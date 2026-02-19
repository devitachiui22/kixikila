// =====================================================
// KIXIKILAHUB - MIDDLEWARES DE TRATAMENTO DE ERROS
// Error handling global e respostas padronizadas
// =====================================================

const logger = require('../utils/logger');
const config = require('../config/env');

// =====================================================
// CLASSE DE ERRO PERSONALIZADA
// =====================================================
class AppError extends Error {
    constructor(message, statusCode, errorCode = null, details = null) {
        super(message);
        this.statusCode = statusCode;
        this.errorCode = errorCode || this.getDefaultErrorCode(statusCode);
        this.details = details;
        this.isOperational = true;
        this.timestamp = new Date().toISOString();

        Error.captureStackTrace(this, this.constructor);
    }

    getDefaultErrorCode(statusCode) {
        switch (statusCode) {
            case 400: return 'BAD_REQUEST';
            case 401: return 'UNAUTHORIZED';
            case 403: return 'FORBIDDEN';
            case 404: return 'NOT_FOUND';
            case 409: return 'CONFLICT';
            case 422: return 'VALIDATION_ERROR';
            case 429: return 'RATE_LIMIT_EXCEEDED';
            case 500: return 'INTERNAL_SERVER_ERROR';
            case 503: return 'SERVICE_UNAVAILABLE';
            default: return 'UNKNOWN_ERROR';
        }
    }
}

// =====================================================
// TRATADORES DE ERROS ESPECÍFICOS
// =====================================================

/**
 * Erro de validação (Joi, express-validator)
 */
class ValidationError extends AppError {
    constructor(message, details = null) {
        super(message, 422, 'VALIDATION_ERROR', details);
    }
}

/**
 * Erro de autenticação
 */
class AuthenticationError extends AppError {
    constructor(message = 'Não autenticado') {
        super(message, 401, 'AUTHENTICATION_ERROR');
    }
}

/**
 * Erro de autorização
 */
class AuthorizationError extends AppError {
    constructor(message = 'Sem permissão') {
        super(message, 403, 'AUTHORIZATION_ERROR');
    }
}

/**
 * Erro de recurso não encontrado
 */
class NotFoundError extends AppError {
    constructor(resource = 'Recurso') {
        super(`${resource} não encontrado`, 404, 'NOT_FOUND');
    }
}

/**
 * Erro de conflito (ex: email já existe)
 */
class ConflictError extends AppError {
    constructor(message = 'Conflito com recurso existente') {
        super(message, 409, 'CONFLICT');
    }
}

/**
 * Erro de limite excedido
 */
class RateLimitError extends AppError {
    constructor(message = 'Muitas requisições') {
        super(message, 429, 'RATE_LIMIT_EXCEEDED');
    }
}

/**
 * Erro de negócio (regras da fintech)
 */
class BusinessError extends AppError {
    constructor(message, errorCode = 'BUSINESS_RULE_VIOLATION') {
        super(message, 422, errorCode);
    }
}

/**
 * Erro de saldo insuficiente
 */
class InsufficientBalanceError extends BusinessError {
    constructor(message = 'Saldo insuficiente') {
        super(message, 'INSUFFICIENT_BALANCE');
    }
}

/**
 * Erro de PIN inválido
 */
class InvalidPinError extends AuthenticationError {
    constructor(message = 'PIN inválido') {
        super(message);
        this.errorCode = 'INVALID_PIN';
    }
}

// =====================================================
// MIDDLEWARE DE ERRO GLOBAL
// =====================================================
const errorHandler = (err, req, res, next) => {
    // Log do erro
    logError(err, req);

    // Erro padrão
    let error = { ...err };
    error.message = err.message;
    error.statusCode = err.statusCode || 500;
    error.errorCode = err.errorCode || 'INTERNAL_SERVER_ERROR';

    // Erros específicos do PostgreSQL
    if (err.code && err.code.startsWith('23')) {
        error = handlePostgresError(err);
    }

    // Erros do JWT
    if (err.name === 'JsonWebTokenError') {
        error = new AuthenticationError('Token inválido');
    }
    if (err.name === 'TokenExpiredError') {
        error = new AuthenticationError('Token expirado');
    }

    // Erros de validação do Joi (serão tratados no controller)
    if (err.isJoi) {
        error = new ValidationError('Erro de validação', err.details);
    }

    // Erros de multer (upload)
    if (err.code === 'LIMIT_FILE_SIZE') {
        error = new ValidationError('Arquivo muito grande. Máximo: 5MB');
    }
    if (err.code === 'LIMIT_FILE_TYPE') {
        error = new ValidationError('Tipo de arquivo não permitido');
    }

    // Erros de rate limit
    if (err.code === 'RATE_LIMIT_EXCEEDED') {
        error = new RateLimitError(err.message);
    }

    // Erros de CSRF
    if (err.code === 'EBADCSRFTOKEN') {
        error = new AuthenticationError('Token CSRF inválido');
    }

    // Resposta padronizada
    const response = {
        success: false,
        error: {
            code: error.errorCode,
            message: error.message || 'Erro interno do servidor',
            timestamp: new Date().toISOString(),
            path: req.originalUrl
        }
    };

    // Adicionar detalhes em desenvolvimento ou se for erro de validação
    if (error.details && (config.server.isDevelopment || error.statusCode === 422)) {
        response.error.details = error.details;
    }

    // Em desenvolvimento, incluir stack trace
    if (config.server.isDevelopment && error.stack) {
        response.error.stack = error.stack.split('\n').map(line => line.trim());
    }

    // Status code
    res.status(error.statusCode).json(response);
};

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

/**
 * Log do erro com contexto
 */
const logError = (err, req) => {
    const logData = {
        error: {
            message: err.message,
            stack: err.stack,
            code: err.code,
            statusCode: err.statusCode
        },
        request: {
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
            userId: req.user?.id,
            userAgent: req.get('user-agent')
        }
    };

    if (err.statusCode >= 500) {
        logger.error('❌ Erro interno do servidor:', logData);
    } else if (err.statusCode >= 400) {
        // CORREÇÃO: Usar logger.log em vez de logger.warn
        logger.log('warn', '⚠️ Erro do cliente:', logData);
    } else {
        logger.info('ℹ️ Erro tratado:', logData);
    }
};

/**
 * Tratamento de erros do PostgreSQL
 */
const handlePostgresError = (err) => {
    switch (err.code) {
        case '23505': // unique violation
            return new ConflictError('Registro duplicado');
        case '23503': // foreign key violation
            return new ValidationError('Referência inválida');
        case '23502': // not null violation
            return new ValidationError('Campo obrigatório não preenchido');
        case '22P02': // invalid input syntax
            return new ValidationError('Formato de dado inválido');
        default:
            return new AppError('Erro no banco de dados', 500, 'DATABASE_ERROR');
    }
};

// =====================================================
// MIDDLEWARE DE ROTA NÃO ENCONTRADA (404)
// =====================================================
const notFound = (req, res, next) => {
    const error = new NotFoundError(`Rota ${req.originalUrl}`);
    next(error);
};

// =====================================================
// MIDDLEWARE DE TRATAMENTO ASSÍNCRONO
// =====================================================
const catchAsync = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    RateLimitError,
    BusinessError,
    InsufficientBalanceError,
    InvalidPinError,
    errorHandler,
    notFound,
    catchAsync

};
