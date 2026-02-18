// =====================================================
// KIXIKILAHUB - CONTROLLER DE GRUPOS (KIXIKILAS)
// Gerenciamento de grupos, membros e ciclos de pagamento
// =====================================================

const database = require('../../config/database');
const config = require('../../config/env');
const logger = require('../../utils/logger');
const {
    ValidationError,
    NotFoundError,
    BusinessError,
    AuthorizationError
} = require('../../middlewares/error.middleware');
const { emitToGroup } = require('../../config/socket');

// =====================================================
// LISTAR GRUPOS DO USUÁRIO
// =====================================================
const listUserGroups = async (req, res) => {
    const result = await database.query(
        `SELECT
            g.id, g.name, g.description, g.zone, g.city,
            g.cycle_value, g.frequency, g.max_participants, g.current_participants,
            g.status, g.created_at,
            u.full_name as admin_name,
            (SELECT COUNT(*) FROM payment_cycles
             WHERE group_id = g.id AND beneficiary_id = $1 AND status = 'PAID') as cycles_won,
            CASE
                WHEN g.admin_id = $1 THEN true
                ELSE false
            END as is_admin,
            pc.id as current_cycle_id,
            pc.cycle_number as current_cycle,
            pc.due_date as next_payment_date,
            pc.beneficiary_id as current_beneficiary_id,
            bu.full_name as current_beneficiary_name
         FROM groups g
         JOIN users u ON g.admin_id = u.id
         JOIN group_members gm ON g.id = gm.group_id
         LEFT JOIN payment_cycles pc ON g.id = pc.group_id AND pc.status = 'PENDING'
         LEFT JOIN users bu ON pc.beneficiary_id = bu.id
         WHERE gm.user_id = $1 AND gm.is_active = true
         ORDER BY
            CASE WHEN pc.due_date IS NOT NULL THEN 0 ELSE 1 END,
            pc.due_date ASC NULLS LAST,
            g.created_at DESC`,
        [req.user.id]
    );

    res.json({
        success: true,
        data: {
            groups: result.rows.map(group => ({
                ...group,
                cycle_value: parseFloat(group.cycle_value),
                is_admin: group.is_admin,
                current_cycle: group.current_cycle ? parseInt(group.current_cycle) : null,
                current_participants: parseInt(group.current_participants)
            }))
        }
    });
};

// =====================================================
// BUSCAR GRUPOS
// =====================================================
const searchGroups = async (req, res) => {
    const {
        zone,
        city,
        frequency,
        minValue,
        maxValue,
        latitude,
        longitude,
        radius,
        page = 1,
        limit = 20
    } = req.query;

    const offset = (page - 1) * limit;

    let query = `
        SELECT
            g.id, g.name, g.description, g.zone, g.city,
            g.cycle_value, g.frequency, g.max_participants, g.current_participants,
            g.latitude, g.longitude, g.created_at,
            u.full_name as admin_name,
            u.id as admin_id,
            CASE
                WHEN gm.user_id IS NOT NULL THEN true
                ELSE false
            END as is_member,
            CASE
                WHEN g.latitude IS NOT NULL AND g.longitude IS NOT NULL AND $8 IS NOT NULL AND $9 IS NOT NULL
                THEN earth_distance(ll_to_earth(g.latitude, g.longitude), ll_to_earth($8, $9)) / 1000
                ELSE NULL
            END as distance_km
        FROM groups g
        JOIN users u ON g.admin_id = u.id
        LEFT JOIN group_members gm ON g.id = gm.group_id AND gm.user_id = $1
        WHERE g.status = 'ACTIVE' AND g.current_participants < g.max_participants
    `;

    const params = [req.user.id];
    let paramCount = 2;

    if (zone) {
        query += ` AND g.zone ILIKE $${paramCount}`;
        params.push(`%${zone}%`);
        paramCount++;
    }

    if (city) {
        query += ` AND g.city ILIKE $${paramCount}`;
        params.push(`%${city}%`);
        paramCount++;
    }

    if (frequency) {
        query += ` AND g.frequency = $${paramCount}`;
        params.push(frequency);
        paramCount++;
    }

    if (minValue) {
        query += ` AND g.cycle_value >= $${paramCount}`;
        params.push(minValue);
        paramCount++;
    }

    if (maxValue) {
        query += ` AND g.cycle_value <= $${paramCount}`;
        params.push(maxValue);
        paramCount++;
    }

    if (latitude && longitude && radius) {
        // Filtrar por distância usando extensão earthdistance (precisa ser instalada)
        query += ` AND earth_distance(ll_to_earth(g.latitude, g.longitude), ll_to_earth($${paramCount}, $${paramCount + 1})) / 1000 <= $${paramCount + 2}`;
        params.push(latitude, longitude, radius);
        paramCount += 3;
    }

    // Ordenar por relevância
    if (latitude && longitude) {
        query += ` ORDER BY distance_km ASC NULLS LAST, g.created_at DESC`;
    } else {
        query += ` ORDER BY g.created_at DESC`;
    }

    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await database.query(query, params);

    // Contar total
    let countQuery = `
        SELECT COUNT(*) as total
        FROM groups g
        WHERE g.status = 'ACTIVE' AND g.current_participants < g.max_participants
    `;

    if (zone) countQuery += ` AND g.zone ILIKE '%${zone}%'`;
    if (city) countQuery += ` AND g.city ILIKE '%${city}%'`;
    if (frequency) countQuery += ` AND g.frequency = '${frequency}'`;
    if (minValue) countQuery += ` AND g.cycle_value >= ${minValue}`;
    if (maxValue) countQuery += ` AND g.cycle_value <= ${maxValue}`;

    const countResult = await database.query(countQuery);
    const total = parseInt(countResult.rows[0].total);

    res.json({
        success: true,
        data: {
            groups: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        }
    });
};

