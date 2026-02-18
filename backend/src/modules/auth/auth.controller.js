// =====================================================
// KIXIKILAHUB - CONTROLLER DE AUTENTICAÇÃO
// Lógica de negócio para registro, login e verificação
// =====================================================

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const database = require('../../config/database');
const config = require('../../config/env');
const logger = require('../../utils/logger');
const {
    AuthenticationError,
    ConflictError,
    NotFoundError,
    ValidationError
} = require('../../middlewares/error.middleware');
const { validateDocument, validateMinimumAge } = require('../../utils/validators');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../../services/email.service');

// =====================================================
// REGISTRO DE NOVO USUÁRIO
// =====================================================
const register = async (req, res) => {
    const {
        email,
        password,
        fullName,
        birthDate,
        documentNumber,
        documentType
    } = req.body;

    // Iniciar transação
    const result = await database.transaction(async (client) => {
        // 1. Validar documento
        const docValidation = validateDocument(documentNumber, documentType);
        if (!docValidation.isValid) {
            throw new ValidationError(docValidation.error);
        }

        // 2. Validar idade mínima
        const ageValidation = validateMinimumAge(birthDate, config.financial.minAge);
        if (!ageValidation.isValid) {
            throw new ValidationError(ageValidation.error);
        }

        // 3. Verificar se email já existe
        const emailCheck = await client.query(
            'SELECT id FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        if (emailCheck.rows.length > 0) {
            throw new ConflictError('Email já cadastrado');
        }

        // 4. Verificar se documento já existe
        const docCheck = await client.query(
            'SELECT id FROM users WHERE document_number = $1',
            [documentNumber]
        );

        if (docCheck.rows.length > 0) {
            throw new ConflictError('Documento já cadastrado');
        }

        // 5. Verificar limite de contas por documento
        const accountCount = await client.query(
            'SELECT COUNT(*) as count FROM users WHERE document_number = $1',
            [documentNumber]
        );

        if (parseInt(accountCount.rows[0].count) >= config.financial.maxAccountsPerPerson) {
            throw new ValidationError(`Limite máximo de ${config.financial.maxAccountsPerPerson} contas por pessoa atingido`);
        }

        // 6. Hash da senha
        const passwordHash = await bcrypt.hash(password, config.security.bcryptRounds);

        // 7. Criar usuário
        const verificationToken = crypto.randomUUID();
        const verificationExpires = new Date();
        verificationExpires.setHours(verificationExpires.getHours() + 24);

        const newUser = await client.query(
            `INSERT INTO users (
                email, password_hash, full_name, birth_date,
                document_number, document_type, email_verification_token,
                email_verification_expires
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, email, full_name`,
            [
                email.toLowerCase(),
                passwordHash,
                fullName,
                birthDate,
                documentNumber,
                documentType,
                verificationToken,
                verificationExpires
            ]
        );

        const user = newUser.rows[0];

        // 8. Enviar email de verificação
        try {
            await sendVerificationEmail(user.email, user.full_name, verificationToken);
            logger.info(`Email de verificação enviado para ${user.email}`);
        } catch (emailError) {
            logger.error('Erro ao enviar email de verificação:', emailError);
            // Não falhar o registro se o email não enviar
        }

        // 9. Log de auditoria
        await client.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_data)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                user.id,
                'USER_REGISTERED',
                'users',
                user.id,
                JSON.stringify({ email: user.email, documentType })
            ]
        );

        logger.security('USER_REGISTERED', user.id, { email: user.email });

        return user;
    });

    res.status(201).json({
        success: true,
        message: 'Registro realizado com sucesso. Verifique seu email para ativar sua conta.',
        data: {
            userId: result.id,
            email: result.email,
            name: result.full_name
        }
    });
};

