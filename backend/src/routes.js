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
if (authRoutes) {
    router.use(`${API_BASE}/auth`, dynamicRateLimit, authRoutes);
} else {
    logger.error('❌ authRoutes não foi carregado corretamente');
}

// =====================================================
// MIDDLEWARE DE AUTENTICAÇÃO GLOBAL
// Todas as rotas abaixo requerem autenticação
// =====================================================
router.use(authenticate);

// =====================================================
// ROTAS PROTEGIDAS (COM AUTENTICAÇÃO)
// =====================================================

// Usuários
if (userRoutes) {
    router.use(`${API_BASE}/users`, dynamicRateLimit, userRoutes);
}

// KYC
if (kycRoutes) {
    router.use(`${API_BASE}/kyc`, dynamicRateLimit, kycRoutes);
}

// Wallet e transações
if (walletRoutes) {
    router.use(`${API_BASE}/wallet`, dynamicRateLimit, walletRoutes);
}

if (transactionRoutes) {
    router.use(`${API_BASE}/transactions`, dynamicRateLimit, transactionRoutes);
}

// Grupos
if (groupRoutes) {
    router.use(`${API_BASE}/groups`, dynamicRateLimit, groupRoutes);
}

// Chat
if (chatRoutes) {
    router.use(`${API_BASE}/chat`, dynamicRateLimit, chatRoutes);
}

// Pagamentos (mocks)
if (paymentRoutes) {
    router.use(`${API_BASE}/payments`, dynamicRateLimit, paymentRoutes);
}

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
