// =====================================================
// KIXIKILAHUB - CONSTANTES DO SISTEMA
// Valores fixos, enums e configurações imutáveis
// =====================================================

const config = require('../config/env');

// =====================================================
// ENUMS DO SISTEMA
// =====================================================

/**
 * Tipos de documento para KYC
 */
const DOCUMENT_TYPES = {
    BI: 'BI',
    PASSPORT: 'PASSPORT'
};

/**
 * Status de verificação KYC
 */
const KYC_STATUS = {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED'
};

/**
 * Tipos de transação
 */
const TRANSACTION_TYPES = {
    DEPOSIT: 'DEPOSIT',
    WITHDRAWAL: 'WITHDRAWAL',
    GROUP_PAYMENT: 'GROUP_PAYMENT',
    GROUP_RECEIVE: 'GROUP_RECEIVE',
    FEE: 'FEE',
    BONUS: 'BONUS',
    TRANSFER: 'TRANSFER'
};

/**
 * Status de transação
 */
const TRANSACTION_STATUS = {
    PENDING: 'PENDING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED'
};

/**
 * Métodos de pagamento
 */
const PAYMENT_METHODS = {
    MULTICAIXA: 'MULTICAIXA',
    IBAN: 'IBAN',
    KWIK: 'KWIK'
};

/**
 * Frequências de grupo
 */
const GROUP_FREQUENCIES = {
    DAILY: 'DAILY',
    WEEKLY: 'WEEKLY',
    MONTHLY: 'MONTHLY'
};

/**
 * Status de grupo
 */
const GROUP_STATUS = {
    ACTIVE: 'ACTIVE',
    FULL: 'FULL',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED'
};

/**
 * Status de ciclo de pagamento
 */
const CYCLE_STATUS = {
    PENDING: 'PENDING',
    PAID: 'PAID',
    MISSED: 'MISSED',
    CANCELLED: 'CANCELLED'
};

/**
 * Tipos de mensagem no chat
 */
const MESSAGE_TYPES = {
    TEXT: 'TEXT',
    IMAGE: 'IMAGE',
    SYSTEM: 'SYSTEM'
};

/**
 * Tipos de bônus
 */
const BONUS_TYPES = {
    WELCOME: 'WELCOME',
    REFERRAL: 'REFERRAL',
    PROMOTION: 'PROMOTION'
};

/**
 * Status de bônus
 */
const BONUS_STATUS = {
    PENDING: 'PENDING',
    ACTIVATED: 'ACTIVATED',
    USED: 'USED',
    EXPIRED: 'EXPIRED'
};

/**
 =====================================================
 * PERFIS DE USUÁRIO
 =====================================================
 */
const USER_ROLES = {
    USER: 'USER',
    ADMIN: 'ADMIN',
    SUPPORT: 'SUPPORT'
};

// =====================================================
// REGRAS DE NEGÓCIO
// =====================================================

/**
 * Limites do sistema
 */
const SYSTEM_LIMITS = {
    // Contas
    MAX_ACCOUNTS_PER_PERSON: config.financial.maxAccountsPerPerson || 2,
    MIN_AGE: config.financial.minAge || 18,

    // Valores
    MIN_DEPOSIT: 100,
    MAX_DEPOSIT: config.financial.defaultDepositLimit || 200000,
    MIN_WITHDRAWAL: 100,
    MAX_WITHDRAWAL: config.financial.defaultWithdrawalLimit || 100000,
    MIN_GROUP_VALUE: 100,
    MAX_GROUP_VALUE: 100000,

    // Grupos
    MIN_GROUP_PARTICIPANTS: 3,
    MAX_GROUP_PARTICIPANTS: 50,
    MAX_GROUPS_PER_USER: 10,
    MAX_GROUPS_CREATE_PER_HOUR: 5,

    // Chat
    MAX_MESSAGE_LENGTH: 1000,
    MAX_MESSAGES_PER_MINUTE: 30,
    CHAT_HISTORY_LIMIT: 100,

    // Arquivos
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/jpg'],
    ALLOWED_DOCUMENT_TYPES: ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'],

    // PIN
    PIN_LENGTH: 4,
    MAX_PIN_ATTEMPTS: 5,
    PIN_LOCK_DURATION_MINUTES: 30,

    // Tokens
    EMAIL_VERIFICATION_EXPIRY_HOURS: 24,
    PASSWORD_RESET_EXPIRY_HOURS: 1,

    // Bônus
    WELCOME_BONUS_AMOUNT: config.financial.welcomeBonus.amount || 1000,
    WELCOME_BONUS_EXPIRY_DAYS: config.financial.welcomeBonus.expiryDays || 90
};

