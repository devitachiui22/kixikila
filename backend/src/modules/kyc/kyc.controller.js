// =====================================================
// KIXIKILAHUB - CONTROLLER DE KYC
// Verificação de identidade e documentos
// =====================================================

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const database = require('../../config/database');
const config = require('../../config/env');
const logger = require('../../utils/logger');
const {
    ValidationError,
    NotFoundError,
    ConflictError,
    AuthorizationError
} = require('../../middlewares/error.middleware');
const { validateDocument, validateMinimumAge } = require('../../utils/validators');

// =====================================================
// OBTER STATUS DO KYC
// =====================================================
const getKYCStatus = async (req, res) => {
    const result = await database.query(
        `SELECT
            id, document_type, document_number, verification_status,
            verification_notes, created_at, verified_at, rejected_at,
            expires_at
         FROM kyc
         WHERE user_id = $1`,
        [req.user.id]
    );

    const kyc = result.rows[0];

    if (!kyc) {
        return res.json({
            success: true,
            data: {
                status: 'NOT_SUBMITTED',
                message: 'KYC ainda não foi submetido'
            }
        });
    }

    // Mascarar número do documento
    if (kyc.document_number) {
        kyc.document_number = maskDocument(kyc.document_number);
    }

    res.json({
        success: true,
        data: {
            status: kyc.verification_status,
            documentType: kyc.document_type,
            documentNumber: kyc.document_number,
            submittedAt: kyc.created_at,
            verifiedAt: kyc.verified_at,
            rejectedAt: kyc.rejected_at,
            rejectionReason: kyc.verification_notes,
            expiresAt: kyc.expires_at
        }
    });
};

// =====================================================
// SUBMETER KYC
// =====================================================
const submitKYC = async (req, res) => {
    const {
        documentType,
        documentNumber,
        expiresAt
    } = req.body;

    const files = req.files;

    // Validar arquivos
    if (!files || !files.documentFront || !files.documentBack || !files.selfie) {
        throw new ValidationError('Todos os documentos são obrigatórios');
    }

    // Validar documento
    const docValidation = validateDocument(documentNumber, documentType);
    if (!docValidation.isValid) {
        throw new ValidationError(docValidation.error);
    }

    // Verificar idade mínima
    const userResult = await database.query(
        'SELECT birth_date FROM users WHERE id = $1',
        [req.user.id]
    );

    const birthDate = userResult.rows[0]?.birth_date;
    if (birthDate) {
        const ageValidation = validateMinimumAge(birthDate, config.financial.minAge);
        if (!ageValidation.isValid) {
            throw new ValidationError(ageValidation.error);
        }
    }

    // Iniciar transação
    const result = await database.transaction(async (client) => {
        // Verificar se já existe KYC
        const existing = await client.query(
            'SELECT id, verification_status FROM kyc WHERE user_id = $1',
            [req.user.id]
        );

        if (existing.rows.length > 0) {
            const status = existing.rows[0].verification_status;
            if (status === 'PENDING') {
                throw new ConflictError('KYC já foi submetido e está em análise');
            }
            if (status === 'APPROVED') {
                throw new ConflictError('KYC já foi aprovado');
            }
            // Se rejeitado, podemos reenviar
        }

        // Processar e salvar imagens
        const documentFrontUrl = await processAndSaveImage(
            files.documentFront[0],
            `kyc/${req.user.id}/front`
        );

        const documentBackUrl = await processAndSaveImage(
            files.documentBack[0],
            `kyc/${req.user.id}/back`
        );

        const selfieUrl = await processAndSaveImage(
            files.selfie[0],
            `kyc/${req.user.id}/selfie`
        );

        // Calcular data de expiração (padrão: 5 anos)
        const expiryDate = expiresAt || new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000);

        // Inserir ou atualizar KYC
        let kyc;
        if (existing.rows.length > 0) {
            // Atualizar existente
            const updated = await client.query(
                `UPDATE kyc
                 SET document_type = $1, document_number = $2,
                     document_front_url = $3, document_back_url = $4,
                     selfie_url = $5, expires_at = $6,
                     verification_status = 'PENDING',
                     verification_notes = NULL,
                     rejected_at = NULL,
                     updated_at = NOW()
                 WHERE user_id = $7
                 RETURNING id`,
                [documentType, documentNumber, documentFrontUrl, documentBackUrl,
                 selfieUrl, expiryDate, req.user.id]
            );
            kyc = updated.rows[0];
        } else {
            // Inserir novo
            const inserted = await client.query(
                `INSERT INTO kyc (
                    user_id, document_type, document_number,
                    document_front_url, document_back_url, selfie_url,
                    expires_at, verification_status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
                RETURNING id`,
                [req.user.id, documentType, documentNumber, documentFrontUrl,
                 documentBackUrl, selfieUrl, expiryDate]
            );
            kyc = inserted.rows[0];
        }

        // Atualizar documento no usuário
        await client.query(
            `UPDATE users
             SET document_number = $1, document_type = $2
             WHERE id = $3`,
            [documentNumber, documentType, req.user.id]
        );

        // Log de auditoria
        await client.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_data)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'KYC_SUBMITTED', 'kyc', kyc.id, JSON.stringify({ documentType, documentNumber })]
        );

        return { id: kyc.id };
    });

    logger.security('KYC_SUBMITTED', req.user.id, { documentType });

    res.json({
        success: true,
        message: 'KYC submetido com sucesso. Aguarde análise.',
        data: {
            kycId: result.id,
            estimatedTime: '24-48 horas'
        }
    });
};

