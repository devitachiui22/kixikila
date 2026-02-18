// =====================================================
// KIXIKILAHUB - ROTAS DA WALLET
// Gerenciamento de carteira, saldos e PIN
// =====================================================

const express = require('express');
const router = express.Router();

// Controllers
const walletController = require('./wallet.controller');

// Middlewares
const { validate } = require('../../middlewares/validation.middleware');
const { walletSchemas } = require('../../middlewares/validation.middleware');
const {
    authenticate,
    requireKYC,
    requirePin,
    checkDailyLimit
} = require('../../middlewares/auth.middleware');
const { financialLimiter, pinChangeLimiter } = require('../../middlewares/rateLimit.middleware');
const { catchAsync } = require('../../middlewares/error.middleware');

// =====================================================
// TODAS AS ROTAS REQUEREM AUTENTICAÇÃO
// =====================================================

/**
 * @swagger
 * /wallet/balance:
 *   get:
 *     summary: Obter saldo da carteira
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Saldo atual
 *       401:
 *         description: Não autorizado
 */
router.get(
    '/balance',
    authenticate,
    catchAsync(walletController.getBalance)
);

/**
 * @swagger
 * /wallet/pin/set:
 *   post:
 *     summary: Configurar PIN da carteira
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pin
 *               - confirmPin
 *             properties:
 *               pin:
 *                 type: string
 *                 pattern: '^[0-9]{4}$'
 *               confirmPin:
 *                 type: string
 *                 pattern: '^[0-9]{4}$'
 *     responses:
 *       200:
 *         description: PIN configurado
 *       400:
 *         description: Erro de validação
 */
router.post(
    '/pin/set',
    authenticate,
    pinChangeLimiter,
    validate(walletSchemas.setPin),
    catchAsync(walletController.setPin)
);

/**
 * @swagger
 * /wallet/pin/verify:
 *   post:
 *     summary: Verificar PIN (para operações)
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pin
 *             properties:
 *               pin:
 *                 type: string
 *                 pattern: '^[0-9]{4}$'
 *     responses:
 *       200:
 *         description: PIN válido
 *       401:
 *         description: PIN inválido
 */
router.post(
    '/pin/verify',
    authenticate,
    validate(walletSchemas.verifyPin),
    catchAsync(walletController.verifyPin)
);

/**
 * @swagger
 * /wallet/pin/change:
 *   post:
 *     summary: Alterar PIN
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - oldPin
 *               - newPin
 *               - confirmNewPin
 *             properties:
 *               oldPin:
 *                 type: string
 *                 pattern: '^[0-9]{4}$'
 *               newPin:
 *                 type: string
 *                 pattern: '^[0-9]{4}$'
 *               confirmNewPin:
 *                 type: string
 *                 pattern: '^[0-9]{4}$'
 *     responses:
 *       200:
 *         description: PIN alterado
 *       400:
 *         description: Erro de validação
 */
router.post(
    '/pin/change',
    authenticate,
    pinChangeLimiter,
    validate(walletSchemas.changePin),
    catchAsync(walletController.changePin)
);

/**
 * @swagger
 * /wallet/statement:
 *   get:
 *     summary: Obter extrato da carteira
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         name: type
 *         schema:
 *           type: string
 *           enum: [DEPOSIT, WITHDRAWAL, GROUP_PAYMENT, GROUP_RECEIVE, FEE, BONUS]
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
 *     responses:
 *       200:
 *         description: Extrato de transações
 */
router.get(
    '/statement',
    authenticate,
    catchAsync(walletController.getStatement)
);

/**
 * @swagger
 * /wallet/deposit:
 *   post:
 *     summary: Realizar depósito
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - method
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 100
 *                 maximum: 200000
 *               method:
 *                 type: string
 *                 enum: [MULTICAIXA, IBAN, KWIK]
 *               reference:
 *                 type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       200:
 *         description: Depósito processado
 *       400:
 *         description: Erro de validação
 *       402:
 *         description: Falha no pagamento
 */
router.post(
    '/deposit',
    authenticate,
    requireKYC,
    financialLimiter,
    checkDailyLimit('deposit'),
    validate(walletSchemas.deposit),
    catchAsync(walletController.deposit)
);

/**
 * @swagger
 * /wallet/withdraw:
 *   post:
 *     summary: Realizar saque
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - method
 *               - destination
 *               - pin
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 100
 *                 maximum: 100000
 *               method:
 *                 type: string
 *                 enum: [MULTICAIXA, IBAN, KWIK]
 *               destination:
 *                 type: object
 *                 properties:
 *                   iban:
 *                     type: string
 *                   phone:
 *                     type: string
 *                   ownerName:
 *                     type: string
 *               pin:
 *                 type: string
 *                 pattern: '^[0-9]{4}$'
 *     responses:
 *       200:
 *         description: Saque processado
 *       400:
 *         description: Erro de validação
 *       402:
 *         description: Falha no pagamento
 */
router.post(
    '/withdraw',
    authenticate,
    requireKYC,
    requirePin,
    financialLimiter,
    checkDailyLimit('withdrawal'),
    validate(walletSchemas.withdraw),
    catchAsync(walletController.withdraw)
);

/**
 * @swagger
 * /wallet/transfer:
 *   post:
 *     summary: Transferir para outro usuário
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - toUserId
 *               - amount
 *               - pin
 *             properties:
 *               toUserId:
 *                 type: string
 *                 format: uuid
 *               amount:
 *                 type: number
 *                 minimum: 100
 *               description:
 *                 type: string
 *               pin:
 *                 type: string
 *                 pattern: '^[0-9]{4}$'
 *     responses:
 *       200:
 *         description: Transferência realizada
 *       400:
 *         description: Erro de validação
 *       404:
 *         description: Usuário destino não encontrado
 */
router.post(
    '/transfer',
    authenticate,
    requireKYC,
    requirePin,
    financialLimiter,
    validate(walletSchemas.transfer),
    catchAsync(walletController.transfer)
);

/**
 * @swagger
 * /wallet/bonuses:
 *   get:
 *     summary: Listar bônus disponíveis
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de bônus
 */
router.get(
    '/bonuses',
    authenticate,
    catchAsync(walletController.getBonuses)
);

/**
 * @swagger
 * /wallet/fees:
 *   get:
 *     summary: Obter taxas aplicáveis
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Taxas do sistema
 */
router.get(
    '/fees',
    authenticate,
    catchAsync(walletController.getFees)
);

// =====================================================
// EXPORTS
// =====================================================
module.exports = router;