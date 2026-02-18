// =====================================================
// KIXIKILAHUB - MIDDLEWARES DE RATE LIMITING
// Controle de taxa de requisições por IP, usuário e rota
// =====================================================

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');
const config = require('../config/env');
const logger = require('../utils/logger');

// =====================================================
// CONFIGURAÇÃO DO REDIS (OPCIONAL)
// =====================================================
let redisClient;
if (config.redis.host !== 'localhost' || config.server.isProduction) {
    try {
        redisClient = new Redis({
            host: config.redis.host,
            port: config.redis.port,
            password: config.redis.password,
            db: config.redis.db,
            lazyConnect: true,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            }
        });

        redisClient.on('error', (err) => {
            logger.error('❌ Erro na conexão Redis para rate limit:', err);
        });

        redisClient.on('connect', () => {
            logger.info('✅ Redis conectado para rate limit');
        });
    } catch (error) {
        logger.warn('⚠️ Redis não disponível, usando memory store para rate limit');
        redisClient = null;
    }
}

// =====================================================
// FUNÇÃO AUXILIAR PARA CRIAR LIMITADORES
// =====================================================

/**
 * Cria um rate limiter com configurações personalizadas
 */
const createLimiter = (options = {}) => {
    const defaultOptions = {
        windowMs: 15 * 60 * 1000, // 15 minutos
        max: 100, // limite por windowMs
        standardHeaders: true, // Retornar headers RateLimit-*
        legacyHeaders: false, // Não usar headers X-RateLimit-*
        message: {
            success: false,
            error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Muitas requisições. Tente novamente mais tarde.',
                retryAfter: null
            }
        },
        keyGenerator: (req) => {
            // Usar userId se autenticado, senão IP
            if (req.user && req.user.id) {
                return `user:${req.user.id}`;
            }
            return req.ip || req.connection.remoteAddress;
        },
        handler: (req, res, next, options) => {
            const retryAfter = Math.ceil(options.windowMs / 1000);

            logger.warn(`🚨 Rate limit excedido para ${options.keyGenerator(req)}`, {
                path: req.path,
                method: req.method,
                ip: req.ip,
                userId: req.user?.id
            });

            res.status(429).json({
                success: false,
                error: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: options.message.error.message,
                    retryAfter
                }
            });
        },
        skip: (req) => {
            // Pular rate limit para certas condições
            return false;
        }
    };

    // Configurar store
    if (redisClient) {
        defaultOptions.store = new RedisStore({
            client: redisClient,
            prefix: 'rl:',
            sendCommand: (...args) => redisClient.call(...args)
        });
    }

    return rateLimit({ ...defaultOptions, ...options });
};

// =====================================================
// LIMITADORES ESPECÍFICOS
// =====================================================

/**
 * Rate limit geral para API
 */
const apiLimiter = createLimiter({
    windowMs: config.security.rateLimit.windowMs,
    max: config.security.rateLimit.max,
    message: {
        error: {
            code: 'API_RATE_LIMIT',
            message: 'Limite de requisições da API excedido'
        }
    }
});

/**
 * Rate limit para autenticação (mais restritivo)
 */
const authLimiter = createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: config.security.rateLimit.maxAuth,
    skipSuccessfulRequests: true, // Não contar requisições bem-sucedidas
    message: {
        error: {
            code: 'AUTH_RATE_LIMIT',
            message: 'Muitas tentativas de autenticação. Tente novamente em 15 minutos.'
        }
    },
    keyGenerator: (req) => {
        // Para auth, usar IP + email (se fornecido)
        const email = req.body.email || '';
        return `${req.ip}:${email}`;
    }
});

/**
 * Rate limit para criação de grupos
 */
const createGroupLimiter = createLimiter({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 5, // Máximo 5 grupos por hora
    message: {
        error: {
            code: 'GROUP_CREATE_LIMIT',
            message: 'Limite de criação de grupos excedido (máx 5 por hora)'
        }
    }
});

/**
 * Rate limit para envio de mensagens no chat
 */
