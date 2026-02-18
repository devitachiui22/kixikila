// =====================================================
// KIXIKILAHUB - MIDDLEWARES DE AUTENTICAÇÃO E AUTORIZAÇÃO
// Proteção de rotas, verificação de tokens e permissões
// =====================================================

const jwt = require('jsonwebtoken');
const database = require('../config/database');
const config = require('../config/env');
const logger = require('../utils/logger');
const { AuthenticationError, AuthorizationError } = require('./error.middleware');

// =====================================================
// MIDDLEWARE PRINCIPAL DE AUTENTICAÇÃO
// =====================================================
const authenticate = async (req, res, next) => {
    try {
        // 1. Obter token do header ou cookie
        const token = getTokenFromRequest(req);

        if (!token) {
            throw new AuthenticationError('Token não fornecido');
        }

        // 2. Verificar JWT
        let decoded;
        try {
            decoded = jwt.verify(token, config.jwt.secret, {
                issuer: config.jwt.issuer,
                audience: config.jwt.audience
            });
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new AuthenticationError('Token expirado');
            }
            if (error.name === 'JsonWebTokenError') {
                throw new AuthenticationError('Token inválido');
            }
            throw error;
        }

        // 3. Buscar usuário no banco
        const result = await database.query(
            `SELECT id, email, full_name, is_email_verified, is_active,
                    document_number, document_type, account_limit_count,
                    last_login_at, created_at
             FROM users
             WHERE id = $1 AND is_active = true`,
            [decoded.sub]
        );

        if (result.rows.length === 0) {
            throw new AuthenticationError('Usuário não encontrado ou inativo');
        }

        const user = result.rows[0];

        // 4. Verificar se email está verificado (exceto para rotas públicas)
        if (!user.is_email_verified && !req.path.includes('/verify-email') && !req.path.includes('/resend-verification')) {
            throw new AuthenticationError('Email não verificado');
        }

        // 5. Anexar usuário à requisição
        req.user = {
            id: user.id,
            email: user.email,
            name: user.full_name,
            isEmailVerified: user.is_email_verified,
            documentNumber: user.document_number,
            documentType: user.document_type,
            accountLimitCount: user.account_limit_count
        };

        // 6. Atualizar último login (assíncrono, não aguardar)
        updateLastLogin(user.id).catch(err =>
            logger.error('Erro ao atualizar último login:', err)
        );

        next();
    } catch (error) {
        next(error);
    }
};

// =====================================================
// MIDDLEWARE DE AUTORIZAÇÃO (KYC OBRIGATÓRIO)
// =====================================================
const requireKYC = async (req, res, next) => {
    try {
        if (!config.features.kycRequired) {
            return next();
        }

        const result = await database.query(
            `SELECT verification_status
             FROM kyc
             WHERE user_id = $1`,
            [req.user.id]
        );

        const kyc = result.rows[0];

        if (!kyc || kyc.verification_status !== 'APPROVED') {
            throw new AuthorizationError('KYC obrigatório para esta operação');
        }

        next();
    } catch (error) {
        next(error);
    }
};

// =====================================================
// MIDDLEWARE DE VERIFICAÇÃO DE PIN
// =====================================================
const requirePin = async (req, res, next) => {
    try {
        const { pin } = req.body;

        if (!pin) {
            throw new AuthenticationError('PIN obrigatório');
        }

        // Buscar hash do PIN
        const result = await database.query(
            `SELECT pin_hash, pin_attempts, pin_locked_until
             FROM wallets
             WHERE user_id = $1`,
            [req.user.id]
        );

        const wallet = result.rows[0];

        if (!wallet || !wallet.pin_hash) {
            throw new AuthenticationError('PIN não configurado');
        }

        // Verificar se PIN está bloqueado
        if (wallet.pin_locked_until && new Date(wallet.pin_locked_until) > new Date()) {
            const minutesLeft = Math.ceil((new Date(wallet.pin_locked_until) - new Date()) / 60000);
            throw new AuthenticationError(`PIN bloqueado por ${minutesLeft} minutos`);
        }

        // Verificar PIN (usando bcrypt - a ser implementado)
        const bcrypt = require('bcrypt');
        const isValid = await bcrypt.compare(pin, wallet.pin_hash);

        if (!isValid) {
            // Incrementar tentativas
            await handleFailedPinAttempt(req.user.id);
            throw new AuthenticationError('PIN inválido');
        }

        // Resetar tentativas em caso de sucesso
        await database.query(
            `UPDATE wallets
             SET pin_attempts = 0, pin_locked_until = NULL, updated_at = NOW()
             WHERE user_id = $1`,
            [req.user.id]
        );

        next();
    } catch (error) {
        next(error);
    }
};

