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

    // Formatar resposta
    const response = {
        id: transaction.id,
        type: transaction.transaction_type,
        amount: parseFloat(transaction.amount),
        fee: parseFloat(transaction.fee),
        netAmount: parseFloat(transaction.net_amount),
        balanceBefore: parseFloat(transaction.balance_before),
        balanceAfter: parseFloat(transaction.balance_after),
        status: transaction.status,
        reference: transaction.reference,
        description: transaction.description,
        createdAt: transaction.created_at,
        completedAt: transaction.completed_at,
        failedAt: transaction.failed_at,
        failureReason: transaction.failure_reason
    };

    // Adicionar detalhes específicos
    if (transaction.deposit_details) {
        response.details = {
            type: 'deposit',
            method: transaction.deposit_details.method,
            providerReference: transaction.deposit_details.provider_reference
        };
    } else if (transaction.withdrawal_details) {
        response.details = {
            type: 'withdrawal',
            method: transaction.withdrawal_details.method,
            destination: transaction.withdrawal_details.destination_details,
            providerReference: transaction.withdrawal_details.provider_reference
        };
    } else if (transaction.metadata) {
        response.details = transaction.metadata;
    }

    res.json({
        success: true,
        data: { transaction: response }
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

    // Gerar recibo formatado
    const receipt = {
        receiptNumber: `RCT-${tx.id.substring(0, 8)}-${moment(tx.created_at).format('YYYYMMDD')}`,
        transactionId: tx.id,
        date: tx.created_at,
        type: tx.transaction_type,
        status: tx.status,
        amount: parseFloat(tx.amount),
        fee: parseFloat(tx.fee),
        netAmount: parseFloat(tx.net_amount),
        user: {
            name: tx.full_name,
            document: tx.document_number ? maskDocument(tx.document_number) : null,
            account: tx.account_number
        },
        reference: tx.reference || tx.provider_reference,
        description: tx.description
    };

    // Adicionar método de pagamento
    if (tx.deposit_method) {
        receipt.paymentMethod = tx.deposit_method;
    } else if (tx.withdrawal_method) {
        receipt.paymentMethod = tx.withdrawal_method;
        receipt.destination = tx.destination_details;
    }

    // Adicionar assinatura digital simulada
    receipt.digitalSignature = generateReceiptSignature(receipt);

    res.json({
        success: true,
        data: { receipt }
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

    // Agrupar por data
    const summary = {};
    result.rows.forEach(row => {
        const date = row.date.toISOString().split('T')[0];
        if (!summary[date]) {
            summary[date] = {
                date,
                total: 0,
                fees: 0,
                byType: {}
            };
        }

        summary[date].byType[row.transaction_type] = {
            count: parseInt(row.count),
            amount: parseFloat(row.total_amount),
            completed: parseFloat(row.completed_amount)
        };

        summary[date].total += parseFloat(row.total_amount);
        summary[date].fees += parseFloat(row.total_fees);
    });

    // Totais do período
    const totals = await database.query(
        `SELECT
            COUNT(*) as total_transactions,
            SUM(CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END) as total_completed,
            SUM(fee) as total_fees,
            SUM(CASE WHEN transaction_type = 'DEPOSIT' AND status = 'COMPLETED' THEN amount ELSE 0 END) as total_deposits,
            SUM(CASE WHEN transaction_type = 'WITHDRAWAL' AND status = 'COMPLETED' THEN amount ELSE 0 END) as total_withdrawals
         FROM transactions
         WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3`,
        [req.user.id, startDate.toDate(), endDate.toDate()]
    );

    res.json({
        success: true,
        data: {
            period: {
                type: period,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString()
            },
            daily: Object.values(summary),
            totals: {
                transactions: parseInt(totals.rows[0].total_transactions),
                completedAmount: parseFloat(totals.rows[0].total_completed || 0),
                fees: parseFloat(totals.rows[0].total_fees || 0),
                deposits: parseFloat(totals.rows[0].total_deposits || 0),
                withdrawals: parseFloat(totals.rows[0].total_withdrawals || 0),
                netChange: parseFloat(totals.rows[0].total_deposits || 0) - parseFloat(totals.rows[0].total_withdrawals || 0)
            }
        }
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
            COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN fee ELSE 0 END), 0) as total_fees,

            COALESCE(SUM(CASE WHEN transaction_type = 'DEPOSIT' AND status = 'COMPLETED' THEN amount ELSE 0 END), 0) as total_deposits,
            COALESCE(SUM(CASE WHEN transaction_type = 'WITHDRAWAL' AND status = 'COMPLETED' THEN amount ELSE 0 END), 0) as total_withdrawals,
            COALESCE(SUM(CASE WHEN transaction_type = 'GROUP_PAYMENT' AND status = 'COMPLETED' THEN amount ELSE 0 END), 0) as total_group_payments,
            COALESCE(SUM(CASE WHEN transaction_type = 'GROUP_RECEIVE' AND status = 'COMPLETED' THEN amount ELSE 0 END), 0) as total_group_receives,

            AVG(CASE WHEN status = 'COMPLETED' THEN amount ELSE NULL END) as avg_transaction_amount,

            MAX(CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END) as max_transaction_amount,
            MIN(CASE WHEN status = 'COMPLETED' THEN amount ELSE NULL END) as min_transaction_amount,

            COUNT(DISTINCT DATE(created_at)) as active_days
         FROM transactions
         WHERE user_id = $1`,
        [req.user.id]
    );

    const stats = result.rows[0];

    // Estatísticas por tipo
    const byType = await database.query(
        `SELECT
            transaction_type,
            COUNT(*) as count,
            SUM(amount) as total_amount,
            AVG(amount) as avg_amount
         FROM transactions
         WHERE user_id = $1 AND status = 'COMPLETED'
         GROUP BY transaction_type`,
        [req.user.id]
    );

    // Tendência (últimos 30 dias vs anterior)
    const thirtyDaysAgo = moment().subtract(30, 'days').startOf('day');
    const sixtyDaysAgo = moment().subtract(60, 'days').startOf('day');

    const trend = await database.query(
        `SELECT
            SUM(CASE WHEN created_at >= $2 THEN amount ELSE 0 END) as recent_total,
            SUM(CASE WHEN created_at < $2 AND created_at >= $3 THEN amount ELSE 0 END) as previous_total
         FROM transactions
         WHERE user_id = $1 AND status = 'COMPLETED'`,
        [req.user.id, thirtyDaysAgo.toDate(), sixtyDaysAgo.toDate()]
    );

    const recentTotal = parseFloat(trend.rows[0].recent_total || 0);
    const previousTotal = parseFloat(trend.rows[0].previous_total || 0);

    const trendPercentage = previousTotal > 0
        ? ((recentTotal - previousTotal) / previousTotal * 100).toFixed(2)
        : 100;

    res.json({
        success: true,
        data: {
            overview: {
                totalTransactions: parseInt(stats.total_count),
                completedTransactions: parseInt(stats.completed_count),
                pendingTransactions: parseInt(stats.pending_count),
                failedTransactions: parseInt(stats.failed_count),
                successRate: stats.total_count > 0
                    ? (stats.completed_count / stats.total_count * 100).toFixed(2)
                    : 0
            },
            amounts: {
                total: parseFloat(stats.total_completed_amount),
                fees: parseFloat(stats.total_fees),
                average: parseFloat(stats.avg_transaction_amount || 0),
                max: parseFloat(stats.max_transaction_amount),
                min: parseFloat(stats.min_transaction_amount || 0)
            },
            byType: byType.rows.map(row => ({
                type: row.transaction_type,
                count: parseInt(row.count),
                total: parseFloat(row.total_amount),
                average: parseFloat(row.avg_amount)
            })),
            trend: {
                recent30days: recentTotal,
                previous30days: previousTotal,
                percentageChange: parseFloat(trendPercentage),
                direction: recentTotal > previousTotal ? 'up' : recentTotal < previousTotal ? 'down' : 'stable'
            },
            activity: {
                activeDays: parseInt(stats.active_days),
                transactionsPerDay: stats.total_count > 0
                    ? (stats.total_count / stats.active_days).toFixed(2)
                    : 0
            }
        }
    });
};

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

/**
 * Mascarar número de documento
 */
const maskDocument = (document) => {
    if (!document) return null;
    if (document.length <= 4) return '****';
    return '*'.repeat(document.length - 4) + document.slice(-4);
};

/**
 * Gerar assinatura digital para recibo
 */
const generateReceiptSignature = (receipt) => {
    const crypto = require('crypto');
    const data = JSON.stringify(receipt) + process.env.JWT_SECRET;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
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