const chatMessageLimiter = createLimiter({
    windowMs: 60 * 1000, // 1 minuto
    max: 30, // Máximo 30 mensagens por minuto
    message: {
        error: {
            code: 'CHAT_RATE_LIMIT',
            message: 'Limite de mensagens excedido. Aguarde um momento.'
        }
    }
});

/**
 * Rate limit para operações financeiras (depósitos/saques)
 */
const financialLimiter = createLimiter({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 10, // Máximo 10 operações financeiras por hora
    message: {
        error: {
            code: 'FINANCIAL_RATE_LIMIT',
            message: 'Limite de operações financeiras excedido. Tente novamente mais tarde.'
        }
    }
});

/**
 * Rate limit para verificação de KYC (uploads de documentos)
 */
const kycLimiter = createLimiter({
    windowMs: 24 * 60 * 60 * 1000, // 24 horas
    max: 3, // Máximo 3 tentativas de KYC por dia
    message: {
        error: {
            code: 'KYC_RATE_LIMIT',
            message: 'Limite de tentativas de KYC excedido. Tente novamente amanhã.'
        }
    }
});

/**
 * Rate limit para reenvio de email de verificação
 */
const emailVerificationLimiter = createLimiter({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 3, // Máximo 3 reenvios por hora
    message: {
        error: {
            code: 'EMAIL_VERIFICATION_LIMIT',
            message: 'Limite de reenvio de email excedido. Tente novamente em 1 hora.'
        }
    }
});

/**
 * Rate limit para alteração de PIN
 */
const pinChangeLimiter = createLimiter({
    windowMs: 24 * 60 * 60 * 1000, // 24 horas
    max: 2, // Máximo 2 alterações de PIN por dia
    message: {
        error: {
            code: 'PIN_CHANGE_LIMIT',
            message: 'Limite de alterações de PIN excedido. Tente novamente amanhã.'
        }
    }
});

/**
 * Rate limit para busca de grupos
 */
const searchLimiter = createLimiter({
    windowMs: 60 * 1000, // 1 minuto
    max: 20, // Máximo 20 buscas por minuto
    message: {
        error: {
            code: 'SEARCH_RATE_LIMIT',
            message: 'Limite de buscas excedido. Aguarde um momento.'
        }
    }
});

// =====================================================
// LIMITADORES POR ENDPOINT (PRÉ-CONFIGURADOS)
// =====================================================

const limiters = {
    // Autenticação
    login: authLimiter,
    register: authLimiter,
    forgotPassword: authLimiter,
    resetPassword: authLimiter,
    verifyEmail: authLimiter,
    resendVerification: emailVerificationLimiter,
    refreshToken: createLimiter({ windowMs: 60 * 60 * 1000, max: 10 }),

    // Usuários
    updateProfile: createLimiter({ windowMs: 60 * 60 * 1000, max: 10 }),
    changePassword: createLimiter({ windowMs: 60 * 60 * 1000, max: 5 }),
    changePin: pinChangeLimiter,

    // KYC
    submitKYC: kycLimiter,
    uploadDocument: createLimiter({ windowMs: 60 * 60 * 1000, max: 10 }),

    // Grupos
    createGroup: createGroupLimiter,
    joinGroup: createLimiter({ windowMs: 60 * 60 * 1000, max: 20 }),
    leaveGroup: createLimiter({ windowMs: 60 * 60 * 1000, max: 10 }),
    searchGroups: searchLimiter,

    // Chat
    sendMessage: chatMessageLimiter,
    getHistory: createLimiter({ windowMs: 60 * 1000, max: 30 }),

    // Wallet
    deposit: financialLimiter,
    withdraw: financialLimiter,
    transfer: financialLimiter,
    getBalance: createLimiter({ windowMs: 60 * 1000, max: 30 }),

    // Admin
    adminRoutes: createLimiter({ windowMs: 60 * 1000, max: 5 }),

    // Públicas
    publicRoutes: createLimiter({ windowMs: 60 * 1000, max: 60 })
};

// =====================================================
// MIDDLEWARE DINÂMICO BASEADO EM CONFIGURAÇÃO
// =====================================================

