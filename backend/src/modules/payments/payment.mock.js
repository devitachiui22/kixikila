// =====================================================
// KIXIKILAHUB - SERVIÇO DE PAGAMENTO (MOCK)
// Camada de abstração para integrações com provedores
// =====================================================

const crypto = require('crypto');
const config = require('../../config/env');
const logger = require('../../utils/logger');
const { validateAngolanPhone, validateAngolanIBAN } = require('../../utils/validators');

// Interface unificada para todos os provedores
class PaymentMockService {

    // =====================================================
    // MULTICAIXA EXPRESS
    // =====================================================

    async processMulticaixa(amount, reference, phone, metadata = {}) {
        const startTime = Date.now();

        try {
            // Validar dados
            const phoneValidation = validateAngolanPhone(phone);
            if (!phoneValidation.isValid) {
                return {
                    success: false,
                    error: phoneValidation.error,
                    provider: 'multicaixa'
                };
            }

            // Simular processamento
            await this.simulateDelay('multicaixa');

            // Simular sucesso/fracasso baseado na taxa configurada
            const success = Math.random() * 100 < config.mockPayments.multicaixa.successRate;

            if (!success) {
                logger.apiCall('multicaixa', 'mock', 402, Date.now() - startTime, { amount });
                return {
                    success: false,
                    error: 'Falha na comunicação com o provedor',
                    provider: 'multicaixa',
                    status: 'failed'
                };
            }

            // Gerar resposta de sucesso
            const transactionId = `MCX-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
            const providerReference = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

            logger.apiCall('multicaixa', 'mock', 200, Date.now() - startTime, { transactionId });

            return {
                success: true,
                provider: 'multicaixa',
                transactionId,
                providerReference,
                amount,
                status: 'completed',
                timestamp: new Date().toISOString(),
                metadata: {
                    phone: phoneValidation.masked,
                    reference
                }
            };

        } catch (error) {
            logger.error('Erro no mock Multicaixa:', error);
            return {
                success: false,
                error: error.message,
                provider: 'multicaixa'
            };
        }
    }

    // =====================================================
    // IBAN TRANSFER
    // =====================================================

    async processIBAN(amount, iban, ownerName, metadata = {}) {
        const startTime = Date.now();

        try {
            // Validar IBAN
            const ibanValidation = validateAngolanIBAN(iban);
            if (!ibanValidation.isValid) {
                return {
                    success: false,
                    error: ibanValidation.error,
                    provider: 'iban'
                };
            }

            // Simular delay
            await this.simulateDelay('iban');

            // Simular sucesso/fracasso
            const success = Math.random() * 100 < config.mockPayments.iban.successRate;

            if (!success) {
                logger.apiCall('iban', 'mock', 402, Date.now() - startTime, { amount });
                return {
                    success: false,
                    error: 'Falha no processamento bancário',
                    provider: 'iban',
                    status: 'failed'
                };
            }

            // Transferências IBAN são mais lentas
            const estimatedCompletion = new Date();
            estimatedCompletion.setDate(estimatedCompletion.getDate() + 1);
            estimatedCompletion.setHours(17, 0, 0, 0); // 17:00 do próximo dia

            const transactionId = `IBN-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
            const providerReference = `IB${Date.now()}${Math.floor(Math.random() * 1000)}`;

            logger.apiCall('iban', 'mock', 200, Date.now() - startTime, { transactionId });

            return {
                success: true,
                provider: 'iban',
                transactionId,
                providerReference,
                amount,
                status: 'pending',
                estimatedCompletion: estimatedCompletion.toISOString(),
                timestamp: new Date().toISOString(),
                metadata: {
                    iban: ibanValidation.masked,
                    ownerName
                }
            };

        } catch (error) {
            logger.error('Erro no mock IBAN:', error);
            return {
                success: false,
                error: error.message,
                provider: 'iban'
            };
        }
    }

    // =====================================================
    // KWIK
    // =====================================================

