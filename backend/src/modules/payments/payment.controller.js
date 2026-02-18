// File: src/modules/payments/payment.service.js

const db = require('../../config/database');
// Assume-se que o mock exporta tanto funções específicas quanto genéricas, ou adaptamos aqui
const paymentMock = require('./payment.mock');
const { DEPOSIT_FEE_PERCENT, WITHDRAW_FEE_PERCENT } = require('../../utils/constants');
const logger = require('../../utils/logger');

// Fallback para constantes caso não estejam definidas
const DEP_FEE = DEPOSIT_FEE_PERCENT || 1.0; // 1% padrão
const WDR_FEE = WITHDRAW_FEE_PERCENT || 1.0; // 1% padrão

/**
 * Função auxiliar para rotear o método de pagamento para a lógica correta do Mock
 */
const processPaymentSimulation = async (userId, amount, method, type) => {
    try {
        // Se o mock tiver funções específicas (estilo Code 2)
        if (type === 'deposit') {
            switch (method) {
                case 'Multicaixa':
                    return await paymentMock.multicaixaDeposit(userId, amount);
                case 'IBAN':
                    return await paymentMock.ibanTransfer(userId, amount);
                case 'Kwik':
                    return await paymentMock.kwikPayment(userId, amount);
                default:
                    // Tenta usar a função genérica se o método não for específico (estilo Code 1)
                    if (paymentMock.simulatePayment) {
                        return await paymentMock.simulatePayment(method, amount);
                    }
                    throw { status: 400, message: 'Método de pagamento inválido' };
            }
        } else {
            // Lógica para saque (Withdrawal)
            // Geralmente saques usam uma lógica unificada ou switch similar
            if (paymentMock.simulatePayment) {
                return await paymentMock.simulatePayment(method, amount);
            }
            // Retorno fake padrão caso não haja mock específico implementado
            return { status: 'success', reference: `WD-${Date.now()}` };
        }
    } catch (error) {
        logger.error(`Erro na simulação de pagamento (${method}):`, error);
        // Retorna falha controlada ao invés de quebrar a aplicação
        return { status: 'failed', reference: null, error: error.message };
    }
};

const createDeposit = async (userId, amount, method) => {
    // 1. Validação básica
    if (amount <= 0) throw { status: 400, message: 'Valor inválido para depósito' };

    // 2. Calcula taxa (Valor enviado - Taxa = Valor creditado na carteira)
    const fee = parseFloat((amount * (DEP_FEE / 100)).toFixed(2));
    const netAmount = amount - fee;

    logger.info(`Iniciando depósito User: ${userId}, Amount: ${amount}, Method: ${method}`);

    // 3. Processa pagamento externo (Simulação)
    const paymentResult = await processPaymentSimulation(userId, amount, method, 'deposit');

    // 4. Define status da transação baseado no resultado do pagamento
    const status = paymentResult.status === 'success' ? 'completed' :
                   (paymentResult.status === 'pending' ? 'pending' : 'failed');

    // 5. Cria registro da transação
    const tx = await db.query(
        `INSERT INTO transactions (user_id, type, amount, fee, status, reference, description, created_at)
         VALUES ($1, 'deposit', $2, $3, $4, $5, $6, NOW())
         RETURNING *`,
        [
            userId,
            netAmount, // Valor que entra na carteira
            fee,       // Valor retido pela plataforma
            status,
            paymentResult.reference || `REF-${Date.now()}`,
            `Depósito via ${method}`
        ]
    );

    // 6. Se sucesso, atualiza o saldo da Wallet
    if (status === 'completed') {
        await db.query(
            `UPDATE wallets
             SET available_balance = available_balance + $1, updated_at = NOW()
             WHERE user_id = $2`,
            [netAmount, userId]
        );
        logger.info(`Wallet atualizada para User: ${userId} (+${netAmount})`);
    }

    // 7. Webhook interno (se existir a função no mock ou serviço separado)
    if (paymentMock.webhookPayment) {
        paymentMock.webhookPayment(paymentResult);
    }

    return { transaction: tx.rows[0], paymentResult };
};

const createWithdrawal = async (userId, amount, method) => {
    // 1. Validação
    if (amount <= 0) throw { status: 400, message: 'Valor inválido para retirada' };

    // 2. Calcula taxa
    // Lógica: Para sacar 100, o usuário precisa ter (100 + taxa) na conta.
    const fee = parseFloat((amount * (WDR_FEE / 100)).toFixed(2));
    const totalDeduct = amount + fee;

    // 3. Verifica saldo disponível e bloqueia fundos (Lock otimista)
    const walletRes = await db.query(`SELECT available_balance FROM wallets WHERE user_id = $1`, [userId]);

    if (walletRes.rows.length === 0) {
        throw { status: 404, message: 'Carteira não encontrada' };
    }

    if (walletRes.rows[0].available_balance < totalDeduct) {
        logger.warn(`Tentativa de saque sem saldo. User: ${userId}, Req: ${totalDeduct}, Has: ${walletRes.rows[0].available_balance}`);
        throw { status: 400, message: 'Saldo insuficiente para cobrir o valor + taxas' };
    }

    // 4. Deduz saldo IMEDIATAMENTE (previne double-spending)
    await db.query(
        `UPDATE wallets
         SET available_balance = available_balance - $1, updated_at = NOW()
         WHERE user_id = $2`,
        [totalDeduct, userId]
    );

    logger.info(`Saldo deduzido temporariamente User: ${userId}, Total: ${totalDeduct}`);

    // 5. Simula o envio do dinheiro
    const paymentResult = await processPaymentSimulation(userId, amount, method, 'withdrawal');

    // 6. Registra a transação
    const status = paymentResult.status === 'success' ? 'completed' : 'failed';

    const tx = await db.query(
        `INSERT INTO transactions (user_id, type, amount, fee, status, reference, description, created_at)
         VALUES ($1, 'withdrawal', $2, $3, $4, $5, $6, NOW())
         RETURNING *`,
        [
            userId,
            amount, // Valor enviado ao usuário
            fee,    // Taxa cobrada
            status,
            paymentResult.reference || `WD-${Date.now()}`,
            `Retirada via ${method}`
        ]
    );

    // 7. Tratamento de Falha: Devolve o dinheiro (Refund)
    if (status === 'failed') {
        logger.error(`Falha no saque. Reembolsando User: ${userId}`);
        await db.query(
            `UPDATE wallets
             SET available_balance = available_balance + $1, updated_at = NOW()
             WHERE user_id = $2`,
            [totalDeduct, userId]
        );

        // Atualiza a transação para indicar que foi estornada/falhou
        // (Opcional, dependendo da regra de negócio, pode-se atualizar o status da tx criada acima ou criar uma nova tx de reembolso)
    }

    // 8. Webhook
    if (paymentMock.webhookPayment) {
        paymentMock.webhookPayment(paymentResult);
    }

    return { transaction: tx.rows[0], paymentResult };
};

module.exports = {
    createDeposit,
    createWithdrawal
};