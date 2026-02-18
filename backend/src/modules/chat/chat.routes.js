// =====================================================
// KIXIKILAHUB - ROTAS DE CHAT
// Histórico e gerenciamento de mensagens
// =====================================================

const express = require('express');
const router = express.Router();

// Controllers
const chatController = require('./chat.controller');

// Middlewares
const { validate, validateQuery } = require('../../middlewares/validation.middleware');
const { chatSchemas } = require('../../middlewares/validation.middleware');
const { authenticate, requireGroupMember } = require('../../middlewares/auth.middleware');
const { chatMessageLimiter } = require('../../middlewares/rateLimit.middleware');
const { catchAsync } = require('../../middlewares/error.middleware');

// =====================================================
// TODAS AS ROTAS REQUEREM AUTENTICAÇÃO
// =====================================================

/**
 * @swagger
 * /chat/groups/{groupId}/messages:
 *   get:
 *     summary: Obter histórico de mensagens do grupo
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *       - in: query
 *         name: before
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Pegar mensagens anteriores a esta data
 *     responses:
 *       200:
 *         description: Histórico de mensagens
 *       403:
 *         description: Não é membro do grupo
 */
router.get(
    '/groups/:groupId/messages',
    authenticate,
    requireGroupMember,
    validateQuery(chatSchemas.getHistory),
    catchAsync(chatController.getMessages)
);

/**
 * @swagger
 * /chat/groups/{groupId}/messages:
 *   post:
 *     summary: Enviar mensagem (via REST, fallback)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 maxLength: 1000
 *               messageType:
 *                 type: string
 *                 enum: [TEXT, IMAGE, SYSTEM]
 *                 default: TEXT
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Mensagem enviada
 *       400:
 *         description: Erro de validação
 *       429:
 *         description: Limite de mensagens excedido
 */
router.post(
    '/groups/:groupId/messages',
    authenticate,
    requireGroupMember,
    chatMessageLimiter,
    validate(chatSchemas.sendMessage),
    catchAsync(chatController.sendMessage)
);

/**
 * @swagger
 * /chat/groups/{groupId}/messages/{messageId}:
 *   delete:
 *     summary: Apagar mensagem (apenas para admin ou autor)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Mensagem apagada
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Mensagem não encontrada
 */
router.delete(
    '/groups/:groupId/messages/:messageId',
    authenticate,
    requireGroupMember,
    catchAsync(chatController.deleteMessage)
);

/**
 * @swagger
 * /chat/groups/{groupId}/unread:
 *   get:
 *     summary: Obter contagem de mensagens não lidas
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Contagem de mensagens não lidas
 */
router.get(
    '/groups/:groupId/unread',
    authenticate,
    requireGroupMember,
    catchAsync(chatController.getUnreadCount)
);

/**
 * @swagger
 * /chat/groups/{groupId}/read:
 *   post:
 *     summary: Marcar mensagens como lidas
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               upToMessageId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Mensagens marcadas como lidas
 */
router.post(
    '/groups/:groupId/read',
    authenticate,
    requireGroupMember,
    catchAsync(chatController.markAsRead)
);

/**
 * @swagger
 * /chat/groups/{groupId}/search:
 *   get:
 *     summary: Buscar mensagens no grupo
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Termo de busca
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Resultados da busca
 */
router.get(
    '/groups/:groupId/search',
    authenticate,
    requireGroupMember,
    catchAsync(chatController.searchMessages)
);

/**
 * @swagger
 * /chat/groups/{groupId}/participants:
 *   get:
 *     summary: Listar participantes online no grupo
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Lista de participantes online
 */
router.get(
    '/groups/:groupId/participants',
    authenticate,
    requireGroupMember,
    catchAsync(chatController.getOnlineParticipants)
);

/**
 * @swagger
 * /chat/groups/{groupId}/typing:
 *   post:
 *     summary: Notificar que está digitando
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isTyping:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Status enviado
 */
router.post(
    '/groups/:groupId/typing',
    authenticate,
    requireGroupMember,
    chatMessageLimiter,
    catchAsync(chatController.sendTypingStatus)
);

// =====================================================
// EXPORTS
// =====================================================
module.exports = router;