// =====================================================
// MIDDLEWARE DE VERIFICAÇÃO DE LIMITE DE CONTAS
// =====================================================
const checkAccountLimit = async (req, res, next) => {
    try {
        const { documentNumber } = req.body;

        if (!documentNumber) {
            return next();
        }

        // Buscar quantas contas existem com este documento
        const result = await database.query(
            `SELECT COUNT(*) as count,
                    ARRAY_AGG(id) as account_ids,
                    ARRAY_AGG(email) as emails
             FROM users
             WHERE document_number = $1 AND is_active = true`,
            [documentNumber]
        );

        const count = parseInt(result.rows[0].count);

        if (count >= config.financial.maxAccountsPerPerson) {
            throw new AuthorizationError(
                `Limite máximo de ${config.financial.maxAccountsPerPerson} contas por pessoa atingido`,
                'ACCOUNT_LIMIT_EXCEEDED'
            );
        }

        // Se já existe uma conta, vincular como master
        if (count === 1) {
            req.body.masterUserId = result.rows[0].account_ids[0];
        }

        next();
    } catch (error) {
        next(error);
    }
};

// =====================================================
// MIDDLEWARE DE VERIFICAÇÃO DE PROPRIEDADE
// =====================================================
const checkOwnership = (paramName = 'id', tableName = 'users') => {
    return async (req, res, next) => {
        try {
            const resourceId = req.params[paramName];

            if (!resourceId) {
                throw new AuthorizationError('Recurso não especificado');
            }

            // Verificar se o usuário é dono do recurso
            let query;
            switch (tableName) {
                case 'groups':
                    query = `SELECT admin_id FROM groups WHERE id = $1`;
                    break;
                case 'wallets':
                    query = `SELECT user_id FROM wallets WHERE id = $1`;
                    break;
                default:
                    query = `SELECT id FROM ${tableName} WHERE id = $1`;
            }

            const result = await database.query(query, [resourceId]);

            if (result.rows.length === 0) {
                throw new AuthorizationError('Recurso não encontrado');
            }

            const ownerId = result.rows[0].admin_id || result.rows[0].user_id || result.rows[0].id;

            if (ownerId !== req.user.id) {
                throw new AuthorizationError('Sem permissão para acessar este recurso');
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};

// =====================================================
// MIDDLEWARE DE VERIFICAÇÃO DE ADMIN DE GRUPO
// =====================================================
const requireGroupAdmin = async (req, res, next) => {
    try {
        const groupId = req.params.groupId || req.body.groupId;

        if (!groupId) {
            throw new AuthorizationError('Grupo não especificado');
        }

        const result = await database.query(
            `SELECT admin_id FROM groups WHERE id = $1`,
            [groupId]
        );

        if (result.rows.length === 0) {
            throw new AuthorizationError('Grupo não encontrado');
        }

        if (result.rows[0].admin_id !== req.user.id) {
            throw new AuthorizationError('Apenas o administrador do grupo pode realizar esta ação');
        }

        req.group = { id: groupId, adminId: result.rows[0].admin_id };
        next();
    } catch (error) {
        next(error);
    }
};

// =====================================================
// MIDDLEWARE DE VERIFICAÇÃO DE MEMBRO DE GRUPO
// =====================================================
const requireGroupMember = async (req, res, next) => {
    try {
        const groupId = req.params.groupId || req.body.groupId;

        if (!groupId) {
            throw new AuthorizationError('Grupo não especificado');
        }

        const result = await database.query(
            `SELECT 1 FROM group_members
             WHERE group_id = $1 AND user_id = $2 AND is_active = true`,
            [groupId, req.user.id]
        );

        if (result.rows.length === 0) {
            throw new AuthorizationError('Você não é membro deste grupo');
        }

        next();
    } catch (error) {
        next(error);
    }
};

// =====================================================
// MIDDLEWARE DE VERIFICAÇÃO DE LIMITE DIÁRIO
// =====================================================
const checkDailyLimit = (type = 'deposit') => {
    return async (req, res, next) => {
        try {
            const { amount } = req.body;

            if (!amount || amount <= 0) {
                throw new AuthorizationError('Valor inválido');
            }

            // Buscar limites do usuário
            const result = await database.query(
                `SELECT deposit_limit, deposit_used_today,
                        withdrawal_limit, withdrawal_used_today,
                        last_reset_date
                 FROM daily_limits
                 WHERE user_id = $1`,
                [req.user.id]
            );

            let limit = result.rows[0];

            // Resetar limites se necessário (outro dia)
            if (limit.last_reset_date < new Date().toISOString().split('T')[0]) {
                await database.query(
                    `UPDATE daily_limits
                     SET deposit_used_today = 0,
                         withdrawal_used_today = 0,
                         last_reset_date = CURRENT_DATE
                     WHERE user_id = $1`,
                    [req.user.id]
                );

                // Buscar novamente
                const newResult = await database.query(
                    `SELECT * FROM daily_limits WHERE user_id = $1`,
                    [req.user.id]
                );
                limit = newResult.rows[0];
            }

            // Verificar limite
            if (type === 'deposit') {
                const available = limit.deposit_limit - limit.deposit_used_today;
                if (amount > available) {
                    throw new AuthorizationError(
                        `Limite diário de depósito excedido. Disponível: ${available} KZ`
                    );
                }
            } else if (type === 'withdrawal') {
                const available = limit.withdrawal_limit - limit.withdrawal_used_today;
                if (amount > available) {
                    throw new AuthorizationError(
                        `Limite diário de saque excedido. Disponível: ${available} KZ`
                    );
                }
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};

// =====================================================
// MIDDLEWARE DE REFRESH TOKEN
// =====================================================
const refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            throw new AuthenticationError('Refresh token não fornecido');
        }

        // Verificar refresh token
        const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret, {
            issuer: config.jwt.issuer,
            audience: config.jwt.audience
        });

        // Gerar novos tokens
        const newAccessToken = jwt.sign(
            { sub: decoded.sub },
            config.jwt.secret,
            {
                expiresIn: config.jwt.expiresIn,
                issuer: config.jwt.issuer,
                audience: config.jwt.audience
            }
        );

        const newRefreshToken = jwt.sign(
            { sub: decoded.sub },
            config.jwt.refreshSecret,
            {
                expiresIn: config.jwt.refreshExpiresIn,
                issuer: config.jwt.issuer,
                audience: config.jwt.audience
            }
        );

        req.tokens = {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken
        };

        next();
    } catch (error) {
        next(new AuthenticationError('Refresh token inválido ou expirado'));
    }
};

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

/**
 * Extrair token da requisição
 */
const getTokenFromRequest = (req) => {
    // 1. Header Authorization
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }

    // 2. Cookie
    if (req.cookies && req.cookies.token) {
        return req.cookies.token;
    }

    // 3. Query parameter (apenas para WebSocket)
    if (req.query && req.query.token) {
        return req.query.token;
    }

    return null;
};

/**
 * Atualizar último login
 */
const updateLastLogin = async (userId) => {
    await database.query(
        `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
        [userId]
    );
};

/**
 * Lidar com tentativas de PIN falhas
 */
const handleFailedPinAttempt = async (userId) => {
    const result = await database.query(
        `UPDATE wallets
         SET pin_attempts = pin_attempts + 1,
             pin_locked_until = CASE
                 WHEN pin_attempts + 1 >= 5 THEN NOW() + INTERVAL '30 minutes'
                 ELSE NULL
             END
         WHERE user_id = $1
         RETURNING pin_attempts`,
        [userId]
    );

    const attempts = result.rows[0].pin_attempts;

    // Log de segurança
    logger.security('PIN_FAILED_ATTEMPT', userId, { attempts });

    return attempts;
};

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
    authenticate,
    requireKYC,
    requirePin,
    checkAccountLimit,
    checkOwnership,
    requireGroupAdmin,
    requireGroupMember,
    checkDailyLimit,
    refreshToken
};