// =====================================================
// KIXIKILAHUB - REGISTRO GLOBAL DE ROTAS
// VERSÃO 100% FUNCIONAL - ROTAS PÚBLICAS CORRETAMENTE SEPARADAS
// =====================================================

const express = require('express');
const router = express.Router();

// Middlewares
const { authenticate } = require('./middlewares/auth.middleware');
const { dynamicRateLimit } = require('./middlewares/rateLimit.middleware');
const logger = require('./utils/logger');

// =====================================================
// VERSÃO DA API
// =====================================================
const API_VERSION = process.env.API_VERSION || 'v1';
const API_BASE = `/api/${API_VERSION}`;

// =====================================================
// 1. ROTAS PÚBLICAS (NÃO EXIGEM TOKEN)
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

// Rotas de autenticação (TODAS PÚBLICAS)
const authRoutes = require('./modules/auth/auth.routes');
router.use(`${API_BASE}/auth`, dynamicRateLimit, authRoutes);
console.log('✅ Rotas de autenticação registradas (PÚBLICAS)');

// =====================================================
// 2. MIDDLEWARE DE AUTENTICAÇÃO (APENAS PARA ROTAS PROTEGIDAS)
// =====================================================
router.use(`${API_BASE}`, authenticate); // Só protege rotas abaixo

// =====================================================
// 3. ROTAS PROTEGIDAS (EXIGEM TOKEN VÁLIDO)
// =====================================================

// Usuários
const userRoutes = require('./modules/users/user.routes');
router.use(`${API_BASE}/users`, dynamicRateLimit, userRoutes);
console.log('✅ Rotas de usuários registradas (PROTEGIDAS)');

// KYC
const kycRoutes = require('./modules/kyc/kyc.routes');
router.use(`${API_BASE}/kyc`, dynamicRateLimit, kycRoutes);
console.log('✅ Rotas de KYC registradas (PROTEGIDAS)');

// Wallet
const walletRoutes = require('./modules/wallet/wallet.routes');
router.use(`${API_BASE}/wallet`, dynamicRateLimit, walletRoutes);
console.log('✅ Rotas de wallet registradas (PROTEGIDAS)');

// Transações
const transactionRoutes = require('./modules/transactions/transaction.routes');
router.use(`${API_BASE}/transactions`, dynamicRateLimit, transactionRoutes);
console.log('✅ Rotas de transações registradas (PROTEGIDAS)');

// Grupos
const groupRoutes = require('./modules/groups/group.routes');
router.use(`${API_BASE}/groups`, dynamicRateLimit, groupRoutes);
console.log('✅ Rotas de grupos registradas (PROTEGIDAS)');

// Chat
const chatRoutes = require('./modules/chat/chat.routes');
router.use(`${API_BASE}/chat`, dynamicRateLimit, chatRoutes);
console.log('✅ Rotas de chat registradas (PROTEGIDAS)');

// Pagamentos
const paymentRoutes = require('./modules/payments/payment.routes');
router.use(`${API_BASE}/payments`, dynamicRateLimit, paymentRoutes);
console.log('✅ Rotas de pagamentos registradas (PROTEGIDAS)');

module.exports = router;
