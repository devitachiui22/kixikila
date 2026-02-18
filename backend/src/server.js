// =====================================================
// KIXIKILAHUB - BOOTSTRAP DO SERVIDOR
// Inicialização do HTTP Server e WebSocket
// =====================================================

const http = require('http');
const app = require('./app');
const config = require('./config/env');
const logger = require('./utils/logger');
const database = require('./config/database');
const socketIO = require('./config/socket');

// =====================================================
// VARIÁVEIS DE CONTROLE
// =====================================================
let server;
let io;

// =====================================================
// INICIALIZAÇÃO DO SERVIDOR
// =====================================================
const startServer = async () => {
    try {
        // 1. Testar conexão com banco de dados
        logger.info('🔄 Conectando ao banco de dados...');
        await database.testConnection();
        logger.info('✅ Banco de dados conectado com sucesso');

        // 2. Criar servidor HTTP
        server = http.createServer(app);

        // 3. Inicializar Socket.IO
        io = socketIO.initialize(server);
        logger.info('✅ WebSocket inicializado');

        // 4. Iniciar servidor
        const PORT = config.server.port;
        server.listen(PORT, () => {
            logger.info(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🚀 KIXIKILAHUB - SERVIDOR INICIADO                    ║
║                                                          ║
║   📡 Ambiente: ${config.server.env.padEnd(30)} ║
║   🔌 Porta: ${PORT.toString().padEnd(34)} ║
║   🌐 URL: ${config.server.apiUrl.padEnd(33)} ║
║   📊 WebSocket: ${config.server.apiUrl}/socket.io       ║
║   💾 Banco: PostgreSQL (Neon)                           ║
║                                                          ║
║   📅 Iniciado em: ${new Date().toLocaleString('pt-AO')}          ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
            `);

            // Log adicional com informações do sistema
            logger.info('📊 Status do servidor:', {
                nodeVersion: process.version,
                platform: process.platform,
                memory: process.memoryUsage(),
                uptime: process.uptime(),
                pid: process.pid
            });
        });

        // 5. Configurar handlers de erros do servidor
        server.on('error', (error) => {
            logger.error('❌ Erro no servidor:', error);

            if (error.code === 'EADDRINUSE') {
                logger.error(`🚨 Porta ${PORT} já está em uso`);
                process.exit(1);
            }
        });

        server.on('listening', () => {
            const addr = server.address();
            logger.info(`✅ Servidor ouvindo em ${typeof addr === 'string' ? addr : `${addr.address}:${addr.port}`}`);
        });

        // 6. Configurar graceful shutdown
        setupGracefulShutdown();

    } catch (error) {
        logger.error('❌ Falha ao iniciar servidor:', error);
        process.exit(1);
    }
};

// =====================================================
// GRACEFUL SHUTDOWN
// =====================================================
const setupGracefulShutdown = () => {
    // Graceful shutdown handlers
    const shutdownSignals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

    shutdownSignals.forEach((signal) => {
        process.on(signal, async () => {
            logger.info(`🔄 Recebido sinal ${signal}. Iniciando graceful shutdown...`);

            // Não aceitar novas conexões
            if (server) {
                server.close(async () => {
                    logger.info('✅ Servidor HTTP fechado');

                    try {
                        // Fechar conexões WebSocket
                        if (io) {
                            await new Promise((resolve) => {
                                io.close(() => {
                                    logger.info('✅ WebSocket fechado');
                                    resolve();
                                });
                            });
                        }

                        // Fechar pool de conexões do banco
                        await database.closePool();

                        logger.info('✅ Todos os recursos liberados');

                        // Sair com sucesso
                        process.exit(0);
                    } catch (error) {
                        logger.error('❌ Erro durante graceful shutdown:', error);
                        process.exit(1);
                    }
                });

                // Forçar fechamento após timeout
                setTimeout(() => {
                    logger.error('🚨 Timeout do graceful shutdown. Forçando encerramento...');
                    process.exit(1);
                }, 30000); // 30 segundos
            }
        });
    });

    // Tratamento para erros não capturados
    process.on('uncaughtException', (error) => {
        logger.error('❌ Uncaught Exception:', error);
        // Em produção, pode ser melhor reiniciar
        if (config.server.isProduction) {
            process.exit(1);
        }
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    });
};

// =====================================================
// VERIFICAÇÕES PRÉ-INICIALIZAÇÃO
// =====================================================
const preflightChecks = () => {
    // Verificar variáveis de ambiente obrigatórias
    const requiredEnvs = [
        'JWT_SECRET',
        'JWT_REFRESH_SECRET',
        'DB_URL'
    ];

    const missingEnvs = requiredEnvs.filter(env => !process.env[env]);

    if (missingEnvs.length > 0) {
        logger.error('❌ Variáveis de ambiente obrigatórias não definidas:', missingEnvs);
        process.exit(1);
    }

    // Verificar se o diretório de uploads existe
    const fs = require('fs');
    const path = require('path');

    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
        logger.info('📁 Diretório de uploads criado');
    }

    const logsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
        logger.info('📁 Diretório de logs criado');
    }

    logger.info('✅ Preflight checks concluídos');
};

// =====================================================
// INICIAR APLICAÇÃO
// =====================================================
(async () => {
    try {
        // Executar verificações pré-inicialização
        preflightChecks();

        // Iniciar servidor
        await startServer();

    } catch (error) {
        logger.error('❌ Erro fatal na inicialização:', error);
        process.exit(1);
    }
})();

// =====================================================
// EXPORTS PARA TESTES
// =====================================================
module.exports = { app, server, io };