// =====================================================
// OBTER URLs DOS DOCUMENTOS
// =====================================================
const getDocumentURLs = async (req, res) => {
    // Verificar se é admin ou o próprio usuário
    // Por segurança, apenas admin pode ver documentos completos
    const isAdmin = req.user.role === 'ADMIN'; // TODO: Implementar roles

    if (!isAdmin) {
        throw new AuthorizationError('Apenas administradores podem acessar documentos completos');
    }

    const result = await database.query(
        `SELECT
            document_front_url, document_back_url, selfie_url,
            document_type, document_number, user_id
         FROM kyc
         WHERE user_id = $1`,
        [req.user.id]
    );

    if (result.rows.length === 0) {
        throw new NotFoundError('KYC não encontrado');
    }

    const docs = result.rows[0];

    res.json({
        success: true,
        data: {
            documentFront: docs.document_front_url,
            documentBack: docs.document_back_url,
            selfie: docs.selfie_url,
            documentType: docs.document_type,
            documentNumber: maskDocument(docs.document_number)
        }
    });
};

// =====================================================
// REENVIAR KYC (APÓS REJEIÇÃO)
// =====================================================
const resubmitKYC = async (req, res) => {
    const files = req.files;

    // Verificar se existe KYC rejeitado
    const existing = await database.query(
        'SELECT id FROM kyc WHERE user_id = $1 AND verification_status = $2',
        [req.user.id, 'REJECTED']
    );

    if (existing.rows.length === 0) {
        throw new ValidationError('Não há KYC rejeitado para reenviar');
    }

    // Reaproveitar a lógica de submit, mas com os campos opcionais
    // (só enviar os documentos que foram rejeitados)
    const updates = [];

    if (files && files.documentFront) {
        const url = await processAndSaveImage(
            files.documentFront[0],
            `kyc/${req.user.id}/front`
        );
        updates.push(`document_front_url = '${url}'`);
    }

    if (files && files.documentBack) {
        const url = await processAndSaveImage(
            files.documentBack[0],
            `kyc/${req.user.id}/back`
        );
        updates.push(`document_back_url = '${url}'`);
    }

    if (files && files.selfie) {
        const url = await processAndSaveImage(
            files.selfie[0],
            `kyc/${req.user.id}/selfie`
        );
        updates.push(`selfie_url = '${url}'`);
    }

    if (updates.length === 0) {
        throw new ValidationError('Envie pelo menos um documento');
    }

    // Atualizar status
    updates.push(`verification_status = 'PENDING'`);
    updates.push(`verification_notes = NULL`);
    updates.push(`rejected_at = NULL`);
    updates.push(`updated_at = NOW()`);

    await database.query(
        `UPDATE kyc
         SET ${updates.join(', ')}
         WHERE user_id = $1`,
        [req.user.id]
    );

    logger.security('KYC_RESUBMITTED', req.user.id);

    res.json({
        success: true,
        message: 'KYC reenviado com sucesso'
    });
};

