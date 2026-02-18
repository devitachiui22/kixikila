// =====================================================
// KIXIKILAHUB - CONFIGURAÇÃO DO SOCKET.IO
// WebSocket para chat em tempo real e notificações
// =====================================================

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('./env');
const logger = require('../utils/logger');
const database = require('./database');

// =====================================================
// ESTADO DOS SOCKETS
// =====================================================
let io;
const userSockets = new Map(); // userId -> socketId
const groupRooms = new Map();   // groupId -> Set de socketIds

// =====================================================
// INICIALIZAÇÃO DO SOCKET.IO
// =====================================================
const initialize = (server) => {
    io = new Server(server, {
        path: config.socket.path,
        cors: {
            origin: config.socket.corsOrigin,
            credentials: true,
            methods: ['GET', 'POST']
        },
        pingTimeout: config.socket.pingTimeout,
        pingInterval: config.socket.pingInterval,
        transports: ['websocket', 'polling'],
        allowEIO3: true,
        connectTimeout: 45000,
        maxHttpBufferSize: 1e6 // 1MB
    });

    // Middleware de autenticação
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token ||
                         socket.handshake.headers.authorization?.split(' ')[1];

            if (!token) {
                return next(new Error('Token não fornecido'));
            }

            // Verificar JWT
            const decoded = jwt.verify(token, config.jwt.secret, {
                issuer: config.jwt.issuer,
                audience: config.jwt.audience
            });

            // Verificar se usuário existe no banco
            const result = await database.query(
                'SELECT id, full_name, is_active FROM users WHERE id = $1 AND is_active = true',
                [decoded.sub]
            );

            if (result.rows.length === 0) {
                return next(new Error('Usuário não encontrado ou inativo'));
            }

            const user = result.rows[0];

            // Anexar usuário ao socket
            socket.user = {
                id: user.id,
                name: user.full_name
            };

            // Registrar socket para o usuário
            userSockets.set(user.id, socket.id);

            logger.debug(`🔌 Socket autenticado para usuário ${user.id}`);
            next();
        } catch (error) {
            logger.error('❌ Erro na autenticação do socket:', error);
            next(new Error('Autenticação falhou'));
        }
    });

    // Eventos de conexão
    io.on('connection', (socket) => {
        logger.info(`🔌 Novo cliente conectado: ${socket.id} - Usuário: ${socket.user?.id}`);

        // Entrar em salas dos grupos do usuário
        joinUserGroups(socket);

        // Eventos do chat
        setupChatHandlers(socket);

        // Eventos de notificação
        setupNotificationHandlers(socket);

        // Eventos de grupos
        setupGroupHandlers(socket);

        // Evento de digitação
        setupTypingHandlers(socket);

        // Evento de desconexão
        socket.on('disconnect', () => {
            handleDisconnect(socket);
        });

        // Evento de erro
        socket.on('error', (error) => {
            logger.error(`❌ Erro no socket ${socket.id}:`, error);
        });
    });

    // Estatísticas periódicas
    setInterval(() => {
        const stats = {
            connectedSockets: io.engine.clientsCount,
            authenticatedUsers: userSockets.size,
            activeRooms: groupRooms.size
        };
        logger.debug('📊 Estatísticas do WebSocket:', stats);
    }, 60000); // A cada minuto

    logger.info('✅ Socket.IO configurado com sucesso');
    return io;
};

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

/**
 * Buscar e entrar em grupos do usuário
 */
const joinUserGroups = async (socket) => {
    try {
        const result = await database.query(
            `SELECT g.id, g.name
             FROM groups g
             JOIN group_members gm ON g.id = gm.group_id
             WHERE gm.user_id = $1 AND gm.is_active = true AND g.status = 'ACTIVE'`,
            [socket.user.id]
        );

        for (const group of result.rows) {
            const roomName = `group:${group.id}`;
            await socket.join(roomName);

            // Registrar no mapa de grupos
            if (!groupRooms.has(group.id)) {
                groupRooms.set(group.id, new Set());
            }
            groupRooms.get(group.id).add(socket.id);

            logger.debug(`📢 Usuário ${socket.user.id} entrou na sala ${roomName}`);
        }

        // Notificar membros do grupo sobre conexão
        for (const group of result.rows) {
            socket.to(`group:${group.id}`).emit('user:online', {
                userId: socket.user.id,
                name: socket.user.name
            });
        }
    } catch (error) {
        logger.error('❌ Erro ao buscar grupos do usuário:', error);
    }
};

