// =====================================================
// KIXIKILAHUB - CONFIGURAÇÃO DE VARIÁVEIS DE AMBIENTE
// Validação e normalização das variáveis de ambiente
// =====================================================

const dotenv = require('dotenv');
const path = require('path');

// Carrega variáveis de ambiente do arquivo .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Função para validar variáveis obrigatórias
const requiredEnvVars = [
    'NODE_ENV',
    'PORT',
    'DB_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    throw new Error(`❌ Variáveis de ambiente obrigatórias não definidas: ${missingEnvVars.join(', ')}`);
}

// =====================================================
// CONFIGURAÇÕES POR AMBIENTE
// =====================================================
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

// =====================================================
// OBJETO DE CONFIGURAÇÃO
// =====================================================
const config = {
    // Servidor
    server: {
        env: process.env.NODE_ENV,
        port: parseInt(process.env.PORT, 10) || 3000,
        apiVersion: process.env.API_VERSION || 'v1',
        apiUrl: process.env.API_URL || `http://localhost:${parseInt(process.env.PORT, 10) || 3000}`,
        clientUrl: process.env.CLIENT_URL || 'http://localhost:8080',
        isProduction,
        isDevelopment,
        isTest
    },

    // Banco de Dados (Neon PostgreSQL)
    database: {
        url: process.env.DB_URL,
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT, 10) || 5432,
        name: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === 'true',
        pool: {
            min: parseInt(process.env.DB_POOL_MIN, 10) || 2,
            max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
            idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT, 10) || 30000,
            connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) || 10000
        }
    },

    // Redis (para filas e cache)
    // Seção Redis (opcional)
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        password: process.env.REDIS_PASSWORD || '',
        db: parseInt(process.env.REDIS_DB, 10) || 0,
        enabled: process.env.USE_REDIS === 'true'
    },

    // JWT
    jwt: {
        secret: process.env.JWT_SECRET,
        refreshSecret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
        issuer: process.env.JWT_ISSUER || 'kixikilahub.com',
        audience: process.env.JWT_AUDIENCE || 'api.kixikilahub.com'
    },

    // Segurança
    security: {
        bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
        sessionSecret: process.env.SESSION_SECRET,
        corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:8080'],
        rateLimit: {
            windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
            max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
            maxAuth: parseInt(process.env.RATE_LIMIT_MAX_AUTH, 10) || 5
        },
        csrfProtection: process.env.CSRF_PROTECTION === 'true'
    },

    // Email
    email: {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT, 10) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        user: process.env.SMTP_USER,
        password: process.env.SMTP_PASSWORD,
        from: process.env.EMAIL_FROM || 'KixikilaHub <noreply@kixikilahub.com>',
        verificationUrl: process.env.EMAIL_VERIFICATION_URL
    },

    // WebSocket
    socket: {
        path: process.env.SOCKET_PATH || '/socket.io',
        corsOrigin: process.env.SOCKET_CORS_ORIGIN ? process.env.SOCKET_CORS_ORIGIN.split(',') : ['http://localhost:8080'],
        pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT, 10) || 60000,
        pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL, 10) || 25000
    },

    // Limites Financeiros
    financial: {
        defaultDepositLimit: parseFloat(process.env.DEFAULT_DEPOSIT_LIMIT) || 200000,
        defaultWithdrawalLimit: parseFloat(process.env.DEFAULT_WITHDRAWAL_LIMIT) || 100000,
        maxAccountsPerPerson: parseInt(process.env.MAX_ACCOUNTS_PER_PERSON, 10) || 2,
        minAge: parseInt(process.env.MIN_AGE, 10) || 18,
        welcomeBonus: {
            amount: parseFloat(process.env.WELCOME_BONUS_AMOUNT) || 1000,
            expiryDays: parseInt(process.env.WELCOME_BONUS_EXPIRY_DAYS, 10) || 90
        }
    },

    // Taxas
    fees: {
        deposit: parseFloat(process.env.FEE_DEPOSIT_PERCENT) / 100 || 0.01,
        withdrawal: parseFloat(process.env.FEE_WITHDRAWAL_PERCENT) / 100 || 0.01,
        groupPayment: parseFloat(process.env.FEE_GROUP_PAYMENT_PERCENT) / 100 || 0.05
    },

    // Mock Payments
    mockPayments: {
        multicaixa: {
            successRate: parseInt(process.env.MULTICAIXA_MOCK_SUCCESS_RATE, 10) || 95,
            delayMs: parseInt(process.env.MULTICAIXA_MOCK_DELAY_MS, 10) || 2000
        },
        iban: {
            successRate: parseInt(process.env.IBAN_MOCK_SUCCESS_RATE, 10) || 98,
            delayMs: parseInt(process.env.IBAN_MOCK_DELAY_MS, 10) || 5000
        },
        kwik: {
            successRate: parseInt(process.env.KWIK_MOCK_SUCCESS_RATE, 10) || 97,
            delayMs: parseInt(process.env.KWIK_MOCK_DELAY_MS, 10) || 1500
        }
    },

    // Logs
    logs: {
        level: process.env.LOG_LEVEL || 'info',
        dir: process.env.LOG_DIR || './logs',
        maxSize: process.env.LOG_MAX_SIZE || '20m',
        maxFiles: process.env.LOG_MAX_FILES || '14d',
        datePattern: process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD'
    },

    // Upload de Arquivos
    upload: {
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 5 * 1024 * 1024,
        allowedTypes: process.env.ALLOWED_FILE_TYPES ? process.env.ALLOWED_FILE_TYPES.split(',') : ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'],
        uploadDir: process.env.UPLOAD_DIR || './uploads',
        documentExpiryDays: parseInt(process.env.DOCUMENT_EXPIRY_DAYS, 10) || 365
    },

    // Cron Jobs
    cron: {
        checkPayments: process.env.CRON_CHECK_PAYMENTS || '0 8 * * *',
        resetLimits: process.env.CRON_RESET_LIMITS || '0 0 * * *',
        cleanupTokens: process.env.CRON_CLEANUP_TOKENS || '0 2 * * *',
        checkBonusExpiry: process.env.CRON_CHECK_BONUS_EXPIRY || '0 3 * * *'
    },

    // Monitoramento
    monitoring: {
        sentryDsn: process.env.SENTRY_DSN,
        newRelicAppName: process.env.NEW_RELIC_APP_NAME,
        newRelicLicenseKey: process.env.NEW_RELIC_LICENSE_KEY
    },

    // Backup
    backup: {
        enabled: process.env.BACKUP_ENABLED === 'true',
        schedule: process.env.BACKUP_SCHEDULE || '0 4 * * *',
        retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS, 10) || 30,
        s3Bucket: process.env.BACKUP_S3_BUCKET,
        s3Region: process.env.BACKUP_S3_REGION,
        aws: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
    },

    // Feature Flags
    features: {
        kycRequired: process.env.FEATURE_KYC_REQUIRED === 'true',
        googleLogin: process.env.FEATURE_GOOGLE_LOGIN === 'true',
        faceRecognition: process.env.FEATURE_FACE_RECOGNITION === 'true',
        welcomeBonus: process.env.FEATURE_BONUS_WELCOME === 'true',
        chatEnabled: process.env.FEATURE_CHAT_ENABLED === 'true',
        pushNotifications: process.env.FEATURE_PUSH_NOTIFICATIONS === 'true',
        referralProgram: process.env.FEATURE_REFERRAL_PROGRAM === 'true'
    },

    // APIs Externas
    externalApis: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET
        },
        multicaixa: {
            apiKey: process.env.MULTICAIXA_API_KEY,
            apiUrl: process.env.MULTICAIXA_API_URL
        },
        iban: {
            apiKey: process.env.IBAN_API_KEY,
            apiUrl: process.env.IBAN_API_URL
        },
        kwik: {
            apiKey: process.env.KWIK_API_KEY,
            apiUrl: process.env.KWIK_API_URL
        }
    },

    // Debug
    debug: process.env.DEBUG || ''
};

// =====================================================
// CONGELAR OBJETO PARA EVITAR MODIFICAÇÕES
// =====================================================
Object.freeze(config);

module.exports = config;