// =====================================================
// GRUPOS RECOMENDADOS
// =====================================================
const getRecommendedGroups = async (req, res) => {
    // Recomendar baseado em grupos que o usuário já participa
    const result = await database.query(
        `WITH user_groups AS (
            SELECT zone, city, frequency, cycle_value
            FROM group_members gm
            JOIN groups g ON gm.group_id = g.id
            WHERE gm.user_id = $1 AND gm.is_active = true
        )
        SELECT DISTINCT
            g.id, g.name, g.description, g.zone, g.city,
            g.cycle_value, g.frequency, g.max_participants, g.current_participants,
            g.created_at,
            u.full_name as admin_name,
            (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as members_count,
            CASE
                WHEN g.zone IN (SELECT zone FROM user_groups) THEN 2
                WHEN g.city IN (SELECT city FROM user_groups) THEN 1
                ELSE 0
            END +
            CASE
                WHEN g.frequency IN (SELECT frequency FROM user_groups) THEN 1
                ELSE 0
            END +
            CASE
                WHEN ABS(g.cycle_value - (SELECT AVG(cycle_value) FROM user_groups)) < 5000 THEN 1
                ELSE 0
            END as relevance_score
        FROM groups g
        JOIN users u ON g.admin_id = u.id
        WHERE g.status = 'ACTIVE'
            AND g.current_participants < g.max_participants
            AND g.id NOT IN (SELECT group_id FROM group_members WHERE user_id = $1)
        ORDER BY relevance_score DESC, g.created_at DESC
        LIMIT 10`,
        [req.user.id]
    );

    res.json({
        success: true,
        data: {
            recommended: result.rows
        }
    });
};

// =====================================================
// CRIAR GRUPO
// =====================================================
const createGroup = async (req, res) => {
    const {
        name,
        description,
        zone,
        city,
        latitude,
        longitude,
        cycleValue,
        frequency,
        maxParticipants,
        paymentDay
    } = req.body;

    // Validar limites
    const userGroupsCount = await database.query(
        'SELECT COUNT(*) as count FROM group_members WHERE user_id = $1 AND is_active = true',
        [req.user.id]
    );

    if (parseInt(userGroupsCount.rows[0].count) >= 10) {
        throw new BusinessError('Você atingiu o limite máximo de 10 grupos');
    }

    // Iniciar transação
    const result = await database.transaction(async (client) => {
        // Criar grupo
        const group = await client.query(
            `INSERT INTO groups (
                name, description, admin_id, zone, city,
                latitude, longitude, cycle_value, frequency,
                max_participants, payment_day, current_participants
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1)
            RETURNING id, created_at`,
            [
                name, description, req.user.id, zone, city,
                latitude, longitude, cycleValue, frequency,
                maxParticipants, paymentDay
            ]
        );

        const groupId = group.rows[0].id;

        // Adicionar admin como membro
        await client.query(
            `INSERT INTO group_members (group_id, user_id)
             VALUES ($1, $2)`,
            [groupId, req.user.id]
        );

        // Criar ordem (será sorteada depois)
        await client.query(
            `INSERT INTO cycle_order (group_id, user_id, position)
             VALUES ($1, $2, 1)`,
            [groupId, req.user.id]
        );

        // Log de auditoria
        await client.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_data)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'GROUP_CREATED', 'groups', groupId, JSON.stringify(req.body)]
        );

        return { id: groupId, ...group.rows[0] };
    });

    logger.info(`Grupo criado: ${result.id} por usuário ${req.user.id}`);

    res.status(201).json({
        success: true,
        message: 'Grupo criado com sucesso',
        data: {
            groupId: result.id,
            createdAt: result.created_at
        }
    });
};

