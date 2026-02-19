// =====================================================
// KIXIKILAHUB - ROTAS DE AUTENTICAÇÃO
// Registro, login, verificação de email e recuperação de senha
// =====================================================

const express = require('express');
const router = express.Router();

// Controllers
const authController = require('./auth.controller');

// Middlewares
const { validate } = require('../../middlewares/validation.middleware');
const { authSchemas } = require('../../middlewares/validation.middleware');
const { authenticate, refreshToken } = require('../../middlewares/auth.middleware');
const { catchAsync } = require('../../middlewares/error.middleware');

// =====================================================
// ROTAS PÚBLICAS (NÃO REQUEREM AUTENTICAÇÃO)
// =====================================================

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Registrar novo usuário
 *     tags: [Auth]
 */
router.post(
    '/register',
    validate(authSchemas.register),
    catchAsync(authController.register)
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login com email e senha
 *     tags: [Auth]
 */
router.post(
    '/login',
    validate(authSchemas.login),
    catchAsync(authController.login)
);

/**
 * @swagger
 * /auth/google:
 *   post:
 *     summary: Login/Registro com Google
 *     tags: [Auth]
 */
router.post(
    '/google',
    validate(authSchemas.googleLogin),
    catchAsync(authController.googleLogin)
);

/**
 * @swagger
 * /auth/verify-email:
 *   get:
 *     summary: Verificar email com token
 *     tags: [Auth]
 */
router.get(
    '/verify-email',
    validate(authSchemas.verifyEmail, 'query'),
    catchAsync(authController.verifyEmail)
);

/**
 * @swagger
 * /auth/resend-verification:
 *   post:
 *     summary: Reenviar email de verificação
 *     tags: [Auth]
 */
router.post(
    '/resend-verification',
    validate(authSchemas.resendVerification),
    catchAsync(authController.resendVerification)
);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Solicitar recuperação de senha
 *     tags: [Auth]
 */
router.post(
    '/forgot-password',
    validate(authSchemas.forgotPassword),
    catchAsync(authController.forgotPassword)
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Resetar senha com token
 *     tags: [Auth]
 */
router.post(
    '/reset-password',
    validate(authSchemas.resetPassword),
    catchAsync(authController.resetPassword)
);

/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     summary: Renovar access token usando refresh token
 *     tags: [Auth]
 */
router.post(
    '/refresh-token',
    validate(authSchemas.refreshToken),
    refreshToken,
    catchAsync(authController.refreshToken)
);

// =====================================================
// ROTAS PROTEGIDAS (REQUEREM AUTENTICAÇÃO)
// =====================================================

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Realizar logout
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/logout',
    authenticate,
    catchAsync(authController.logout)
);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Obter dados do usuário atual
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/me',
    authenticate,
    catchAsync(authController.getCurrentUser)
);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Alterar senha (usuário logado)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/change-password',
    authenticate,
    validate(authSchemas.changePassword),
    catchAsync(authController.changePassword)
);

// =====================================================
// EXPORTS
// =====================================================
module.exports = router;
