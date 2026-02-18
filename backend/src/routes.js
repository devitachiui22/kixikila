// =====================================================
// KIXIKILAHUB - REGISTRO GLOBAL DE ROTAS
// Versão final com verificações de middleware
// =====================================================

const express = require('express');
const router = express.Router();

// Middlewares globais
let authenticate, dynamicRateLimit;

try {
    authenticate = require('./middlewares/auth.middleware').authenticate;
    console.log('✅ authenticate carregado:', !!authenticate);
} catch (error) {
    console.error('❌ Erro ao carregar authenticate:', error.message);
    authenticate = (req, res, next) => next(); // fallback
}

try {
    dynamicRateLimit = require('./middlewares/rateLimit.middleware').dynamicRateLimit;
    console.log('✅ dynamicRateLimit carregado:', !!dynamicRateLimit);
} catch (error) {
    console.error('❌ Erro ao carregar dynamicRateLimit:', error.message);
    dynamicRateLimit = (req, res, next) => next(); // fallback
}

const logger = require('./utils/logger');

// =====================================================
// IMPORTAÇÃO DOS MÓDULOS DE ROTAS
// =====================================================
console.log('🚀 Iniciando carregamento dos módulos de rotas...');

let authRoutes, userRoutes, kycRoutes, walletRoutes, transactionRoutes, groupRoutes, chatRoutes, paymentRoutes;

try {
    authRoutes = require('./modules/auth/auth.routes');
    console.log('✅ authRoutes carregado:', !!authRoutes);
} catch (error) {
    console.error('❌ Erro ao carregar authRoutes:', error.message);
    authRoutes = express.Router(); // fallback
}

try {
    userRoutes = require('./modules/users/user.routes');
    console.log('✅ userRoutes carregado:', !!userRoutes);
} catch (error) {
    console.error('❌ Erro ao carregar userRoutes:', error.message);
    userRoutes = express.Router();
}

try {
    kycRoutes = require('./modules/kyc/kyc.routes');
    console.log('✅ kycRoutes carregado:', !!kycRoutes);
} catch (error) {
    console.error('❌ Erro ao carregar kycRoutes:', error.message);
    kycRoutes = express.Router();
}

try {
    walletRoutes = require('./modules/wallet/wallet.routes');
    console.log('✅ walletRoutes carregado:', !!walletRoutes);
} catch (error) {
    console.error('❌ Erro ao carregar walletRoutes:', error.message);
    walletRoutes = express.Router();
}

try {
    transactionRoutes = require('./modules/transactions/transaction.routes');
    console.log('✅ transactionRoutes carregado:', !!transactionRoutes);
} catch (error) {
    console.error('❌ Erro ao carregar transactionRoutes:', error.message);
    transactionRoutes = express.Router();
}

try {
    groupRoutes = require('./modules/groups/group.routes');
    console.log('✅ groupRoutes carregado:', !!groupRoutes);
} catch (error) {
    console.error('❌ Erro ao carregar groupRoutes:', error.message);
    groupRoutes = express.Router();
}

try {
    chatRoutes = require('./modules/chat/chat.routes');
    console.log('✅ chatRoutes carregado:', !!chatRoutes);
} catch (error) {
    console.error('❌ Erro ao carregar chatRoutes:', error.message);
    chatRoutes = express.Router();
}

try {
    paymentRoutes = require('./modules/payments/payment.routes');
    console.log('✅ paymentRoutes carregado:', !!paymentRoutes);
} catch (error) {
    console.error('❌ Erro ao carregar paymentRoutes:', error.message);
    paymentRoutes = express.Router();
}

// =====================================================
// VERSÃO DA API
// =====================================================
const API_VERSION = process.env.API_VERSION || 'v1';
const API_BASE = `/api/${API_VERSION}`;

// =====================================================
// ROTAS PÚBLICAS
// =====================================================

router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'KixikilaHub API está funcionando',
        timestamp: new Date().toISOString(),
        version: API_VERSION
    });
});

if (authRoutes) {
    router.use(`${API_BASE}/auth`, dynamicRateLimit, authRoutes);
    console.log('✅ Rota /auth registrada');
}

// =====================================================
// MIDDLEWARE DE AUTENTICAÇÃO
// =====================================================
if (authenticate) {
    router.use(authenticate);
    console.log('✅ Middleware authenticate registrado');
}

// =====================================================
// ROTAS PROTEGIDAS
// =====================================================

if (userRoutes) {
    router.use(`${API_BASE}/users`, dynamicRateLimit, userRoutes);
    console.log('✅ Rota /users registrada');
}

if (kycRoutes) {
    router.use(`${API_BASE}/kyc`, dynamicRateLimit, kycRoutes);
    console.log('✅ Rota /kyc registrada');
}

if (walletRoutes) {
    router.use(`${API_BASE}/wallet`, dynamicRateLimit, walletRoutes);
    console.log('✅ Rota /wallet registrada');
}

if (transactionRoutes) {
    router.use(`${API_BASE}/transactions`, dynamicRateLimit, transactionRoutes);
    console.log('✅ Rota /transactions registrada');
}

if (groupRoutes) {
    router.use(`${API_BASE}/groups`, dynamicRateLimit, groupRoutes);
    console.log('✅ Rota /groups registrada');
}

if (chatRoutes) {
    router.use(`${API_BASE}/chat`, dynamicRateLimit, chatRoutes);
    console.log('✅ Rota /chat registrada');
}

if (paymentRoutes) {
    router.use(`${API_BASE}/payments`, dynamicRateLimit, paymentRoutes);
    console.log('✅ Rota /payments registrada');
}

// =====================================================
// LOG FINAL
// =====================================================
console.log('📋 Rotas configuradas com sucesso!');
console.log(`- API Base: ${API_BASE}`);
console.log(`- Auth: ${API_BASE}/auth`);
console.log(`- Users: ${API_BASE}/users`);
console.log(`- KYC: ${API_BASE}/kyc`);
console.log(`- Wallet: ${API_BASE}/wallet`);
console.log(`- Transactions: ${API_BASE}/transactions`);
console.log(`- Groups: ${API_BASE}/groups`);
console.log(`- Chat: ${API_BASE}/chat`);
console.log(`- Payments: ${API_BASE}/payments`);

module.exports = router;