// =====================================================
// OBTER DETALHES DO GRUPO
// =====================================================
const getGroupDetails = async (req, res) => {
    const { groupId } = req.params;

    const result = await database.query(
        `SELECT
            g.*,
            u.full_name as admin_name,
            u.email as admin_email,
            (SELECT COUNT(*) FROM group_members WHERE group_id = g.id AND is_active = true) as members_count,
            (SELECT json_agg(json_build_object(
                'id', u.id,
                'name', u.full_name,
                'joined_at', gm.joined_at,
                'is_admin', (u.id = g.admin_id)
            )) FROM group_members gm
            JOIN users u ON gm.user_id = u.id
            WHERE gm.group_id = g.id AND gm.is_active = true) as members,
            CASE
                WHEN EXISTS (SELECT 1 FROM group_members WHERE group_id = g.id AND user_id = $2)
                THEN true
                ELSE false
            END as is_member,
            CASE
                WHEN g.admin_id = $2 THEN true
                ELSE false
            END as is_admin
         FROM groups g
         JOIN users u ON g.admin_id = u.id
         WHERE g.id = $1`,
        [groupId, req.user.id]
    );

    if (result.rows.length === 0) {
        throw new NotFoundError('Grupo não encontrado');
    }

    const group = result.rows[0];

    // Buscar ciclo atual
    const currentCycle = await database.query(
        `SELECT
            pc.*,
            u.full_name as beneficiary_name
         FROM payment_cycles pc
         JOIN users u ON pc.beneficiary_id = u.id
         WHERE pc.group_id = $1 AND pc.status = 'PENDING'
         ORDER BY pc.due_date ASC
         LIMIT 1`,
        [groupId]
    );

    // Buscar próxima ordem
    const nextOrder = await database.query(
        `SELECT
            co.position,
            u.id as user_id,
            u.full_name as user_name
         FROM cycle_order co
         JOIN users u ON co.user_id = u.id
         WHERE co.group_id = $1 AND co.is_active = true
         ORDER BY co.position ASC
         LIMIT 5`,
        [groupId]
    );

    res.json({
        success: true,
        data: {
            group: {
                id: group.id,
                name: group.name,
                description: group.description,
                zone: group.zone,
                city: group.city,
                latitude: group.latitude,
                longitude: group.longitude,
                cycleValue: parseFloat(group.cycle_value),
                frequency: group.frequency,
                maxParticipants: group.max_participants,
                currentParticipants: parseInt(group.members_count),
                status: group.status,
                createdAt: group.created_at,
                admin: {
                    id: group.admin_id,
                    name: group.admin_name,
                    email: group.admin_email
                },
                isMember: group.is_member,
                isAdmin: group.is_admin,
                members: group.members || []
            },
            currentCycle: currentCycle.rows[0] || null,
            nextOrder: nextOrder.rows
        }
    });
};

