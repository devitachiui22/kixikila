// =====================================================
// KIXIKILAHUB - CONTROLLER DA WALLET
// Gerenciamento de carteira, saldos, PIN e transações
// =====================================================

const bcrypt = require('bcrypt');
const database = require('../../config/database');
const config = require('../../config/env');
const logger = require('../../utils/logger');
const {
    ValidationError,
    NotFoundError,
    InsufficientBalanceError,
    InvalidPinError,
    BusinessError
} = require('../../middlewares/error.middleware');
const { validatePin } = require('../../utils/validators');
const paymentService = require('../payments/payment.service');

// =====================================================
// OBTER SALDO DA CARTEIRA
// =====================================================
const getBalance = async (req, res) => {
    const result = await database.query(
        `SELECT
            available_balance, locked_balance,
            total_deposited, total_withdrawn, total_fees_paid,
            account_number, pin_attempts,
            CASE
                WHEN pin_locked_until > NOW() THEN true
                ELSE false
            END as is_pin_locked,
            pin_locked_until
         FROM wallets
         WHERE user_id = $1`,
        [req.user.id]
    );

    const wallet = result.rows[0];

    if (!wallet) {
        throw new NotFoundError('Carteira não encontrada');
    }

    res.json({
        success: true,
        data: {
            balance: {
                available: parseFloat(wallet.available_balance),
                locked: parseFloat(wallet.locked_balance),
                total: parseFloat(wallet.available_balance) + parseFloat(wallet.locked_balance)
            },
            totals: {
                deposited: parseFloat(wallet.total_deposited),
                withdrawn: parseFloat(wallet.total_withdrawn),
                fees: parseFloat(wallet.total_fees_paid)
            },
            accountNumber: wallet.account_number,
            security: {
                hasPin: !!(wallet.account_number), // Simplificado, idealmente verificar pin_hash
                isPinLocked: wallet.is_pin_locked,
                pinLockedUntil: wallet.pin_locked_until
            }
        }
    });
};

