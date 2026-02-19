// =====================================================
// KIXIKILAHUB - CONFIGURAÇÃO PRINCIPAL DO EXPRESS
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

const app = express();

// =====================================================
// CONFIGURAÇÃO CORS - ACEITAR QUALQUER ORIGEM LOCAL
// =====================================================
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            /^http:\/\/localhost:\d+$/,
            /^http:\/\/127\.0\.0\.1:\d+$/,
            'https://kixikila.onrender.com',
            'https://kixikila-mobile.web.app'
        ];
        
        const allowed = allowedOrigins.some(pattern => {
            if (pattern instanceof RegExp) {
                return pattern.test(origin);
            }
            return pattern === origin;
        });
        
        if (allowed) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// =====================================================
// OUTROS MIDDLEWARES (ORDEM IMPORTANTE!)
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

// Rate limiting (aplicado a todas as rotas)
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

// =====================================================
// ROTAS DA API - A ORDEM É CRUCIAL!
// Primeiro as rotas públicas, depois as protegidas
// =====================================================

// Health check (pública)
app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'KixikilaHub API está funcionando',
        timestamp: new Date().toISOString(),
        environment: config.server.env,
        version: '1.0.0'
    });
});

// Montar todas as rotas definidas no routes.js
// O routes.js já tem a separação correta de públicas/protegidas
app.use('/api', routes);

// =====================================================
// TRATAMENTO DE ERROS (sempre no final)
// =====================================================
app.use(notFound);
app.use(errorHandler);

// =====================================================
// EXPORTS
// =====================================================
module.exports = app;
