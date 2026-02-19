// =====================================================
// KIXIKILAHUB - SISTEMA DE LOGS (WINSTON) - CORRIGIDO
// =====================================================

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config/env');

// Garantir que o diretório de logs existe
const logDir = config.logs.dir;
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// =====================================================
// FORMATOS PERSONALIZADOS
// =====================================================

const devFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
        return `${timestamp} [${level}]: ${message}${metaStr}`;
    })
);

const prodFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.metadata(),
    winston.format.json()
);

// =====================================================
// TRANSPORTES
// =====================================================

const consoleTransport = new winston.transports.Console({
    level: config.server.isProduction ? 'info' : 'debug',
    format: config.server.isDevelopment ? devFormat : prodFormat,
    handleExceptions: true
});

const fileTransport = new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    level: config.logs.level,
    format: prodFormat,
    maxsize: 20 * 1024 * 1024,
    maxFiles: 5,
    tailable: true,
    handleExceptions: true
});

const errorFileTransport = new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    format: prodFormat,
    maxsize: 20 * 1024 * 1024,
    maxFiles: 5,
    tailable: true,
    handleExceptions: true
});

// =====================================================
// CRIAÇÃO DO LOGGER PRINCIPAL
// =====================================================

const logger = winston.createLogger({
    levels: winston.config.syslog.levels,
    exitOnError: false,
    transports: [
        consoleTransport,
        fileTransport,
        errorFileTransport
    ],
    exceptionHandlers: [
        new winston.transports.File({ 
            filename: path.join(logDir, 'exceptions.log'),
            format: prodFormat
        })
    ],
    rejectionHandlers: [
        new winston.transports.File({ 
            filename: path.join(logDir, 'rejections.log'),
            format: prodFormat
        })
    ]
});

// =====================================================
// MIDDLEWARE PARA EXPRESS (CORRIGIDO)
// =====================================================

const requestLogger = (req, res, next) => {
    const start = Date.now();
    
    logger.debug(`➡️ ${req.method} ${req.originalUrl}`, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        userId: req.user?.id
    });
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const level = res.statusCode >= 400 ? 'warn' : 'info';
        
        // CORREÇÃO: Usar logger.log(level, ...) em vez de logger[level]
        logger.log(level, `⬅️ ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`, {
            statusCode: res.statusCode,
            duration,
            userId: req.user?.id,
            contentLength: res.get('content-length')
        });
        
        if (duration > 1000) {
            logger.warn(`⚠️ Requisição lenta: ${req.method} ${req.originalUrl} (${duration}ms)`);
        }
    });
    
    next();
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = logger;
module.exports.requestLogger = requestLogger;
module.exports.stream = {
    write: (message) => {
        logger.http(message.trim());
    }
};
