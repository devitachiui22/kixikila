// =====================================================
// KIXIKILAHUB - ROTAS DE PAGAMENTO (MOCKS)
// Simulação de integrações com Multicaixa, IBAN e Kwik
// =====================================================

const express = require('express');
const router = express.Router();

// Controllers
const paymentController = require('./payment.controller');

// Middlewares
const { validate } = require('../../middlewares/validation.middleware');
const { paymentSchemas } = require('../../middlewares/validation.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { catchAsync } = require('../../middlewares/error.middleware');

// =====================================================
// MOCK DE MULTICAIXA EXPRESS
// =====================================================
router.post(
    '/multicaixa/process',
    validate(paymentSchemas.multicaixa),
    catchAsync(paymentController.processMulticaixa)
);

router.get(
    '/multicaixa/status/:reference',
    catchAsync(paymentController.getMulticaixaStatus)
);

// =====================================================
// MOCK DE TRANSFERÊNCIA IBAN
// =====================================================
router.post(
    '/iban/transfer',
    validate(paymentSchemas.iban),
    catchAsync(paymentController.processIBAN)
);

router.post(
    '/iban/confirm/:reference',
    catchAsync(paymentController.confirmIBAN)
);

// =====================================================
// MOCK DE KWIK
// =====================================================
router.post(
    '/kwik/send',
    validate(paymentSchemas.kwik),
    catchAsync(paymentController.processKwik)
);

router.get(
    '/kwik/balance/:phone',
    catchAsync(paymentController.getKwikBalance)
);

// =====================================================
// MOCK GENÉRICO
// =====================================================
router.get(
    '/methods',
    catchAsync(paymentController.getPaymentMethods)
);

router.get(
    '/fees',
    catchAsync(paymentController.getPaymentFees)
);

router.post(
    '/webhook/:provider',
    catchAsync(paymentController.handleWebhook)
);

// =====================================================
// ROTAS PROTEGIDAS (REQUEREM AUTENTICAÇÃO)
// =====================================================
router.get(
    '/history',
    authenticate,
    catchAsync(paymentController.getPaymentHistory)
);

router.get(
    '/receipt/:reference',
    authenticate,
    catchAsync(paymentController.getPaymentReceipt)
);

// =====================================================
// EXPORTS
// =====================================================
module.exports = router;