// =====================================================
// LOGIN COM EMAIL E SENHA
// =====================================================
const login = async (req, res) => {
    const { email, password } = req.body;

    // Buscar usuário
    const result = await database.query(
        `SELECT id, email, password_hash, full_name, is_email_verified,
                is_active, document_number, document_type
         FROM users
         WHERE email = $1`,
        [email.toLowerCase()]
    );

    const user = result.rows[0];

    if (!user) {
        logger.security('LOGIN_FAILED', null, { email, reason: 'USER_NOT_FOUND' });
        throw new AuthenticationError('Email ou senha inválidos');
    }

    // Verificar se conta está ativa
    if (!user.is_active) {
        logger.security('LOGIN_FAILED', user.id, { reason: 'ACCOUNT_INACTIVE' });
        throw new AuthenticationError('Conta desativada. Contacte o suporte.');
    }

    // Verificar senha
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
        logger.security('LOGIN_FAILED', user.id, { reason: 'INVALID_PASSWORD' });
        throw new AuthenticationError('Email ou senha inválidos');
    }

    // Gerar tokens
    const tokens = generateTokens(user.id);

    // Log de sucesso
    logger.security('LOGIN_SUCCESS', user.id, { email: user.email });

    // Atualizar último login (já é feito pelo middleware, mas garantimos)
    await database.query(
        'UPDATE users SET last_login_at = NOW() WHERE id = $1',
        [user.id]
    );

    res.json({
        success: true,
        message: 'Login realizado com sucesso',
        data: {
            user: {
                id: user.id,
                email: user.email,
                name: user.full_name,
                isEmailVerified: user.is_email_verified,
                hasDocument: !!(user.document_number)
            },
            tokens
        }
    });
};

// =====================================================
// LOGIN COM GOOGLE
// =====================================================
const googleLogin = async (req, res) => {
    const { token, fullName: providedName } = req.body;

    try {
        // Verificar token do Google (simulado por enquanto)
        // Em produção, usar google-auth-library
        const googlePayload = verifyGoogleToken(token); // Função simulada

        const email = googlePayload.email;
        const googleId = googlePayload.sub;
        const fullName = providedName || googlePayload.name;

        // Iniciar transação
        const result = await database.transaction(async (client) => {
            // Verificar se usuário existe
            let user = await client.query(
                'SELECT * FROM users WHERE email = $1',
                [email]
            );

            if (user.rows.length === 0) {
                // Criar novo usuário
                const newUser = await client.query(
                    `INSERT INTO users (email, google_id, full_name, is_email_verified, email_verified_at)
                     VALUES ($1, $2, $3, $4, $5)
                     RETURNING id, email, full_name, is_email_verified`,
                    [email, googleId, fullName, true, new Date()]
                );
                user = newUser;
            } else {
                // Atualizar google_id se não existir
                if (!user.rows[0].google_id) {
                    await client.query(
                        'UPDATE users SET google_id = $1 WHERE id = $2',
                        [googleId, user.rows[0].id]
                    );
                }
            }

            return user.rows[0];
        });

        // Gerar tokens
        const tokens = generateTokens(result.id);

        logger.security('GOOGLE_LOGIN_SUCCESS', result.id, { email: result.email });

        res.json({
            success: true,
            message: 'Login com Google realizado com sucesso',
            data: {
                user: {
                    id: result.id,
                    email: result.email,
                    name: result.full_name,
                    isEmailVerified: result.is_email_verified
                },
                tokens
            }
        });

    } catch (error) {
        logger.error('Erro no login com Google:', error);
        throw new AuthenticationError('Falha na autenticação com Google');
    }
};

