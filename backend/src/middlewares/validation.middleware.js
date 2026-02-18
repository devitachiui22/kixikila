// =====================================================
// KIXIKILAHUB - MIDDLEWARES DE VALIDAÇÃO
// Validação de dados de entrada com Joi
// =====================================================

const Joi = require('joi');
const { ValidationError } = require('./error.middleware');
const logger = require('../utils/logger');

// =====================================================
// SCHEMAS DE VALIDAÇÃO
// =====================================================

// Schemas de autenticação
const authSchemas = {
    register: Joi.object({
        email: Joi.string().email().required().messages({
            'string.email': 'Email inválido',
            'any.required': 'Email é obrigatório'
        }),
        password: Joi.string().min(8).max(50)
            .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
            .required()
            .messages({
                'string.min': 'Senha deve ter no mínimo 8 caracteres',
                'string.pattern.base': 'Senha deve conter maiúscula, minúscula, número e caractere especial',
                'any.required': 'Senha é obrigatória'
            }),
        fullName: Joi.string().min(3).max(100).required().messages({
            'string.min': 'Nome completo deve ter no mínimo 3 caracteres',
            'any.required': 'Nome completo é obrigatório'
        }),
        birthDate: Joi.date().max('now').required().messages({
            'date.max': 'Data de nascimento inválida',
            'any.required': 'Data de nascimento é obrigatória'
        }),
        documentNumber: Joi.string().pattern(/^[0-9]{9,14}$/).required().messages({
            'string.pattern.base': 'Documento deve ter entre 9 e 14 dígitos',
            'any.required': 'Número do documento é obrigatório'
        }),
        documentType: Joi.string().valid('BI', 'PASSPORT').required().messages({
            'any.only': 'Tipo de documento deve ser BI ou PASSPORT',
            'any.required': 'Tipo de documento é obrigatório'
        })
    }),

    login: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().required()
    }),

    googleLogin: Joi.object({
        token: Joi.string().required(),
        fullName: Joi.string().optional()
    }),

    verifyEmail: Joi.object({
        token: Joi.string().uuid().required()
    }),

    resendVerification: Joi.object({
        email: Joi.string().email().required()
    }),

    forgotPassword: Joi.object({
        email: Joi.string().email().required()
    }),

    resetPassword: Joi.object({
        token: Joi.string().required(),
        password: Joi.string().min(8).max(50)
            .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
            .required()
    }),

    refreshToken: Joi.object({
        refreshToken: Joi.string().required()
    })
};

// Schemas de KYC
const kycSchemas = {
    submit: Joi.object({
        documentType: Joi.string().valid('BI', 'PASSPORT').required(),
        documentNumber: Joi.string().pattern(/^[0-9]{9,14}$/).required(),
        documentFrontUrl: Joi.string().uri().required(),
        documentBackUrl: Joi.string().uri().required(),
        selfieUrl: Joi.string().uri().required(),
        expiresAt: Joi.date().min('now').optional()
    }),

    verify: Joi.object({
        userId: Joi.string().uuid().required(),
        status: Joi.string().valid('APPROVED', 'REJECTED').required(),
        notes: Joi.string().max(500).when('status', {
            is: 'REJECTED',
            then: Joi.required(),
            otherwise: Joi.optional()
        })
    })
};

// Schemas de wallet
const walletSchemas = {
    setPin: Joi.object({
        pin: Joi.string().length(4).pattern(/^[0-9]{4}$/).required(),
        confirmPin: Joi.string().valid(Joi.ref('pin')).required().messages({
            'any.only': 'PINs não conferem'
        })
    }),

    verifyPin: Joi.object({
        pin: Joi.string().length(4).pattern(/^[0-9]{4}$/).required()
    }),

    changePin: Joi.object({
        oldPin: Joi.string().length(4).pattern(/^[0-9]{4}$/).required(),
        newPin: Joi.string().length(4).pattern(/^[0-9]{4}$/).required(),
        confirmNewPin: Joi.string().valid(Joi.ref('newPin')).required()
    }),

    deposit: Joi.object({
        amount: Joi.number().positive().min(100).max(200000).required(),
        method: Joi.string().valid('MULTICAIXA', 'IBAN', 'KWIK').required(),
        reference: Joi.string().optional(),
        metadata: Joi.object().optional()
    }),

    withdraw: Joi.object({
        amount: Joi.number().positive().min(100).max(100000).required(),
        method: Joi.string().valid('MULTICAIXA', 'IBAN', 'KWIK').required(),
        destination: Joi.object({
            iban: Joi.string().when('method', { is: 'IBAN', then: Joi.required() }),
            phone: Joi.string().pattern(/^[0-9]{9}$/).when('method', {
                is: Joi.valid('MULTICAIXA', 'KWIK'),
                then: Joi.required()
            }),
            ownerName: Joi.string().when('method', { is: 'IBAN', then: Joi.required() })
        }).required(),
        pin: Joi.string().length(4).pattern(/^[0-9]{4}$/).required()
    })
};