// =====================================================
// ATUALIZAR GRUPO
// =====================================================
const updateGroup = async (req, res) => {
    const { groupId } = req.params;
    const updates = req.body;

    // Construir query dinamicamente
    const allowedUpdates = ['name', 'description', 'zone', 'city', 'maxParticipants'];
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
        if (allowedUpdates.includes(key)) {
            let dbField = key;
            if (key === 'maxParticipants') dbField = 'max_participants';

            updateFields.push(`${dbField} = $${paramCount}`);
            values.push(updates[key]);
            paramCount++;
        }
    });

    if (updateFields.length === 0) {
        throw new ValidationError('Nenhum campo válido para atualização');
    }

    updateFields.push('updated_at = NOW()');
    values.push(groupId);

    const result = await database.query(
        `UPDATE groups
         SET ${updateFields.join(', ')}
         WHERE id = $${paramCount} AND admin_id = $${paramCount + 1}
         RETURNING id`,
        [...values, req.user.id]
    );

    if (result.rows.length === 0) {
        throw new NotFoundError('Grupo não encontrado ou você não é admin');
    }

    logger.info(`Grupo ${groupId} atualizado por admin ${req.user.id}`);

    res.json({
        success: true,
        message: 'Grupo atualizado com sucesso'
    });
};

// =====================================================
// ENTRAR EM GRUPO
// =====================================================
const joinGroup = async (req, res) => {
    const { groupId } = req.params;

    await database.transaction(async (client) => {
        // Verificar se grupo existe e tem vaga
        const group = await client.query(
            `SELECT id, max_participants, current_participants, status
             FROM groups
             WHERE id = $1 FOR UPDATE`,
            [groupId]
        );

        if (group.rows.length === 0) {
            throw new NotFoundError('Grupo não encontrado');
        }

        const groupData = group.rows[0];

        if (groupData.status !== 'ACTIVE') {
            throw new BusinessError('Grupo não está ativo');
        }

        if (groupData.current_participants >= groupData.max_participants) {
            throw new BusinessError('Grupo já atingiu o número máximo de participantes');
        }

        // Verificar se já é membro
        const existing = await client.query(
            'SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2',
            [groupId, req.user.id]
        );

        if (existing.rows.length > 0) {
            throw new BusinessError('Você já é membro deste grupo');
        }

        // Verificar limite de grupos do usuário
        const userGroups = await client.query(
            'SELECT COUNT(*) as count FROM group_members WHERE user_id = $1 AND is_active = true',
            [req.user.id]
        );

        if (parseInt(userGroups.rows[0].count) >= 10) {
            throw new BusinessError('Você atingiu o limite máximo de 10 grupos');
        }

        // Adicionar membro
        await client.query(
            `INSERT INTO group_members (group_id, user_id)
             VALUES ($1, $2)`,
            [groupId, req.user.id]
        );

        // Adicionar à ordem (posição será sorteada depois)
        const orderCount = await client.query(
            'SELECT COUNT(*) as count FROM cycle_order WHERE group_id = $1',
            [groupId]
        );

        const nextPosition = parseInt(orderCount.rows[0].count) + 1;

        await client.query(
            `INSERT INTO cycle_order (group_id, user_id, position)
             VALUES ($1, $2, $3)`,
            [groupId, req.user.id, nextPosition]
        );

        // Atualizar contagem no grupo
        await client.query(
            `UPDATE groups
             SET current_participants = current_participants + 1
             WHERE id = $1`,
            [groupId]
        );

        // Log
        logger.info(`Usuário ${req.user.id} entrou no grupo ${groupId}`);
    });

    // Notificar via WebSocket
    emitToGroup(groupId, 'group:member_joined', {
        groupId,
        userId: req.user.id,
        userName: req.user.name
    });

    res.json({
        success: true,
        message: 'Você entrou no grupo com sucesso'
    });
};

