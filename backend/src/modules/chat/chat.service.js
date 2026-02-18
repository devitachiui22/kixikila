// File: src/modules/chat/chat.service.js

const db = require('../../config/database');

// Salvar mensagem no banco
const saveMessage = async ({ groupId, userId, message }) => {
    const res = await db.query(
        `INSERT INTO chat_messages (group_id, user_id, message, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id, group_id, user_id, message, created_at`,
        [groupId, userId, message]
    );
    return res.rows[0];
};

// Obter histórico de mensagens de um grupo
const getMessagesByGroup = async (groupId, limit = 50) => {
    const res = await db.query(
        `SELECT cm.id, cm.user_id, u.email as user_email, cm.message, cm.created_at
         FROM chat_messages cm
         JOIN users u ON cm.user_id = u.id
         WHERE cm.group_id = $1
         ORDER BY cm.created_at DESC
         LIMIT $2`,
        [groupId, limit]
    );
    return res.rows.reverse(); // Ordem cronológica
};

module.exports = {
    saveMessage,
    getMessagesByGroup
};
