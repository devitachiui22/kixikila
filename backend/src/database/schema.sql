-- =====================================================
-- KIXIKILAHUB - ESQUEMA COMPLETO DO BANCO DE DADOS
-- POSTGRESQL (NEON) - PRODUÇÃO
-- =====================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- TABELAS BASE
-- =====================================================

-- Tabela de usuários
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    google_id VARCHAR(255) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    birth_date DATE,
    document_number VARCHAR(50) UNIQUE,
    document_type VARCHAR(20) CHECK (document_type IN ('BI', 'PASSPORT', NULL)),
    is_email_verified BOOLEAN DEFAULT FALSE,
    email_verified_at TIMESTAMP,
    email_verification_token UUID DEFAULT uuid_generate_v4(),
    email_verification_expires TIMESTAMP DEFAULT (NOW() + INTERVAL '24 hours'),
    account_limit_count SMALLINT DEFAULT 1, -- 1 ou 2 (máximo por pessoa)
    master_user_id UUID REFERENCES users(id), -- Para vincular segunda conta
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT email_or_google_check CHECK (
        (email IS NOT NULL AND password_hash IS NOT NULL) OR
        (google_id IS NOT NULL)
    )
);

-- Índices para users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_document ON users(document_number);
CREATE INDEX idx_users_master ON users(master_user_id);

-- Tabela de KYC (Know Your Customer)
CREATE TABLE kyc (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type VARCHAR(20) NOT NULL CHECK (document_type IN ('BI', 'PASSPORT')),
    document_number VARCHAR(50) NOT NULL,
    document_front_url TEXT,
    document_back_url TEXT,
    selfie_url TEXT,
    verification_status VARCHAR(20) DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    verification_notes TEXT,
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP,
    rejected_at TIMESTAMP,
    rejection_reason TEXT,
    expires_at DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX idx_kyc_user ON kyc(user_id);
CREATE INDEX idx_kyc_status ON kyc(verification_status);

-- Tabela de wallets
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_number VARCHAR(20) UNIQUE NOT NULL DEFAULT 'KX' || TO_CHAR(NOW(), 'YYYYMM') || LPAD(CAST(FLOOR(RANDOM() * 1000000) AS TEXT), 6, '0'),
    available_balance DECIMAL(15, 2) DEFAULT 0,
    locked_balance DECIMAL(15, 2) DEFAULT 0,
    total_deposited DECIMAL(15, 2) DEFAULT 0,
    total_withdrawn DECIMAL(15, 2) DEFAULT 0,
    total_fees_paid DECIMAL(15, 2) DEFAULT 0,
    pin_hash VARCHAR(255),
    pin_attempts SMALLINT DEFAULT 0,
    pin_locked_until TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX idx_wallets_user ON wallets(user_id);
CREATE INDEX idx_wallets_account ON wallets(account_number);

-- Tabela de limites diários
CREATE TABLE daily_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    deposit_limit DECIMAL(15, 2) DEFAULT 200000, -- 200.000 KZ padrão
    deposit_used_today DECIMAL(15, 2) DEFAULT 0,
    withdrawal_limit DECIMAL(15, 2) DEFAULT 100000, -- 100.000 KZ padrão
    withdrawal_used_today DECIMAL(15, 2) DEFAULT 0,
    last_reset_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX idx_limits_user ON daily_limits(user_id);

-- =====================================================
-- TABELAS DE TRANSAÇÕES
-- =====================================================

-- Tabela de transações (base para todas movimentações)
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    wallet_id UUID NOT NULL REFERENCES wallets(id),
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('DEPOSIT', 'WITHDRAWAL', 'GROUP_PAYMENT', 'GROUP_RECEIVE', 'FEE', 'BONUS', 'TRANSFER')),
    amount DECIMAL(15, 2) NOT NULL,
    fee DECIMAL(15, 2) DEFAULT 0,
    net_amount DECIMAL(15, 2) NOT NULL,
    balance_before DECIMAL(15, 2) NOT NULL,
    balance_after DECIMAL(15, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    reference VARCHAR(100) UNIQUE,
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    failed_at TIMESTAMP,
    failure_reason TEXT
);

CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_wallet ON transactions(wallet_id);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created ON transactions(created_at);
CREATE INDEX idx_transactions_reference ON transactions(reference);

-- Tabela de depósitos
CREATE TABLE deposits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id),
    user_id UUID NOT NULL REFERENCES users(id),
    method VARCHAR(20) NOT NULL CHECK (method IN ('MULTICAIXA', 'IBAN', 'KWIK')),
    amount DECIMAL(15, 2) NOT NULL,
    fee DECIMAL(15, 2) DEFAULT 0,
    reference VARCHAR(100),
    provider_reference VARCHAR(100),
    provider_data JSONB,
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    UNIQUE(transaction_id)
);

CREATE INDEX idx_deposits_user ON deposits(user_id);
CREATE INDEX idx_deposits_method ON deposits(method);
CREATE INDEX idx_deposits_status ON deposits(status);

-- Tabela de retiradas
CREATE TABLE withdrawals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id),
    user_id UUID NOT NULL REFERENCES users(id),
    method VARCHAR(20) NOT NULL CHECK (method IN ('MULTICAIXA', 'IBAN', 'KWIK')),
    amount DECIMAL(15, 2) NOT NULL,
    fee DECIMAL(15, 2) DEFAULT 0,
    destination_details JSONB NOT NULL, -- {iban: '', phone: '', etc}
    reference VARCHAR(100),
    provider_reference VARCHAR(100),
    provider_data JSONB,
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    UNIQUE(transaction_id)
);

CREATE INDEX idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX idx_withdrawals_status ON withdrawals(status);

-- =====================================================
-- TABELAS DE GRUPOS (KIXIKILAS)
-- =====================================================

-- Tabela de grupos
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    admin_id UUID NOT NULL REFERENCES users(id),
    zone VARCHAR(255) NOT NULL, -- Bairro/zona
    city VARCHAR(100) DEFAULT 'Luanda',
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    cycle_value DECIMAL(15, 2) NOT NULL,
    frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('DAILY', 'WEEKLY', 'MONTHLY')),
    max_participants INTEGER NOT NULL CHECK (max_participants BETWEEN 3 AND 50),
    current_participants INTEGER DEFAULT 1,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FULL', 'COMPLETED', 'CANCELLED')),
    payment_day INTEGER, -- Dia do mês para mensal, dia da semana para semanal (0-6)
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_groups_admin ON groups(admin_id);
CREATE INDEX idx_groups_zone ON groups(zone);
CREATE INDEX idx_groups_status ON groups(status);
CREATE INDEX idx_groups_location ON groups(latitude, longitude);

-- Tabela de membros do grupo
CREATE TABLE group_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    joined_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    left_at TIMESTAMP,
    penalty_count INTEGER DEFAULT 0,
    UNIQUE(group_id, user_id)
);

CREATE INDEX idx_members_group ON group_members(group_id);
CREATE INDEX idx_members_user ON group_members(user_id);

-- Tabela de ciclos de pagamento
CREATE TABLE payment_cycles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    cycle_number INTEGER NOT NULL,
    beneficiary_id UUID NOT NULL REFERENCES users(id),
    amount DECIMAL(15, 2) NOT NULL,
    due_date DATE NOT NULL,
    paid_at TIMESTAMP,
    transaction_id UUID REFERENCES transactions(id),
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'MISSED', 'CANCELLED')),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(group_id, cycle_number)
);

CREATE INDEX idx_cycles_group ON payment_cycles(group_id);
CREATE INDEX idx_cycles_beneficiary ON payment_cycles(beneficiary_id);
CREATE INDEX idx_cycles_status ON payment_cycles(status);
CREATE INDEX idx_cycles_due_date ON payment_cycles(due_date);

-- Tabela de ordem futura (sorteio)
CREATE TABLE cycle_order (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    position INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(group_id, user_id),
    UNIQUE(group_id, position)
);

CREATE INDEX idx_order_group ON cycle_order(group_id);

-- =====================================================
-- TABELAS DE CHAT
-- =====================================================