// =====================================================
// SAIR DO GRUPO
// =====================================================
const leaveGroup = async (req, res) => {
    const { groupId } = req.params;
    const { reason } = req.body;

    await database.transaction(async (client) => {
        // Verificar se é admin
        const group = await client.query(
            'SELECT admin_id FROM groups WHERE id = $1',
            [groupId]
        );

        if (group.rows.length === 0) {
            throw new NotFoundError('Grupo não encontrado');
        }

        if (group.rows[0].admin_id === req.user.id) {
            throw new BusinessError('O administrador não pode sair do grupo. Cancele o grupo ou transfira admin.');
        }

        // Verificar se há pagamentos pendentes
        const pending = await client.query(
            `SELECT id FROM payment_cycles
             WHERE group_id = $1 AND beneficiary_id = $2 AND status = 'PENDING'`,
            [groupId, req.user.id]
        );

        if (pending.rows.length > 0) {
            throw new BusinessError('Você tem um pagamento pendente como beneficiário. Não é possível sair agora.');
        }

        // Remover membro (soft delete)
        await client.query(
            `UPDATE group_members
             SET is_active = false, left_at = NOW()
             WHERE group_id = $1 AND user_id = $2`,
            [groupId, req.user.id]
        );

        // Desativar na ordem
        await client.query(
            `UPDATE cycle_order
             SET is_active = false
             WHERE group_id = $1 AND user_id = $2`,
            [groupId, req.user.id]
        );

        // Atualizar contagem no grupo
        await client.query(
            `UPDATE groups
             SET current_participants = current_participants - 1
             WHERE id = $1`,
            [groupId]
        );

        // Registrar penalidade se aplicável
        if (reason) {
            await client.query(
                `UPDATE group_members
                 SET penalty_count = penalty_count + 1
                 WHERE group_id = $1 AND user_id = $2`,
                [groupId, req.user.id]
            );
        }

        logger.info(`Usuário ${req.user.id} saiu do grupo ${groupId}`);
    });

    // Notificar via WebSocket
    emitToGroup(groupId, 'group:member_left', {
        groupId,
        userId: req.user.id,
        userName: req.user.name,
        reason
    });

    res.json({
        success: true,
        message: 'Você saiu do grupo com sucesso'
    });
};

// =====================================================
// LISTAR MEMBROS DO GRUPO
// =====================================================
const listMembers = async (req, res) => {
    const { groupId } = req.params;

    const result = await database.query(
        `SELECT
            u.id, u.full_name, u.email,
            gm.joined_at, gm.is_active, gm.penalty_count,
            CASE WHEN g.admin_id = u.id THEN true ELSE false END as is_admin,
            co.position as order_position
         FROM group_members gm
         JOIN users u ON gm.user_id = u.id
         JOIN groups g ON gm.group_id = g.id
         LEFT JOIN cycle_order co ON gm.group_id = co.group_id AND gm.user_id = co.user_id
         WHERE gm.group_id = $1 AND gm.is_active = true
         ORDER BY
            CASE WHEN g.admin_id = u.id THEN 0 ELSE 1 END,
            co.position ASC NULLS LAST,
            gm.joined_at ASC`,
        [groupId]
    );

    res.json({
        success: true,
        data: {
            members: result.rows,
            total: result.rows.length
        }
    });
};

// =====================================================
// LISTAR CICLOS DO GRUPO
// =====================================================
const listCycles = async (req, res) => {
    const { groupId } = req.params;

    const result = await database.query(
        `SELECT
            pc.id, pc.cycle_number, pc.amount, pc.due_date,
            pc.paid_at, pc.status,
            u.id as beneficiary_id,
            u.full_name as beneficiary_name,
            t.id as transaction_id,
            t.reference as transaction_reference
         FROM payment_cycles pc
         JOIN users u ON pc.beneficiary_id = u.id
         LEFT JOIN transactions t ON pc.transaction_id = t.id
         WHERE pc.group_id = $1
         ORDER BY pc.cycle_number ASC`,
        [groupId]
    );

    // Calcular totais
    const totals = {
        total: result.rows.length,
        paid: result.rows.filter(c => c.status === 'PAID').length,
        pending: result.rows.filter(c => c.status === 'PENDING').length,
        missed: result.rows.filter(c => c.status === 'MISSED').length,
        totalAmount: result.rows.reduce((sum, c) => sum + parseFloat(c.amount), 0),
        paidAmount: result.rows
            .filter(c => c.status === 'PAID')
            .reduce((sum, c) => sum + parseFloat(c.amount), 0)
    };

    res.json({
        success: true,
        data: {
            cycles: result.rows,
            summary: totals
        }
    });
};

