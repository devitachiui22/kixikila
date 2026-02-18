// =====================================================
// KIXIKILAHUB - SERVIÇO DE CRON JOBS
// Tarefas agendadas para processamento em background
// =====================================================

const cron = require('node-cron');
const database = require('../config/database');
const logger = require('../utils/logger');
const config = require('../config/env');
const { emitToGroup } = require('../config/socket');

class CronService {

    constructor() {
        this.jobs = new Map();
    }

    // =====================================================
    // INICIALIZAR TODOS OS CRON JOBS
    // =====================================================

    initialize() {
        logger.info('🔄 Inicializando cron jobs...');

        // Verificar pagamentos pendentes (todos os dias às 8h)
        this.scheduleJob(
            'check-payments',
            config.cron.checkPayments,
            this.checkPendingPayments.bind(this)
        );

        // Resetar limites diários (todos os dias à meia-noite)
        this.scheduleJob(
            'reset-limits',
            config.cron.resetLimits,
            this.resetDailyLimits.bind(this)
        );

        // Limpar tokens expirados (todos os dias às 2h)
        this.scheduleJob(
            'cleanup-tokens',
            config.cron.cleanupTokens,
            this.cleanupExpiredTokens.bind(this)
        );

        // Verificar expiração de bônus (todos os dias às 3h)
        this.scheduleJob(
            'check-bonus',
            config.cron.checkBonusExpiry,
            this.checkBonusExpiry.bind(this)
        );

        // Processar ciclos de grupos (a cada hora)
        this.scheduleJob(
            'process-cycles',
            '0 * * * *',
            this.processGroupCycles.bind(this)
        );

        // Backup do banco de dados (se configurado)
        if (config.backup.enabled) {
            this.scheduleJob(
                'database-backup',
                config.backup.schedule,
                this.performBackup.bind(this)
            );
        }

        // Gerar relatórios diários (todos os dias às 23:30)
        this.scheduleJob(
            'daily-reports',
            '30 23 * * *',
            this.generateDailyReports.bind(this)
        );

        logger.info('✅ Cron jobs inicializados');
    }

    // =====================================================
    // AGENDAR JOB
    // =====================================================

    scheduleJob(name, schedule, task) {
        if (!cron.validate(schedule)) {
            logger.error(`❌ Cron schedule inválido para ${name}: ${schedule}`);
            return;
        }

        const job = cron.schedule(schedule, async () => {
            const startTime = Date.now();
            logger.info(`🚀 Iniciando cron job: ${name}`);

            try {
                await task();
                const duration = Date.now() - startTime;
                logger.info(`✅ Cron job ${name} concluído em ${duration}ms`);
            } catch (error) {
                logger.error(`❌ Erro no cron job ${name}:`, error);
            }
        });

        this.jobs.set(name, job);
        logger.info(`📅 Cron job ${name} agendado: ${schedule}`);
    }

    // =====================================================
    // VERIFICAR PAGAMENTOS PENDENTES
    // =====================================================

    async checkPendingPayments() {
        logger.info('Verificando pagamentos pendentes...');

        // Buscar ciclos vencidos
        const result = await database.query(
            `SELECT pc.*, g.name as group_name, g.admin_id,
                    u.email, u.full_name
             FROM payment_cycles pc
             JOIN groups g ON pc.group_id = g.id
             JOIN users u ON pc.beneficiary_id = u.id
             WHERE pc.status = 'PENDING'
               AND pc.due_date < CURRENT_DATE
               AND pc.due_date > CURRENT_DATE - INTERVAL '7 days'`,
            []
        );

        for (const cycle of result.rows) {
            // Marcar como atrasado
            await database.query(
                `UPDATE payment_cycles
                 SET status = 'MISSED'
                 WHERE id = $1`,
                [cycle.id]
            );

            // Notificar admin do grupo
            logger.warn(`Ciclo atrasado: ${cycle.id} - Grupo: ${cycle.group_name}`);

            // Emitir notificação via socket
            emitToGroup(cycle.group_id, 'group:cycle_missed', {
                groupId: cycle.group_id,
                cycleId: cycle.id,
                beneficiaryId: cycle.beneficiary_id,
                beneficiaryName: cycle.full_name
            });
        }

        logger.info(`${result.rows.length} ciclos atrasados processados`);
    }

    // =====================================================
    // RESETAR LIMITES DIÁRIOS
    // =====================================================

    async resetDailyLimits() {
        logger.info('Resetando limites diários...');

        const result = await database.query(
            `UPDATE daily_limits
             SET deposit_used_today = 0,
                 withdrawal_used_today = 0,
                 last_reset_date = CURRENT_DATE,
                 updated_at = NOW()
             WHERE last_reset_date < CURRENT_DATE
             RETURNING id`
        );

        logger.info(`${result.rowCount} limites diários resetados`);
    }

    // =====================================================
    // LIMPAR TOKENS EXPIRADOS
    // =====================================================

