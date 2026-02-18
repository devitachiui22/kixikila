// File: src/modules/transactions/transaction.service.js

const db = require('../../config/database');

// Obter histórico de transações com filtros opcionais
const getTransactions = async (userId, filters = {}) => {
    const { type, startDate, endDate } = filters;
    let query = `SELECT id, type, amount, fee, status, reference, description, created_at
                 FROM transactions
                 WHERE user_id = $1`;
    const params = [userId];
    let paramIndex = 2;

    if (type) {
        query += ` AND type = $${paramIndex}`;
        params.push(type);
        paramIndex++;
    }
    if (startDate) {
        query += ` AND created_at >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
    }
    if (endDate) {
        query += ` AND created_at <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

    const res = await db.query(query, params);
    return res.rows;
};

module.exports = {
    getTransactions
};
