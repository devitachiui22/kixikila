// =====================================================
// KIXIKILAHUB - SERVIÇO DE PAGAMENTOS
// Camada de orquestração para processamento de pagamentos
// =====================================================

const paymentMock = require('./payment.mock');
const logger = require('../../utils/logger');
const { BusinessError } = require('../../middlewares/error.middleware');

class PaymentService {

    // =====================================================
    // PROCESSAR DEPÓSITO
    // =====================================================

    async processDeposit({ amount, method, reference, userId, metadata = {} }) {
        try {
            let result;

            switch (method.toUpperCase()) {
                case 'MULTICAIXA':
                    result = await paymentMock.processMulticaixa(
                        amount,
                        reference || paymentMock.generateReference('MCX'),
                        metadata.phone,
                        { userId, ...metadata }
                    );
                    break;

                case 'IBAN':
                    result = await paymentMock.processIBAN(
                        amount,
                        metadata.iban,
                        metadata.ownerName,
                        { userId, ...metadata }
                    );
                    break;

                case 'KWIK':
                    result = await paymentMock.processKwik(
                        amount,
                        metadata.phone,
                        metadata.pin || '1234', // PIN padrão para teste
                        { userId, ...metadata }
                    );
                    break;

                default:
                    throw new BusinessError(`Método de pagamento não suportado: ${method}`);
            }

            // Log do resultado
            if (result.success) {
                logger.info(`Depósito processado via ${method}: ${amount} KZ`, {
                    userId,
                    transactionId: result.transactionId,
                    provider: result.provider
                });
            } else {
                logger.warn(`Falha no depósito via ${method}: ${result.error}`, { userId, amount });
            }

            return {
                success: result.success,
                transactionId: result.transactionId,
                providerReference: result.providerReference,
                providerData: result,
                reference: result.transactionId,
                error: result.error,
                status: result.status
            };

        } catch (error) {
            logger.error('Erro no serviço de depósito:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // =====================================================
    // PROCESSAR SAQUE
    // =====================================================

    async processWithdrawal({ amount, method, destination, userId }) {
        try {
            let result;

            switch (method.toUpperCase()) {
                case 'MULTICAIXA':
                    result = await paymentMock.processMulticaixa(
                        amount,
                        paymentMock.generateReference('MCX'),
                        destination.phone,
                        { userId, type: 'withdrawal' }
                    );
                    break;

                case 'IBAN':
                    result = await paymentMock.processIBAN(
                        amount,
                        destination.iban,
                        destination.ownerName,
                        { userId, type: 'withdrawal' }
                    );
                    break;

                case 'KWIK':
                    result = await paymentMock.processKwik(
                        amount,
                        destination.phone,
                        destination.pin || '1234',
                        { userId, type: 'withdrawal' }
                    );
                    break;

                default:
                    throw new BusinessError(`Método de pagamento não suportado: ${method}`);
            }

            // Log do resultado
            if (result.success) {
                logger.info(`Saque processado via ${method}: ${amount} KZ`, {
                    userId,
                    transactionId: result.transactionId
                });
            } else {
                logger.warn(`Falha no saque via ${method}: ${result.error}`, { userId, amount });
            }

            return {
                success: result.success,
                transactionId: result.transactionId,
                providerReference: result.providerReference,
                providerData: result,
                reference: result.transactionId,
                error: result.error,
                status: result.status
            };

        } catch (error) {
            logger.error('Erro no serviço de saque:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // =====================================================
    // CONSULTAR STATUS DE TRANSAÇÃO
    // =====================================================

    async getTransactionStatus(provider, reference) {
        try {
            return await paymentMock.getStatus(provider, reference);
        } catch (error) {
            logger.error('Erro ao consultar status:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // =====================================================
    // CONFIRMAR TRANSFERÊNCIA
    // =====================================================

    async confirmTransfer(provider, reference) {
        try {
            return await paymentMock.confirmTransfer(provider, reference);
        } catch (error) {
            logger.error('Erro ao confirmar transferência:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // =====================================================
    // VALIDAR DADOS DE PAGAMENTO
    // =====================================================

    validatePaymentData(method, data) {
        const errors = [];

        switch (method.toUpperCase()) {
            case 'MULTICAIXA':
                if (!data.phone) errors.push('Telefone é obrigatório');
                else if (!/^9[0-9]{8}$/.test(data.phone)) errors.push('Telefone inválido');
                break;

            case 'IBAN':
                if (!data.iban) errors.push('IBAN é obrigatório');
                else if (!/^AO[0-9]{21}$/.test(data.iban)) errors.push('IBAN inválido');
                if (!data.ownerName) errors.push('Nome do titular é obrigatório');
                break;

            case 'KWIK':
                if (!data.phone) errors.push('Telefone é obrigatório');
                else if (!/^9[0-9]{8}$/.test(data.phone)) errors.push('Telefone inválido');
                if (!data.pin) errors.push('PIN é obrigatório');
                else if (!/^[0-9]{4}$/.test(data.pin)) errors.push('PIN deve ter 4 dígitos');
                break;
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // =====================================================
    // OBTER TAXAS DO MÉTODO
    // =====================================================

    getMethodFees(method) {
        const fees = {
            MULTICAIXA: {
                deposit: 0.01,
                withdrawal: 0.01,
                minFee: 10,
                maxFee: 2000
            },
            IBAN: {
                deposit: 0,
                withdrawal: 0.01,
                minFee: 100,
                maxFee: 5000
            },
            KWIK: {
                deposit: 0.01,
                withdrawal: 0.01,
                minFee: 5,
                maxFee: 1000
            }
        };

        return fees[method.toUpperCase()] || null;
    }

    // =====================================================
    // OBTER LIMITES DO MÉTODO
    // =====================================================

    getMethodLimits(method) {
        const limits = {
            MULTICAIXA: {
                min: 100,
                max: 200000
            },
            IBAN: {
                min: 1000,
                max: 500000
            },
            KWIK: {
                min: 50,
                max: 100000
            }
        };

        return limits[method.toUpperCase()] || null;
    }
}

// Exportar instância única
module.exports = new PaymentService();