/**
 * Configurar handlers de chat
 */
const setupChatHandlers = (socket) => {
    socket.on('chat:message', async (data) => {
        try {
            const { groupId, message, messageType = 'TEXT' } = data;

            // Validar se usuário é membro do grupo
            const isMember = await checkGroupMembership(socket.user.id, groupId);
            if (!isMember) {
                socket.emit('error', { message: 'Você não é membro deste grupo' });
                return;
            }

            // Validar mensagem
            if (!message || message.trim().length === 0) {
                socket.emit('error', { message: 'Mensagem não pode estar vazia' });
                return;
            }

            if (message.length > 1000) {
                socket.emit('error', { message: 'Mensagem muito longa (máx 1000 caracteres)' });
                return;
            }

            // Salvar no banco
            const result = await database.query(
                `INSERT INTO chat_messages (group_id, user_id, message, message_type)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, created_at`,
                [groupId, socket.user.id, message.trim(), messageType]
            );

            const savedMessage = {
                id: result.rows[0].id,
                groupId,
                userId: socket.user.id,
                userName: socket.user.name,
                message: message.trim(),
                messageType,
                createdAt: result.rows[0].created_at
            };

            // Emitir para todos na sala (incluindo remetente)
            io.to(`group:${groupId}`).emit('chat:message', savedMessage);

            logger.debug(`💬 Mensagem enviada no grupo ${groupId} pelo usuário ${socket.user.id}`);

        } catch (error) {
            logger.error('❌ Erro ao enviar mensagem:', error);
            socket.emit('error', { message: 'Erro ao enviar mensagem' });
        }
    });

    // Histórico de mensagens
    socket.on('chat:history', async (data) => {
        try {
            const { groupId, limit = 50, before = null } = data;

            // Validar membro
            const isMember = await checkGroupMembership(socket.user.id, groupId);
            if (!isMember) {
                socket.emit('error', { message: 'Você não é membro deste grupo' });
                return;
            }

            let query = `
                SELECT cm.*, u.full_name as user_name
                FROM chat_messages cm
                JOIN users u ON cm.user_id = u.id
                WHERE cm.group_id = $1
            `;
            const params = [groupId];

            if (before) {
                query += ` AND cm.created_at < $2`;
                params.push(before);
            }

            query += ` ORDER BY cm.created_at DESC LIMIT $${params.length + 1}`;
            params.push(limit);

            const result = await database.query(query, params);

            socket.emit('chat:history', {
                groupId,
                messages: result.rows.reverse(), // Reverter para ordem cronológica
                hasMore: result.rows.length === limit
            });

        } catch (error) {
            logger.error('❌ Erro ao buscar histórico:', error);
            socket.emit('error', { message: 'Erro ao buscar histórico' });
        }
    });
};

/**
 * Configurar handlers de digitação
 */
const setupTypingHandlers = (socket) => {
    socket.on('typing:start', (data) => {
        const { groupId } = data;
        socket.to(`group:${groupId}`).emit('typing:start', {
            userId: socket.user.id,
            userName: socket.user.name,
            groupId
        });
    });

    socket.on('typing:stop', (data) => {
        const { groupId } = data;
        socket.to(`group:${groupId}`).emit('typing:stop', {
            userId: socket.user.id,
            groupId
        });
    });
};

/**
 * Configurar handlers de notificação
 */
const setupNotificationHandlers = (socket) => {
    socket.on('notification:mark_read', async (data) => {
        // Implementar marcação de notificações como lidas
        // (Pode ser integrado com banco de dados)
    });
};

