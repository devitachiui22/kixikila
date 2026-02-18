// =====================================================
// KIXIKILAHUB - SERVIÇO DE AUDITORIA
// Registro de todas as ações importantes para compliance
// =====================================================

const database = require('../config/database');
const logger = require('../utils/logger');

class AuditService {

    // =====================================================
    // REGISTRAR AÇÃO DE AUDITORIA
    // =====================================================

    async log(userId, action, entityType, entityId, oldData = null, newData = null, req = null) {
        try {
            const result = await database.query(
                `INSERT INTO audit_logs (
                    user_id, action, entity_type, entity_id,
                    old_data, new_data, ip_address, user_agent
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id`,
                [
                    userId,
                    action,
                    entityType,
                    entityId,
                    oldData ? JSON.stringify(oldData) : null,
                    newData ? JSON.stringify(newData) : null,
                    req?.ip,
                    req?.get('user-agent')
                ]
            );

            logger.debug(`Audit log criado: ${result.rows[0].id}`);
            return result.rows[0].id;

        } catch (error) {
            logger.error('Erro ao criar audit log:', error);
            // Não lançar erro para não interromper fluxo principal
            return null;
        }
    }

    // =====================================================
    // REGISTRAR AÇÃO FINANCEIRA
    // =====================================================

    async logFinancial(userId, transactionId, action, amount, metadata = {}) {
        return this.log(
            userId,
            `FINANCIAL_${action}`,
            'transactions',
            transactionId,
            null,
            { amount, ...metadata },
            null
        );
    }

    // =====================================================
    // REGISTRAR ALTERAÇÃO DE PERFIL
    // =====================================================

    async logProfileChange(userId, oldData, newData, req = null) {
        return this.log(
            userId,
            'PROFILE_UPDATED',
            'users',
            userId,
            oldData,
            newData,
            req
        );
    }

    // =====================================================
    // REGISTRAR TENTATIVA DE LOGIN
    // =====================================================

    async logLoginAttempt(userId, success, req = null, failureReason = null) {
        return this.log(
            userId,
            success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED',
            'auth',
            userId,
            null,
            { success, failureReason, timestamp: new Date() },
            req
        );
    }

    // =====================================================
    // REGISTRAR ALTERAÇÃO DE PIN
    // =====================================================

    async logPinChange(userId, req = null) {
        return this.log(
            userId,
            'PIN_CHANGED',
            'wallets',
            userId,
            null,
            { changedAt: new Date() },
            req
        );
    }

    // =====================================================
    // REGISTRAR CRIAÇÃO DE GRUPO
    // =====================================================

    async logGroupCreation(userId, groupId, groupData, req = null) {
        return this.log(
            userId,
            'GROUP_CREATED',
            'groups',
            groupId,
            null,
            groupData,
            req
        );
    }

    // =====================================================
    // REGISTRAR PARTICIPAÇÃO EM GRUPO
    // =====================================================

    async logGroupJoin(userId, groupId, req = null) {
        return this.log(
            userId,
            'GROUP_JOINED',
            'group_members',
            groupId,
            null,
            { joinedAt: new Date() },
            req
        );
    }

    // =====================================================
    // REGISTRAR SAÍDA DE GRUPO
    // =====================================================

    async logGroupLeave(userId, groupId, reason = null, req = null) {
        return this.log(
            userId,
            'GROUP_LEFT',
            'group_members',
            groupId,
            null,
            { leftAt: new Date(), reason },
            req
        );
    }

    // =====================================================
    // REGISTRAR SUBMISSÃO DE KYC
    // =====================================================

    async logKYCSubmission(userId, kycId, documentType, req = null) {
        return this.log(
            userId,
            'KYC_SUBMITTED',
            'kyc',
            kycId,
            null,
            { documentType, submittedAt: new Date() },
            req
        );
    }

    // =====================================================
    // REGISTRAR APROVAÇÃO DE KYC (ADMIN)
    // =====================================================

    async logKYCApproval(adminId, userId, kycId, req = null) {
        return this.log(
            adminId,
            'KYC_APPROVED',
            'kyc',
            kycId,
            null,
            { userId, approvedAt: new Date() },
            req
        );
    }

    // =====================================================
    // BUSCAR LOGS DE AUDITORIA
    // =====================================================

    async getLogs(filters = {}) {
        const {
            userId,
            action,
            entityType,
            entityId,
            startDate,
            endDate,
            limit = 100,
            offset = 0
        } = filters;

        let query = 'SELECT * FROM audit_logs WHERE 1=1';
        const params = [];
        let paramCount = 1;

        if (userId) {
            query += ` AND user_id = $${paramCount}`;
            params.push(userId);
            paramCount++;
        }

        if (action) {
            query += ` AND action = $${paramCount}`;
            params.push(action);
            paramCount++;
        }

        if (entityType) {
            query += ` AND entity_type = $${paramCount}`;
            params.push(entityType);
            paramCount++;
        }

        if (entityId) {
            query += ` AND entity_id = $${paramCount}`;
            params.push(entityId);
            paramCount++;
        }

        if (startDate) {
            query += ` AND created_at >= $${paramCount}`;
            params.push(startDate);
            paramCount++;
        }

        if (endDate) {
            query += ` AND created_at <= $${paramCount}`;
            params.push(endDate);
            paramCount++;
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
        params.push(limit, offset);

        const result = await database.query(query, params);
        return result.rows;
    }

    // =====================================================
    // EXPORTAR LOGS PARA CSV
    // =====================================================

    async exportLogsToCSV(filters = {}) {
        const logs = await this.getLogs({ ...filters, limit: 10000 });

        if (logs.length === 0) {
            return null;
        }

        // Criar cabeçalho CSV
        const headers = ['ID', 'Usuário', 'Ação', 'Tipo', 'Entidade', 'IP', 'Data'];
        const csvRows = [headers.join(',')];

        // Adicionar linhas
        for (const log of logs) {
            const row = [
                log.id,
                log.user_id,
                log.action,
                log.entity_type,
                log.entity_id,
                log.ip_address,
                log.created_at
            ].map(cell => `"${cell}"`).join(',');

            csvRows.push(row);
        }

        return csvRows.join('\n');
    }

    // =====================================================
    // OBTER ESTATÍSTICAS DE AUDITORIA
    // =====================================================

    async getAuditStats(startDate, endDate) {
        const result = await database.query(
            `SELECT
                COUNT(*) as total_logs,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(DISTINCT action) as unique_actions,
                action,
                COUNT(*) as action_count
             FROM audit_logs
             WHERE created_at BETWEEN $1 AND $2
             GROUP BY action
             ORDER BY action_count DESC`,
            [startDate, endDate]
        );

        return {
            period: { startDate, endDate },
            summary: {
                totalLogs: result.rows.reduce((sum, row) => sum + parseInt(row.action_count), 0),
                uniqueUsers: result.rows[0]?.unique_users || 0,
                actions: result.rows
            }
        };
    }

    // =====================================================
    // LIMPAR LOGS ANTIGOS (RETENÇÃO)
    // =====================================================

    async cleanupOldLogs(daysToKeep = 365) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        const result = await database.query(
            `DELETE FROM audit_logs
             WHERE created_at < $1
             RETURNING id`,
            [cutoffDate]
        );

        logger.info(`${result.rowCount} logs de auditoria antigos removidos`);
        return result.rowCount;
    }
}

// Exportar instância única
module.exports = new AuditService();