-- Tabela de mensagens do chat
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    message TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'TEXT' CHECK (message_type IN ('TEXT', 'IMAGE', 'SYSTEM')),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);

CREATE INDEX idx_chat_group ON chat_messages(group_id);
CREATE INDEX idx_chat_user ON chat_messages(user_id);
CREATE INDEX idx_chat_created ON chat_messages(created_at);

-- =====================================================
-- TABELAS DE BÔNUS
-- =====================================================

-- Tabela de bônus
CREATE TABLE bonuses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id),
    bonus_type VARCHAR(50) NOT NULL CHECK (bonus_type IN ('WELCOME', 'REFERRAL', 'PROMOTION')),
    amount DECIMAL(15, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVATED', 'USED', 'EXPIRED')),
    granted_at TIMESTAMP DEFAULT NOW(),
    activated_at TIMESTAMP, -- Após primeiro depósito
    expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '90 days'),
    UNIQUE(user_id, bonus_type) -- Apenas um welcome bonus por usuário
);

CREATE INDEX idx_bonuses_user ON bonuses(user_id);
CREATE INDEX idx_bonuses_status ON bonuses(status);

-- =====================================================
-- TABELAS DE AUDITORIA
-- =====================================================

-- Tabela de logs de auditoria
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- =====================================================
-- FUNÇÕES E TRIGGERS
-- =====================================================

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kyc_updated_at BEFORE UPDATE ON kyc
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Função para criar wallet automaticamente após registro de usuário
CREATE OR REPLACE FUNCTION create_wallet_for_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO wallets (user_id) VALUES (NEW.id);
    INSERT INTO daily_limits (user_id) VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_user_insert
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION create_wallet_for_user();

-- Função para atualizar contagem de participantes do grupo
CREATE OR REPLACE FUNCTION update_group_participants_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE groups
        SET current_participants = current_participants + 1,
            status = CASE
                WHEN current_participants + 1 >= max_participants THEN 'FULL'
                ELSE status
            END
        WHERE id = NEW.group_id;
    ELSIF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.is_active = FALSE AND OLD.is_active = TRUE) THEN
        UPDATE groups
        SET current_participants = current_participants - 1,
            status = 'ACTIVE'
        WHERE id = OLD.group_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_group_member_change
    AFTER INSERT OR UPDATE OF is_active ON group_members
    FOR EACH ROW
    EXECUTE FUNCTION update_group_participants_count();

-- =====================================================
-- DADOS INICIAIS (OPCIONAL)
-- =====================================================

-- Inserir usuário admin (senha: Admin@123)
INSERT INTO users (id, email, password_hash, full_name, is_email_verified, email_verified_at)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin@kixikilahub.com',
    crypt('Admin@123', gen_salt('bf')),
    'System Administrator',
    TRUE,
    NOW()
) ON CONFLICT (email) DO NOTHING;

-- Criar wallet para admin
INSERT INTO wallets (user_id, account_number)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'KX' || TO_CHAR(NOW(), 'YYYYMM') || '000001'
) ON CONFLICT (user_id) DO NOTHING;

-- =====================================================
-- COMENTÁRIOS NAS TABELAS
-- =====================================================

COMMENT ON TABLE users IS 'Usuários do sistema KixikilaHub';
COMMENT ON TABLE kyc IS 'Documentos e verificação KYC';
COMMENT ON TABLE wallets IS 'Carteiras digitais dos usuários';
COMMENT ON TABLE daily_limits IS 'Limites diários por usuário';
COMMENT ON TABLE transactions IS 'Histórico completo de transações';
COMMENT ON TABLE groups IS 'Grupos de Kixikila';
COMMENT ON TABLE payment_cycles IS 'Ciclos de pagamento dos grupos';
COMMENT ON TABLE cycle_order IS 'Ordem sorteada dos beneficiários';
COMMENT ON TABLE chat_messages IS 'Mensagens do chat dos grupos';
COMMENT ON TABLE bonuses IS 'Bônus concedidos aos usuários';
COMMENT ON TABLE audit_logs IS 'Logs de auditoria para compliance';