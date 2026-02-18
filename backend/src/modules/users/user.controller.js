// =====================================================
// KIXIKILAHUB - CONTROLLER DE USUÁRIOS
// Gerenciamento de perfil, limites e configurações
// =====================================================

const bcrypt = require('bcrypt');
const database = require('../../config/database');
const config = require('../../config/env');
const logger = require('../../utils/logger');
const { NotFoundError, ValidationError } = require('../../middlewares/error.middleware');

// =====================================================
// OBTER PERFIL DO USUÁRIO LOGADO
// =====================================================
const getProfile = async (req, res) => {
    const result = await database.query(
        `SELECT
            u.id, u.email, u.full_name, u.birth_date,
            u.document_number, u.document_type, u.is_email_verified,
            u.created_at, u.last_login_at, u.account_limit_count,
            w.available_balance, w.locked_balance, w.account_number,
            w.total_deposited, w.total_withdrawn, w.total_fees_paid,
            k.verification_status as kyc_status,
            (SELECT COUNT(*) FROM group_members WHERE user_id = u.id AND is_active = true) as active_groups_count
         FROM users u
         LEFT JOIN wallets w ON u.id = w.user_id
         LEFT JOIN kyc k ON u.id = k.user_id
         WHERE u.id = $1`,
        [req.user.id]
    );

    const profile = result.rows[0];

    if (!profile) {
        throw new NotFoundError('Perfil não encontrado');
    }

    // Mascarar dados sensíveis
    if (profile.document_number) {
        profile.document_number = maskDocument(profile.document_number);
    }

    res.json({
        success: true,
        data: { profile }
    });
};

// =====================================================
// ATUALIZAR PERFIL
// =====================================================
const updateProfile = async (req, res) => {
    const { fullName, birthDate, avatar } = req.body;

    const result = await database.transaction(async (client) => {
        // Verificar se usuário existe
        const user = await client.query(
            'SELECT id FROM users WHERE id = $1',
            [req.user.id]
        );

        if (user.rows.length === 0) {
            throw new NotFoundError('Usuário não encontrado');
        }

        // Construir query dinamicamente
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (fullName) {
            updates.push(`full_name = $${paramCount}`);
            values.push(fullName);
            paramCount++;
        }

        if (birthDate) {
            updates.push(`birth_date = $${paramCount}`);
            values.push(birthDate);
            paramCount++;
        }

        if (avatar) {
            updates.push(`avatar_url = $${paramCount}`);
            values.push(avatar);
            paramCount++;
        }

        if (updates.length === 0) {
            return user.rows[0];
        }

        updates.push(`updated_at = NOW()`);
        values.push(req.user.id);

        const query = `
            UPDATE users
            SET ${updates.join(', ')}
            WHERE id = $${paramCount}
            RETURNING id, full_name, email, birth_date
        `;

        const updated = await client.query(query, values);

        // Log de auditoria
        await client.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_data)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'PROFILE_UPDATED', 'users', req.user.id, JSON.stringify(req.body)]
        );

        return updated.rows[0];
    });

    logger.info(`Perfil atualizado para usuário ${req.user.id}`);

    res.json({
        success: true,
        message: 'Perfil atualizado com sucesso',
        data: { user: result }
    });
};

// =====================================================
// OBTER LIMITES DIÁRIOS
// =====================================================
const getLimits = async (req, res) => {
    const result = await database.query(
        `SELECT
            deposit_limit, deposit_used_today,
            withdrawal_limit, withdrawal_used_today,
            last_reset_date
         FROM daily_limits
         WHERE user_id = $1`,
        [req.user.id]
    );

    const limits = result.rows[0] || {
        deposit_limit: config.financial.defaultDepositLimit,
        deposit_used_today: 0,
        withdrawal_limit: config.financial.defaultWithdrawalLimit,
        withdrawal_used_today: 0
    };

    // Calcular disponíveis
    const availableDeposit = limits.deposit_limit - limits.deposit_used_today;
    const availableWithdrawal = limits.withdrawal_limit - limits.withdrawal_used_today;

    res.json({
        success: true,
        data: {
            limits: {
                deposit: {
                    limit: limits.deposit_limit,
                    used: limits.deposit_used_today,
                    available: availableDeposit
                },
                withdrawal: {
                    limit: limits.withdrawal_limit,
                    used: limits.withdrawal_used_today,
                    available: availableWithdrawal
                },
                lastReset: limits.last_reset_date
            }
        }
    });
};

