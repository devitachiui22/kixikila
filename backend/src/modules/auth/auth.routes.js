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
// ROTAS PÚBLICAS
// =====================================================

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Registrar novo usuário
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - fullName
 *               - birthDate
 *               - documentNumber
 *               - documentType
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: usuario@email.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Senha@123
 *               fullName:
 *                 type: string
 *                 example: João Manuel Silva
 *               birthDate:
 *                 type: string
 *                 format: date
 *                 example: 1990-01-01
 *               documentNumber:
 *                 type: string
 *                 example: 123456789A
 *               documentType:
 *                 type: string
 *                 enum: [BI, PASSPORT]
 *                 example: BI
 *     responses:
 *       201:
 *         description: Usuário registrado com sucesso
 *       400:
 *         description: Erro de validação
 *       409:
 *         description: Email ou documento já cadastrado
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Login realizado com sucesso
 *       401:
 *         description: Credenciais inválidas
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: Token do Google ID
 *               fullName:
 *                 type: string
 *                 description: Nome completo (opcional, se não vier no token)
 *     responses:
 *       200:
 *         description: Autenticado com sucesso
 *       400:
 *         description: Token inválido
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
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Token de verificação enviado por email
 *     responses:
 *       200:
 *         description: Email verificado com sucesso
 *       400:
 *         description: Token inválido ou expirado
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Email reenviado com sucesso
 *       404:
 *         description: Usuário não encontrado
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Email de recuperação enviado
 *       404:
 *         description: Email não encontrado
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *                 description: Token recebido por email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Senha alterada com sucesso
 *       400:
 *         description: Token inválido ou expirado
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tokens renovados com sucesso
 *       401:
 *         description: Refresh token inválido
 */
router.post(
    '/refresh-token',
    validate(authSchemas.refreshToken),
    refreshToken,
    catchAsync(authController.refreshToken)
);

// =====================================================
// ROTAS PROTEGIDAS (REQUER AUTENTICAÇÃO)
// =====================================================

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Realizar logout
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout realizado com sucesso
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
 *     responses:
 *       200:
 *         description: Dados do usuário
 *       401:
 *         description: Não autorizado
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *               - confirmPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *               newPassword:
 *                 type: string
 *                 format: password
 *               confirmPassword:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Senha alterada com sucesso
 *       400:
 *         description: Senha atual incorreta
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