// =====================================================
// KIXIKILAHUB - ROTAS DE AUTENTICAÇÃO
// VERSÃO FINAL - TODAS PÚBLICAS
// =====================================================

const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { validate } = require('../../middlewares/validation.middleware');
const { authSchemas } = require('../../middlewares/validation.middleware');
const { refreshToken } = require('../../middlewares/auth.middleware');
const { catchAsync } = require('../../middlewares/error.middleware');

// ATENÇÃO: NENHUMA DESTAS ROTAS USA O MIDDLEWARE authenticate
// TODAS SÃO PÚBLICAS

router.post('/register', 
    validate(authSchemas.register), 
    catchAsync(authController.register)
);

router.post('/login', 
    validate(authSchemas.login), 
    catchAsync(authController.login)
);

router.post('/google', 
    validate(authSchemas.googleLogin), 
    catchAsync(authController.googleLogin)
);

router.get('/verify-email', 
    validate(authSchemas.verifyEmail, 'query'), 
    catchAsync(authController.verifyEmail)
);

router.post('/resend-verification', 
    validate(authSchemas.resendVerification), 
    catchAsync(authController.resendVerification)
);

router.post('/forgot-password', 
    validate(authSchemas.forgotPassword), 
    catchAsync(authController.forgotPassword)
);

router.post('/reset-password', 
    validate(authSchemas.resetPassword), 
    catchAsync(authController.resetPassword)
);

router.post('/refresh-token', 
    validate(authSchemas.refreshToken), 
    refreshToken,
    catchAsync(authController.refreshToken)
);

module.exports = router;
