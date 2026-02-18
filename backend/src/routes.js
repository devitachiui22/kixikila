// =====================================================
// KIXIKILAHUB - REGISTRO GLOBAL DE ROTAS
// Versão com debug para identificar módulo não carregado
// =====================================================

const express = require('express');
const router = express.Router();

// Middlewares globais
const { authenticate } = require('./middlewares/auth.middleware');
const { dynamicRateLimit } = require('./middlewares/rateLimit.middleware');
const logger = require('./utils/logger');

// =====================================================
// IMPORTAÇÃO COM VERIFICAÇÃO DETALHADA
// =====================================================
console.log('🚀 Iniciando carregamento dos módulos de rotas...');

let authRoutes, userRoutes, kycRoutes, walletRoutes, transactionRoutes, groupRoutes, chatRoutes, paymentRoutes;

try {
    authRoutes = require('./modules/auth/auth.routes');
    console.log('✅ authRoutes carregado:', !!authRoutes);
} catch (error) {
    console.error('❌ Erro ao carregar authRoutes:', error.message);
}

try {
    userRoutes = require('./modules/users/user.routes');
    console.log('✅ userRoutes carregado:', !!userRoutes);
} catch (error) {
    console.error('❌ Erro ao carregar userRoutes:', error.message);
}

try {
    kycRoutes = require('./modules/kyc/kyc.routes');
    console.log('✅ kycRoutes carregado:', !!kycRoutes);
} catch (error) {
    console.error('❌ Erro ao carregar kycRoutes:', error.message);
}

try {
    walletRoutes = require('./modules/wallet/wallet.routes');
    console.log('✅ walletRoutes carregado:', !!walletRoutes);
} catch (error) {
    console.error('❌ Erro ao carregar walletRoutes:', error.message);
}

try {
    transactionRoutes = require('./modules/transactions/transaction.routes');
    console.log('✅ transactionRoutes carregado:', !!transactionRoutes);
} catch (error) {
    console.error('❌ Erro ao carregar transactionRoutes:', error.message);
}

try {
    groupRoutes = require('./modules/groups/group.routes');
    console.log('✅ groupRoutes carregado:', !!groupRoutes);
} catch (error) {
    console.error('❌ Erro ao carregar groupRoutes:', error.message);
}

try {
    chatRoutes = require('./modules/chat/chat.routes');
    console.log('✅ chatRoutes carregado:', !!chatRoutes);
} catch (error) {
    console.error('❌ Erro ao carregar chatRoutes:', error.message);
}

try {
    paymentRoutes = require('./modules/payments/payment.routes');
    console.log('✅ paymentRoutes carregado:', !!paymentRoutes);
} catch (error) {
    console.error('❌ Erro ao carregar paymentRoutes:', error.message);
}

// =====================================================
// VERSÃO DA API
// =====================================================
const API_VERSION = process.env.API_VERSION || 'v1';
const API_BASE = `/api/${API_VERSION}`;

// =====================================================
// ROTAS PÚBLICAS (SEM AUTENTICAÇÃO)
// =====================================================

// Health check
router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'KixikilaHub API está funcionando',
        timestamp: new Date().toISOString(),
        version: API_VERSION
    });
});

// Rotas de autenticação
if (authRoutes && typeof authRoutes === 'function') {
    router.use(`${API_BASE}/auth`, dynamicRateLimit, authRoutes);
    console.log('✅ Rota /auth registrada');
} else {
    console.error('❌ authRoutes não é uma função válida:', typeof authRoutes);
}

// =====================================================
// MIDDLEWARE DE AUTENTICAÇÃO GLOBAL
// =====================================================
router.use(authenticate);

// =====================================================
// ROTAS PROTEGIDAS (COM VERIFICAÇÃO)
// =====================================================

if (userRoutes && typeof userRoutes === 'function') {
    router.use(`${API_BASE}/users`, dynamicRateLimit, userRoutes);
    console.log('✅ Rota /users registrada');
}

if (kycRoutes && typeof kycRoutes === 'function') {
    router.use(`${API_BASE}/kyc`, dynamicRateLimit, kycRoutes);
    console.log('✅ Rota /kyc registrada');
}

if (walletRoutes && typeof walletRoutes === 'function') {
    router.use(`${API_BASE}/wallet`, dynamicRateLimit, walletRoutes);
    console.log('✅ Rota /wallet registrada');
}

if (transactionRoutes && typeof transactionRoutes === 'function') {
    router.use(`${API_BASE}/transactions`, dynamicRateLimit, transactionRoutes);
    console.log('✅ Rota /transactions registrada');
}

if (groupRoutes && typeof groupRoutes === 'function') {
    router.use(`${API_BASE}/groups`, dynamicRateLimit, groupRoutes);
    console.log('✅ Rota /groups registrada');
}

if (chatRoutes && typeof chatRoutes === 'function') {
    router.use(`${API_BASE}/chat`, dynamicRateLimit, chatRoutes);
    console.log('✅ Rota /chat registrada');
}

if (paymentRoutes && typeof paymentRoutes === 'function') {
    router.use(`${API_BASE}/payments`, dynamicRateLimit, paymentRoutes);
    console.log('✅ Rota /payments registrada');
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
                    routes.push({ path: basePath + layer.route.path, methods });
                } else if (layer.name === 'router' && layer.handle.stack) {
                    extractRoutes(layer.handle.stack, basePath);
                }
            });
        };
        extractRoutes(router.stack);
        res.json({ total: routes.length, routes });
    });
}

// =====================================================
// LOG DE ROTAS REGISTRADAS
// =====================================================
console.log('📋 Resumo das rotas registradas:');
console.log(`- /auth: ${authRoutes ? '✅' : '❌'}`);
console.log(`- /users: ${userRoutes ? '✅' : '❌'}`);
console.log(`- /kyc: ${kycRoutes ? '✅' : '❌'}`);
console.log(`- /wallet: ${walletRoutes ? '✅' : '❌'}`);
console.log(`- /transactions: ${transactionRoutes ? '✅' : '❌'}`);
console.log(`- /groups: ${groupRoutes ? '✅' : '❌'}`);
console.log(`- /chat: ${chatRoutes ? '✅' : '❌'}`);
console.log(`- /payments: ${paymentRoutes ? '✅' : '❌'}`);

module.exports = router;