/**
 * Taxas do sistema (em percentual)
 */
const FEES = {
    DEPOSIT: config.fees.deposit || 0.01, // 1%
    WITHDRAWAL: config.fees.withdrawal || 0.01, // 1%
    GROUP_PAYMENT: config.fees.groupPayment || 0.05 // 5%
};

/**
 * Dias da semana (para grupos semanais)
 */
const WEEKDAYS = {
    0: 'Domingo',
    1: 'Segunda-feira',
    2: 'Terça-feira',
    3: 'Quarta-feira',
    4: 'Quinta-feira',
    5: 'Sexta-feira',
    6: 'Sábado'
};

/**
 * Meses em português
 */
const MONTHS = {
    1: 'Janeiro',
    2: 'Fevereiro',
    3: 'Março',
    4: 'Abril',
    5: 'Maio',
    6: 'Junho',
    7: 'Julho',
    8: 'Agosto',
    9: 'Setembro',
    10: 'Outubro',
    11: 'Novembro',
    12: 'Dezembro'
};

// =====================================================
// MENSAGENS DO SISTEMA
// =====================================================

/**
 * Mensagens de erro padronizadas
 */
const ERROR_MESSAGES = {
    // Autenticação
    AUTH: {
        INVALID_CREDENTIALS: 'Email ou senha inválidos',
        EMAIL_NOT_VERIFIED: 'Por favor, verifique seu email antes de continuar',
        ACCOUNT_LOCKED: 'Conta temporariamente bloqueada. Tente novamente mais tarde',
        TOKEN_EXPIRED: 'Token expirado',
        TOKEN_INVALID: 'Token inválido',
        UNAUTHORIZED: 'Não autorizado',
        FORBIDDEN: 'Acesso negado',
        PIN_INVALID: 'PIN inválido',
        PIN_LOCKED: 'PIN bloqueado por múltiplas tentativas',
        PIN_NOT_SET: 'PIN não configurado'
    },

    // Registro
    REGISTER: {
        EMAIL_EXISTS: 'Email já cadastrado',
        DOCUMENT_EXISTS: 'Documento já cadastrado',
        ACCOUNT_LIMIT: `Limite máximo de ${SYSTEM_LIMITS.MAX_ACCOUNTS_PER_PERSON} contas por pessoa atingido`,
        UNDERAGE: `Idade mínima é ${SYSTEM_LIMITS.MIN_AGE} anos`
    },

    // KYC
    KYC: {
        ALREADY_SUBMITTED: 'KYC já foi submetido',
        NOT_FOUND: 'KYC não encontrado',
        NOT_APPROVED: 'KYC não aprovado',
        PENDING: 'KYC em análise',
        REJECTED: 'KYC rejeitado'
    },

    // Wallet
    WALLET: {
        INSUFFICIENT_BALANCE: 'Saldo insuficiente',
        INSUFFICIENT_AVAILABLE: 'Saldo disponível insuficiente',
        LIMIT_EXCEEDED: 'Limite diário excedido',
        INVALID_AMOUNT: 'Valor inválido',
        MIN_AMOUNT: `Valor mínimo é ${SYSTEM_LIMITS.MIN_DEPOSIT} KZ`,
        MAX_AMOUNT: `Valor máximo é ${SYSTEM_LIMITS.MAX_DEPOSIT} KZ`
    },

    // Grupos
    GROUPS: {
        NOT_FOUND: 'Grupo não encontrado',
        NOT_MEMBER: 'Você não é membro deste grupo',
        ALREADY_MEMBER: 'Você já é membro deste grupo',
        GROUP_FULL: 'Grupo atingiu o número máximo de participantes',
        NOT_ADMIN: 'Apenas o administrador pode realizar esta ação',
        INVALID_FREQUENCY: 'Frequência inválida',
        INVALID_VALUE: 'Valor do ciclo inválido',
        CANCELLED: 'Grupo cancelado',
        COMPLETED: 'Grupo já foi concluído'
    },

    // Chat
    CHAT: {
        MESSAGE_EMPTY: 'Mensagem não pode estar vazia',
        MESSAGE_TOO_LONG: `Mensagem muito longa (máx ${SYSTEM_LIMITS.MAX_MESSAGE_LENGTH} caracteres)`,
        RATE_LIMIT: 'Limite de mensagens excedido. Aguarde um momento'
    },

    // Pagamentos
    PAYMENTS: {
        METHOD_UNAVAILABLE: 'Método de pagamento indisponível',
        PROCESSING_ERROR: 'Erro ao processar pagamento',
        INVALID_REFERENCE: 'Referência inválida',
        DUPLICATE: 'Transação duplicada'
    },

    // Geral
    GENERAL: {
        NOT_FOUND: 'Recurso não encontrado',
        VALIDATION_ERROR: 'Erro de validação',
        INTERNAL_ERROR: 'Erro interno do servidor',
        DATABASE_ERROR: 'Erro no banco de dados',
        RATE_LIMIT: 'Muitas requisições. Tente novamente mais tarde'
    }
};