// =====================================================
// VERIFICAR EMAIL
// =====================================================
const verifyEmail = async (req, res) => {
    const { token } = req.query;

    const result = await database.transaction(async (client) => {
        // Buscar usuário com token válido
        const user = await client.query(
            `SELECT id, email, full_name, email_verification_expires
             FROM users
             WHERE email_verification_token = $1 AND is_email_verified = false`,
            [token]
        );

        if (user.rows.length === 0) {
            throw new ValidationError('Token de verificação inválido');
        }

        const userData = user.rows[0];

        // Verificar se token expirou
        if (new Date() > new Date(userData.email_verification_expires)) {
            throw new ValidationError('Token de verificação expirado');
        }

        // Atualizar usuário
        await client.query(
            `UPDATE users
             SET is_email_verified = true,
                 email_verified_at = NOW(),
                 email_verification_token = NULL,
                 email_verification_expires = NULL
             WHERE id = $1`,
            [userData.id]
        );

        // Log de auditoria
        await client.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
             VALUES ($1, $2, $3, $4)`,
            [userData.id, 'EMAIL_VERIFIED', 'users', userData.id]
        );

        return userData;
    });

    logger.security('EMAIL_VERIFIED', result.id, { email: result.email });

    res.json({
        success: true,
        message: 'Email verificado com sucesso. Sua conta está ativa.'
    });
};

// =====================================================
// REENVIAR EMAIL DE VERIFICAÇÃO
// =====================================================
const resendVerification = async (req, res) => {
    const { email } = req.body;

    const result = await database.transaction(async (client) => {
        // Buscar usuário
        const user = await client.query(
            `SELECT id, email, full_name, is_email_verified
             FROM users
             WHERE email = $1`,
            [email.toLowerCase()]
        );

        if (user.rows.length === 0) {
            throw new NotFoundError('Usuário não encontrado');
        }

        const userData = user.rows[0];

        if (userData.is_email_verified) {
            throw new ValidationError('Email já foi verificado');
        }

        // Gerar novo token
        const newToken = crypto.randomUUID();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        await client.query(
            `UPDATE users
             SET email_verification_token = $1,
                 email_verification_expires = $2
             WHERE id = $3`,
            [newToken, expiresAt, userData.id]
        );

        return { ...userData, token: newToken };
    });

    // Enviar email
    try {
        await sendVerificationEmail(result.email, result.full_name, result.token);
    } catch (error) {
        logger.error('Erro ao reenviar email:', error);
    }

    res.json({
        success: true,
        message: 'Email de verificação reenviado com sucesso'
    });
};

// =====================================================
// ESQUECI SENHA
// =====================================================
const forgotPassword = async (req, res) => {
    const { email } = req.body;

    const result = await database.transaction(async (client) => {
        // Buscar usuário
        const user = await client.query(
            'SELECT id, email, full_name FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        if (user.rows.length === 0) {
            // Por segurança, não informar que email não existe
            return null;
        }

        const userData = user.rows[0];

        // Gerar token de reset
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1);

        // Salvar token (em uma tabela separada ou no usuário)
        await client.query(
            `UPDATE users
             SET password_reset_token = $1,
                 password_reset_expires = $2
             WHERE id = $3`,
            [resetToken, expiresAt, userData.id]
        );

        return { ...userData, resetToken };
    });

    // Se usuário existe, enviar email
    if (result) {
        try {
            await sendPasswordResetEmail(result.email, result.full_name, result.resetToken);
        } catch (error) {
            logger.error('Erro ao enviar email de reset:', error);
        }
    }

    res.json({
        success: true,
        message: 'Se o email estiver cadastrado, você receberá instruções para recuperar sua senha'
    });
};

// =====================================================
// RESETAR SENHA
// =====================================================
const resetPassword = async (req, res) => {
    const { token, password } = req.body;

    await database.transaction(async (client) => {
        // Buscar usuário com token válido
        const user = await client.query(
            `SELECT id, email
             FROM users
             WHERE password_reset_token = $1 AND password_reset_expires > NOW()`,
            [token]
        );

        if (user.rows.length === 0) {
            throw new ValidationError('Token inválido ou expirado');
        }

        const userData = user.rows[0];

        // Hash da nova senha
        const passwordHash = await bcrypt.hash(password, config.security.bcryptRounds);

        // Atualizar senha e limpar token
        await client.query(
            `UPDATE users
             SET password_hash = $1,
                 password_reset_token = NULL,
                 password_reset_expires = NULL,
                 updated_at = NOW()
             WHERE id = $2`,
            [passwordHash, userData.id]
        );

        // Log de segurança
        await client.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
             VALUES ($1, $2, $3, $4)`,
            [userData.id, 'PASSWORD_RESET', 'users', userData.id]
        );

        logger.security('PASSWORD_RESET', userData.id, { email: userData.email });
    });

    res.json({
        success: true,
        message: 'Senha alterada com sucesso'
    });
};

