// =====================================================
// KIXIKILAHUB - CONEXÃO COM POSTGRESQL (NEON)
// =====================================================

const { Pool } = require('pg');
const config = require('./env');
const logger = require('../utils/logger');

const pool = new Pool({
    connectionString: config.database.url,
    ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
    max: config.database.pool.max,
    min: config.database.pool.min,
    idleTimeoutMillis: config.database.pool.idleTimeoutMillis,
    connectionTimeoutMillis: config.database.pool.connectionTimeoutMillis,
});

const query = async (text, params) => {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        if (duration > 1000) {
            // CORREÇÃO: Usar logger.log em vez de logger.warn
            logger.log('warn', `⚠️ Query lenta (${duration}ms): ${text.substring(0, 200)}...`);
        }
        return result;
    } catch (error) {
        logger.error('❌ Erro na query:', { query: text, error: error.message });
        throw error;
    }
};

const transaction = async (callback) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const testConnection = async () => {
    try {
        const client = await pool.connect();
        logger.info('✅ Conexão com PostgreSQL estabelecida');
        client.release();
        return true;
    } catch (error) {
        logger.error('❌ Erro na conexão com PostgreSQL:', error);
        return false;
    }
};

module.exports = {
    pool,
    query,
    transaction,
    testConnection
};
