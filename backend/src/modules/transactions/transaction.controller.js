// =====================================================
// KIXIKILAHUB - CONTROLLER DE TRANSAÇÕES
// Histórico e detalhes de transações
// =====================================================

const database = require('../../config/database');
const logger = require('../../utils/logger');
const { NotFoundError } = require('../../middlewares/error.middleware');
const moment = require('moment');

// =====================================================
// LISTAR TRANSAÇÕES
// =====================================================
const listTransactions = async (req, res) => {
    const {
        page = 1,
        limit = 20,
        type,
        startDate,
        endDate,
        status
    } = req.query;

    const offset = (page - 1) * limit;

    let query = `
        SELECT 
            t.id, t.transaction_type, t.amount, t.fee, t.net_amount,
            t.balance_before, t.balance_after, t.status,
            t.reference, t.description, t.created_at, t.completed_at,
            CASE 
                WHEN t.transaction_type = 'DEPOSIT' THEN json_build_object(
                    'method', d.method,
                    'provider_reference', d.provider_reference
                )
                WHEN t.transaction_type = 'WITHDRAWAL' THEN json_build_object(
                    'method', w.method,
                    'provider_reference', w.provider_reference
                )
                WHEN t.transaction_type = 'GROUP_PAYMENT' OR t.transaction_type = 'GROUP_RECEIVE' THEN json_build_object(
                    'group_id', t.metadata->>'groupId',
                    'group_name', t.metadata->>'groupName',
                    'cycle_number', t.metadata->>'cycleNumber'
                )
                WHEN t.transaction_type = 'TRANSFER' THEN json_build_object(
                    'from_user_id', t.metadata->>'fromUserId',
                    'to_user_id', t.metadata->>'toUserId',
                    'from_user_name', t.metadata->>'fromUserName',
                    'to_user_name', t.metadata->>'toUserName'
                )
                ELSE NULL
            END as details
        FROM transactions t
        LEFT JOIN deposits d ON t.id = d.transaction_id
        LEFT JOIN withdrawals w ON t.id = w.transaction_id
        WHERE t.user_id = $1
    `;

    const params = [req.user.id];
    let paramCount = 2;

    if (type) {
        query += ` AND t.transaction_type = $${paramCount}`;
        params.push(type);
        paramCount++;
    }

    if (status) {
        query += ` AND t.status = $${paramCount}`;
        params.push(status);
        paramCount++;
    }

    if (startDate) {
        query += ` AND t.created_at >= $${paramCount}`;
        params.push(startDate);
        paramCount++;
    }

    if (endDate) {
        query += ` AND t.created_at <= $${paramCount}`;
        params.push(endDate);
        paramCount++;
    }

    query += ` ORDER BY t.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await database.query(query, params);

    // Contar total
    let countQuery = 'SELECT COUNT(*) as total FROM transactions WHERE user_id = $1';
    const countParams = [req.user.id];
    
    if (type) {
        countQuery += ` AND transaction_type = $${countParams.length + 1}`;
        countParams.push(type);
    }
    if (status) {
        countQuery += ` AND status = $${countParams.length + 1}`;
        countParams.push(status);
    }
    if (startDate) {
        countQuery += ` AND created_at >= $${countParams.length + 1}`;
        countParams.push(startDate);
    }
    if (endDate) {
        countQuery += ` AND created_at <= $${countParams.length + 1}`;
        countParams.push(endDate);
    }

    const countResult = await database.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
        success: true,
        data: {
            transactions: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        }
    });
};

// =====================================================
// OBTER DETALHES DA TRANSAÇÃO
// =====================================================
const getTransactionDetails = async (req, res) => {
    const { transactionId } = req.params;

    const result = await database.query(
        `SELECT 
            t.*,
            row_to_json(d) as deposit_details,
            row_to_json(w) as withdrawal_details,
            json_build_object(
                'id', u.id,
                'name', u.full_name,
                'email', u.email
            ) as user
         FROM transactions t
         LEFT JOIN deposits d ON t.id = d.transaction_id
         LEFT JOIN withdrawals w ON t.id = w.transaction_id
         LEFT JOIN users u ON t.user_id = u.id
         WHERE t.id = $1 AND t.user_id = $2`,
        [transactionId, req.user.id]
    );

    if (result.rows.length === 0) {
        throw new NotFoundError('Transação não encontrada');
    }

    const transaction = result.rows[0];

    res.json({
        success: true,
        data: { transaction }
    });
};

// =====================================================
// OBTER RECIBO DA TRANSAÇÃO
// =====================================================
const getTransactionReceipt = async (req, res) => {
    const { transactionId } = req.params;

    const result = await database.query(
        `SELECT 
            t.id, t.transaction_type, t.amount, t.fee, t.net_amount,
            t.balance_before, t.balance_after, t.status,
            t.reference, t.description, t.created_at, t.completed_at,
            t.metadata,
            u.full_name, u.email, u.document_number,
            w.account_number,
            d.method as deposit_method, d.provider_reference,
            wd.method as withdrawal_method, wd.destination_details
         FROM transactions t
         JOIN users u ON t.user_id = u.id
         JOIN wallets w ON u.id = w.user_id
         LEFT JOIN deposits d ON t.id = d.transaction_id
         LEFT JOIN withdrawals wd ON t.id = wd.transaction_id
         WHERE t.id = $1 AND t.user_id = $2`,
        [transactionId, req.user.id]
    );

    if (result.rows.length === 0) {
        throw new NotFoundError('Transação não encontrada');
    }

    const tx = result.rows[0];

    res.json({
        success: true,
        data: { receipt: tx }
    });
};

// =====================================================
// RESUMO DE TRANSAÇÕES POR PERÍODO
// =====================================================
const getTransactionSummary = async (req, res) => {
    const { period = 'month' } = req.query;

    let startDate;
    const endDate = moment();

    switch (period) {
        case 'today':
            startDate = moment().startOf('day');
            break;
        case 'week':
            startDate = moment().subtract(7, 'days').startOf('day');
            break;
        case 'month':
            startDate = moment().subtract(30, 'days').startOf('day');
            break;
        case 'year':
            startDate = moment().subtract(1, 'year').startOf('day');
            break;
        default:
            startDate = moment().subtract(30, 'days').startOf('day');
    }

    const result = await database.query(
        `SELECT 
            DATE(created_at) as date,
            transaction_type,
            COUNT(*) as count,
            SUM(amount) as total_amount,
            SUM(fee) as total_fees,
            SUM(CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END) as completed_amount
         FROM transactions
         WHERE user_id = $1 
            AND created_at >= $2 
            AND created_at <= $3
         GROUP BY DATE(created_at), transaction_type
         ORDER BY date DESC`,
        [req.user.id, startDate.toDate(), endDate.toDate()]
    );

    res.json({
        success: true,
        data: { summary: result.rows }
    });
};

// =====================================================
// ESTATÍSTICAS DE TRANSAÇÕES
// =====================================================
const getTransactionStats = async (req, res) => {
    const result = await database.query(
        `SELECT 
            COUNT(*) as total_count,
            COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_count,
            COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_count,
            COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed_count,
            COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END), 0) as total_completed_amount,
            COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN fee ELSE 0 END), 0) as total_fees
         FROM transactions
         WHERE user_id = $1`,
        [req.user.id]
    );

    res.json({
        success: true,
        data: { stats: result.rows[0] }
    });
};

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
    listTransactions,
    getTransactionDetails,
    getTransactionReceipt,
    getTransactionSummary,
    getTransactionStats
};