    async processKwik(amount, phone, pin, metadata = {}) {
        const startTime = Date.now();

        try {
            // Validar telefone
            const phoneValidation = validateAngolanPhone(phone);
            if (!phoneValidation.isValid) {
                return {
                    success: false,
                    error: phoneValidation.error,
                    provider: 'kwik'
                };
            }

            // Validar PIN (simulado)
            if (pin !== '1234' && pin !== '0000') {
                return {
                    success: false,
                    error: 'PIN inválido',
                    provider: 'kwik'
                };
            }

            // Simular delay
            await this.simulateDelay('kwik');

            // Simular sucesso/fracasso
            const success = Math.random() * 100 < config.mockPayments.kwik.successRate;

            if (!success) {
                logger.apiCall('kwik', 'mock', 402, Date.now() - startTime, { amount });
                return {
                    success: false,
                    error: 'Falha na comunicação com Kwik',
                    provider: 'kwik',
                    status: 'failed'
                };
            }

            // Simular verificação de saldo
            const balance = 500000; // Saldo fixo para teste
            if (amount > balance) {
                return {
                    success: false,
                    error: 'Saldo insuficiente na carteira Kwik',
                    provider: 'kwik'
                };
            }

            const transactionId = `KWK-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
            const providerReference = `K${Date.now()}${Math.floor(Math.random() * 1000)}`;

            logger.apiCall('kwik', 'mock', 200, Date.now() - startTime, { transactionId });

            return {
                success: true,
                provider: 'kwik',
                transactionId,
                providerReference,
                amount,
                status: 'completed',
                newBalance: balance - amount,
                timestamp: new Date().toISOString(),
                metadata: {
                    phone: phoneValidation.masked
                }
            };

        } catch (error) {
            logger.error('Erro no mock Kwik:', error);
            return {
                success: false,
                error: error.message,
                provider: 'kwik'
            };
        }
    }

    // =====================================================
    // CONSULTAR STATUS
    // =====================================================

    async getStatus(provider, reference) {
        // Simular consulta de status
        const delay = Math.random() * 500 + 100;
        await new Promise(resolve => setTimeout(resolve, delay));

        // Status aleatório para teste
        const statuses = ['completed', 'pending', 'processing'];
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

        return {
            success: true,
            provider,
            reference,
            status: randomStatus,
            timestamp: new Date().toISOString(),
            details: {
                estimatedCompletion: randomStatus === 'pending'
                    ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                    : null
            }
        };
    }

    // =====================================================
    // CONFIRMAR TRANSFERÊNCIA
    // =====================================================

    async confirmTransfer(provider, reference) {
        // Simular confirmação
        const delay = 1000;
        await new Promise(resolve => setTimeout(resolve, delay));

        return {
            success: true,
            provider,
            reference,
            status: 'completed',
            confirmedAt: new Date().toISOString()
        };
    }

    // =====================================================
    // SIMULAR DELAY
    // =====================================================

    async simulateDelay(provider) {
        const config = {
            multicaixa: { min: 1000, max: 3000 },
            iban: { min: 2000, max: 7000 },
            kwik: { min: 500, max: 2000 }
        };

        const { min, max } = config[provider] || { min: 1000, max: 3000 };
        const delay = Math.random() * (max - min) + min;

        await new Promise(resolve => setTimeout(resolve, delay));
    }

    // =====================================================
    // GERAR REFERÊNCIA
    // =====================================================

    generateReference(prefix = 'TXN') {
        return `${prefix}-${crypto.randomBytes(8).toString('hex').toUpperCase()}-${Date.now().toString(36)}`;
    }

    // =====================================================
    // MASCARAR DADOS SENSÍVEIS (PARA LOGS)
    // =====================================================

    maskSensitiveData(data, type) {
        if (!data) return null;

        switch (type) {
            case 'phone':
                return data.replace(/(\d{3})\d{4}(\d{2})/, '$1****$2');
            case 'iban':
                return data.substring(0, 4) + '****' + data.substring(data.length - 4);
            case 'email':
                const [local, domain] = data.split('@');
                return local.substring(0, 2) + '***@' + domain;
            default:
                return '***';
        }
    }
}

// Exportar instância única
module.exports = new PaymentMockService();