/**
 * Aplica rate limit baseado na rota
 */
const dynamicRateLimit = (req, res, next) => {
    // Determinar tipo de rota
    const path = req.path;
    let limiter = limiters.publicRoutes;

    if (path.includes('/auth/')) {
        if (path.includes('/login') || path.includes('/register')) {
            limiter = limiters.login;
        } else if (path.includes('/verify-email')) {
            limiter = limiters.verifyEmail;
        } else if (path.includes('/resend-verification')) {
            limiter = limiters.resendVerification;
        } else if (path.includes('/refresh-token')) {
            limiter = limiters.refreshToken;
        } else {
            limiter = limiters.forgotPassword;
        }
    } else if (path.includes('/kyc/')) {
        limiter = limiters.submitKYC;
    } else if (path.includes('/groups/')) {
        if (path.includes('/create') || req.method === 'POST') {
            limiter = limiters.createGroup;
        } else if (path.includes('/search')) {
            limiter = limiters.searchGroups;
        } else if (path.includes('/join')) {
            limiter = limiters.joinGroup;
        } else if (path.includes('/leave')) {
            limiter = limiters.leaveGroup;
        }
    } else if (path.includes('/chat/')) {
        if (path.includes('/message') || req.method === 'POST') {
            limiter = limiters.sendMessage;
        } else {
            limiter = limiters.getHistory;
        }
    } else if (path.includes('/wallet/')) {
        if (path.includes('/deposit') || path.includes('/withdraw')) {
            limiter = limiters.deposit;
        } else {
            limiter = limiters.getBalance;
        }
    } else if (path.includes('/admin/')) {
        limiter = limiters.adminRoutes;
    }

    // Aplicar o limiter
    return limiter(req, res, next);
};

// =====================================================
// MIDDLEWARE DE MONITORAMENTO DE RATE LIMIT
// =====================================================

/**
 * Middleware para monitorar e logar quando rate limit está próximo
 */
const rateLimitMonitor = (threshold = 0.8) => {
    return async (req, res, next) => {
        if (!redisClient) {
            return next();
        }

        try {
            const key = `rl:{user:${req.user?.id || req.ip}}`;
            const current = await redisClient.get(key);

            if (current) {
                const used = parseInt(current);
                const max = config.security.rateLimit.max;

                if (used >= max * threshold) {
                    logger.warn(`⚠️ Rate limit próximo do limite para ${req.user?.id || req.ip}`, {
                        used,
                        max,
                        percent: Math.round((used / max) * 100)
                    });
                }
            }
        } catch (error) {
            logger.error('Erro no monitoramento de rate limit:', error);
        }

        next();
    };
};

// =====================================================
// MIDDLEWARE PARA RESETAR RATE LIMIT (APENAS ADMIN)
// =====================================================

/**
 * Resetar rate limit para um usuário ou IP
 */
const resetRateLimit = async (req, res) => {
    try {
        const { identifier } = req.params;

        if (!identifier || !redisClient) {
            return res.status(400).json({
                success: false,
                error: 'Identificador inválido ou Redis não disponível'
            });
        }

        // Remover todas as chaves relacionadas
        const keys = await redisClient.keys(`rl:*${identifier}*`);

        if (keys.length > 0) {
            await redisClient.del(keys);
        }

        logger.info(`✅ Rate limit resetado para ${identifier} por admin ${req.user.id}`);

        res.json({
            success: true,
            message: `Rate limit resetado para ${identifier}`,
            keysRemoved: keys.length
        });
    } catch (error) {
        logger.error('Erro ao resetar rate limit:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao resetar rate limit'
        });
    }
};

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
    // Limitadores pré-configurados
    apiLimiter,
    authLimiter,
    createGroupLimiter,
    chatMessageLimiter,
    financialLimiter,
    kycLimiter,
    emailVerificationLimiter,
    pinChangeLimiter,
    searchLimiter,

    // Limitador dinâmico
    dynamicRateLimit,

    // Utilitários
    rateLimitMonitor,
    resetRateLimit,

    // Função para criar limitadores personalizados
    createLimiter
};