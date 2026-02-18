// =====================================================
// KIXIKILAHUB - HANDLERS DE SOCKET PARA CHAT
// Eventos em tempo real do chat
// =====================================================

const database = require('../../config/database');
const logger = require('../../utils/logger');
const { emitToGroup, emitToGroupExcept } = require('../../config/socket');

// Mapa para controle de usuários digitando
const typingUsers = new Map(); // groupId -> Set de userId

// =====================================================
// CONFIGURAR HANDLERS DE CHAT
// =====================================================
const setupChatHandlers = (socket, io) => {

    // =====================================================
    // ENTRAR EM SALA DE GRUPO
    // =====================================================
    socket.on('chat:join_room', async (data) => {
        try {
            const { groupId } = data;

            // Verificar se é membro
            const isMember = await checkGroupMembership(socket.user.id, groupId);
            if (!isMember) {
                socket.emit('error', { message: 'Você não é membro deste grupo' });
                return;
            }

            // Entrar na sala
            const roomName = `group:${groupId}`;
            await socket.join(roomName);

            logger.debug(`📢 Usuário ${socket.user.id} entrou na sala de chat ${roomName}`);

            // Notificar outros membros
            socket.to(roomName).emit('chat:user_joined', {
                userId: socket.user.id,
                userName: socket.user.name,
                groupId
            });

            // Enviar histórico recente (opcional)
            const recentMessages = await getRecentMessages(groupId, 20);
            socket.emit('chat:history', {
                groupId,
                messages: recentMessages
            });

        } catch (error) {
            logger.error('Erro ao entrar na sala de chat:', error);
            socket.emit('error', { message: 'Erro ao entrar na sala' });
        }
    });

    // =====================================================
    // SAIR DA SALA DE GRUPO
    // =====================================================
    socket.on('chat:leave_room', (data) => {
        const { groupId } = data;
        const roomName = `group:${groupId}`;

        socket.leave(roomName);

        // Notificar outros membros
        socket.to(roomName).emit('chat:user_left', {
            userId: socket.user.id,
            userName: socket.user.name,
            groupId
        });

        // Remover de typing se estiver
        if (typingUsers.has(groupId)) {
            typingUsers.get(groupId).delete(socket.user.id);
            if (typingUsers.get(groupId).size === 0) {
                typingUsers.delete(groupId);
            }
        }

        logger.debug(`Usuário ${socket.user.id} saiu da sala ${roomName}`);
    });

    // =====================================================
    // ENVIAR MENSAGEM
    // =====================================================
    socket.on('chat:send_message', async (data) => {
        try {
            const { groupId, message, messageType = 'TEXT', metadata } = data;

            // Validações
            if (!message || message.trim().length === 0) {
                socket.emit('error', { message: 'Mensagem não pode estar vazia' });
                return;
            }

            if (message.length > 1000) {
                socket.emit('error', { message: 'Mensagem muito longa (máx 1000 caracteres)' });
                return;
            }

            // Verificar se é membro
            const isMember = await checkGroupMembership(socket.user.id, groupId);
            if (!isMember) {
                socket.emit('error', { message: 'Você não é membro deste grupo' });
                return;
            }

            // Salvar no banco
            const result = await database.query(
                `INSERT INTO chat_messages (group_id, user_id, message, message_type, metadata)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id, created_at`,
                [groupId, socket.user.id, message.trim(), messageType, metadata || null]
            );

            const messageData = {
                id: result.rows[0].id,
                groupId,
                userId: socket.user.id,
                userName: socket.user.name,
                message: message.trim(),
                messageType,
                metadata,
                createdAt: result.rows[0].created_at
            };

            // Emitir para todos na sala (incluindo remetente)
            io.to(`group:${groupId}`).emit('chat:new_message', messageData);

            logger.debug(`💬 Mensagem enviada via socket no grupo ${groupId}`);

            // Remover status de digitação
            if (typingUsers.has(groupId)) {
                typingUsers.get(groupId).delete(socket.user.id);
                io.to(`group:${groupId}`).emit('chat:typing_stop', {
                    groupId,
                    userId: socket.user.id
                });
            }

        } catch (error) {
            logger.error('Erro ao enviar mensagem via socket:', error);
            socket.emit('error', { message: 'Erro ao enviar mensagem' });
        }
    });

    // =====================================================
    // EDITAR MENSAGEM
    // =====================================================
    socket.on('chat:edit_message', async (data) => {
        try {
            const { messageId, groupId, newMessage } = data;

            // Verificar se é autor da mensagem
            const message = await database.query(
                'SELECT user_id FROM chat_messages WHERE id = $1 AND group_id = $2',
                [messageId, groupId]
            );

            if (message.rows.length === 0) {
                socket.emit('error', { message: 'Mensagem não encontrada' });
                return;
            }

            if (message.rows[0].user_id !== socket.user.id) {
                socket.emit('error', { message: 'Você só pode editar suas próprias mensagens' });
                return;
            }

            // Atualizar mensagem
            await database.query(
                `UPDATE chat_messages
                 SET message = $1, updated_at = NOW()
                 WHERE id = $2`,
                [newMessage, messageId]
            );

            // Notificar grupo
            io.to(`group:${groupId}`).emit('chat:message_edited', {
                messageId,
                groupId,
                newMessage,
                editedBy: socket.user.id,
                editedAt: new Date()
            });

        } catch (error) {
            logger.error('Erro ao editar mensagem:', error);
            socket.emit('error', { message: 'Erro ao editar mensagem' });
        }
    });

    // =====================================================
    // APAGAR MENSAGEM
    // =====================================================
    socket.on('chat:delete_message', async (data) => {
        try {
            const { messageId, groupId } = data;

            // Verificar permissão
            const message = await database.query(
                `SELECT cm.user_id, g.admin_id
                 FROM chat_messages cm
                 JOIN groups g ON cm.group_id = g.id
                 WHERE cm.id = $1 AND cm.group_id = $2`,
                [messageId, groupId]
            );

            if (message.rows.length === 0) {
                socket.emit('error', { message: 'Mensagem não encontrada' });
                return;
            }

            const { user_id: authorId, admin_id: adminId } = message.rows[0];
            const canDelete = authorId === socket.user.id || adminId === socket.user.id;

            if (!canDelete) {
                socket.emit('error', { message: 'Sem permissão para apagar esta mensagem' });
                return;
            }

            // Apagar (soft delete)
            await database.query(
                `UPDATE chat_messages
                 SET message = '[mensagem apagada]',
                     message_type = 'SYSTEM',
                     metadata = jsonb_build_object('deleted_by', $1, 'deleted_at', NOW()),
                     updated_at = NOW()
                 WHERE id = $2`,
                [socket.user.id, messageId]
            );

            // Notificar grupo
            io.to(`group:${groupId}`).emit('chat:message_deleted', {
                messageId,
                groupId,
                deletedBy: socket.user.id
            });

        } catch (error) {
            logger.error('Erro ao apagar mensagem:', error);
            socket.emit('error', { message: 'Erro ao apagar mensagem' });
        }
    });

    // =====================================================
    // STATUS DE DIGITAÇÃO
    // =====================================================
    socket.on('chat:typing_start', (data) => {
        const { groupId } = data;

        // Registrar usuário digitando
        if (!typingUsers.has(groupId)) {
            typingUsers.set(groupId, new Set());
        }
        typingUsers.get(groupId).add(socket.user.id);

        // Notificar outros membros (exceto quem está digitando)
        socket.to(`group:${groupId}`).emit('chat:typing_start', {
            groupId,
            userId: socket.user.id,
            userName: socket.user.name
        });

        // Auto-remover após 3 segundos (timeout)
        setTimeout(() => {
            if (typingUsers.has(groupId) && typingUsers.get(groupId).has(socket.user.id)) {
                typingUsers.get(groupId).delete(socket.user.id);
                socket.to(`group:${groupId}`).emit('chat:typing_stop', {
                    groupId,
                    userId: socket.user.id
                });
            }
        }, 3000);
    });

    socket.on('chat:typing_stop', (data) => {
        const { groupId } = data;

        if (typingUsers.has(groupId)) {
            typingUsers.get(groupId).delete(socket.user.id);
            if (typingUsers.get(groupId).size === 0) {
                typingUsers.delete(groupId);
            }
        }

        socket.to(`group:${groupId}`).emit('chat:typing_stop', {
            groupId,
            userId: socket.user.id
        });
    });

    // =====================================================
    // MARCAR COMO LIDAS
    // =====================================================
    socket.on('chat:mark_read', async (data) => {
        try {
            const { groupId, upToMessageId } = data;

            // TODO: Implementar marcação de leitura no banco
            logger.debug(`Usuário ${socket.user.id} marcou mensagens como lidas no grupo ${groupId}`);

            // Notificar que usuário leu as mensagens
            socket.to(`group:${groupId}`).emit('chat:user_read', {
                groupId,
                userId: socket.user.id,
                upToMessageId
            });

        } catch (error) {
            logger.error('Erro ao marcar mensagens como lidas:', error);
        }
    });

    // =====================================================
    // CARREGAR MAIS MENSAGENS
    // =====================================================
    socket.on('chat:load_more', async (data) => {
        try {
            const { groupId, before, limit = 30 } = data;

            const messages = await database.query(
                `SELECT
                    cm.id, cm.message, cm.message_type, cm.metadata,
                    cm.created_at,
                    u.id as user_id,
                    u.full_name as user_name
                 FROM chat_messages cm
                 JOIN users u ON cm.user_id = u.id
                 WHERE cm.group_id = $1 AND cm.created_at < $2
                 ORDER BY cm.created_at DESC
                 LIMIT $3`,
                [groupId, before, limit]
            );

            socket.emit('chat:more_messages', {
                groupId,
                messages: messages.rows.reverse(),
                hasMore: messages.rows.length === limit
            });

        } catch (error) {
            logger.error('Erro ao carregar mais mensagens:', error);
            socket.emit('error', { message: 'Erro ao carregar mensagens' });
        }
    });

    // =====================================================
    // REAÇÕES À MENSAGENS
    // =====================================================
    socket.on('chat:add_reaction', async (data) => {
        try {
            const { messageId, groupId, reaction } = data;

            // TODO: Implementar reações no banco
            // Por enquanto, apenas notificar

            io.to(`group:${groupId}`).emit('chat:reaction_added', {
                messageId,
                groupId,
                userId: socket.user.id,
                userName: socket.user.name,
                reaction
            });

        } catch (error) {
            logger.error('Erro ao adicionar reação:', error);
        }
    });

    socket.on('chat:remove_reaction', (data) => {
        const { messageId, groupId, reaction } = data;

        io.to(`group:${groupId}`).emit('chat:reaction_removed', {
            messageId,
            groupId,
            userId: socket.user.id,
            reaction
        });
    });

    // =====================================================
    // EVENTOS DE DESCONEXÃO
    // =====================================================
    socket.on('disconnect', () => {
        // Remover de todos os grupos de typing
        typingUsers.forEach((users, groupId) => {
            if (users.has(socket.user.id)) {
                users.delete(socket.user.id);
                io.to(`group:${groupId}`).emit('chat:typing_stop', {
                    groupId,
                    userId: socket.user.id
                });
            }
        });

        logger.debug(`Socket de chat desconectado: ${socket.id}`);
    });
};

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

/**
 * Verificar se usuário é membro do grupo
 */
const checkGroupMembership = async (userId, groupId) => {
    try {
        const result = await database.query(
            'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2 AND is_active = true',
            [groupId, userId]
        );
        return result.rows.length > 0;
    } catch (error) {
        logger.error('Erro ao verificar membership:', error);
        return false;
    }
};

/**
 * Buscar mensagens recentes
 */
const getRecentMessages = async (groupId, limit = 20) => {
    try {
        const result = await database.query(
            `SELECT
                cm.id, cm.message, cm.message_type, cm.metadata,
                cm.created_at,
                u.id as user_id,
                u.full_name as user_name
             FROM chat_messages cm
             JOIN users u ON cm.user_id = u.id
             WHERE cm.group_id = $1
             ORDER BY cm.created_at DESC
             LIMIT $2`,
            [groupId, limit]
        );

        return result.rows.reverse();
    } catch (error) {
        logger.error('Erro ao buscar mensagens recentes:', error);
        return [];
    }
};

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
    setupChatHandlers
};