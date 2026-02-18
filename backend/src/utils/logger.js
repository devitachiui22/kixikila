// =====================================================
// KIXIKILAHUB - SISTEMA DE LOGS (WINSTON)
// Logs estruturados para produção com rotação de arquivos
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

// Formato para desenvolvimento (console)
const devFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
        return `${timestamp} [${level}]: ${message}${metaStr}`;
    })
);

// Formato para produção (JSON estruturado)
const prodFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.metadata(),
    winston.format.json()
);

// Formato para auditoria (imutável, com hash)
const auditFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
    winston.format((info) => {
        // Adicionar hash simples para integridade (em produção usar HMAC)
        const crypto = require('crypto');
        const data = JSON.stringify(info);
        info.audit_hash = crypto.createHash('sha256').update(data).digest('hex');
        return info;
      })()
);

// =====================================================
// TRANSPORTES (DESTINOS DOS LOGS)
// =====================================================

// Transporte para console
const consoleTransport = new winston.transports.Console({
    level: config.server.isProduction ? 'info' : 'debug',
    format: config.server.isDevelopment ? devFormat : prodFormat,
    handleExceptions: true
});

// Transporte para arquivo de logs gerais
const fileTransport = new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    level: config.logs.level,
    format: prodFormat,
    maxsize: 20 * 1024 * 1024, // 20MB
    maxFiles: 5,
    tailable: true,
    handleExceptions: true
});

// Transporte para arquivo de erros
const errorFileTransport = new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    format: prodFormat,
    maxsize: 20 * 1024 * 1024, // 20MB
    maxFiles: 5,
    tailable: true,
    handleExceptions: true
});

// Transporte para logs de auditoria (financeiro)
const auditTransport = new winston.transports.File({
    filename: path.join(logDir, 'audit.log'),
    level: 'info',
    format: auditFormat,
    maxsize: 50 * 1024 * 1024, // 50MB
    maxFiles: 10,
    tailable: false, // Não sobrescrever logs de auditoria
    handleExceptions: true
});

// Transporte para logs de segurança
const securityTransport = new winston.transports.File({
    filename: path.join(logDir, 'security.log'),
    level: 'info',
    format: prodFormat,
    maxsize: 20 * 1024 * 1024, // 20MB
    maxFiles: 5,
    tailable: true
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
        errorFileTransport,
        securityTransport
    ],

    // Não finalizar o processo em caso de exceção não tratada
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

// Adicionar transporte de auditoria apenas em produção
if (config.server.isProduction) {
    logger.add(auditTransport);
}

// =====================================================
// MÉTODOS AUXILIARES PARA LOGS ESPECÍFICOS
// =====================================================

/**
 * Log de auditoria para transações financeiras
 */
const audit = (action, userId, data, req = null) => {
    const logData = {
        action,
        userId,
        ...data,
        ip: req?.ip,
        userAgent: req?.get('user-agent'),
        timestamp: new Date().toISOString()
    };

    logger.info(`AUDIT: ${action}`, logData);
};

/**
 * Log de segurança (tentativas de login, alterações de PIN, etc)
 */
const security = (event, userId, details, req = null) => {
    const logData = {
        event,
        userId,
        details,
        ip: req?.ip,
        userAgent: req?.get('user-agent'),
        timestamp: new Date().toISOString()
    };

    logger.info(`SECURITY: ${event}`, logData);
};

/**
 * Log de performance
 */
const performance = (operation, durationMs, metadata = {}) => {
    const logData = {
        operation,
        durationMs,
        ...metadata,
        timestamp: new Date().toISOString()
    };

    logger.debug(`PERF: ${operation} - ${durationMs}ms`, logData);

    // Alertar se for muito lento
    if (durationMs > 2000) {
        logger.warn(`⚠️ Operação lenta detectada: ${operation} (${durationMs}ms)`);
    }
};

/**
 * Log de API externa (mocks de pagamento)
 */
const apiCall = (service, endpoint, status, durationMs, metadata = {}) => {
    const logData = {
        service,
        endpoint,
        status,
        durationMs,
        ...metadata,
        timestamp: new Date().toISOString()
    };

    if (status >= 400) {
        logger.error(`API ${service} falhou`, logData);
    } else {
        logger.info(`API ${service} chamada`, logData);
    }
};

// =====================================================
// MIDDLEWARE PARA EXPRESS
// =====================================================

/**
 * Middleware para log de requisições HTTP
 */
const requestLogger = (req, res, next) => {
    const start = Date.now();

    // Log quando a requisição começar
    logger.debug(`➡️ ${req.method} ${req.originalUrl}`, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        userId: req.user?.id
    });

    // Log quando a requisição terminar
    res.on('finish', () => {
        const duration = Date.now() - start;
        const level = res.statusCode >= 400 ? 'warn' : 'info';

        logger[level](`⬅️ ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`, {
            statusCode: res.statusCode,
            duration,
            userId: req.user?.id,
            contentLength: res.get('content-length')
        });

        // Log de performance para requisições lentas
        if (duration > 1000) {
            logger.warn(`⚠️ Requisição lenta: ${req.method} ${req.originalUrl} (${duration}ms)`);
        }
    });

    next();
};

// =====================================================
// STREAM PARA MORGAN (INTEGRAÇÃO OPCIONAL)
// =====================================================

const stream = {
    write: (message) => {
        logger.http(message.trim());
    }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = logger;
module.exports.audit = audit;
module.exports.security = security;
module.exports.performance = performance;
module.exports.apiCall = apiCall;
module.exports.requestLogger = requestLogger;
module.exports.stream = stream;