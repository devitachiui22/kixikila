// =====================================================
// KIXIKILAHUB - CONTROLLER DE CHAT
// Gerenciamento de mensagens e histórico
// =====================================================

const database = require('../../config/database');
const logger = require('../../utils/logger');
const { ValidationError, NotFoundError, AuthorizationError } = require('../../middlewares/error.middleware');
const { emitToGroup } = require('../../config/socket');

// =====================================================
// OBTER MENSAGENS DO GRUPO
// =====================================================
const getMessages = async (req, res) => {
    const { groupId } = req.params;
    const { limit = 50, before } = req.query;

    let query = `
        SELECT
            cm.id, cm.message, cm.message_type, cm.metadata,
            cm.created_at, cm.updated_at,
            u.id as user_id,
            u.full_name as user_name,
            u.avatar_url
        FROM chat_messages cm
        JOIN users u ON cm.user_id = u.id
        WHERE cm.group_id = $1
    `;

    const params = [groupId];
    let paramCount = 2;

    if (before) {
        query += ` AND cm.created_at < $${paramCount}`;
        params.push(before);
        paramCount++;
    }

    query += ` ORDER BY cm.created_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    const result = await database.query(query, params);

    // Inverter para ordem cronológica
    const messages = result.rows.reverse();

    // Verificar se há mais mensagens
    const hasMore = messages.length === parseInt(limit);

    res.json({
        success: true,
        data: {
            messages,
            hasMore,
            groupId
        }
    });
};

// =====================================================
// ENVIAR MENSAGEM (FALLBACK REST)
// =====================================================
const sendMessage = async (req, res) => {
    const { groupId } = req.params;
    const { message, messageType = 'TEXT', metadata } = req.body;

    // Validar mensagem
    if (!message || message.trim().length === 0) {
        throw new ValidationError('Mensagem não pode estar vazia');
    }

    if (message.length > 1000) {
        throw new ValidationError('Mensagem muito longa (máx 1000 caracteres)');
    }

    // Inserir no banco
    const result = await database.query(
        `INSERT INTO chat_messages (group_id, user_id, message, message_type, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`,
        [groupId, req.user.id, message.trim(), messageType, metadata || null]
    );

    const messageData = {
        id: result.rows[0].id,
        groupId,
        userId: req.user.id,
        userName: req.user.name,
        message: message.trim(),
        messageType,
        metadata,
        createdAt: result.rows[0].created_at
    };

    // Emitir via WebSocket
    emitToGroup(groupId, 'chat:message', messageData);

    logger.debug(`Mensagem enviada via REST no grupo ${groupId} por ${req.user.id}`);

    res.status(201).json({
        success: true,
        data: messageData
    });
};

// =====================================================
// APAGAR MENSAGEM
// =====================================================
const deleteMessage = async (req, res) => {
    const { groupId, messageId } = req.params;

    // Verificar permissão (admin do grupo ou autor da mensagem)
    const result = await database.transaction(async (client) => {
        // Buscar mensagem
        const message = await client.query(
            `SELECT cm.user_id, g.admin_id
             FROM chat_messages cm
             JOIN groups g ON cm.group_id = g.id
             WHERE cm.id = $1 AND cm.group_id = $2`,
            [messageId, groupId]
        );

        if (message.rows.length === 0) {
            throw new NotFoundError('Mensagem não encontrada');
        }

        const { user_id: authorId, admin_id: adminId } = message.rows[0];

        // Verificar se usuário pode apagar
        const canDelete = authorId === req.user.id || adminId === req.user.id;

        if (!canDelete) {
            throw new AuthorizationError('Sem permissão para apagar esta mensagem');
        }

        // Apagar mensagem (soft delete ou hard delete?)
        await client.query(
            `UPDATE chat_messages
             SET message = '[mensagem apagada]',
                 message_type = 'SYSTEM',
                 metadata = jsonb_build_object('deleted_by', $1, 'deleted_at', NOW()),
                 updated_at = NOW()
             WHERE id = $2`,
            [req.user.id, messageId]
        );

        return { authorId, adminId };
    });

    // Notificar via WebSocket
    emitToGroup(groupId, 'chat:message_deleted', {
        groupId,
        messageId,
        deletedBy: req.user.id
    });

    logger.info(`Mensagem ${messageId} apagada no grupo ${groupId} por ${req.user.id}`);

    res.json({
        success: true,
        message: 'Mensagem apagada com sucesso'
    });
};

// =====================================================
// OBTER CONTAGEM DE MENSAGENS NÃO LIDAS
// =====================================================
const getUnreadCount = async (req, res) => {
    const { groupId } = req.params;

    // TODO: Implementar tabela de leitura de mensagens
    // Por enquanto, retornar 0 como placeholder
    res.json({
        success: true,
        data: {
            groupId,
            unreadCount: 0
        }
    });
};

// =====================================================
// MARCAR MENSAGENS COMO LIDAS
// =====================================================
const markAsRead = async (req, res) => {
    const { groupId } = req.params;
    const { upToMessageId } = req.body;

    // TODO: Implementar marcação de leitura
    logger.debug(`Usuário ${req.user.id} marcou mensagens como lidas no grupo ${groupId}`);

    res.json({
        success: true,
        message: 'Mensagens marcadas como lidas'
    });
};

// =====================================================
// BUSCAR MENSAGENS
// =====================================================
const searchMessages = async (req, res) => {
    const { groupId } = req.params;
    const { q, limit = 20 } = req.query;

    if (!q || q.length < 3) {
        throw new ValidationError('Termo de busca deve ter pelo menos 3 caracteres');
    }

    const result = await database.query(
        `SELECT
            cm.id, cm.message, cm.message_type, cm.metadata,
            cm.created_at,
            u.id as user_id,
            u.full_name as user_name,
            ts_rank_cd(to_tsvector('portuguese', cm.message), plainto_tsquery('portuguese', $1)) as rank
         FROM chat_messages cm
         JOIN users u ON cm.user_id = u.id
         WHERE cm.group_id = $2
            AND to_tsvector('portuguese', cm.message) @@ plainto_tsquery('portuguese', $1)
         ORDER BY rank DESC, cm.created_at DESC
         LIMIT $3`,
        [q, groupId, limit]
    );

    res.json({
        success: true,
        data: {
            query: q,
            results: result.rows,
            total: result.rows.length
        }
    });
};

// =====================================================
// OBTER PARTICIPANTES ONLINE
// =====================================================
const getOnlineParticipants = async (req, res) => {
    const { groupId } = req.params;

    // Buscar do serviço de socket (será populado pelo socket)
    // Por enquanto, retornar lista vazia
    const onlineUsers = []; // socket.getOnlineUsersInGroup(groupId)

    res.json({
        success: true,
        data: {
            groupId,
            online: onlineUsers,
            count: onlineUsers.length
        }
    });
};

// =====================================================
// ENVIAR STATUS DE DIGITAÇÃO
// =====================================================
const sendTypingStatus = async (req, res) => {
    const { groupId } = req.params;
    const { isTyping = true } = req.body;

    // Emitir via WebSocket
    emitToGroup(groupId, isTyping ? 'typing:start' : 'typing:stop', {
        groupId,
        userId: req.user.id,
        userName: req.user.name
    });

    res.json({
        success: true
    });
};

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
    getMessages,
    sendMessage,
    deleteMessage,
    getUnreadCount,
    markAsRead,
    searchMessages,
    getOnlineParticipants,
    sendTypingStatus
};