    async cleanupExpiredTokens() {
        logger.info('Limpando tokens expirados...');

        const result = await database.query(
            `UPDATE users
             SET email_verification_token = NULL,
                 email_verification_expires = NULL,
                 password_reset_token = NULL,
                 password_reset_expires = NULL
             WHERE email_verification_expires < NOW()
                OR password_reset_expires < NOW()
             RETURNING id`
        );

        logger.info(`${result.rowCount} tokens expirados limpos`);
    }

    // =====================================================
    // VERIFICAR EXPIRAÇÃO DE BÔNUS
    // =====================================================

    async checkBonusExpiry() {
        logger.info('Verificando bônus expirados...');

        const result = await database.query(
            `UPDATE bonuses
             SET status = 'EXPIRED'
             WHERE status IN ('PENDING', 'ACTIVATED')
               AND expires_at < NOW()
             RETURNING id`
        );

        logger.info(`${result.rowCount} bônus expirados`);
    }

    // =====================================================
    // PROCESSAR CICLOS DE GRUPOS
    // =====================================================

    async processGroupCycles() {
        logger.info('Processando ciclos de grupos...');

        // Verificar novos ciclos que devem começar hoje
        const result = await database.query(
            `SELECT pc.*, g.name as group_name, g.cycle_value,
                    g.admin_id, g.frequency
             FROM payment_cycles pc
             JOIN groups g ON pc.group_id = g.id
             WHERE pc.status = 'PENDING'
               AND pc.due_date = CURRENT_DATE
               AND NOT EXISTS (
                   SELECT 1 FROM payment_cycles
                   WHERE group_id = pc.group_id
                     AND cycle_number = pc.cycle_number - 1
                     AND status != 'PAID'
               )`,
            []
        );

        for (const cycle of result.rows) {
            // Notificar grupo sobre novo ciclo
            emitToGroup(cycle.group_id, 'group:new_cycle', {
                groupId: cycle.group_id,
                cycleId: cycle.id,
                cycleNumber: cycle.cycle_number,
                beneficiaryId: cycle.beneficiary_id,
                amount: cycle.amount,
                dueDate: cycle.due_date
            });

            logger.info(`Novo ciclo iniciado: ${cycle.id} - Grupo: ${cycle.group_name}`);
        }

        logger.info(`${result.rows.length} novos ciclos processados`);
    }

    // =====================================================
    // REALIZAR BACKUP DO BANCO DE DADOS
    // =====================================================

    async performBackup() {
        if (!config.backup.enabled) return;

        logger.info('Iniciando backup do banco de dados...');

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `backup-${timestamp}.sql`;

        try {
            // Simular backup (em produção, usar pg_dump)
            logger.info(`Backup simulado: ${filename}`);

            // Aqui você implementaria o backup real com pg_dump
            // e upload para S3 ou outro storage

            // Limpar backups antigos
            await this.cleanupOldBackups();

            logger.info(`✅ Backup concluído: ${filename}`);
        } catch (error) {
            logger.error('❌ Erro no backup:', error);
        }
    }

    // =====================================================
    // LIMPAR BACKUPS ANTIGOS
    // =====================================================

    async cleanupOldBackups() {
        if (!config.backup.enabled || !config.backup.retentionDays) return;

        logger.info(`Limpando backups com mais de ${config.backup.retentionDays} dias...`);

        // Simular limpeza
        logger.info('Backups antigos removidos (simulado)');
    }

    // =====================================================
    // GERAR RELATÓRIOS DIÁRIOS
    // =====================================================

    async generateDailyReports() {
        logger.info('Gerando relatórios diários...');

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];

        // Relatório de transações
        const transactions = await database.query(
            `SELECT
                COUNT(*) as total_transactions,
                SUM(CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END) as total_amount,
                SUM(fee) as total_fees,
                COUNT(DISTINCT user_id) as active_users
             FROM transactions
             WHERE DATE(created_at) = $1`,
            [dateStr]
        );

        // Relatório de novos usuários
        const newUsers = await database.query(
            `SELECT COUNT(*) as count
             FROM users
             WHERE DATE(created_at) = $1`,
            [dateStr]
        );

        // Relatório de grupos
        const groups = await database.query(
            `SELECT
                COUNT(*) as total_groups,
                SUM(current_participants) as total_participants
             FROM groups
             WHERE status = 'ACTIVE'`
        );

        logger.info('📊 Relatório diário:', {
            date: dateStr,
            transactions: transactions.rows[0],
            newUsers: newUsers.rows[0].count,
            groups: groups.rows[0]
        });

        // Aqui você poderia enviar por email ou salvar em uma tabela de relatórios
    }

    // =====================================================
    // PARAR TODOS OS JOBS
    // =====================================================

    stopAll() {
        logger.info('Parando todos os cron jobs...');

        this.jobs.forEach((job, name) => {
            job.stop();
            logger.info(`Cron job ${name} parado`);
        });

        this.jobs.clear();
    }

    // =====================================================
    // OBTER STATUS DOS JOBS
    // =====================================================

    getStatus() {
        const status = {};

        this.jobs.forEach((job, name) => {
            status[name] = {
                running: true,
                nextRun: job.nextDate ? job.nextDate().toISOString() : null
            };
        });

        return status;
    }
}

// Exportar instância única
module.exports = new CronService();