/**
 * Mensagens de sucesso
 */
const SUCCESS_MESSAGES = {
    AUTH: {
        LOGIN: 'Login realizado com sucesso',
        LOGOUT: 'Logout realizado com sucesso',
        REGISTER: 'Registro realizado com sucesso. Verifique seu email',
        EMAIL_VERIFIED: 'Email verificado com sucesso',
        PASSWORD_RESET: 'Senha alterada com sucesso',
        PIN_SET: 'PIN configurado com sucesso',
        PIN_CHANGED: 'PIN alterado com sucesso'
    },

    KYC: {
        SUBMITTED: 'KYC submetido com sucesso. Aguarde análise',
        APPROVED: 'KYC aprovado com sucesso',
        UPDATED: 'KYC atualizado com sucesso'
    },

    WALLET: {
        DEPOSIT: 'Depósito realizado com sucesso',
        WITHDRAWAL: 'Saque realizado com sucesso',
        BONUS_RECEIVED: 'Bônus recebido com sucesso'
    },

    GROUPS: {
        CREATED: 'Grupo criado com sucesso',
        JOINED: 'Entrou no grupo com sucesso',
        LEFT: 'Saiu do grupo com sucesso',
        UPDATED: 'Grupo atualizado com sucesso',
        PAYMENT_MADE: 'Pagamento realizado com sucesso'
    },

    CHAT: {
        SENT: 'Mensagem enviada com sucesso'
    }
};

// =====================================================
// CONFIGURAÇÕES DE PAGAMENTO (MOCK)
// =====================================================

/**
 * Configurações dos mocks de pagamento
 */
const PAYMENT_MOCK_CONFIG = {
    MULTICAIXA: {
        successRate: config.mockPayments.multicaixa.successRate || 95,
        delayMs: config.mockPayments.multicaixa.delayMs || 2000,
        minAmount: 100,
        maxAmount: 200000,
        workingHours: {
            start: 8, // 8h
            end: 22   // 22h
        }
    },
    IBAN: {
        successRate: config.mockPayments.iban.successRate || 98,
        delayMs: config.mockPayments.iban.delayMs || 5000,
        minAmount: 1000,
        maxAmount: 500000,
        workingDays: [1, 2, 3, 4, 5] // Segunda a Sexta
    },
    KWIK: {
        successRate: config.mockPayments.kwik.successRate || 97,
        delayMs: config.mockPayments.kwik.delayMs || 1500,
        minAmount: 50,
        maxAmount: 100000,
        workingHours: {
            start: 0,
            end: 24 // 24h
        }
    }
};

// =====================================================
// REGEX PATTERNS
// =====================================================

/**
 * Padrões regex para validação
 */
const REGEX_PATTERNS = {
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    BI: /^[0-9]{9}[A-Z]{1}$/,
    PASSPORT: /^N[0-9]{8}$/,
    PHONE: /^9[0-9]{8}$/,
    IBAN: /^AO[0-9]{21}$/,
    PIN: /^[0-9]{4}$/,
    UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    NUMBER: /^[0-9]+$/,
    ALPHANUMERIC: /^[a-zA-Z0-9]+$/,
    NAME: /^[a-zA-ZÀ-ÖØ-öø-ÿ\s]+$/,
    ADDRESS: /^[a-zA-Z0-9\s,.-]+$/
};

// =====================================================
// CABEÇALHOS DE SEGURANÇA
// =====================================================

/**
 * Headers de segurança recomendados
 */
const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Content-Security-Policy': "default-src 'self'"
};

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
    // Enums
    DOCUMENT_TYPES,
    KYC_STATUS,
    TRANSACTION_TYPES,
    TRANSACTION_STATUS,
    PAYMENT_METHODS,
    GROUP_FREQUENCIES,
    GROUP_STATUS,
    CYCLE_STATUS,
    MESSAGE_TYPES,
    BONUS_TYPES,
    BONUS_STATUS,
    USER_ROLES,

    // Regras de negócio
    SYSTEM_LIMITS,
    FEES,

    // Datas
    WEEKDAYS,
    MONTHS,

    // Mensagens
    ERROR_MESSAGES,
    SUCCESS_MESSAGES,

    // Configurações
    PAYMENT_MOCK_CONFIG,

    // Regex
    REGEX_PATTERNS,

    // Segurança
    SECURITY_HEADERS
};