/**
 * Configurar handlers de grupos
 */
const setupGroupHandlers = (socket) => {
    socket.on('group:join', async (data) => {
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

            // Registrar no mapa
            if (!groupRooms.has(groupId)) {
                groupRooms.set(groupId, new Set());
            }
            groupRooms.get(groupId).add(socket.id);

            // Notificar outros membros
            socket.to(roomName).emit('user:online', {
                userId: socket.user.id,
                name: socket.user.name
            });

            logger.debug(`📢 Usuário ${socket.user.id} entrou manualmente no grupo ${groupId}`);

        } catch (error) {
            logger.error('❌ Erro ao entrar no grupo:', error);
            socket.emit('error', { message: 'Erro ao entrar no grupo' });
        }
    });

    socket.on('group:leave', async (data) => {
        try {
            const { groupId } = data;

            const roomName = `group:${groupId}`;
            await socket.leave(roomName);

            // Remover do mapa
            if (groupRooms.has(groupId)) {
                groupRooms.get(groupId).delete(socket.id);
                if (groupRooms.get(groupId).size === 0) {
                    groupRooms.delete(groupId);
                }
            }

            // Notificar outros membros
            socket.to(roomName).emit('user:offline', {
                userId: socket.user.id
            });

        } catch (error) {
            logger.error('❌ Erro ao sair do grupo:', error);
        }
    });
};

/**
 * Handler de desconexão
 */
const handleDisconnect = (socket) => {
    logger.info(`🔌 Cliente desconectado: ${socket.id} - Usuário: ${socket.user?.id}`);

    // Remover dos maps
    if (socket.user) {
        userSockets.delete(socket.user.id);

        // Remover de todos os grupos
        groupRooms.forEach((sockets, groupId) => {
            if (sockets.has(socket.id)) {
                sockets.delete(socket.id);
                io.to(`group:${groupId}`).emit('user:offline', {
                    userId: socket.user.id
                });
            }
        });
    }
};

/**
 * Verificar se usuário é membro do grupo
 */
const checkGroupMembership = async (userId, groupId) => {
    try {
        const result = await database.query(
            `SELECT 1 FROM group_members
             WHERE group_id = $1 AND user_id = $2 AND is_active = true`,
            [groupId, userId]
        );
        return result.rows.length > 0;
    } catch (error) {
        logger.error('❌ Erro ao verificar membership:', error);
        return false;
    }
};

// =====================================================
// FUNÇÕES PÚBLICAS (PARA USO EM CONTROLLERS)
// =====================================================

/**
 * Emitir evento para um usuário específico
 */
const emitToUser = (userId, event, data) => {
    const socketId = userSockets.get(userId);
    if (socketId && io) {
        io.to(socketId).emit(event, data);
        return true;
    }
    return false;
};

/**
 * Emitir evento para um grupo
 */
const emitToGroup = (groupId, event, data) => {
    if (io) {
        io.to(`group:${groupId}`).emit(event, data);
        return true;
    }
    return false;
};

/**
 * Emitir evento para todos exceto um usuário
 */
const emitToGroupExcept = (groupId, userId, event, data) => {
    if (io) {
        const socketId = userSockets.get(userId);
        if (socketId) {
            io.to(`group:${groupId}`).except(socketId).emit(event, data);
        } else {
            io.to(`group:${groupId}`).emit(event, data);
        }
        return true;
    }
    return false;
};

/**
 * Obter estatísticas
 */
const getStats = () => {
    return {
        connectedSockets: io?.engine?.clientsCount || 0,
        authenticatedUsers: userSockets.size,
        activeRooms: groupRooms.size,
        rooms: Array.from(groupRooms.keys()).map(id => ({
            groupId: id,
            members: groupRooms.get(id).size
        }))
    };
};

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
    initialize,
    emitToUser,
    emitToGroup,
    emitToGroupExcept,
    getStats
};