// =====================================================
// ATUALIZAR LIMITES
// =====================================================
const updateLimits = async (req, res) => {
    const { depositLimit, withdrawalLimit } = req.body;

    // Validar limites máximos
    if (depositLimit && (depositLimit < 1000 || depositLimit > 500000)) {
        throw new ValidationError('Limite de depósito deve estar entre 1.000 e 500.000 KZ');
    }

    if (withdrawalLimit && (withdrawalLimit < 1000 || withdrawalLimit > 500000)) {
        throw new ValidationError('Limite de saque deve estar entre 1.000 e 500.000 KZ');
    }

    await database.transaction(async (client) => {
        // Verificar se já existe registro
        const exists = await client.query(
            'SELECT 1 FROM daily_limits WHERE user_id = $1',
            [req.user.id]
        );

        if (exists.rows.length > 0) {
            // Atualizar
            const updates = [];
            const values = [];
            let paramCount = 1;

            if (depositLimit) {
                updates.push(`deposit_limit = $${paramCount}`);
                values.push(depositLimit);
                paramCount++;
            }

            if (withdrawalLimit) {
                updates.push(`withdrawal_limit = $${paramCount}`);
                values.push(withdrawalLimit);
                paramCount++;
            }

            if (updates.length > 0) {
                updates.push(`updated_at = NOW()`);
                values.push(req.user.id);

                await client.query(
                    `UPDATE daily_limits
                     SET ${updates.join(', ')}
                     WHERE user_id = $${paramCount}`,
                    values
                );
            }
        } else {
            // Inserir
            await client.query(
                `INSERT INTO daily_limits (user_id, deposit_limit, withdrawal_limit)
                 VALUES ($1, $2, $3)`,
                [req.user.id, depositLimit || config.financial.defaultDepositLimit,
                 withdrawalLimit || config.financial.defaultWithdrawalLimit]
            );
        }

        // Log de auditoria
        await client.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_data)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'LIMITS_UPDATED', 'daily_limits', req.user.id, JSON.stringify(req.body)]
        );
    });

    logger.info(`Limites atualizados para usuário ${req.user.id}`);

    res.json({
        success: true,
        message: 'Limites atualizados com sucesso'
    });
};

// =====================================================
// OBTER CONFIGURAÇÕES DE NOTIFICAÇÃO
// =====================================================
const getNotificationSettings = async (req, res) => {
    // Por enquanto, retornar configurações padrão
    // Em versão futura, implementar tabela de preferências
    res.json({
        success: true,
        data: {
            settings: {
                emailNotifications: true,
                pushNotifications: true,
                smsNotifications: false,
                marketingEmails: false,
                paymentAlerts: true,
                groupUpdates: true,
                chatNotifications: true
            }
        }
    });
};

// =====================================================
// ATUALIZAR CONFIGURAÇÕES DE NOTIFICAÇÃO
// =====================================================
const updateNotificationSettings = async (req, res) => {
    const settings = req.body;

    // TODO: Implementar tabela de preferências
    logger.info(`Configurações de notificação atualizadas para usuário ${req.user.id}`, settings);

    res.json({
        success: true,
        message: 'Configurações de notificação atualizadas',
        data: { settings }
    });
};

