// File: src/modules/wallet/wallet.service.js

const db = require('../../config/database');
const paymentService = require('../payments/payment.service');
const { getUserById } = require('../users/user.service');

// Obter saldo da wallet
const getWalletBalance = async (userId) => {
    const res = await db.query(
        `SELECT available_balance, blocked_balance FROM wallets WHERE user_id = $1`,
        [userId]
    );
    if (res.rows.length === 0) throw { status: 404, message: 'Wallet não encontrada' };
    return res.rows[0];
};

// Histórico de transações
const getTransactions = async (userId) => {
    const res = await db.query(
        `SELECT id, type, amount, fee, status, reference, description, created_at
         FROM transactions
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
    );
    return res.rows;
};

// Depositar fundos (chama PaymentService)
const depositFunds = async (userId, amount, method) => {
    if (amount <= 0) throw { status: 400, message: 'Valor inválido' };
    const user = await getUserById(userId);
    if (!user) throw { status: 404, message: 'Usuário não encontrado' };

    const result = await paymentService.createDeposit(userId, amount, method);
    return result;
};

// Retirar fundos (chama PaymentService)
const withdrawFunds = async (userId, amount, method) => {
    if (amount <= 0) throw { status: 400, message: 'Valor inválido' };
    const user = await getUserById(userId);
    if (!user) throw { status: 404, message: 'Usuário não encontrado' };

    const result = await paymentService.createWithdrawal(userId, amount, method);
    return result;
};

module.exports = {
    getWalletBalance,
    getTransactions,
    depositFunds,
    withdrawFunds
};
