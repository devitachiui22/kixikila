#!/usr/bin/env node

// =====================================================
// KIXIKILAHUB - SCRIPT DE CONFIGURAÇÃO DO BANCO DE DADOS
// Executa o schema.sql e cria as tabelas no Neon PostgreSQL
// =====================================================

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const crypto = require('crypto');

// Carregar variáveis de ambiente
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Cores para console
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

// =====================================================
// CONFIGURAÇÃO DA CONEXÃO
// =====================================================
const poolConfig = {
    connectionString: process.env.DB_URL,
    ssl: {
        rejectUnauthorized: false
    }
};

const pool = new Pool(poolConfig);

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

const log = (message, color = colors.reset) => {
    console.log(`${color}${message}${colors.reset}`);
};

const logSuccess = (message) => log(`✅ ${message}`, colors.green);
const logError = (message) => log(`❌ ${message}`, colors.red);
const logInfo = (message) => log(`ℹ️ ${message}`, colors.cyan);
const logWarning = (message) => log(`⚠️ ${message}`, colors.yellow);

// =====================================================
// EXECUTAR SCHEMA SQL
// =====================================================
const setupDatabase = async () => {
    const client = await pool.connect();

    try {
        logInfo('Iniciando configuração do banco de dados...');
        logInfo(`Conectando ao Neon PostgreSQL...`);

        // Verificar conexão
        await client.query('SELECT NOW()');
        logSuccess('Conexão estabelecida');

        // Ler arquivo schema.sql
        const schemaPath = path.resolve(__dirname, '../src/database/schema.sql');

        if (!fs.existsSync(schemaPath)) {
            throw new Error(`Arquivo schema.sql não encontrado em: ${schemaPath}`);
        }

        const schema = fs.readFileSync(schemaPath, 'utf8');

        // Dividir em comandos individuais (separados por ;)
        const commands = schema
            .split(';')
            .map(cmd => cmd.trim())
            .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));

        logInfo(`Encontrados ${commands.length} comandos SQL`);

        // Executar cada comando
        for (let i = 0; i < commands.length; i++) {
            const command = commands[i];

            try {
                logInfo(`Executando comando ${i + 1}/${commands.length}...`);

                // Mostrar preview do comando
                const preview = command.substring(0, 100) + (command.length > 100 ? '...' : '');
                log(`   ${preview}`, colors.cyan);

                await client.query(command);

                // Pequena pausa para não sobrecarregar
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (cmdError) {
                // Ignorar erros de extensões já existentes
                if (cmdError.message.includes('already exists')) {
                    logWarning(`Extensão já existe (ignorado)`);
                } else {
                    throw cmdError;
                }
            }
        }

        logSuccess('Schema criado com sucesso');

        // =====================================================
        // VERIFICAR TABELAS CRIADAS
        // =====================================================
        logInfo('Verificando tabelas...');

        const tables = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);

        logSuccess(`${tables.rows.length} tabelas encontradas:`);
        tables.rows.forEach((table, index) => {
            log(`   ${index + 1}. ${table.table_name}`, colors.green);
        });

        // =====================================================
        // CRIAR USUÁRIO ADMIN INICIAL
        // =====================================================
        logInfo('Criando usuário admin inicial...');

        const adminEmail = 'admin@kixikilahub.com';
        const adminPassword = 'Admin@123';
        const adminFullName = 'System Administrator';

        // Gerar hash da senha
        const bcrypt = require('bcrypt');
        const passwordHash = await bcrypt.hash(adminPassword, 12);

        // Verificar se admin já existe
        const existingAdmin = await client.query(
            'SELECT id FROM users WHERE email = $1',
            [adminEmail]
        );

        if (existingAdmin.rows.length === 0) {
            // Inserir admin
            const adminResult = await client.query(
                `INSERT INTO users (
                    email, password_hash, full_name,
                    is_email_verified, email_verified_at,
                    document_number, document_type
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id`,
                [adminEmail, passwordHash, adminFullName, true, new Date(), '000000000A', 'BI']
            );

            const adminId = adminResult.rows[0].id;

            // Criar wallet para admin
            await client.query(
                `INSERT INTO wallets (user_id, account_number)
                 VALUES ($1, $2)`,
                [adminId, 'ADMIN' + Date.now().toString().slice(-10)]
            );

            // Criar limites diários
            await client.query(
                `INSERT INTO daily_limits (user_id, deposit_limit, withdrawal_limit)
                 VALUES ($1, 500000, 500000)`,
                [adminId]
            );

            logSuccess(`Usuário admin criado com ID: ${adminId}`);
            logInfo(`Email: ${adminEmail}`);
            logInfo(`Senha: ${adminPassword}`);
            logWarning('⚠️ Altere a senha do admin após o primeiro login!');
        } else {
            logInfo('Usuário admin já existe');
        }

        // =====================================================
        // CRIAR DADOS DE TESTE (OPCIONAL)
        // =====================================================
        if (process.env.NODE_ENV === 'development' || process.argv.includes('--seed')) {
            logInfo('Criando dados de teste...');

            // Criar usuário de teste
            const testEmail = 'teste@kixikilahub.com';
            const testPassword = 'Teste@123';
            const testPasswordHash = await bcrypt.hash(testPassword, 12);

            const testUser = await client.query(
                `INSERT INTO users (
                    email, password_hash, full_name,
                    birth_date, document_number, document_type,
                    is_email_verified, email_verified_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (email) DO NOTHING
                RETURNING id`,
                [
                    testEmail,
                    testPasswordHash,
                    'Usuário Teste',
                    '1990-01-01',
                    '123456789A',
                    'BI',
                    true,
                    new Date()
                ]
            );

            if (testUser.rows.length > 0) {
                const testUserId = testUser.rows[0].id;

                // Adicionar KYC aprovado
                await client.query(
                    `INSERT INTO kyc (
                        user_id, document_type, document_number,
                        document_front_url, document_back_url, selfie_url,
                        verification_status, verified_at, expires_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [
                        testUserId,
                        'BI',
                        '123456789A',
                        '/uploads/test/front.jpg',
                        '/uploads/test/back.jpg',
                        '/uploads/test/selfie.jpg',
                        'APPROVED',
                        new Date(),
                        new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000)
                    ]
                );

                // Adicionar bônus de boas-vindas
                await client.query(
                    `INSERT INTO bonuses (user_id, bonus_type, amount, status, expires_at)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [
                        testUserId,
                        'WELCOME',
                        1000,
                        'ACTIVATED',
                        new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
                    ]
                );

                // Adicionar saldo à wallet
                await client.query(
                    `UPDATE wallets
                     SET available_balance = 10000,
                         total_deposited = 9000,
                         total_fees_paid = 100
                     WHERE user_id = $1`,
                    [testUserId]
                );

                logSuccess(`Usuário de teste criado: ${testEmail} / ${testPassword}`);
            } else {
                logInfo('Usuário de teste já existe');
            }
        }

        // =====================================================
        // ESTATÍSTICAS FINAIS
        // =====================================================
        const stats = await client.query(`
            SELECT
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM wallets) as total_wallets,
                (SELECT COUNT(*) FROM kyc) as total_kyc,
                (SELECT COUNT(*) FROM groups) as total_groups,
                (SELECT COUNT(*) FROM transactions) as total_transactions
        `);

        logSuccess('\n📊 Estatísticas do banco de dados:');
        log(`   👥 Usuários: ${stats.rows[0].total_users}`, colors.cyan);
        log(`   💳 Carteiras: ${stats.rows[0].total_wallets}`, colors.cyan);
        log(`   📋 KYC: ${stats.rows[0].total_kyc}`, colors.cyan);
        log(`   👪 Grupos: ${stats.rows[0].total_groups}`, colors.cyan);
        log(`   💰 Transações: ${stats.rows[0].total_transactions}`, colors.cyan);

        logSuccess('\n🎉 Banco de dados configurado com sucesso!');

    } catch (error) {
        logError('Erro na configuração do banco de dados:');
        console.error(error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
};

// =====================================================
// EXECUTAR
// =====================================================
setupDatabase().then(() => {
    process.exit(0);
}).catch(error => {
    logError('Erro fatal:');
    console.error(error);
    process.exit(1);
});