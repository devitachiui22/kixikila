// File: src/modules/groups/group.service.js

const db = require('../../config/database');
const { v4: uuidv4 } = require('uuid');

// Criar grupo Kixikila
const createGroup = async (adminId, { name, zone, value_per_cycle, frequency, max_members, first_beneficiary }) => {
    const nextBeneficiary = first_beneficiary || adminId;
    const res = await db.query(
        `INSERT INTO groups (id, name, admin_id, zone, value_per_cycle, frequency, max_members, next_beneficiary, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
         RETURNING *`,
        [uuidv4(), name, adminId, zone, value_per_cycle, frequency, max_members, nextBeneficiary]
    );
    // Adiciona admin ao grupo
    await db.query(`INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,NOW())`, [res.rows[0].id, adminId]);
    return res.rows[0];
};

// Listar grupos (opcional por zona)
const listGroups = async (zone) => {
    let query = `SELECT g.*, u.email as admin_email FROM groups g
                 JOIN users u ON g.admin_id = u.id`;
    const params = [];
    if (zone) {
        query += ` WHERE g.zone = $1`;
        params.push(zone);
    }
    const res = await db.query(query, params);
    return res.rows;
};

// Obter detalhes de um grupo
const getGroupDetails = async (groupId) => {
    const resGroup = await db.query(`SELECT * FROM groups WHERE id = $1`, [groupId]);
    if (resGroup.rows.length === 0) throw { status: 404, message: 'Grupo não encontrado' };
    const group = resGroup.rows[0];

    const membersRes = await db.query(
        `SELECT u.id, u.email FROM group_members gm
         JOIN users u ON gm.user_id = u.id
         WHERE gm.group_id = $1`,
        [groupId]
    );
    group.members = membersRes.rows;
    return group;
};

// Entrar no grupo
const joinGroup = async (userId, groupId) => {
    const exists = await db.query(`SELECT * FROM group_members WHERE user_id=$1 AND group_id=$2`, [userId, groupId]);
    if (exists.rows.length > 0) throw { status: 400, message: 'Você já está neste grupo' };

    const groupRes = await db.query(`SELECT * FROM groups WHERE id=$1`, [groupId]);
    if (groupRes.rows.length === 0) throw { status: 404, message: 'Grupo não encontrado' };
    const group = groupRes.rows[0];

    const memberCount = await db.query(`SELECT COUNT(*) FROM group_members WHERE group_id=$1`, [groupId]);
    if (parseInt(memberCount.rows[0].count) >= group.max_members) throw { status: 400, message: 'Grupo cheio' };

    await db.query(`INSERT INTO group_members (group_id, user_id, joined_at) VALUES ($1,$2,NOW())`, [groupId, userId]);
    return { message: 'Entrou no grupo com sucesso' };
};

// Sair do grupo
const leaveGroup = async (userId, groupId) => {
    const res = await db.query(`DELETE FROM group_members WHERE user_id=$1 AND group_id=$2 RETURNING *`, [userId, groupId]);
    if (res.rows.length === 0) throw { status: 400, message: 'Você não pertence a este grupo' };
    return { message: 'Saiu do grupo com sucesso' };
};

// Atualizar grupo (apenas admin)
const updateGroup = async (adminId, groupId, updates) => {
    const groupRes = await db.query(`SELECT * FROM groups WHERE id=$1`, [groupId]);
    if (groupRes.rows.length === 0) throw { status: 404, message: 'Grupo não encontrado' };
    const group = groupRes.rows[0];
    if (group.admin_id !== adminId) throw { status: 403, message: 'Apenas admin pode atualizar o grupo' };

    const fields = [];
    const values = [];
    let index = 1;
    for (let key in updates) {
        fields.push(`${key}=$${index}`);
        values.push(updates[key]);
        index++;
    }
    values.push(groupId);
    const query = `UPDATE groups SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$${index} RETURNING *`;
    const resUpdate = await db.query(query, values);
    return resUpdate.rows[0];
};

// Obter próximos beneficiários e ciclo
const getPaymentCycle = async (groupId) => {
    const res = await db.query(
        `SELECT pc.id, pc.beneficiary_id, u.email as beneficiary_email, pc.amount, pc.due_date, pc.status
         FROM payment_cycles pc
         JOIN users u ON pc.beneficiary_id = u.id
         WHERE pc.group_id=$1
         ORDER BY pc.due_date ASC`,
        [groupId]
    );
    return res.rows;
};

module.exports = {
    createGroup,
    listGroups,
    getGroupDetails,
    joinGroup,
    leaveGroup,
    updateGroup,
    getPaymentCycle
};