// =====================================================
// CONFIGURAR PIN
// =====================================================
const setPin = async (req, res) => {
    const { pin } = req.body;

    // Validar PIN
    const pinValidation = validatePin(pin);
    if (!pinValidation.isValid) {
        throw new ValidationError(pinValidation.error);
    }

    await database.transaction(async (client) => {
        // Verificar se já tem PIN
        const wallet = await client.query(
            'SELECT pin_hash FROM wallets WHERE user_id = $1',
            [req.user.id]
        );

        if (wallet.rows[0]?.pin_hash) {
            throw new BusinessError('PIN já foi configurado anteriormente');
        }

        // Hash do PIN
        const pinHash = await bcrypt.hash(pin, config.security.bcryptRounds);

        // Salvar PIN
        await client.query(
            'UPDATE wallets SET pin_hash = $1, updated_at = NOW() WHERE user_id = $2',
            [pinHash, req.user.id]
        );

        // Log de auditoria
        await client.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
             VALUES ($1, $2, $3, $4)`,
            [req.user.id, 'PIN_SET', 'wallets', req.user.id]
        );
    });

    logger.security('PIN_SET', req.user.id);

    res.json({
        success: true,
        message: 'PIN configurado com sucesso'
    });
};

// =====================================================
// VERIFICAR PIN
// =====================================================
const verifyPin = async (req, res) => {
    const { pin } = req.body;

    const result = await database.query(
        `SELECT pin_hash, pin_attempts, pin_locked_until
         FROM wallets
         WHERE user_id = $1`,
        [req.user.id]
    );

    const wallet = result.rows[0];

    if (!wallet || !wallet.pin_hash) {
        throw new BusinessError('PIN não configurado');
    }

    // Verificar se está bloqueado
    if (wallet.pin_locked_until && new Date(wallet.pin_locked_until) > new Date()) {
        const minutesLeft = Math.ceil((new Date(wallet.pin_locked_until) - new Date()) / 60000);
        throw new InvalidPinError(`PIN bloqueado por ${minutesLeft} minutos`);
    }

    // Verificar PIN
    const isValid = await bcrypt.compare(pin, wallet.pin_hash);

    if (!isValid) {
        // Incrementar tentativas
        await handleFailedPinAttempt(req.user.id);
        throw new InvalidPinError('PIN inválido');
    }

    // Resetar tentativas
    await database.query(
        `UPDATE wallets
         SET pin_attempts = 0, pin_locked_until = NULL, updated_at = NOW()
         WHERE user_id = $1`,
        [req.user.id]
    );

    res.json({
        success: true,
        message: 'PIN válido'
    });
};

// =====================================================
// ALTERAR PIN
// =====================================================
const changePin = async (req, res) => {
    const { oldPin, newPin } = req.body;

    // Validar novo PIN
    const pinValidation = validatePin(newPin);
    if (!pinValidation.isValid) {
        throw new ValidationError(pinValidation.error);
    }

    await database.transaction(async (client) => {
        // Buscar PIN atual
        const wallet = await client.query(
            'SELECT pin_hash FROM wallets WHERE user_id = $1',
            [req.user.id]
        );

        if (!wallet.rows[0]?.pin_hash) {
            throw new BusinessError('PIN não configurado');
        }

        // Verificar PIN antigo
        const isValid = await bcrypt.compare(oldPin, wallet.rows[0].pin_hash);
        if (!isValid) {
            throw new InvalidPinError('PIN atual incorreto');
        }

        // Hash do novo PIN
        const newPinHash = await bcrypt.hash(newPin, config.security.bcryptRounds);

        // Atualizar PIN
        await client.query(
            `UPDATE wallets
             SET pin_hash = $1, pin_attempts = 0, pin_locked_until = NULL, updated_at = NOW()
             WHERE user_id = $2`,
            [newPinHash, req.user.id]
        );

        // Log de auditoria
        await client.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
             VALUES ($1, $2, $3, $4)`,
            [req.user.id, 'PIN_CHANGED', 'wallets', req.user.id]
        );
    });

    logger.security('PIN_CHANGED', req.user.id);

    res.json({
        success: true,
        message: 'PIN alterado com sucesso'
    });
};

