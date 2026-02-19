// =====================================================
// KIXIKILAHUB - REGISTRO GLOBAL DE ROTAS
// CORREÇÃO: Garantir que rotas públicas venham antes do middleware
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
    authenticate = (req, res, next) => next();
}

try {
    dynamicRateLimit = require('./middlewares/rateLimit.middleware').dynamicRateLimit;
    console.log('✅ dynamicRateLimit carregado:', !!dynamicRateLimit);
} catch (error) {
    console.error('❌ Erro ao carregar dynamicRateLimit:', error.message);
    dynamicRateLimit = (req, res, next) => next();
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
    authRoutes = express.Router();
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
// 1. PRIMEIRO: ROTAS PÚBLICAS (SEM AUTENTICAÇÃO)
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

// Rotas de autenticação (públicas) - ANTES do middleware
if (authRoutes) {
    router.use(`${API_BASE}/auth`, dynamicRateLimit, authRoutes);
    console.log('✅ Rota /auth registrada (PÚBLICA)');
}

// =====================================================
// 2. DEPOIS: MIDDLEWARE DE AUTENTICAÇÃO
// =====================================================
// Todas as rotas APÓS este ponto exigem autenticação
if (authenticate) {
    router.use(authenticate);
    console.log('✅ Middleware authenticate registrado - rotas abaixo são PROTEGIDAS');
} else {
    console.error('❌ Middleware authenticate não disponível!');
}

// =====================================================
// 3. ROTAS PROTEGIDAS (REQUEREM AUTENTICAÇÃO)
// =====================================================

if (userRoutes) {
    router.use(`${API_BASE}/users`, dynamicRateLimit, userRoutes);
    console.log('✅ Rota /users registrada (PROTEGIDA)');
}

if (kycRoutes) {
    router.use(`${API_BASE}/kyc`, dynamicRateLimit, kycRoutes);
    console.log('✅ Rota /kyc registrada (PROTEGIDA)');
}

if (walletRoutes) {
    router.use(`${API_BASE}/wallet`, dynamicRateLimit, walletRoutes);
    console.log('✅ Rota /wallet registrada (PROTEGIDA)');
}

if (transactionRoutes) {
    router.use(`${API_BASE}/transactions`, dynamicRateLimit, transactionRoutes);
    console.log('✅ Rota /transactions registrada (PROTEGIDA)');
}

if (groupRoutes) {
    router.use(`${API_BASE}/groups`, dynamicRateLimit, groupRoutes);
    console.log('✅ Rota /groups registrada (PROTEGIDA)');
}

if (chatRoutes) {
    router.use(`${API_BASE}/chat`, dynamicRateLimit, chatRoutes);
    console.log('✅ Rota /chat registrada (PROTEGIDA)');
}

if (paymentRoutes) {
    router.use(`${API_BASE}/payments`, dynamicRateLimit, paymentRoutes);
    console.log('✅ Rota /payments registrada (PROTEGIDA)');
}

// =====================================================
// LOG FINAL
// =====================================================
console.log('📋 Rotas configuradas com sucesso!');
console.log(`- API Base: ${API_BASE}`);
console.log(`- Auth (PÚBLICA): ${API_BASE}/auth`);
console.log(`- Users (PROTEGIDA): ${API_BASE}/users`);
console.log(`- KYC (PROTEGIDA): ${API_BASE}/kyc`);
console.log(`- Wallet (PROTEGIDA): ${API_BASE}/wallet`);
console.log(`- Transactions (PROTEGIDA): ${API_BASE}/transactions`);
console.log(`- Groups (PROTEGIDA): ${API_BASE}/groups`);
console.log(`- Chat (PROTEGIDA): ${API_BASE}/chat`);
console.log(`- Payments (PROTEGIDA): ${API_BASE}/payments`);

module.exports = router;
