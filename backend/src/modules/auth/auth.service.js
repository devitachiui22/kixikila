// File: src/modules/auth/auth.service.js

const db = require('../../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../../config/env');
const { WELCOME_BONUS_AMOUNT } = require('../../utils/constants');
const { v4: uuidv4 } = require('uuid');

// Registrar usuário
const registerUser = async (email, password) => {
    // Verifica se já existe
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
        throw { status: 400, message: 'Email já registrado' };
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(password, 12);

    // Cria usuário
    const userRes = await db.query(
        `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, is_email_verified`,
        [email, passwordHash]
    );
    const user = userRes.rows[0];

    // Cria wallet
    await db.query(`INSERT INTO wallets (user_id) VALUES ($1)`, [user.id]);

    // Cria limite padrão
    await db.query(`INSERT INTO limits (user_id) VALUES ($1)`, [user.id]);

    // Cria bônus de boas-vindas (desbloqueado após 1º depósito)
    await db.query(
        `INSERT INTO bonuses (user_id, amount, is_unlocked) VALUES ($1, $2, false)`,
        [user.id, WELCOME_BONUS_AMOUNT]
    );

    return { id: user.id, email: user.email, is_email_verified: user.is_email_verified };
};

// Login com email e senha
const loginUser = async (email, password) => {
    const res = await db.query('SELECT id, password_hash, is_email_verified FROM users WHERE email = $1', [email]);
    if (res.rows.length === 0) {
        throw { status: 400, message: 'Credenciais inválidas' };
    }
    const user = res.rows[0];

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
        throw { status: 400, message: 'Credenciais inválidas' };
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    return { token, is_email_verified: user.is_email_verified };
};

// Login com Google (simulado)
const loginWithGoogle = async (tokenId) => {
    // Para MVP, aceitamos tokenId como email
    const email = tokenId;
    let userRes = await db.query('SELECT id, is_email_verified FROM users WHERE email = $1', [email]);
    let user;
    if (userRes.rows.length === 0) {
        // Cria usuário
        const id = uuidv4();
        const resInsert = await db.query(
            `INSERT INTO users (id, email, is_email_verified) VALUES ($1, $2, TRUE) RETURNING id, is_email_verified`,
            [id, email]
        );
        user = resInsert.rows[0];

        // Wallet, limits, bonus
        await db.query(`INSERT INTO wallets (user_id) VALUES ($1)`, [user.id]);
        await db.query(`INSERT INTO limits (user_id) VALUES ($1)`, [user.id]);
        await db.query(
            `INSERT INTO bonuses (user_id, amount, is_unlocked) VALUES ($1, $2, false)`,
            [user.id, WELCOME_BONUS_AMOUNT]
        );
    } else {
        user = userRes.rows[0];
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    return { token, is_email_verified: user.is_email_verified };
};

// Verificação de email (simulado)
const verifyUserEmail = async (email, code) => {
    // MVP: qualquer código válido
    const res = await db.query('SELECT id, is_email_verified FROM users WHERE email = $1', [email]);
    if (res.rows.length === 0) throw { status: 400, message: 'Email não encontrado' };

    if (res.rows[0].is_email_verified) return { message: 'Email já verificado' };

    await db.query('UPDATE users SET is_email_verified = TRUE, updated_at = NOW() WHERE email = $1', [email]);
    return { message: 'Email verificado com sucesso' };
};

module.exports = {
    registerUser,
    loginUser,
    loginWithGoogle,
    verifyUserEmail
};