// =====================================================
// OBTER EXTRATO
// =====================================================
const getStatement = async (req, res) => {
    const { startDate, endDate, type, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
        SELECT
            t.id, t.transaction_type, t.amount, t.fee, t.net_amount,
            t.balance_before, t.balance_after, t.status,
            t.reference, t.description, t.metadata,
            t.created_at, t.completed_at,
            CASE
                WHEN t.transaction_type = 'DEPOSIT' THEN d.method
                WHEN t.transaction_type = 'WITHDRAWAL' THEN w.method
                ELSE NULL
            END as payment_method
        FROM transactions t
        LEFT JOIN deposits d ON t.id = d.transaction_id
        LEFT JOIN withdrawals w ON t.id = w.transaction_id
        WHERE t.user_id = $1
    `;

    const params = [req.user.id];
    let paramCount = 2;

    if (startDate) {
        query += ` AND t.created_at >= $${paramCount}`;
        params.push(startDate);
        paramCount++;
    }

    if (endDate) {
        query += ` AND t.created_at <= $${paramCount}`;
        params.push(endDate);
        paramCount++;
    }

    if (type) {
        query += ` AND t.transaction_type = $${paramCount}`;
        params.push(type);
        paramCount++;
    }

    query += ` ORDER BY t.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await database.query(query, params);

    // Total para paginação
    let countQuery = 'SELECT COUNT(*) as total FROM transactions WHERE user_id = $1';
    const countParams = [req.user.id];

    if (startDate) {
        countQuery += ` AND created_at >= $2`;
        countParams.push(startDate);
    }
    if (endDate) {
        countQuery += ` AND created_at <= $${countParams.length + 1}`;
        countParams.push(endDate);
    }
    if (type) {
        countQuery += ` AND transaction_type = $${countParams.length + 1}`;
        countParams.push(type);
    }

    const countResult = await database.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    // Calcular totais do período
    let totalsQuery = `
        SELECT
            COALESCE(SUM(CASE WHEN transaction_type = 'DEPOSIT' AND status = 'COMPLETED' THEN amount ELSE 0 END), 0) as total_deposits,
            COALESCE(SUM(CASE WHEN transaction_type = 'WITHDRAWAL' AND status = 'COMPLETED' THEN amount ELSE 0 END), 0) as total_withdrawals,
            COALESCE(SUM(CASE WHEN transaction_type = 'FEE' THEN amount ELSE 0 END), 0) as total_fees,
            COALESCE(SUM(CASE WHEN transaction_type = 'GROUP_PAYMENT' THEN amount ELSE 0 END), 0) as total_paid_groups,
            COALESCE(SUM(CASE WHEN transaction_type = 'GROUP_RECEIVE' THEN amount ELSE 0 END), 0) as total_received_groups
        FROM transactions
        WHERE user_id = $1 AND status = 'COMPLETED'
    `;

    if (startDate) totalsQuery += ` AND created_at >= $2`;
    if (endDate) totalsQuery += ` AND created_at <= $3`;

    const totalsResult = await database.query(totalsQuery, countParams);
    const totals = totalsResult.rows[0];

    res.json({
        success: true,
        data: {
            transactions: result.rows,
            summary: {
                deposits: parseFloat(totals.total_deposits),
                withdrawals: parseFloat(totals.total_withdrawals),
                fees: parseFloat(totals.total_fees),
                paidGroups: parseFloat(totals.total_paid_groups),
                receivedGroups: parseFloat(totals.total_received_groups),
                netChange: parseFloat(totals.total_deposits) - parseFloat(totals.total_withdrawals) - parseFloat(totals.total_fees)
            },
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        }
    });
};

// =====================================================
// REALIZAR DEPÓSITO
// =====================================================
const deposit = async (req, res) => {
    const { amount, method, reference, metadata } = req.body;

    // Validar valor mínimo
    if (amount < 100) {
        throw new ValidationError('Valor mínimo para depósito é 100 KZ');
    }

    // Processar pagamento com mock
    const paymentResult = await paymentService.processDeposit({
        amount,
        method,
        reference,
        userId: req.user.id,
        metadata
    });

    if (!paymentResult.success) {
        throw new BusinessError(`Falha no pagamento: ${paymentResult.error}`, 'PAYMENT_FAILED');
    }

    // Iniciar transação no banco
    const result = await database.transaction(async (client) => {
        // Calcular taxa
        const fee = amount * config.fees.deposit;
        const netAmount = amount - fee;

        // Buscar saldo atual
        const wallet = await client.query(
            'SELECT available_balance FROM wallets WHERE user_id = $1 FOR UPDATE',
            [req.user.id]
        );

        const currentBalance = parseFloat(wallet.rows[0].available_balance);

        // Criar transação
        const transaction = await client.query(
            `INSERT INTO transactions (
                user_id, wallet_id, transaction_type, amount, fee, net_amount,
                balance_before, balance_after, status, reference, description, metadata
            ) VALUES (
                $1, (SELECT id FROM wallets WHERE user_id = $1),
                'DEPOSIT', $2, $3, $4, $5, $5 + $4, 'COMPLETED', $6, $7, $8
            ) RETURNING id`,
            [
                req.user.id, amount, fee, netAmount, currentBalance,
                paymentResult.reference || reference,
                `Depósito via ${method}`,
                JSON.stringify({ ...metadata, providerData: paymentResult.providerData })
            ]
        );

        // Atualizar saldo da wallet
        await client.query(
            `UPDATE wallets
             SET available_balance = available_balance + $1,
                 total_deposited = total_deposited + $2,
                 total_fees_paid = total_fees_paid + $3,
                 updated_at = NOW()
             WHERE user_id = $4`,
            [netAmount, amount, fee, req.user.id]
        );

        // Atualizar limite diário
        await client.query(
            `UPDATE daily_limits
             SET deposit_used_today = deposit_used_today + $1,
                 updated_at = NOW()
             WHERE user_id = $2`,
            [amount, req.user.id]
        );

        // Inserir registro de depósito
        await client.query(
            `INSERT INTO deposits (
                transaction_id, user_id, method, amount, fee,
                reference, provider_reference, provider_data, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'COMPLETED')`,
            [
                transaction.rows[0].id, req.user.id, method, amount, fee,
                reference, paymentResult.providerReference, paymentResult.providerData
            ]
        );

        // Verificar se tem bônus de boas-vindas pendente
        await activateWelcomeBonus(client, req.user.id);

        return {
            transactionId: transaction.rows[0].id,
            amount,
            fee,
            netAmount,
            newBalance: currentBalance + netAmount
        };
    });

    logger.info(`Depósito realizado: ${amount} KZ via ${method} para usuário ${req.user.id}`);

    res.json({
        success: true,
        message: 'Depósito realizado com sucesso',
        data: {
            transactionId: result.transactionId,
            amount: result.amount,
            fee: result.fee,
            netAmount: result.netAmount,
            newBalance: result.newBalance,
            paymentReference: paymentResult.providerReference
        }
    });
};

// =====================================================
// REALIZAR SAQUE
// =====================================================
const withdraw = async (req, res) => {
    const { amount, method, destination, pin } = req.body;

    // Validar valor mínimo
    if (amount < 100) {
        throw new ValidationError('Valor mínimo para saque é 100 KZ');
    }

    // Calcular taxa
    const fee = amount * config.fees.withdrawal;
    const totalDeduction = amount + fee;

    // Iniciar transação
    const result = await database.transaction(async (client) => {
        // Verificar saldo
        const wallet = await client.query(
            'SELECT available_balance FROM wallets WHERE user_id = $1 FOR UPDATE',
            [req.user.id]
        );

        const currentBalance = parseFloat(wallet.rows[0].available_balance);

        if (currentBalance < totalDeduction) {
            throw new InsufficientBalanceError(
                `Saldo insuficiente. Necessário: ${totalDeduction} KZ, Disponível: ${currentBalance} KZ`
            );
        }

        // Processar pagamento com mock
        const paymentResult = await paymentService.processWithdrawal({
            amount,
            method,
            destination,
            userId: req.user.id
        });

        if (!paymentResult.success) {
            throw new BusinessError(`Falha no processamento: ${paymentResult.error}`, 'PAYMENT_FAILED');
        }

        // Criar transação
        const transaction = await client.query(
            `INSERT INTO transactions (
                user_id, wallet_id, transaction_type, amount, fee, net_amount,
                balance_before, balance_after, status, description, metadata
            ) VALUES (
                $1, (SELECT id FROM wallets WHERE user_id = $1),
                'WITHDRAWAL', $2, $3, -$2, $4, $4 - $2 - $3, 'COMPLETED', $5, $6
            ) RETURNING id`,
            [
                req.user.id, amount, fee, currentBalance,
                `Saque via ${method}`,
                JSON.stringify({ destination, providerData: paymentResult.providerData })
            ]
        );

        // Atualizar saldo
        await client.query(
            `UPDATE wallets
             SET available_balance = available_balance - $1,
                 total_withdrawn = total_withdrawn + $2,
                 total_fees_paid = total_fees_paid + $3,
                 updated_at = NOW()
             WHERE user_id = $4`,
            [totalDeduction, amount, fee, req.user.id]
        );

        // Atualizar limite diário
        await client.query(
            `UPDATE daily_limits
             SET withdrawal_used_today = withdrawal_used_today + $1,
                 updated_at = NOW()
             WHERE user_id = $2`,
            [amount, req.user.id]
        );

        // Inserir registro de saque
        await client.query(
            `INSERT INTO withdrawals (
                transaction_id, user_id, method, amount, fee,
                destination_details, reference, provider_reference, provider_data, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'COMPLETED')`,
            [
                transaction.rows[0].id, req.user.id, method, amount, fee,
                JSON.stringify(destination), paymentResult.reference,
                paymentResult.providerReference, paymentResult.providerData
            ]
        );

        return {
            transactionId: transaction.rows[0].id,
            amount,
            fee,
            totalDeduction,
            newBalance: currentBalance - totalDeduction
        };
    });

    logger.info(`Saque realizado: ${amount} KZ via ${method} para usuário ${req.user.id}`);

    res.json({
        success: true,
        message: 'Saque realizado com sucesso',
        data: {
            transactionId: result.transactionId,
            amount: result.amount,
            fee: result.fee,
            totalDeduction: result.totalDeduction,
            newBalance: result.newBalance
        }
    });
};

// =====================================================
// TRANSFERIR PARA OUTRO USUÁRIO
// =====================================================
const transfer = async (req, res) => {
    const { toUserId, amount, description } = req.body;

    if (toUserId === req.user.id) {
        throw new ValidationError('Não é possível transferir para si mesmo');
    }

    // Verificar se usuário destino existe
    const targetUser = await database.query(
        'SELECT id, full_name FROM users WHERE id = $1 AND is_active = true',
        [toUserId]
    );

    if (targetUser.rows.length === 0) {
        throw new NotFoundError('Usuário destino não encontrado');
    }

    // Iniciar transação
    const result = await database.transaction(async (client) => {
        // Verificar saldo
        const wallet = await client.query(
            'SELECT available_balance FROM wallets WHERE user_id = $1 FOR UPDATE',
            [req.user.id]
        );

        const currentBalance = parseFloat(wallet.rows[0].available_balance);

        if (currentBalance < amount) {
            throw new InsufficientBalanceError('Saldo insuficiente para transferência');
        }

        // Criar transação de saída (para o remetente)
        const outTransaction = await client.query(
            `INSERT INTO transactions (
                user_id, wallet_id, transaction_type, amount, fee, net_amount,
                balance_before, balance_after, status, description, metadata
            ) VALUES (
                $1, (SELECT id FROM wallets WHERE user_id = $1),
                'TRANSFER', $2, 0, -$2, $3, $3 - $2, 'COMPLETED', $4, $5
            ) RETURNING id`,
            [
                req.user.id, amount, currentBalance,
                description || `Transferência para ${targetUser.rows[0].full_name}`,
                JSON.stringify({ toUserId })
            ]
        );

        // Atualizar saldo do remetente
        await client.query(
            'UPDATE wallets SET available_balance = available_balance - $1 WHERE user_id = $2',
            [amount, req.user.id]
        );

        // Buscar saldo do destinatário
        const targetWallet = await client.query(
            'SELECT available_balance FROM wallets WHERE user_id = $1 FOR UPDATE',
            [toUserId]
        );

        const targetBalance = parseFloat(targetWallet.rows[0].available_balance);

        // Criar transação de entrada (para o destinatário)
        await client.query(
            `INSERT INTO transactions (
                user_id, wallet_id, transaction_type, amount, fee, net_amount,
                balance_before, balance_after, status, description, metadata
            ) VALUES (
                $1, (SELECT id FROM wallets WHERE user_id = $1),
                'TRANSFER', $2, 0, $2, $3, $3 + $2, 'COMPLETED', $4, $5
            )`,
            [
                toUserId, amount, targetBalance,
                `Transferência de ${req.user.name}`,
                JSON.stringify({ fromUserId: req.user.id })
            ]
        );

        // Atualizar saldo do destinatário
        await client.query(
            'UPDATE wallets SET available_balance = available_balance + $1 WHERE user_id = $2',
            [amount, toUserId]
        );

        return {
            transactionId: outTransaction.rows[0].id,
            amount,
            newBalance: currentBalance - amount,
            toUser: {
                id: toUserId,
                name: targetUser.rows[0].full_name
            }
        };
    });

    logger.info(`Transferência: ${amount} KZ de ${req.user.id} para ${toUserId}`);

    res.json({
        success: true,
        message: 'Transferência realizada com sucesso',
        data: {
            transactionId: result.transactionId,
            amount: result.amount,
            newBalance: result.newBalance,
            toUser: result.toUser
        }
    });
};

// =====================================================
// LISTAR BÔNUS
// =====================================================
const getBonuses = async (req, res) => {
    const result = await database.query(
        `SELECT
            id, bonus_type, amount, status,
            granted_at, activated_at, expires_at
         FROM bonuses
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [req.user.id]
    );

    const now = new Date();

    res.json({
        success: true,
        data: {
            bonuses: result.rows.map(b => ({
                ...b,
                isExpired: b.expires_at && new Date(b.expires_at) < now,
                canActivate: b.status === 'PENDING' &&
                            b.bonus_type === 'WELCOME' &&
                            (!b.expires_at || new Date(b.expires_at) > now)
            })),
            totalAvailable: result.rows
                .filter(b => b.status === 'ACTIVATED' && (!b.expires_at || new Date(b.expires_at) > now))
                .reduce((sum, b) => sum + parseFloat(b.amount), 0)
        }
    });
};

// =====================================================
// OBTER TAXAS
// =====================================================
const getFees = async (req, res) => {
    res.json({
        success: true,
        data: {
            fees: {
                deposit: config.fees.deposit * 100 + '%',
                withdrawal: config.fees.withdrawal * 100 + '%',
                groupPayment: config.fees.groupPayment * 100 + '%'
            },
            limits: {
                minDeposit: 100,
                maxDeposit: config.financial.defaultDepositLimit,
                minWithdrawal: 100,
                maxWithdrawal: config.financial.defaultWithdrawalLimit
            }
        }
    });
};

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

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
             END,
             updated_at = NOW()
         WHERE user_id = $1
         RETURNING pin_attempts, pin_locked_until`,
        [userId]
    );

    const attempts = result.rows[0].pin_attempts;
    const lockedUntil = result.rows[0].pin_locked_until;

    logger.security('PIN_FAILED_ATTEMPT', userId, { attempts, lockedUntil });

    return result.rows[0];
};

/**
 * Ativar bônus de boas-vindas após primeiro depósito
 */
const activateWelcomeBonus = async (client, userId) => {
    // Verificar se tem bônus de boas-vindas pendente
    const bonus = await client.query(
        `SELECT id, amount FROM bonuses
         WHERE user_id = $1 AND bonus_type = 'WELCOME' AND status = 'PENDING'`,
        [userId]
    );

    if (bonus.rows.length === 0) {
        return;
    }

    const bonusData = bonus.rows[0];

    // Ativar bônus
    await client.query(
        `UPDATE bonuses
         SET status = 'ACTIVATED', activated_at = NOW()
         WHERE id = $1`,
        [bonusData.id]
    );

    // Adicionar bônus ao saldo
    const wallet = await client.query(
        'SELECT available_balance FROM wallets WHERE user_id = $1',
        [userId]
    );

    const currentBalance = parseFloat(wallet.rows[0].available_balance);

    // Criar transação do bônus
    await client.query(
        `INSERT INTO transactions (
            user_id, wallet_id, transaction_type, amount, fee, net_amount,
            balance_before, balance_after, status, description
        ) VALUES (
            $1, (SELECT id FROM wallets WHERE user_id = $1),
            'BONUS', $2, 0, $2, $3, $3 + $2, 'COMPLETED', 'Bônus de boas-vindas'
        )`,
        [userId, bonusData.amount, currentBalance]
    );

    // Atualizar saldo
    await client.query(
        'UPDATE wallets SET available_balance = available_balance + $1 WHERE user_id = $2',
        [bonusData.amount, userId]
    );

    logger.info(`Bônus de boas-vindas ativado para usuário ${userId}: ${bonusData.amount} KZ`);
};

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
    getBalance,
    setPin,
    verifyPin,
    changePin,
    getStatement,
    deposit,
    withdraw,
    transfer,
    getBonuses,
    getFees
};