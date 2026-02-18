// =====================================================
// KIXIKILAHUB - ROTAS DE TRANSAÇÕES
// Histórico e detalhes de transações
// =====================================================

const express = require('express');
const router = express.Router();

// Controllers
const transactionController = require('./transaction.controller');

// Middlewares
const { authenticate } = require('../../middlewares/auth.middleware');
const { catchAsync } = require('../../middlewares/error.middleware');

// =====================================================
// TODAS AS ROTAS REQUEREM AUTENTICAÇÃO
// =====================================================

/**
 * @swagger
 * /transactions:
 *   get:
 *     summary: Listar transações do usuário
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [DEPOSIT, WITHDRAWAL, GROUP_PAYMENT, GROUP_RECEIVE, FEE, BONUS, TRANSFER]
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, COMPLETED, FAILED, CANCELLED]
 *     responses:
 *       200:
 *         description: Lista de transações
 */
router.get(
    '/',
    authenticate,
    catchAsync(transactionController.listTransactions)
);

/**
 * @swagger
 * /transactions/{transactionId}:
 *   get:
 *     summary: Obter detalhes de uma transação
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Detalhes da transação
 *       404:
 *         description: Transação não encontrada
 */
router.get(
    '/:transactionId',
    authenticate,
    catchAsync(transactionController.getTransactionDetails)
);

/**
 * @swagger
 * /transactions/{transactionId}/receipt:
 *   get:
 *     summary: Obter recibo da transação
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Recibo da transação
 *       404:
 *         description: Transação não encontrada
 */
router.get(
    '/:transactionId/receipt',
    authenticate,
    catchAsync(transactionController.getTransactionReceipt)
);

/**
 * @swagger
 * /transactions/summary/period:
 *   get:
 *     summary: Obter resumo de transações por período
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [today, week, month, year]
 *           default: month
 *     responses:
 *       200:
 *         description: Resumo de transações
 */
router.get(
    '/summary/period',
    authenticate,
    catchAsync(transactionController.getTransactionSummary)
);

/**
 * @swagger
 * /transactions/stats/overview:
 *   get:
 *     summary: Estatísticas de transações
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estatísticas consolidadas
 */
router.get(
    '/stats/overview',
    authenticate,
    catchAsync(transactionController.getTransactionStats)
);

// =====================================================
// EXPORTS - GARANTIR QUE É UMA FUNÇÃO
// =====================================================
module.exports = router; // Isso deve ser um router do Express, não um objeto