// =====================================================
// OBTER CICLO ATUAL
// =====================================================
const getCurrentCycle = async (req, res) => {
    const { groupId } = req.params;

    const result = await database.query(
        `SELECT
            pc.*,
            u.full_name as beneficiary_name,
            u.email as beneficiary_email,
            g.cycle_value, g.name as group_name
         FROM payment_cycles pc
         JOIN users u ON pc.beneficiary_id = u.id
         JOIN groups g ON pc.group_id = g.id
         WHERE pc.group_id = $1 AND pc.status = 'PENDING'
         ORDER BY pc.due_date ASC
         LIMIT 1`,
        [groupId]
    );

    if (result.rows.length === 0) {
        return res.json({
            success: true,
            data: { currentCycle: null }
        });
    }

    const cycle = result.rows[0];

    // Verificar se o usuário atual é o beneficiário
    const isBeneficiary = cycle.beneficiary_id === req.user.id;

    // Buscar contribuições já feitas para este ciclo
    const contributions = await database.query(
        `SELECT
            COUNT(*) as paid_count,
            COALESCE(SUM(t.amount), 0) as total_paid
         FROM transactions t
         WHERE t.metadata->>'cycleId' = $1 AND t.status = 'COMPLETED'`,
        [cycle.id]
    );

    res.json({
        success: true,
        data: {
            currentCycle: {
                id: cycle.id,
                cycleNumber: cycle.cycle_number,
                amount: parseFloat(cycle.amount),
                dueDate: cycle.due_date,
                status: cycle.status,
                beneficiary: {
                    id: cycle.beneficiary_id,
                    name: cycle.beneficiary_name,
                    email: cycle.beneficiary_email,
                    isCurrentUser: isBeneficiary
                },
                progress: {
                    paid: parseInt(contributions.rows[0].paid_count),
                    total: parseInt(cycle.cycle_number), // Apenas exemplo
                    totalPaid: parseFloat(contributions.rows[0].total_paid)
                }
            }
        }
    });
};

// =====================================================
// OBTER ORDEM DOS BENEFICIÁRIOS
// =====================================================
const getOrder = async (req, res) => {
    const { groupId } = req.params;

    const result = await database.query(
        `SELECT
            co.position,
            u.id as user_id,
            u.full_name as user_name,
            CASE
                WHEN pc.beneficiary_id = u.id AND pc.status = 'PENDING' THEN true
                ELSE false
            END as is_next
         FROM cycle_order co
         JOIN users u ON co.user_id = u.id
         LEFT JOIN payment_cycles pc ON co.group_id = pc.group_id
            AND co.user_id = pc.beneficiary_id
            AND pc.status = 'PENDING'
         WHERE co.group_id = $1 AND co.is_active = true
         ORDER BY co.position ASC`,
        [groupId]
    );

    // Encontrar posição do usuário atual
    const userPosition = result.rows.findIndex(r => r.user_id === req.user.id) + 1;

    res.json({
        success: true,
        data: {
            order: result.rows,
            userPosition: userPosition || null,
            total: result.rows.length
        }
    });
};

// =====================================================
// DEFINIR PRIMEIRO BENEFICIÁRIO
// =====================================================
const setFirstBeneficiary = async (req, res) => {
    const { groupId } = req.params;
    const { beneficiaryId } = req.body;

    await database.transaction(async (client) => {
        // Verificar se beneficiário é membro
        const member = await client.query(
            'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
            [groupId, beneficiaryId]
        );

        if (member.rows.length === 0) {
            throw new ValidationError('Beneficiário não é membro do grupo');
        }

        // Verificar se já existem ciclos
        const cycles = await client.query(
            'SELECT id FROM payment_cycles WHERE group_id = $1',
            [groupId]
        );

        if (cycles.rows.length > 0) {
            throw new BusinessError('Os ciclos já foram gerados');
        }

        // Reordenar ordem para colocar beneficiário como primeiro
        await client.query(
            `UPDATE cycle_order
             SET position = position + 1
             WHERE group_id = $1 AND position >= 1`,
            [groupId]
        );

        await client.query(
            `UPDATE cycle_order
             SET position = 1
             WHERE group_id = $1 AND user_id = $2`,
            [groupId, beneficiaryId]
        );

        logger.info(`Primeiro beneficiário do grupo ${groupId} definido como ${beneficiaryId}`);
    });

    // Gerar ciclos após definir primeiro beneficiário
    await generateCycles(groupId);

    res.json({
        success: true,
        message: 'Primeiro beneficiário definido com sucesso'
    });
};

