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

const routes = require('./routes');

const app = express();

// =====================================================
// CONFIGURAÇÃO CORS - CORRIGIDA
// =====================================================
const corsOptions = {
    origin: [
        'http://localhost:59011',  // Porta atual do seu frontend
        'http://localhost:8080',
        'http://localhost:3000',
        'http://127.0.0.1:59011',
        'http://127.0.0.1:8080',
        'https://kixikila.onrender.com',
        'https://kixikila-mobile.web.app'
    ],
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// Para desenvolvimento, permitir qualquer origem (APENAS TESTE!)
if (config.server.isDevelopment) {
    app.use(cors({
        origin: '*',
        credentials: true
    }));
}

// =====================================================
// OUTROS MIDDLEWARES
// =====================================================
app.use(helmet({
    contentSecurityPolicy: false, // Desabilitado para teste
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

// =====================================================
// EXPORTS
// =====================================================
module.exports = app;
