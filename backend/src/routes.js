// =====================================================
// KIXIKILAHUB - REGISTRO GLOBAL DE ROTAS
// Agrupamento e organização de todas as rotas da API
// =====================================================

const express = require('express');
const router = express.Router();

// Middlewares globais
const { authenticate } = require('./middlewares/auth.middleware');
const { dynamicRateLimit } = require('./middlewares/rateLimit.middleware');
const logger = require('./utils/logger');

// Importação dos módulos de rotas
const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/user.routes');
const kycRoutes = require('./modules/kyc/kyc.routes');
const walletRoutes = require('./modules/wallet/wallet.routes');
const transactionRoutes = require('./modules/transactions/transaction.routes');
const groupRoutes = require('./modules/groups/group.routes');
const chatRoutes = require('./modules/chat/chat.routes');
const paymentRoutes = require('./modules/payments/payment.routes');

// =====================================================
// VERSÃO DA API
// =====================================================
const API_VERSION = process.env.API_VERSION || 'v1';
const API_BASE = `/api/${API_VERSION}`;

// =====================================================
// ROTAS PÚBLICAS (SEM AUTENTICAÇÃO)
// =====================================================

// Health check (sem rate limit)
router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'KixikilaHub API está funcionando',
        timestamp: new Date().toISOString(),
        version: API_VERSION
    });
});

// Rotas de autenticação (com rate limit específico)
router.use(`${API_BASE}/auth`, dynamicRateLimit, authRoutes);

// =====================================================
// MIDDLEWARE DE AUTENTICAÇÃO GLOBAL
// Todas as rotas abaixo requerem autenticação
// =====================================================
router.use(authenticate);

// =====================================================
// ROTAS PROTEGIDAS (COM AUTENTICAÇÃO)
// =====================================================

// Usuários
router.use(`${API_BASE}/users`, dynamicRateLimit, userRoutes);

// KYC
router.use(`${API_BASE}/kyc`, dynamicRateLimit, kycRoutes);

// Wallet e transações
router.use(`${API_BASE}/wallet`, dynamicRateLimit, walletRoutes);
router.use(`${API_BASE}/transactions`, dynamicRateLimit, transactionRoutes);

// Grupos
router.use(`${API_BASE}/groups`, dynamicRateLimit, groupRoutes);

// Chat
router.use(`${API_BASE}/chat`, dynamicRateLimit, chatRoutes);

// Pagamentos (mocks)
router.use(`${API_BASE}/payments`, dynamicRateLimit, paymentRoutes);

// =====================================================
// ROTA DE DEBUG (APENAS DESENVOLVIMENTO)
// =====================================================
if (process.env.NODE_ENV === 'development') {
    router.get('/api/debug/routes', (req, res) => {
        const routes = [];

        const extractRoutes = (stack, basePath = '') => {
            stack.forEach((layer) => {
                if (layer.route) {
                    const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
                    routes.push({
                        path: basePath + layer.route.path,
                        methods
                    });
                } else if (layer.name === 'router' && layer.handle.stack) {
                    const routerPath = layer.regexp.source
                        .replace('\\/?(?=\\/|$)', '')
                        .replace(/\\\//g, '/')
                        .replace(/\^/g, '')
                        .replace(/\?/g, '')
                        .replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, ':param');
                    extractRoutes(layer.handle.stack, routerPath);
                }
            });
        };

        extractRoutes(router.stack);

        res.json({
            total: routes.length,
            routes: routes.sort((a, b) => a.path.localeCompare(b.path))
        });
    });
}

// =====================================================
// DOCUMENTAÇÃO DAS ROTAS
// =====================================================

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Autenticação e registro
 *   - name: Users
 *     description: Gerenciamento de usuários
 *   - name: KYC
 *     description: Verificação de identidade
 *   - name: Wallet
 *     description: Carteira digital e saldos
 *   - name: Transactions
 *     description: Histórico de transações
 *   - name: Groups
 *     description: Grupos de Kixikila
 *   - name: Chat
 *     description: Chat em tempo real
 *   - name: Payments
 *     description: Pagamentos simulados
 */

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   responses:
 *     UnauthorizedError:
 *       description: Token ausente ou inválido
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               error:
 *                 type: object
 *                 properties:
 *                   code:
 *                     type: string
 *                     example: UNAUTHORIZED
 *                   message:
 *                     type: string
 *                     example: Não autorizado
 */

// =====================================================
// LOG DE ROTAS REGISTRADAS
// =====================================================
logger.info('✅ Rotas registradas:', {
    auth: `${API_BASE}/auth`,
    users: `${API_BASE}/users`,
    kyc: `${API_BASE}/kyc`,
    wallet: `${API_BASE}/wallet`,
    transactions: `${API_BASE}/transactions`,
    groups: `${API_BASE}/groups`,
    chat: `${API_BASE}/chat`,
    payments: `${API_BASE}/payments`
});

// =====================================================
// EXPORTS
// =====================================================
module.exports = router;