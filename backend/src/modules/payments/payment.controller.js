// =====================================================
// KIXIKILAHUB - CONTROLLER DE PAGAMENTOS (MOCK)
// Simulação de integrações com Multicaixa, IBAN e Kwik
// =====================================================

const crypto = require('crypto');
const database = require('../../config/database');
const config = require('../../config/env');
const logger = require('../../utils/logger');
const { ValidationError, BusinessError } = require('../../middlewares/error.middleware');
const { validateAngolanPhone, validateAngolanIBAN } = require('../../utils/validators');

// Armazenamento temporário para transações simuladas
const mockTransactions = new Map();

// =====================================================
// PROCESSAR PAGAMENTO MULTICAIXA EXPRESS
// =====================================================
const processMulticaixa = async (req, res) => {
    const { amount, reference, phone } = req.body;

    // Validar telefone
    const phoneValidation = validateAngolanPhone(phone);
    if (!phoneValidation.isValid) {
        throw new ValidationError(phoneValidation.error);
    }

    // Simular processamento
    const success = Math.random() * 100 < config.mockPayments.multicaixa.successRate;
    const delay = config.mockPayments.multicaixa.delayMs;

    // Simular delay
    await new Promise(resolve => setTimeout(resolve, delay));

    if (!success) {
        logger.apiCall('multicaixa', '/process', 402, delay, { amount, phone: phoneValidation.masked });
        throw new BusinessError('Falha no processamento do Multicaixa Express. Tente novamente.', 'PAYMENT_FAILED');
    }

    // Gerar referência da transação
    const transactionId = `MCX-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    const providerReference = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // Armazenar transação mock
    mockTransactions.set(transactionId, {
        provider: 'multicaixa',
        amount,
        phone: phoneValidation.clean,
        reference,
        status: 'COMPLETED',
        providerReference,
        timestamp: new Date(),
        metadata: req.body
    });

    logger.apiCall('multicaixa', '/process', 200, delay, {
        transactionId,
        amount,
        phone: phoneValidation.masked
    });

    res.json({
        success: true,
        data: {
            transactionId,
            providerReference,
            amount,
            status: 'COMPLETED',
            message: 'Pagamento processado com sucesso',
            timestamp: new Date().toISOString(),
            receipt: `https://api.kixikilahub.com/payments/receipt/${transactionId}`
        }
    });
};

// =====================================================
// CONSULTAR STATUS MULTICAIXA
// =====================================================
const getMulticaixaStatus = async (req, res) => {
    const { reference } = req.params;

    const transaction = mockTransactions.get(reference);

    if (!transaction) {
        // Simular transação não encontrada
        return res.json({
            success: true,
            data: {
                reference,
                status: 'NOT_FOUND',
                message: 'Transação não encontrada'
            }
        });
    }

    res.json({
        success: true,
        data: {
            reference,
            providerReference: transaction.providerReference,
            amount: transaction.amount,
            status: transaction.status,
            timestamp: transaction.timestamp,
            estimatedCompletion: transaction.status === 'PENDING'
                ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
                : null
        }
    });
};

