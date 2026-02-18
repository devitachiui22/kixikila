// =====================================================
// KIXIKILAHUB - MIDDLEWARES DE RATE LIMITING
// Versão sem Redis para produção
// =====================================================

const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const logger = require('../utils/logger');

// =====================================================
// FUNÇÃO AUXILIAR PARA CRIAR LIMITADORES
// =====================================================

/**
 * Cria um rate limiter com configurações personalizadas
 */
const createLimiter = (options = {}) => {
    const defaultOptions = {
        windowMs: 15 * 60 * 1000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
            success: false,
            error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Muitas requisições. Tente novamente mais tarde.',
                retryAfter: null
            }
        },
        keyGenerator: (req) => {
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
        skip: (req) => false
    };

    return rateLimit({ ...defaultOptions, ...options });
};

// =====================================================
// LIMITADORES ESPECÍFICOS
// =====================================================

const apiLimiter = createLimiter({
    windowMs: config.security?.rateLimit?.windowMs || 15 * 60 * 1000,
    max: config.security?.rateLimit?.max || 100
});

const authLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: config.security?.rateLimit?.maxAuth || 5,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
        const email = req.body.email || '';
        return `${req.ip}:${email}`;
    }
});

const createGroupLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5
});

const chatMessageLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 30
});

const financialLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 10
});

const kycLimiter = createLimiter({
    windowMs: 24 * 60 * 60 * 1000,
    max: 3
});

const emailVerificationLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 3
});

const pinChangeLimiter = createLimiter({
    windowMs: 24 * 60 * 60 * 1000,
    max: 2
});

const searchLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 20
});

module.exports = {
    apiLimiter,
    authLimiter,
    createGroupLimiter,
    chatMessageLimiter,
    financialLimiter,
    kycLimiter,
    emailVerificationLimiter,
    pinChangeLimiter,
    searchLimiter,
    createLimiter
};