// =====================================================
// OBTER HISTÓRICO DE ATIVIDADES
// =====================================================
const getActivityLog = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const result = await database.query(
        `SELECT
            id, action, entity_type, entity_id,
            ip_address, user_agent, created_at
         FROM audit_logs
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
    );

    // Contar total para paginação
    const countResult = await database.query(
        'SELECT COUNT(*) as total FROM audit_logs WHERE user_id = $1',
        [req.user.id]
    );

    const total = parseInt(countResult.rows[0].total);

    res.json({
        success: true,
        data: {
            activities: result.rows,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        }
    });
};

// =====================================================
// LISTAR DISPOSITIVOS CONECTADOS
// =====================================================
const getDevices = async (req, res) => {
    // TODO: Implementar com Redis ou tabela de sessões
    // Por enquanto, retornar dispositivo atual
    res.json({
        success: true,
        data: {
            devices: [
                {
                    id: 'current',
                    name: 'Dispositivo atual',
                    type: req.headers['user-agent']?.includes('Mobile') ? 'mobile' : 'web',
                    browser: req.headers['user-agent'],
                    ip: req.ip,
                    lastActive: new Date(),
                    current: true
                }
            ]
        }
    });
};

// =====================================================
// REVOGAR DISPOSITIVO
// =====================================================
const revokeDevice = async (req, res) => {
    const { deviceId } = req.params;

    if (deviceId === 'current') {
        throw new ValidationError('Não é possível remover o dispositivo atual');
    }

    // TODO: Implementar revogação de token
    logger.info(`Dispositivo ${deviceId} revogado para usuário ${req.user.id}`);

    res.json({
        success: true,
        message: 'Dispositivo removido com sucesso'
    });
};

// =====================================================
// OBTER ESTATÍSTICAS DO USUÁRIO
// =====================================================
const getStatistics = async (req, res) => {
    const result = await database.query(
        `SELECT
            (SELECT COUNT(*) FROM group_members WHERE user_id = $1 AND is_active = true) as active_groups,
            (SELECT COUNT(*) FROM transactions WHERE user_id = $1) as total_transactions,
            (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = $1 AND transaction_type = 'DEPOSIT' AND status = 'COMPLETED') as total_deposits,
            (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = $1 AND transaction_type = 'WITHDRAWAL' AND status = 'COMPLETED') as total_withdrawals,
            (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = $1 AND transaction_type = 'GROUP_PAYMENT' AND status = 'COMPLETED') as total_paid,
            (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = $1 AND transaction_type = 'GROUP_RECEIVE' AND status = 'COMPLETED') as total_received,
            (SELECT COUNT(*) FROM payment_cycles WHERE beneficiary_id = $1 AND status = 'PAID') as cycles_won,
            (SELECT EXTRACT(DAY FROM (NOW() - created_at)) FROM users WHERE id = $1) as account_age_days
         FROM users WHERE id = $1
         GROUP BY id`,
        [req.user.id]
    );

    const stats = result.rows[0] || {};

    res.json({
        success: true,
        data: { statistics: stats }
    });
};

// =====================================================
// DESATIVAR CONTA
// =====================================================
const deactivateAccount = async (req, res) => {
    const { password, reason } = req.body;

    await database.transaction(async (client) => {
        // Verificar senha
        const user = await client.query(
            'SELECT password_hash FROM users WHERE id = $1',
            [req.user.id]
        );

        const isValid = await bcrypt.compare(password, user.rows[0].password_hash);

        if (!isValid) {
            throw new ValidationError('Senha incorreta');
        }

        // Verificar se não há grupos ativos ou saldo
        const groups = await client.query(
            `SELECT COUNT(*) as count
             FROM group_members gm
             JOIN groups g ON gm.group_id = g.id
             WHERE gm.user_id = $1 AND gm.is_active = true AND g.status = 'ACTIVE'`,
            [req.user.id]
        );

        if (parseInt(groups.rows[0].count) > 0) {
            throw new ValidationError('Não é possível desativar conta com grupos ativos');
        }

        const wallet = await client.query(
            'SELECT available_balance FROM wallets WHERE user_id = $1',
            [req.user.id]
        );

        if (wallet.rows[0]?.available_balance > 0) {
            throw new ValidationError('Não é possível desativar conta com saldo disponível');
        }

        // Desativar conta
        await client.query(
            `UPDATE users
             SET is_active = false,
                 deactivation_reason = $1,
                 deactivated_at = NOW(),
                 updated_at = NOW()
             WHERE id = $2`,
            [reason || 'Solicitação do usuário', req.user.id]
        );

        // Log de auditoria
        await client.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_data)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'ACCOUNT_DEACTIVATED', 'users', req.user.id, JSON.stringify({ reason })]
        );
    });

    logger.security('ACCOUNT_DEACTIVATED', req.user.id, { reason });

    res.json({
        success: true,
        message: 'Conta desativada com sucesso'
    });
};

// =====================================================
// OBTER PERFIL PÚBLICO DE OUTRO USUÁRIO
// =====================================================
const getPublicProfile = async (req, res) => {
    const { userId } = req.params;

    const result = await database.query(
        `SELECT
            u.id, u.full_name,
            (SELECT COUNT(*) FROM group_members WHERE user_id = u.id AND is_active = true) as groups_count,
            (SELECT COUNT(*) FROM payment_cycles WHERE beneficiary_id = u.id AND status = 'PAID') as cycles_won,
            k.verification_status as kyc_verified
         FROM users u
         LEFT JOIN kyc k ON u.id = k.user_id
         WHERE u.id = $1 AND u.is_active = true`,
        [userId]
    );

    if (result.rows.length === 0) {
        throw new NotFoundError('Usuário não encontrado');
    }

    const profile = result.rows[0];

    res.json({
        success: true,
        data: { profile }
    });
};

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

/**
 * Mascarar número de documento
 */
const maskDocument = (document) => {
    if (!document) return null;
    if (document.length <= 4) return '****';
    return '*'.repeat(document.length - 4) + document.slice(-4);
};

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
    getProfile,
    updateProfile,
    getLimits,
    updateLimits,
    getNotificationSettings,
    updateNotificationSettings,
    getActivityLog,
    getDevices,
    revokeDevice,
    getStatistics,
    deactivateAccount,
    getPublicProfile
};