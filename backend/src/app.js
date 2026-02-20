// =====================================================
// KIXIKILAHUB - CONFIGURAÇÃO PRINCIPAL DO EXPRESS
// VERSÃO FINAL COM CORS CORRETO
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

const routes = require('./routes');

const app = express();

// =====================================================
// CONFIGURAÇÃO CORS - ACEITAR QUALQUER ORIGEM (PARA TESTES)
// =====================================================
app.use(cors({
    origin: true, // Aceita qualquer origem
    credentials: true,
    optionsSuccessStatus: 200
}));

// Log de origens para debug
app.use((req, res, next) => {
    console.log('🌐 Origem:', req.headers.origin);
    console.log('🔐 Método:', req.method);
    console.log('📦 Path:', req.path);
    next();
});

// =====================================================
// OUTROS MIDDLEWARES
// =====================================================
app.use(helmet({
    contentSecurityPolicy: false,
}));

app.use(compression());
app.use(cookieParser(config.security.sessionSecret));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
        success: false,
        error: 'Muitas requisições deste IP, tente novamente mais tarde.'
    }
});
app.use('/api/', limiter);

// Logs de requisição
app.use(requestLogger);

// Arquivos estáticos
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/public', express.static(path.join(__dirname, '../public')));

// Trust proxy
if (config.server.isProduction) {
    app.set('trust proxy', 1);
}

// Rotas da API
app.use('/api', routes);

// Rota de health check
app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'KixikilaHub API está funcionando',
        timestamp: new Date().toISOString(),
        environment: config.server.env,
        version: '1.0.0'
    });
});

// Tratamento de erros
app.use(notFound);
app.use(errorHandler);

module.exports = app;
