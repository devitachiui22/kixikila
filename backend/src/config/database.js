// =====================================================
// KIXIKILAHUB - CONEXÃO COM POSTGRESQL (NEON)
// Pool de conexões com tratamento de erros e retry
// =====================================================

const { Pool } = require('pg');
const config = require('./env');
const logger = require('../utils/logger');

// Configuração do pool de conexões
const poolConfig = {
    connectionString: config.database.url,
    ssl: config.database.ssl ? {
        rejectUnauthorized: false // Neon requer isso
    } : false,
    max: config.database.pool.max,
    min: config.database.pool.min,
    idleTimeoutMillis: config.database.pool.idleTimeoutMillis,
    connectionTimeoutMillis: config.database.pool.connectionTimeoutMillis,

    // Eventos do pool
    error: (err, client) => {
        logger.error('Erro no pool de conexões PostgreSQL:', err);
    }
};

// Criar pool de conexões
const pool = new Pool(poolConfig);

// =====================================================
// TESTAR CONEXÃO INICIAL
// =====================================================
const testConnection = async () => {
    let retries = 5;
    let connected = false;

    while (retries > 0 && !connected) {
        try {
            const client = await pool.connect();
            logger.info('✅ Conexão com PostgreSQL (Neon) estabelecida com sucesso');

            // Verificar versão do PostgreSQL
            const result = await client.query('SELECT version()');
            logger.info(`📊 PostgreSQL version: ${result.rows[0].version}`);

            client.release();
            connected = true;

            // Criar schemas se não existirem (opcional - podemos rodar migrations separadamente)
            await ensureSchema();

        } catch (error) {
            retries -= 1;
            logger.error(`❌ Falha na conexão com PostgreSQL. Tentativas restantes: ${retries}`, error);

            if (retries === 0) {
                logger.error('❌ Não foi possível conectar ao PostgreSQL após múltiplas tentativas');
                throw error;
            }

            // Aguardar 5 segundos antes de tentar novamente
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
};

// =====================================================
// GARANTIR SCHEMA INICIAL
// =====================================================
const ensureSchema = async () => {
    try {
        // Verificar se as tabelas principais existem
        const result = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'users'
            );
        `);

        if (!result.rows[0].exists) {
            logger.warn('⚠️ Tabelas não encontradas. Execute o script schema.sql manualmente');
            logger.info('📝 Comando: npm run db:setup');
        } else {
            logger.info('📦 Schema do banco de dados verificado');
        }
    } catch (error) {
        logger.error('Erro ao verificar schema:', error);
    }
};

// =====================================================
// WRAPPER PARA QUERIES COM LOG
// =====================================================
const query = async (text, params, options = {}) => {
    const start = Date.now();

    try {
        const result = await pool.query(text, params);

        const duration = Date.now() - start;

        // Log de queries lentas (> 1 segundo)
        if (duration > 1000) {
            logger.warn(`⚠️ Query lenta (${duration}ms): ${text.substring(0, 200)}...`);
        }

        // Log em desenvolvimento
        if (config.server.isDevelopment) {
            logger.debug(`📊 Query executada em ${duration}ms: ${text.substring(0, 100)}...`);
        }

        return result;
    } catch (error) {
        logger.error('❌ Erro na query:', {
            query: text.substring(0, 200),
            params: params,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};

// =====================================================
// TRANSAÇÕES
// =====================================================
const transaction = async (callback) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const result = await callback(client);

        await client.query('COMMIT');

        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('❌ Transação revertida:', error);
        throw error;
    } finally {
        client.release();
    }
};

// =====================================================
// HEALTH CHECK
// =====================================================
const healthCheck = async () => {
    try {
        const start = Date.now();
        const result = await pool.query('SELECT 1 as health_check');
        const duration = Date.now() - start;

        return {
            status: 'healthy',
            latency: duration,
            timestamp: new Date().toISOString(),
            connections: {
                total: pool.totalCount,
                idle: pool.idleCount,
                waiting: pool.waitingCount
            }
        };
    } catch (error) {
        logger.error('❌ Health check falhou:', error);
        return {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
};

// =====================================================
// EVENTOS DO POOL
// =====================================================
pool.on('connect', (client) => {
    logger.debug('🔄 Nova conexão estabelecida com o banco de dados');
});

pool.on('acquire', (client) => {
    logger.debug('🔄 Cliente adquirido do pool');
});

pool.on('remove', (client) => {
    logger.debug('🔄 Cliente removido do pool');
});

// =====================================================
// ENCERRAMENTO GRACEFUL
// =====================================================
const closePool = async () => {
    logger.info('🔄 Encerrando pool de conexões...');
    try {
        await pool.end();
        logger.info('✅ Pool de conexões encerrado');
    } catch (error) {
        logger.error('❌ Erro ao encerrar pool:', error);
        throw error;
    }
};

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
    pool,
    query,
    transaction,
    healthCheck,
    testConnection,
    closePool
};