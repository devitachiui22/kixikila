// =====================================================
// KIXIKILAHUB - ROTAS DE USUÁRIOS
// Gerenciamento de perfil, limites e configurações
// =====================================================

const express = require('express');
const router = express.Router({ mergeParams: true });

// Controllers
const userController = require('./user.controller');

// Middlewares
const { validate } = require('../../middlewares/validation.middleware');
const { userSchemas } = require('../../middlewares/validation.middleware');
const { checkOwnership } = require('../../middlewares/auth.middleware');
const { catchAsync } = require('../../middlewares/error.middleware');

// =====================================================
// TODAS AS ROTAS REQUEREM AUTENTICAÇÃO (já aplicada em routes.js)
// =====================================================

/**
 * @swagger
 * /users/profile:
 *   get:
 *     summary: Obter perfil do usuário logado
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil do usuário
 *       401:
 *         description: Não autorizado
 */
router.get(
    '/profile',
    catchAsync(userController.getProfile)
);

/**
 * @swagger
 * /users/profile:
 *   put:
 *     summary: Atualizar perfil do usuário
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *               birthDate:
 *                 type: string
 *                 format: date
 *               avatar:
 *                 type: string
 *                 format: uri
 *     responses:
 *       200:
 *         description: Perfil atualizado
 *       400:
 *         description: Erro de validação
 */
router.put(
    '/profile',
    validate(userSchemas.updateProfile),
    catchAsync(userController.updateProfile)
);

/**
 * @swagger
 * /users/limits:
 *   get:
 *     summary: Obter limites diários do usuário
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Limites do usuário
 */
router.get(
    '/limits',
    catchAsync(userController.getLimits)
);

/**
 * @swagger
 * /users/limits:
 *   put:
 *     summary: Atualizar limites diários (auto-serviço)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               depositLimit:
 *                 type: number
 *                 example: 200000
 *               withdrawalLimit:
 *                 type: number
 *                 example: 100000
 *     responses:
 *       200:
 *         description: Limites atualizados
 *       400:
 *         description: Valor fora do permitido
 */
router.put(
    '/limits',
    validate(userSchemas.updateLimits),
    catchAsync(userController.updateLimits)
);

/**
 * @swagger
 * /users/notifications:
 *   get:
 *     summary: Obter configurações de notificação
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configurações de notificação
 */
router.get(
    '/notifications',
    catchAsync(userController.getNotificationSettings)
);

/**
 * @swagger
 * /users/notifications:
 *   put:
 *     summary: Atualizar configurações de notificação
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               emailNotifications:
 *                 type: boolean
 *               pushNotifications:
 *                 type: boolean
 *               smsNotifications:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Configurações atualizadas
 */
router.put(
    '/notifications',
    catchAsync(userController.updateNotificationSettings)
);

/**
 * @swagger
 * /users/activity:
 *   get:
 *     summary: Obter histórico de atividades
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Histórico de atividades
 */
router.get(
    '/activity',
    catchAsync(userController.getActivityLog)
);

/**
 * @swagger
 * /users/devices:
 *   get:
 *     summary: Listar dispositivos conectados
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de dispositivos
 */
router.get(
    '/devices',
    catchAsync(userController.getDevices)
);

/**
 * @swagger
 * /users/devices/{deviceId}:
 *   delete:
 *     summary: Remover dispositivo (logout remoto)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Dispositivo removido
 */
router.delete(
    '/devices/:deviceId',
    catchAsync(userController.revokeDevice)
);

/**
 * @swagger
 * /users/statistics:
 *   get:
 *     summary: Obter estatísticas do usuário
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estatísticas consolidadas
 */
router.get(
    '/statistics',
    catchAsync(userController.getStatistics)
);

/**
 * @swagger
 * /users/deactivate:
 *   post:
 *     summary: Desativar conta temporariamente
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Conta desativada
 */
router.post(
    '/deactivate',
    catchAsync(userController.deactivateAccount)
);

/**
 * @swagger
 * /users/{userId}:
 *   get:
 *     summary: Obter perfil público de outro usuário
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Perfil público do usuário
 *       404:
 *         description: Usuário não encontrado
 */
router.get(
    '/:userId',
    catchAsync(userController.getPublicProfile)
);

// =====================================================
// EXPORTS
// =====================================================
module.exports = router;