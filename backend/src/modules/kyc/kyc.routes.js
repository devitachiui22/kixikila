// =====================================================
// KIXIKILAHUB - ROTAS DE KYC
// Verificação de identidade e documentos
// =====================================================

const express = require('express');
const multer = require('multer');
const router = express.Router();

// Controllers
const kycController = require('./kyc.controller');

// Middlewares
const { validate } = require('../../middlewares/validation.middleware');
const { kycSchemas } = require('../../middlewares/validation.middleware');
const { authenticate, requireKYC } = require('../../middlewares/auth.middleware');
const { kycLimiter } = require('../../middlewares/rateLimit.middleware');
const { catchAsync } = require('../../middlewares/error.middleware');

// Configuração do multer para upload de arquivos
const upload = multer({
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não permitido. Use JPEG, PNG ou PDF.'));
        }
    }
});

// =====================================================
// TODAS AS ROTAS REQUEREM AUTENTICAÇÃO
// =====================================================

/**
 * @swagger
 * /kyc/status:
 *   get:
 *     summary: Obter status do KYC do usuário
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status do KYC
 *       401:
 *         description: Não autorizado
 */
router.get(
    '/status',
    authenticate,
    catchAsync(kycController.getKYCStatus)
);

/**
 * @swagger
 * /kyc/submit:
 *   post:
 *     summary: Submeter documentos para KYC
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - documentType
 *               - documentNumber
 *               - documentFront
 *               - documentBack
 *               - selfie
 *             properties:
 *               documentType:
 *                 type: string
 *                 enum: [BI, PASSPORT]
 *               documentNumber:
 *                 type: string
 *               documentFront:
 *                 type: string
 *                 format: binary
 *               documentBack:
 *                 type: string
 *                 format: binary
 *               selfie:
 *                 type: string
 *                 format: binary
 *               expiresAt:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: KYC submetido com sucesso
 *       400:
 *         description: Erro de validação
 *       409:
 *         description: KYC já submetido
 */
router.post(
    '/submit',
    authenticate,
    kycLimiter,
    upload.fields([
        { name: 'documentFront', maxCount: 1 },
        { name: 'documentBack', maxCount: 1 },
        { name: 'selfie', maxCount: 1 }
    ]),
    validate(kycSchemas.submit),
    catchAsync(kycController.submitKYC)
);

/**
 * @swagger
 * /kyc/documents:
 *   get:
 *     summary: Obter URLs dos documentos (apenas para admin)
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: URLs dos documentos
 *       403:
 *         description: Acesso negado
 */
router.get(
    '/documents',
    authenticate,
    requireKYC,
    catchAsync(kycController.getDocumentURLs)
);

/**
 * @swagger
 * /kyc/resubmit:
 *   post:
 *     summary: Reenviar documentos após rejeição
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               documentFront:
 *                 type: string
 *                 format: binary
 *               documentBack:
 *                 type: string
 *                 format: binary
 *               selfie:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Documentos reenviados
 */
router.post(
    '/resubmit',
    authenticate,
    kycLimiter,
    upload.fields([
        { name: 'documentFront', maxCount: 1 },
        { name: 'documentBack', maxCount: 1 },
        { name: 'selfie', maxCount: 1 }
    ]),
    catchAsync(kycController.resubmitKYC)
);

// =====================================================
// ROTAS DE ADMIN (REQUER PERMISSÕES ESPECIAIS)
// =====================================================

/**
 * @swagger
 * /kyc/admin/pending:
 *   get:
 *     summary: Listar KYCs pendentes (admin)
 *     tags: [KYC]
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
 *         description: Lista de KYCs pendentes
 */
router.get(
    '/admin/pending',
    authenticate,
    // TODO: Adicionar middleware de admin
    catchAsync(kycController.getPendingKYC)
);

/**
 * @swagger
 * /kyc/admin/{kycId}/verify:
 *   post:
 *     summary: Verificar KYC (aprovar/rejeitar)
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: kycId
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [APPROVED, REJECTED]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: KYC verificado
 *       404:
 *         description: KYC não encontrado
 */
router.post(
    '/admin/:kycId/verify',
    authenticate,
    // TODO: Adicionar middleware de admin
    validate(kycSchemas.verify),
    catchAsync(kycController.verifyKYC)
);

/**
 * @swagger
 * /kyc/admin/stats:
 *   get:
 *     summary: Estatísticas de KYC (admin)
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estatísticas consolidadas
 */
router.get(
    '/admin/stats',
    authenticate,
    // TODO: Adicionar middleware de admin
    catchAsync(kycController.getKYCStats)
);

// =====================================================
// EXPORTS
// =====================================================
module.exports = router;