// Schemas de grupos
const groupSchemas = {
    create: Joi.object({
        name: Joi.string().min(3).max(100).required(),
        description: Joi.string().max(500).optional(),
        zone: Joi.string().min(3).max(100).required(),
        city: Joi.string().default('Luanda'),
        latitude: Joi.number().min(-90).max(90).optional(),
        longitude: Joi.number().min(-180).max(180).optional(),
        cycleValue: Joi.number().positive().min(100).max(100000).required(),
        frequency: Joi.string().valid('DAILY', 'WEEKLY', 'MONTHLY').required(),
        maxParticipants: Joi.number().integer().min(3).max(50).required(),
        paymentDay: Joi.number().integer().min(0).max(31).when('frequency', {
            is: 'WEEKLY',
            then: Joi.number().integer().min(0).max(6).required(),
            otherwise: Joi.when('frequency', {
                is: 'MONTHLY',
                then: Joi.number().integer().min(1).max(28).required(),
                otherwise: Joi.optional()
            })
        })
    }),

    update: Joi.object({
        name: Joi.string().min(3).max(100).optional(),
        description: Joi.string().max(500).optional(),
        zone: Joi.string().min(3).max(100).optional(),
        city: Joi.string().optional(),
        latitude: Joi.number().min(-90).max(90).optional(),
        longitude: Joi.number().min(-180).max(180).optional(),
        maxParticipants: Joi.number().integer().min(3).max(50).optional()
    }),

    join: Joi.object({
        groupId: Joi.string().uuid().required(),
        pin: Joi.string().length(4).pattern(/^[0-9]{4}$/).optional()
    }),

    leave: Joi.object({
        groupId: Joi.string().uuid().required(),
        reason: Joi.string().max(200).optional()
    }),

    search: Joi.object({
        zone: Joi.string().optional(),
        city: Joi.string().optional(),
        frequency: Joi.string().valid('DAILY', 'WEEKLY', 'MONTHLY').optional(),
        minValue: Joi.number().positive().optional(),
        maxValue: Joi.number().positive().optional(),
        latitude: Joi.number().min(-90).max(90).optional(),
        longitude: Joi.number().min(-180).max(180).optional(),
        radius: Joi.number().positive().max(50).optional(),
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20)
    }),

    setFirstBeneficiary: Joi.object({
        groupId: Joi.string().uuid().required(),
        beneficiaryId: Joi.string().uuid().required()
    })
};

// Schemas de chat
const chatSchemas = {
    sendMessage: Joi.object({
        groupId: Joi.string().uuid().required(),
        message: Joi.string().min(1).max(1000).required(),
        messageType: Joi.string().valid('TEXT', 'IMAGE', 'SYSTEM').default('TEXT'),
        metadata: Joi.object().optional()
    }),

    getHistory: Joi.object({
        groupId: Joi.string().uuid().required(),
        limit: Joi.number().integer().min(1).max(100).default(50),
        before: Joi.date().iso().optional()
    })
};

// Schemas de usuário
const userSchemas = {
    updateProfile: Joi.object({
        fullName: Joi.string().min(3).max(100).optional(),
        birthDate: Joi.date().max('now').optional(),
        avatar: Joi.string().uri().optional()
    }),

    changePassword: Joi.object({
        currentPassword: Joi.string().required(),
        newPassword: Joi.string().min(8).max(50)
            .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
            .required(),
        confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
    }),

    updateLimits: Joi.object({
        depositLimit: Joi.number().positive().max(500000).optional(),
        withdrawalLimit: Joi.number().positive().max(500000).optional()
    })
};

// Schemas de pagamento (mocks)
const paymentSchemas = {
    multicaixa: Joi.object({
        amount: Joi.number().positive().required(),
        reference: Joi.string().required(),
        phone: Joi.string().pattern(/^[0-9]{9}$/).required()
    }),

    iban: Joi.object({
        amount: Joi.number().positive().required(),
        iban: Joi.string().pattern(/^AO[0-9]{21}$/).required(),
        ownerName: Joi.string().required()
    }),

    kwik: Joi.object({
        amount: Joi.number().positive().required(),
        phone: Joi.string().pattern(/^[0-9]{9}$/).required(),
        pin: Joi.string().length(4).pattern(/^[0-9]{4}$/).required()
    })
};

// =====================================================
// MIDDLEWARE DE VALIDAÇÃO
// =====================================================

/**
 * Valida dados da requisição contra um schema
 */
const validate = (schema, source = 'body') => {
    return (req, res, next) => {
        const data = req[source];
        const { error, value } = schema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
            presence: 'required'
        });

        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));

            logger.debug('❌ Validação falhou:', {
                path: req.path,
                errors: details
            });

            throw new ValidationError('Erro de validação', details);
        }

        // Substituir dados validados
        req[source] = value;
        next();
    };
};

/**
 * Valida parâmetros de query string
 */
const validateQuery = (schema) => validate(schema, 'query');

/**
 * Valida parâmetros de URL
 */
const validateParams = (schema) => validate(schema, 'params');

/**
 * Valida headers
 */
const validateHeaders = (schema) => validate(schema, 'headers');

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
    // Schemas
    authSchemas,
    kycSchemas,
    walletSchemas,
    groupSchemas,
    chatSchemas,
    userSchemas,
    paymentSchemas,

    // Middlewares de validação
    validate,
    validateQuery,
    validateParams,
    validateHeaders
};