// =====================================================
// PAGAR CICLO ATUAL
// =====================================================
const payCycle = async (req, res) => {
    const { groupId } = req.params;
    const { pin } = req.body;

    const result = await database.transaction(async (client) => {
        // Buscar ciclo atual
        const cycle = await client.query(
            `SELECT pc.*, g.cycle_value, g.name as group_name
             FROM payment_cycles pc
             JOIN groups g ON pc.group_id = g.id
             WHERE pc.group_id = $1 AND pc.status = 'PENDING'
             ORDER BY pc.due_date ASC
             LIMIT 1
             FOR UPDATE`,
            [groupId]
        );

        if (cycle.rows.length === 0) {
            throw new NotFoundError('Nenhum ciclo pendente encontrado');
        }

        const cycleData = cycle.rows[0];

        // Verificar se o usuário é o beneficiário (não pode pagar para si mesmo)
        if (cycleData.beneficiary_id === req.user.id) {
            throw new BusinessError('Você não pode pagar para si mesmo');
        }

        // Calcular taxa do grupo
        const fee = cycleData.amount * config.fees.groupPayment;
        const totalToPay = cycleData.amount;

        // Verificar saldo
        const wallet = await client.query(
            'SELECT available_balance FROM wallets WHERE user_id = $1 FOR UPDATE',
            [req.user.id]
        );

        const balance = parseFloat(wallet.rows[0].available_balance);

        if (balance < totalToPay) {
            throw new BusinessError(`Saldo insuficiente. Necessário: ${totalToPay} KZ`);
        }

        // Registrar transação de pagamento
        const transaction = await client.query(
            `INSERT INTO transactions (
                user_id, wallet_id, transaction_type, amount, fee, net_amount,
                balance_before, balance_after, status, description, metadata
            ) VALUES (
                $1, (SELECT id FROM wallets WHERE user_id = $1),
                'GROUP_PAYMENT', $2, $3, -$2, $4, $4 - $2, 'COMPLETED', $5, $6
            ) RETURNING id`,
            [
                req.user.id,
                cycleData.amount,
                fee,
                balance,
                `Pagamento do ciclo ${cycleData.cycle_number} - ${cycleData.group_name}`,
                JSON.stringify({
                    groupId,
                    cycleId: cycleData.id,
                    cycleNumber: cycleData.cycle_number,
                    beneficiaryId: cycleData.beneficiary_id
                })
            ]
        );

        // Atualizar saldo do pagador
        await client.query(
            'UPDATE wallets SET available_balance = available_balance - $1 WHERE user_id = $2',
            [totalToPay, req.user.id]
        );

        // Atualizar ciclo
        await client.query(
            `UPDATE payment_cycles
             SET paid_at = NOW(), transaction_id = $1
             WHERE id = $2`,
            [transaction.rows[0].id, cycleData.id]
        );

        // Verificar se todos pagaram (simplificado)
        const paymentsCount = await client.query(
            'SELECT COUNT(*) as count FROM payment_cycles WHERE id = $1 AND paid_at IS NOT NULL',
            [cycleData.id]
        );

        const totalMembers = await client.query(
            'SELECT current_participants FROM groups WHERE id = $1',
            [groupId]
        );

        if (parseInt(paymentsCount.rows[0].count) === parseInt(totalMembers.rows[0].current_participants) - 1) { // -1 porque beneficiário não paga
            // Marcar ciclo como completo e creditar beneficiário
            await completeCycle(client, cycleData);
        }

        return {
            transactionId: transaction.rows[0].id,
            amount: cycleData.amount,
            fee,
            cycleNumber: cycleData.cycle_number
        };
    });

    logger.info(`Pagamento de ciclo realizado: grupo ${groupId}, usuário ${req.user.id}`);

    // Notificar via WebSocket
    emitToGroup(groupId, 'group:payment_made', {
        groupId,
        userId: req.user.id,
        userName: req.user.name,
        cycleNumber: result.cycleNumber,
        amount: result.amount
    });

    res.json({
        success: true,
        message: 'Pagamento realizado com sucesso',
        data: {
            transactionId: result.transactionId,
            amount: result.amount,
            fee: result.fee,
            cycleNumber: result.cycleNumber
        }
    });
};

// =====================================================
// CANCELAR GRUPO
// =====================================================
const cancelGroup = async (req, res) => {
    const { groupId } = req.params;

    await database.transaction(async (client) => {
        // Verificar se há ciclos pendentes
        const pending = await client.query(
            'SELECT id FROM payment_cycles WHERE group_id = $1 AND status = $2',
            [groupId, 'PENDING']
        );

        if (pending.rows.length > 0) {
            // TODO: Reembolsar pagamentos já feitos
            throw new BusinessError('Há ciclos pendentes. Não é possível cancelar agora.');
        }

        // Atualizar status do grupo
        await client.query(
            `UPDATE groups
             SET status = 'CANCELLED', updated_at = NOW()
             WHERE id = $1`,
            [groupId]
        );

        // Desativar membros
        await client.query(
            `UPDATE group_members
             SET is_active = false
             WHERE group_id = $1`,
            [groupId]
        );

        logger.info(`Grupo ${groupId} cancelado por admin ${req.user.id}`);
    });

    // Notificar via WebSocket
    emitToGroup(groupId, 'group:cancelled', {
        groupId,
        cancelledBy: req.user.id
    });

    res.json({
        success: true,
        message: 'Grupo cancelado com sucesso'
    });
};

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

