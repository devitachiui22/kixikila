// File: src/modules/users/user.service.js

const db = require('../../config/database');

// Obter usuário por ID
const getUserById = async (userId) => {
    const res = await db.query(
        `SELECT id, email, role, is_email_verified, created_at, updated_at
         FROM users WHERE id = $1`,
        [userId]
    );
    return res.rows[0] || null;
};

// Atualizar email do usuário
const updateUserEmail = async (userId, newEmail) => {
    const res = await db.query(
        `UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2
         RETURNING id, email, role, is_email_verified, updated_at`,
        [newEmail, userId]
    );
    return res.rows[0];
};

// Listar todos os usuários
const listAllUsers = async () => {
    const res = await db.query(
        `SELECT id, email, role, is_email_verified, created_at
         FROM users ORDER BY created_at DESC`
    );
    return res.rows;
};

module.exports = {
    getUserById,
    updateUserEmail,
    listAllUsers
};
