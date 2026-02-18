// =====================================================
// KIXIKILAHUB - ROTAS DE GRUPOS (KIXIKILAS)
// Gerenciamento de grupos, membros e ciclos de pagamento
// =====================================================

const express = require('express');
const router = express.Router();

// Controllers
const groupController = require('./group.controller');

// Middlewares
const { validate, validateQuery } = require('../../middlewares/validation.middleware');
const { groupSchemas } = require('../../middlewares/validation.middleware');
const {
    authenticate,
    requireKYC,
    requireGroupAdmin,
    requireGroupMember,
    checkDailyLimit
} = require('../../middlewares/auth.middleware');
const { createGroupLimiter, searchLimiter } = require('../../middlewares/rateLimit.middleware');
const { catchAsync } = require('../../middlewares/error.middleware');

// =====================================================
// TODAS AS ROTAS REQUEREM AUTENTICAÇÃO
// =====================================================

/**
 * @swagger
 * /groups:
 *   get:
 *     summary: Listar grupos do usuário
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de grupos
 */
router.get(
    '/',
    authenticate,
    catchAsync(groupController.listUserGroups)
);

/**
 * @swagger
 * /groups/search:
 *   get:
 *     summary: Buscar grupos por zona/localização
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: zone
 *         schema:
 *           type: string
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *       - in: query
 *         name: frequency
 *         schema:
 *           type: string
 *           enum: [DAILY, WEEKLY, MONTHLY]
 *       - in: query
 *         name: minValue
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxValue
 *         schema:
 *           type: number
 *       - in: query
 *         name: latitude
 *         schema:
 *           type: number
 *       - in: query
 *         name: longitude
 *         schema:
 *           type: number
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *           description: Raio em km
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
 *         description: Grupos encontrados
 */
router.get(
    '/search',
    authenticate,
    searchLimiter,
    validateQuery(groupSchemas.search),
    catchAsync(groupController.searchGroups)
);

/**
 * @swagger
 * /groups/recommended:
 *   get:
 *     summary: Grupos recomendados para o usuário
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de grupos recomendados
 */
router.get(
    '/recommended',
    authenticate,
    catchAsync(groupController.getRecommendedGroups)
);

/**
 * @swagger
 * /groups:
 *   post:
 *     summary: Criar novo grupo
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - zone
 *               - cycleValue
 *               - frequency
 *               - maxParticipants
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               zone:
 *                 type: string
 *               city:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               cycleValue:
 *                 type: number
 *               frequency:
 *                 type: string
 *                 enum: [DAILY, WEEKLY, MONTHLY]
 *               maxParticipants:
 *                 type: integer
 *                 minimum: 3
 *                 maximum: 50
 *               paymentDay:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Grupo criado
 *       400:
 *         description: Erro de validação
 */
router.post(
    '/',
    authenticate,
    requireKYC,
    createGroupLimiter,
    validate(groupSchemas.create),
    catchAsync(groupController.createGroup)
);

/**
 * @swagger
 * /groups/{groupId}:
 *   get:
 *     summary: Obter detalhes do grupo
 *     tags: [Groups]
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
 *         description: Detalhes do grupo
 *       404:
 *         description: Grupo não encontrado
 */
router.get(
    '/:groupId',
    authenticate,
    catchAsync(groupController.getGroupDetails)
);

/**
 * @swagger
 * /groups/{groupId}:
 *   put:
 *     summary: Atualizar grupo (apenas admin)
 *     tags: [Groups]
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
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               zone:
 *                 type: string
 *               maxParticipants:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Grupo atualizado
 *       403:
 *         description: Não é admin
 */
router.put(
    '/:groupId',
    authenticate,
    requireKYC,
    requireGroupAdmin,
    validate(groupSchemas.update),
    catchAsync(groupController.updateGroup)
);

/**
 * @swagger
 * /groups/{groupId}/join:
 *   post:
 *     summary: Entrar em um grupo
 *     tags: [Groups]
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
 *               pin:
 *                 type: string
 *     responses:
 *       200:
 *         description: Entrou no grupo
 *       400:
 *         description: Erro ao entrar
 */
router.post(
    '/:groupId/join',
    authenticate,
    requireKYC,
    validate(groupSchemas.join),
    catchAsync(groupController.joinGroup)
);

/**
 * @swagger
 * /groups/{groupId}/leave:
 *   post:
 *     summary: Sair de um grupo
 *     tags: [Groups]
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
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Saiu do grupo
 *       400:
 *         description: Erro ao sair
 */
router.post(
    '/:groupId/leave',
    authenticate,
    validate(groupSchemas.leave),
    catchAsync(groupController.leaveGroup)
);

/**
 * @swagger
 * /groups/{groupId}/members:
 *   get:
 *     summary: Listar membros do grupo
 *     tags: [Groups]
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
 *         description: Lista de membros
 */
router.get(
    '/:groupId/members',
    authenticate,
    requireGroupMember,
    catchAsync(groupController.listMembers)
);

/**
 * @swagger
 * /groups/{groupId}/cycles:
 *   get:
 *     summary: Listar ciclos do grupo
 *     tags: [Groups]
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
 *         description: Ciclos do grupo
 */
router.get(
    '/:groupId/cycles',
    authenticate,
    requireGroupMember,
    catchAsync(groupController.listCycles)
);

/**
 * @swagger
 * /groups/{groupId}/current-cycle:
 *   get:
 *     summary: Obter ciclo atual
 *     tags: [Groups]
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
 *         description: Ciclo atual
 */
router.get(
    '/:groupId/current-cycle',
    authenticate,
    requireGroupMember,
    catchAsync(groupController.getCurrentCycle)
);

/**
 * @swagger
 * /groups/{groupId}/order:
 *   get:
 *     summary: Obter ordem dos beneficiários
 *     tags: [Groups]
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
 *         description: Ordem dos beneficiários
 */
router.get(
    '/:groupId/order',
    authenticate,
    requireGroupMember,
    catchAsync(groupController.getOrder)
);

/**
 * @swagger
 * /groups/{groupId}/set-first-beneficiary:
 *   post:
 *     summary: Definir primeiro beneficiário (apenas admin)
 *     tags: [Groups]
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
 *               - beneficiaryId
 *             properties:
 *               beneficiaryId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Primeiro beneficiário definido
 *       403:
 *         description: Não é admin
 */
router.post(
    '/:groupId/set-first-beneficiary',
    authenticate,
    requireGroupAdmin,
    validate(groupSchemas.setFirstBeneficiary),
    catchAsync(groupController.setFirstBeneficiary)
);

/**
 * @swagger
 * /groups/{groupId}/pay:
 *   post:
 *     summary: Pagar ciclo atual
 *     tags: [Groups]
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
 *               - pin
 *             properties:
 *               pin:
 *                 type: string
 *     responses:
 *       200:
 *         description: Pagamento realizado
 *       400:
 *         description: Erro no pagamento
 */
router.post(
    '/:groupId/pay',
    authenticate,
    requireKYC,
    requireGroupMember,
    checkDailyLimit('withdrawal'),
    validate(walletSchemas.verifyPin), // Reutilizar schema de PIN
    catchAsync(groupController.payCycle)
);

/**
 * @swagger
 * /groups/{groupId}/cancel:
 *   post:
 *     summary: Cancelar grupo (apenas admin)
 *     tags: [Groups]
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
 *         description: Grupo cancelado
 *       403:
 *         description: Não é admin
 */
router.post(
    '/:groupId/cancel',
    authenticate,
    requireGroupAdmin,
    catchAsync(groupController.cancelGroup)
);

// =====================================================
// EXPORTS
// =====================================================
module.exports = router;