// =====================================================
// LISTAR KYCs PENDENTES (ADMIN)
// =====================================================
const getPendingKYC = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const result = await database.query(
        `SELECT
            k.id, k.user_id, k.document_type,
            k.document_number, k.created_at,
            u.full_name, u.email, u.birth_date
         FROM kyc k
         JOIN users u ON k.user_id = u.id
         WHERE k.verification_status = 'PENDING'
         ORDER BY k.created_at ASC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
    );

    // Mascarar documentos
    result.rows.forEach(row => {
        row.document_number = maskDocument(row.document_number);
    });

    // Total
    const countResult = await database.query(
        "SELECT COUNT(*) as total FROM kyc WHERE verification_status = 'PENDING'"
    );

    const total = parseInt(countResult.rows[0].total);

    res.json({
        success: true,
        data: {
            pending: result.rows,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        }
    });
};

// =====================================================
// VERIFICAR KYC (APROVAR/REJEITAR) - ADMIN
// =====================================================
const verifyKYC = async (req, res) => {
    const { kycId } = req.params;
    const { status, notes } = req.body;

    await database.transaction(async (client) => {
        // Buscar KYC
        const kyc = await client.query(
            `SELECT k.*, u.email, u.full_name
             FROM kyc k
             JOIN users u ON k.user_id = u.id
             WHERE k.id = $1`,
            [kycId]
        );

        if (kyc.rows.length === 0) {
            throw new NotFoundError('KYC não encontrado');
        }

        const kycData = kyc.rows[0];

        if (kycData.verification_status !== 'PENDING') {
            throw new ValidationError('KYC já foi processado');
        }

        if (status === 'APPROVED') {
            // Aprovar KYC
            await client.query(
                `UPDATE kyc
                 SET verification_status = 'APPROVED',
                     verified_by = $1,
                     verified_at = NOW(),
                     verification_notes = $2
                 WHERE id = $3`,
                [req.user.id, notes, kycId]
            );

            // Conceder bônus de boas-vindas se configurado
            if (config.features.welcomeBonus) {
                await grantWelcomeBonus(client, kycData.user_id);
            }

            logger.security('KYC_APPROVED', kycData.user_id, { verifiedBy: req.user.id });
        } else {
            // Rejeitar KYC
            await client.query(
                `UPDATE kyc
                 SET verification_status = 'REJECTED',
                     verified_by = $1,
                     rejected_at = NOW(),
                     verification_notes = $2
                 WHERE id = $3`,
                [req.user.id, notes, kycId]
            );

            logger.security('KYC_REJECTED', kycData.user_id, { reason: notes });
        }

        // Log de auditoria
        await client.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_data)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, `KYC_${status}`, 'kyc', kycId, JSON.stringify({ status, notes })]
        );
    });

    res.json({
        success: true,
        message: `KYC ${status === 'APPROVED' ? 'aprovado' : 'rejeitado'} com sucesso`
    });
};

// =====================================================
// ESTATÍSTICAS DE KYC (ADMIN)
// =====================================================
const getKYCStats = async (req, res) => {
    const result = await database.query(
        `SELECT
            COUNT(*) as total,
            COUNT(CASE WHEN verification_status = 'PENDING' THEN 1 END) as pending,
            COUNT(CASE WHEN verification_status = 'APPROVED' THEN 1 END) as approved,
            COUNT(CASE WHEN verification_status = 'REJECTED' THEN 1 END) as rejected,
            AVG(CASE
                WHEN verification_status = 'APPROVED'
                THEN EXTRACT(EPOCH FROM (verified_at - created_at))/3600
                ELSE NULL
            END) as avg_approval_hours
         FROM kyc`
    );

    const stats = result.rows[0];

    res.json({
        success: true,
        data: { statistics: stats }
    });
};

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

/**
 * Processar e salvar imagem
 */
const processAndSaveImage = async (file, subpath) => {
    try {
        // Criar diretório se não existir
        const uploadDir = path.join(config.upload.uploadDir, subpath);
        await fs.mkdir(uploadDir, { recursive: true });

        // Gerar nome único
        const filename = `${crypto.randomUUID()}.jpg`;
        const filepath = path.join(uploadDir, filename);

        // Processar imagem com sharp (redimensionar, comprimir)
        await sharp(file.buffer)
            .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toFile(filepath);

        // Retornar URL relativa
        return `/uploads/${subpath}/${filename}`;
    } catch (error) {
        logger.error('Erro ao processar imagem:', error);
        throw new Error('Falha ao processar imagem');
    }
};

/**
 * Conceder bônus de boas-vindas
 */
const grantWelcomeBonus = async (client, userId) => {
    // Verificar se já recebeu bônus
    const existing = await client.query(
        `SELECT id FROM bonuses
         WHERE user_id = $1 AND bonus_type = 'WELCOME'`,
        [userId]
    );

    if (existing.rows.length > 0) {
        return;
    }

    // Calcular data de expiração
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.financial.welcomeBonus.expiryDays);

    // Inserir bônus
    await client.query(
        `INSERT INTO bonuses (user_id, bonus_type, amount, status, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, 'WELCOME', config.financial.welcomeBonus.amount, 'PENDING', expiresAt]
    );

    logger.info(`Bônus de boas-vindas concedido para usuário ${userId}`);
};

/**
 * Mascarar número de documento
 */
const maskDocument = (document) => {
    if (!document) return null;
    if (document.length <= 4) return '****';
    return '*'.repeat(document.length - 4) + document.slice(-4);
};

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
    getKYCStatus,
    submitKYC,
    getDocumentURLs,
    resubmitKYC,
    getPendingKYC,
    verifyKYC,
    getKYCStats
};