// =====================================================
// REFRESH TOKEN
// =====================================================
const refreshToken = async (req, res) => {
    // Tokens já foram gerados pelo middleware refreshToken
    res.json({
        success: true,
        data: {
            tokens: req.tokens
        }
    });
};

// =====================================================
// LOGOUT
// =====================================================
const logout = async (req, res) => {
    // Em uma implementação com blacklist, adicionar token à blacklist aqui

    logger.security('LOGOUT', req.user.id);

    res.json({
        success: true,
        message: 'Logout realizado com sucesso'
    });
};

// =====================================================
// OBTER USUÁRIO ATUAL
// =====================================================
const getCurrentUser = async (req, res) => {
    // Buscar dados adicionais do usuário
    const result = await database.query(
        `SELECT
            u.id, u.email, u.full_name, u.birth_date,
            u.document_number, u.document_type, u.is_email_verified,
            u.created_at, u.last_login_at,
            w.available_balance, w.locked_balance, w.account_number,
            k.verification_status as kyc_status
         FROM users u
         LEFT JOIN wallets w ON u.id = w.user_id
         LEFT JOIN kyc k ON u.id = k.user_id
         WHERE u.id = $1`,
        [req.user.id]
    );

    const userData = result.rows[0];

    res.json({
        success: true,
        data: {
            user: userData
        }
    });
};

// =====================================================
// ALTERAR SENHA (USUÁRIO LOGADO)
// =====================================================
const changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    await database.transaction(async (client) => {
        // Buscar usuário com senha atual
        const user = await client.query(
            'SELECT password_hash FROM users WHERE id = $1',
            [req.user.id]
        );

        // Verificar senha atual
        const isValid = await bcrypt.compare(currentPassword, user.rows[0].password_hash);

        if (!isValid) {
            throw new ValidationError('Senha atual incorreta');
        }

        // Hash da nova senha
        const newPasswordHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);

        // Atualizar senha
        await client.query(
            'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
            [newPasswordHash, req.user.id]
        );

        // Log de segurança
        await client.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
             VALUES ($1, $2, $3, $4)`,
            [req.user.id, 'PASSWORD_CHANGED', 'users', req.user.id]
        );
    });

    logger.security('PASSWORD_CHANGED', req.user.id);

    res.json({
        success: true,
        message: 'Senha alterada com sucesso'
    });
};

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

/**
 * Gerar tokens JWT
 */
const generateTokens = (userId) => {
    const accessToken = jwt.sign(
        { sub: userId },
        config.jwt.secret,
        {
            expiresIn: config.jwt.expiresIn,
            issuer: config.jwt.issuer,
            audience: config.jwt.audience
        }
    );

    const refreshToken = jwt.sign(
        { sub: userId },
        config.jwt.refreshSecret,
        {
            expiresIn: config.jwt.refreshExpiresIn,
            issuer: config.jwt.issuer,
            audience: config.jwt.audience
        }
    );

    return { accessToken, refreshToken };
};

/**
 * Verificar token do Google (simulado)
 */
const verifyGoogleToken = (token) => {
    // Implementação simulada para MVP
    // Em produção, usar biblioteca oficial do Google
    return {
        email: 'usuario@gmail.com',
        sub: '123456789',
        name: 'Usuário Google'
    };
};

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
    register,
    login,
    googleLogin,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    refreshToken,
    logout,
    getCurrentUser,
    changePassword
};