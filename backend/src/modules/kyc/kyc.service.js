// File: src/modules/kyc/kyc.service.js

const db = require('../../config/database');

// Submeter KYC
const submitKYC = async (userId, document_type, document_number) => {
    // Verifica se já existe submissão pendente
    const existing = await db.query(
        `SELECT id, status FROM kyc WHERE user_id = $1 AND status = 'pending'`,
        [userId]
    );
    if (existing.rows.length > 0) {
        throw { status: 400, message: 'Você já possui uma submissão pendente' };
    }

    const res = await db.query(
        `INSERT INTO kyc (user_id, document_type, document_number)
         VALUES ($1, $2, $3)
         RETURNING id, document_type, document_number, status, submitted_at`,
        [userId, document_type, document_number]
    );

    return res.rows[0];
};

// Obter KYC por usuário
const getKYCByUser = async (userId) => {
    const res = await db.query(
        `SELECT id, document_type, document_number, status, submitted_at, reviewed_at
         FROM kyc WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 1`,
        [userId]
    );
    return res.rows[0] || null;
};

// Listar todas submissões KYC (admin)
const listAllKYC = async () => {
    const res = await db.query(
        `SELECT k.id, u.email, k.document_type, k.document_number, k.status, k.submitted_at, k.reviewed_at
         FROM kyc k
         JOIN users u ON k.user_id = u.id
         ORDER BY k.submitted_at DESC`
    );
    return res.rows;
};

module.exports = {
    submitKYC,
    getKYCByUser,
    listAllKYC
};