/**
 * Gerar ciclos de pagamento para o grupo
 */
const generateCycles = async (groupId) => {
    return database.transaction(async (client) => {
        // Buscar dados do grupo
        const group = await client.query(
            `SELECT id, cycle_value, frequency, max_participants, payment_day
             FROM groups WHERE id = $1`,
            [groupId]
        );

        if (group.rows.length === 0) return;

        const groupData = group.rows[0];

        // Buscar ordem dos membros
        const order = await client.query(
            `SELECT user_id, position
             FROM cycle_order
             WHERE group_id = $1 AND is_active = true
             ORDER BY position ASC`,
            [groupId]
        );

        // Gerar ciclos para cada membro na ordem
        for (let i = 0; i < order.rows.length; i++) {
            const member = order.rows[i];

            // Calcular data de vencimento
            let dueDate = new Date();
            switch (groupData.frequency) {
                case 'DAILY':
                    dueDate.setDate(dueDate.getDate() + i);
                    break;
                case 'WEEKLY':
                    dueDate.setDate(dueDate.getDate() + (i * 7));
                    break;
                case 'MONTHLY':
                    dueDate.setMonth(dueDate.getMonth() + i);
                    if (groupData.payment_day) {
                        dueDate.setDate(groupData.payment_day);
                    }
                    break;
            }

            await client.query(
                `INSERT INTO payment_cycles (
                    group_id, cycle_number, beneficiary_id, amount, due_date, status
                ) VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    groupId,
                    i + 1,
                    member.user_id,
                    groupData.cycle_value,
                    dueDate,
                    i === 0 ? 'PENDING' : 'PENDING' // Todos começam pendentes
                ]
            );
        }

        logger.info(`Ciclos gerados para grupo ${groupId}`);
    });
};

/**
 * Completar ciclo (creditando beneficiário)
 */
const completeCycle = async (client, cycleData) => {
    // Buscar saldo do beneficiário
    const beneficiaryWallet = await client.query(
        'SELECT available_balance FROM wallets WHERE user_id = $1 FOR UPDATE',
        [cycleData.beneficiary_id]
    );

    const beneficiaryBalance = parseFloat(beneficiaryWallet.rows[0].available_balance);

    // Criar transação de recebimento
    await client.query(
        `INSERT INTO transactions (
            user_id, wallet_id, transaction_type, amount, fee, net_amount,
            balance_before, balance_after, status, description, metadata
        ) VALUES (
            $1, (SELECT id FROM wallets WHERE user_id = $1),
            'GROUP_RECEIVE', $2, 0, $2, $3, $3 + $2, 'COMPLETED', $4, $5
        )`,
        [
            cycleData.beneficiary_id,
            cycleData.amount,
            beneficiaryBalance,
            `Recebimento do ciclo ${cycleData.cycle_number}`,
            JSON.stringify({ groupId: cycleData.group_id, cycleId: cycleData.id })
        ]
    );

    // Atualizar saldo do beneficiário
    await client.query(
        'UPDATE wallets SET available_balance = available_balance + $1 WHERE user_id = $2',
        [cycleData.amount, cycleData.beneficiary_id]
    );

    // Marcar ciclo como pago
    await client.query(
        `UPDATE payment_cycles
         SET status = 'PAID'
         WHERE id = $1`,
        [cycleData.id]
    );

    logger.info(`Ciclo ${cycleData.id} completado, beneficiário ${cycleData.beneficiary_id} creditado`);
};

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
    listUserGroups,
    searchGroups,
    getRecommendedGroups,
    createGroup,
    getGroupDetails,
    updateGroup,
    joinGroup,
    leaveGroup,
    listMembers,
    listCycles,
    getCurrentCycle,
    getOrder,
    setFirstBeneficiary,
    payCycle,
    cancelGroup
};