// =====================================================
// PROCESSAR TRANSFERÊNCIA IBAN
// =====================================================
const processIBAN = async (req, res) => {
    const { amount, iban, ownerName } = req.body;

    // Validar IBAN
    const ibanValidation = validateAngolanIBAN(iban);
    if (!ibanValidation.isValid) {
        throw new ValidationError(ibanValidation.error);
    }

    // Simular processamento
    const success = Math.random() * 100 < config.mockPayments.iban.successRate;
    const delay = config.mockPayments.iban.delayMs;

    // Simular delay
    await new Promise(resolve => setTimeout(resolve, delay));

    if (!success) {
        logger.apiCall('iban', '/transfer', 402, delay, { amount, iban: ibanValidation.masked });
        throw new BusinessError('Falha na transferência IBAN. Verifique os dados e tente novamente.', 'PAYMENT_FAILED');
    }

    // Gerar referência
    const transactionId = `IBN-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    const providerReference = `IB${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // Armazenar transação (inicialmente como PENDING)
    mockTransactions.set(transactionId, {
        provider: 'iban',
        amount,
        iban: ibanValidation.clean,
        ownerName,
        status: 'PENDING',
        providerReference,
        timestamp: new Date(),
        estimatedCompletion: new Date(Date.now() + 24 * 60 * 60 * 1000), // +1 dia
        metadata: req.body
    });

    logger.apiCall('iban', '/transfer', 200, delay, {
        transactionId,
        amount,
        iban: ibanValidation.masked
    });

    res.json({
        success: true,
        data: {
            transactionId,
            providerReference,
            amount,
            status: 'PENDING',
            message: 'Transferência IBAN iniciada. Será processada em até 1 dia útil.',
            estimatedCompletion: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            timestamp: new Date().toISOString()
        }
    });
};

// =====================================================
// CONFIRMAR TRANSFERÊNCIA IBAN
// =====================================================
const confirmIBAN = async (req, res) => {
    const { reference } = req.params;

    const transaction = mockTransactions.get(reference);

    if (!transaction) {
        throw new ValidationError('Transação não encontrada');
    }

    if (transaction.provider !== 'iban') {
        throw new ValidationError('Referência não corresponde a uma transferência IBAN');
    }

    // Simular confirmação
    transaction.status = 'COMPLETED';
    transaction.completedAt = new Date();
    mockTransactions.set(reference, transaction);

    logger.info(`Transferência IBAN ${reference} confirmada`);

    res.json({
        success: true,
        data: {
            reference,
            status: 'COMPLETED',
            completedAt: transaction.completedAt.toISOString(),
            message: 'Transferência confirmada com sucesso'
        }
    });
};

// =====================================================
// PROCESSAR ENVIO KWIK
// =====================================================
const processKwik = async (req, res) => {
    const { amount, phone, pin } = req.body;

    // Validar telefone
    const phoneValidation = validateAngolanPhone(phone);
    if (!phoneValidation.isValid) {
        throw new ValidationError(phoneValidation.error);
    }

    // Validar PIN (simulado)
    if (pin !== '1234' && pin !== '0000') { // Aceitar alguns PINs para teste
        throw new ValidationError('PIN inválido');
    }

    // Simular processamento
    const success = Math.random() * 100 < config.mockPayments.kwik.successRate;
    const delay = config.mockPayments.kwik.delayMs;

    // Simular delay
    await new Promise(resolve => setTimeout(resolve, delay));

    if (!success) {
        logger.apiCall('kwik', '/send', 402, delay, { amount, phone: phoneValidation.masked });
        throw new BusinessError('Falha no envio via Kwik. Tente novamente.', 'PAYMENT_FAILED');
    }

    // Gerar referência
    const transactionId = `KWK-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    const providerReference = `K${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // Simular saldo (sempre suficiente para teste)
    const newBalance = 500000 - amount; // Saldo inicial fictício de 500.000 KZ

    mockTransactions.set(transactionId, {
        provider: 'kwik',
        amount,
        phone: phoneValidation.clean,
        status: 'COMPLETED',
        providerReference,
        timestamp: new Date(),
        metadata: req.body
    });

    logger.apiCall('kwik', '/send', 200, delay, {
        transactionId,
        amount,
        phone: phoneValidation.masked
    });

    res.json({
        success: true,
        data: {
            transactionId,
            providerReference,
            amount,
            status: 'COMPLETED',
            message: 'Envio via Kwik realizado com sucesso',
            newBalance,
            timestamp: new Date().toISOString()
        }
    });
};

// =====================================================
// CONSULTAR SALDO KWIK
// =====================================================
const getKwikBalance = async (req, res) => {
    const { phone } = req.params;

    // Validar telefone
    const phoneValidation = validateAngolanPhone(phone);
    if (!phoneValidation.isValid) {
        throw new ValidationError(phoneValidation.error);
    }

    // Simular saldo baseado no telefone (para teste)
    const balance = parseInt(phone.slice(-5)) * 1000; // Saldo fictício

    res.json({
        success: true,
        data: {
            phone: phoneValidation.formatted,
            balance,
            currency: 'KZ',
            lastUpdated: new Date().toISOString()
        }
    });
};

// =====================================================
// LISTAR MÉTODOS DE PAGAMENTO
// =====================================================
const getPaymentMethods = async (req, res) => {
    res.json({
        success: true,
        data: {
            methods: [
                {
                    id: 'multicaixa',
                    name: 'Multicaixa Express',
                    description: 'Pagamento via referência Multicaixa',
                    minAmount: 100,
                    maxAmount: 200000,
                    fee: config.fees.deposit * 100 + '%',
                    estimatedTime: 'Instantâneo',
                    workingHours: '08:00 - 22:00',
                    icon: 'https://api.kixikilahub.com/public/icons/multicaixa.png'
                },
                {
                    id: 'iban',
                    name: 'Transferência IBAN',
                    description: 'Transferência bancária nacional',
                    minAmount: 1000,
                    maxAmount: 500000,
                    fee: 'Grátis',
                    estimatedTime: '1-2 dias úteis',
                    workingDays: 'Segunda a Sexta',
                    icon: 'https://api.kixikilahub.com/public/icons/iban.png'
                },
                {
                    id: 'kwik',
                    name: 'Kwik',
                    description: 'Carteira digital Kwik',
                    minAmount: 50,
                    maxAmount: 100000,
                    fee: config.fees.deposit * 100 + '%',
                    estimatedTime: 'Instantâneo',
                    workingHours: '24 horas',
                    icon: 'https://api.kixikilahub.com/public/icons/kwik.png'
                }
            ]
        }
    });
};

// =====================================================
// OBTER TAXAS POR MÉTODO
// =====================================================
const getPaymentFees = async (req, res) => {
    res.json({
        success: true,
        data: {
            fees: {
                multicaixa: {
                    deposit: config.fees.deposit * 100 + '%',
                    withdrawal: config.fees.withdrawal * 100 + '%',
                    minFee: 10,
                    maxFee: 2000
                },
                iban: {
                    deposit: 'Grátis',
                    withdrawal: config.fees.withdrawal * 100 + '%',
                    minFee: 100,
                    maxFee: 5000
                },
                kwik: {
                    deposit: config.fees.deposit * 100 + '%',
                    withdrawal: config.fees.withdrawal * 100 + '%',
                    minFee: 5,
                    maxFee: 1000
                }
            }
        }
    });
};

// =====================================================
// HANDLER DE WEBHOOK SIMULADO
// =====================================================
const handleWebhook = async (req, res) => {
    const { provider } = req.params;
    const payload = req.body;

    logger.info(`Webhook recebido de ${provider}:`, payload);

    // Simular processamento do webhook
    // Em produção, isso atualizaria o status das transações

    res.json({
        success: true,
        message: 'Webhook recebido com sucesso',
        receivedAt: new Date().toISOString()
    });
};

// =====================================================
// HISTÓRICO DE PAGAMENTOS
// =====================================================
const getPaymentHistory = async (req, res) => {
    const { page = 1, limit = 20 } = req.query;

    // Buscar transações do banco de dados (deposits e withdrawals)
    const offset = (page - 1) * limit;

    const result = await database.query(
        `SELECT
            d.id, 'DEPOSIT' as type, d.method, d.amount, d.fee,
            d.status, d.reference, d.provider_reference,
            d.created_at, d.completed_at,
            t.description
         FROM deposits d
         JOIN transactions t ON d.transaction_id = t.id
         WHERE t.user_id = $1
         UNION ALL
         SELECT
            w.id, 'WITHDRAWAL' as type, w.method, w.amount, w.fee,
            w.status, w.reference, w.provider_reference,
            w.created_at, w.completed_at,
            t.description
         FROM withdrawals w
         JOIN transactions t ON w.transaction_id = t.id
         WHERE t.user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
    );

    // Total para paginação
    const countResult = await database.query(
        `SELECT
            (SELECT COUNT(*) FROM deposits d JOIN transactions t ON d.transaction_id = t.id WHERE t.user_id = $1) +
            (SELECT COUNT(*) FROM withdrawals w JOIN transactions t ON w.transaction_id = t.id WHERE t.user_id = $1) as total`,
        [req.user.id]
    );

    const total = parseInt(countResult.rows[0].total);

    res.json({
        success: true,
        data: {
            transactions: result.rows,
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
// OBTER RECIBO DE PAGAMENTO
// =====================================================
const getPaymentReceipt = async (req, res) => {
    const { reference } = req.params;

    // Buscar nos mocks primeiro
    const mockTx = mockTransactions.get(reference);

    if (mockTx) {
        return res.json({
            success: true,
            data: {
                receiptNumber: `RCT-${reference.substring(0, 8)}`,
                transactionId: reference,
                provider: mockTx.provider,
                amount: mockTx.amount,
                status: mockTx.status,
                timestamp: mockTx.timestamp,
                details: mockTx.metadata,
                digitalSignature: generateReceiptSignature(reference)
            }
        });
    }

    // Se não estiver nos mocks, buscar no banco
    const result = await database.query(
        `SELECT
            t.id, t.transaction_type, t.amount, t.fee, t.net_amount,
            t.status, t.reference, t.description, t.created_at,
            d.method as deposit_method, d.provider_reference,
            w.method as withdrawal_method, w.destination_details
         FROM transactions t
         LEFT JOIN deposits d ON t.id = d.transaction_id
         LEFT JOIN withdrawals w ON t.id = w.transaction_id
         WHERE t.reference = $1 OR d.reference = $1 OR w.reference = $1`,
        [reference]
    );

    if (result.rows.length === 0) {
        throw new ValidationError('Recibo não encontrado');
    }

    const tx = result.rows[0];

    res.json({
        success: true,
        data: {
            receiptNumber: `RCT-${tx.id.substring(0, 8)}-${new Date(tx.created_at).toISOString().split('T')[0].replace(/-/g, '')}`,
            transactionId: tx.id,
            reference: tx.reference || reference,
            type: tx.transaction_type,
            amount: parseFloat(tx.amount),
            fee: parseFloat(tx.fee),
            netAmount: parseFloat(tx.net_amount),
            status: tx.status,
            method: tx.deposit_method || tx.withdrawal_method,
            providerReference: tx.provider_reference,
            description: tx.description,
            destination: tx.destination_details,
            createdAt: tx.created_at,
            digitalSignature: generateReceiptSignature(tx.id)
        }
    });
};

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

/**
 * Gerar assinatura digital para recibo
 */
const generateReceiptSignature = (data) => {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(data + process.env.JWT_SECRET);
    return hash.digest('hex').substring(0, 16).toUpperCase();
};

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
    processMulticaixa,
    getMulticaixaStatus,
    processIBAN,
    confirmIBAN,
    processKwik,
    getKwikBalance,
    getPaymentMethods,
    getPaymentFees,
    handleWebhook,
    getPaymentHistory,
    getPaymentReceipt

};
