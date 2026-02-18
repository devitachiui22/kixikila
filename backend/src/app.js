// =====================================================
// KIXIKILAHUB - CONFIGURAÇÃO PRINCIPAL DO EXPRESS
// Middlewares, segurança, rotas e tratamento de erros
// =====================================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');
const path = require('path');
const config = require('./config/env');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middlewares/error.middleware');
const { requestLogger } = require('./utils/logger');

// Importar rotas
const routes = require('./routes');

// =====================================================
// INICIALIZAÇÃO DO EXPRESS
// =====================================================
const app = express();

// =====================================================
// MIDDLEWARES DE SEGURANÇA
// =====================================================

// Helmet para headers de segurança
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", config.server.apiUrl, config.server.clientUrl]
        }
    },
    crossOriginEmbedderPolicy: false // Desabilitar para Socket.IO
}));

// CORS configurado
app.use(cors({
    origin: config.security.corsOrigin,
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token']
}));

// Compressão de respostas
app.use(compression());

// Cookie parser
app.use(cookieParser(config.security.sessionSecret));

// Body parser com limites
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sanitização contra NoSQL injection (para MongoDB, mantido por compatibilidade)
app.use(mongoSanitize());

// Prevenção XSS
app.use(xss());

// Prevenção HTTP Parameter Pollution
app.use(hpp());

// =====================================================
// RATE LIMITING
// =====================================================

// Rate limit geral
const limiter = rateLimit({
    windowMs: config.security.rateLimit.windowMs,
    max: config.security.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Muitas requisições deste IP, tente novamente mais tarde.',
        code: 'RATE_LIMIT_EXCEEDED'
    },
    keyGenerator: (req) => {
        return req.ip || req.connection.remoteAddress;
    },
    skip: (req) => {
        // Pular rate limit para certas rotas em produção?
        return false;
    }
});

// Rate limit específico para autenticação
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: config.security.rateLimit.maxAuth,
    skipSuccessfulRequests: true,
    message: {
        success: false,
        error: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
        code: 'AUTH_RATE_LIMIT_EXCEEDED'
    }
});

// Aplicar rate limit geral a todas rotas
app.use('/api/', limiter);

// Aplicar rate limit específico para auth
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);
app.use('/api/v1/auth/forgot-password', authLimiter);

// =====================================================
// LOGS DE REQUISIÇÃO
// =====================================================
app.use(requestLogger);

// =====================================================
// ARQUIVOS ESTÁTICOS
// =====================================================
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/public', express.static(path.join(__dirname, '../public')));

// =====================================================
// TRUST PROXY (para produção atrás de load balancer)
// =====================================================
if (config.server.isProduction) {
    app.set('trust proxy', 1);
}

// =====================================================
// ROTAS DA API
// =====================================================
app.use('/api', routes);

// =====================================================
// ROTA DE HEALTH CHECK
// =====================================================
app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'KixikilaHub API está funcionando',
        timestamp: new Date().toISOString(),
        environment: config.server.env,
        version: process.env.npm_package_version || '1.0.0'
    });
});

// =====================================================
// ROTA PARA DOCUMENTAÇÃO (OPCIONAL)
// =====================================================
app.get('/api-docs', (req, res) => {
    res.redirect('https://documenter.getpostman.com/view/...');
});

// =====================================================
// TRATAMENTO DE ERROS
// =====================================================

// 404 - Rota não encontrada
app.use(notFound);

// Error handler global
app.use(errorHandler);

// =====================================================
// TRATAMENTO DE EXCEÇÕES NÃO CAPTURADAS
// =====================================================
process.on('uncaughtException', (error) => {
    logger.error('❌ Exceção não capturada:', error);
    // Em produção, podemos querer reiniciar o processo
    if (config.server.isProduction) {
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('❌ Promise rejeitada não tratada:', { reason, promise });
});

// =====================================================
// EXPORTS
// =====================================================
module.exports = app;