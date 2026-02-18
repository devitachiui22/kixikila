// =====================================================
// KIXIKILAHUB - UTILITÁRIOS DE VALIDAÇÃO
// Funções de validação reutilizáveis
// =====================================================

const Joi = require('joi');
const moment = require('moment');
const crypto = require('crypto');
const { ValidationError } = require('../middlewares/error.middleware');

// =====================================================
// VALIDAÇÕES DE DOCUMENTOS ANGOLANOS
// =====================================================

/**
 * Validar BI (Bilhete de Identidade) angolano
 * Formato: 9 dígitos + 1 letra (ex: 123456789A)
 */
const validateBI = (bi) => {
    if (!bi || typeof bi !== 'string') {
        return { isValid: false, error: 'BI inválido' };
    }

    const biRegex = /^[0-9]{9}[A-Z]{1}$/;

    if (!biRegex.test(bi)) {
        return {
            isValid: false,
            error: 'BI deve ter 9 números seguidos de 1 letra maiúscula'
        };
    }

    // Validar dígito de controle (algoritmo simples)
    const numbers = bi.substring(0, 9).split('').map(Number);
    const letter = bi.substring(9);

    const sum = numbers.reduce((acc, num, index) => {
        return acc + num * (index + 1);
    }, 0);

    const remainder = sum % 23;
    const expectedLetter = String.fromCharCode(65 + remainder);

    if (letter !== expectedLetter) {
        return {
            isValid: false,
            error: 'Dígito de controle do BI inválido'
        };
    }

    return { isValid: true };
};

/**
 * Validar Passaporte angolano
 * Formato: N seguido de 8 dígitos (ex: N12345678)
 */
const validatePassport = (passport) => {
    if (!passport || typeof passport !== 'string') {
        return { isValid: false, error: 'Passaporte inválido' };
    }

    const passportRegex = /^N[0-9]{8}$/;

    if (!passportRegex.test(passport)) {
        return {
            isValid: false,
            error: 'Passaporte deve começar com N seguido de 8 dígitos'
        };
    }

    return { isValid: true };
};

/**
 * Validar documento (BI ou Passaporte)
 */
const validateDocument = (documentNumber, documentType) => {
    if (documentType === 'BI') {
        return validateBI(documentNumber);
    } else if (documentType === 'PASSPORT') {
        return validatePassport(documentNumber);
    }

    return { isValid: false, error: 'Tipo de documento inválido' };
};

// =====================================================
// VALIDAÇÕES DE IDADE
// =====================================================

/**
 * Validar idade mínima
 */
const validateMinimumAge = (birthDate, minAge = 18) => {
    const birth = moment(birthDate);
    const today = moment();
    const age = today.diff(birth, 'years');

    if (age < minAge) {
        return {
            isValid: false,
            error: `Idade mínima é ${minAge} anos`,
            age
        };
    }

    return { isValid: true, age };
};

// =====================================================
// VALIDAÇÕES DE TELEFONE (ANGOLA)
// =====================================================

/**
 * Validar número de telefone angolano
 * Formato: 9 dígitos, começando com 9
 */
const validateAngolanPhone = (phone) => {
    if (!phone || typeof phone !== 'string') {
        return { isValid: false, error: 'Telefone inválido' };
    }

    // Remover caracteres não numéricos
    const cleanPhone = phone.replace(/\D/g, '');

    // Verificar se tem 9 dígitos e começa com 9
    const phoneRegex = /^9[0-9]{8}$/;

    if (!phoneRegex.test(cleanPhone)) {
        return {
            isValid: false,
            error: 'Telefone deve ter 9 dígitos e começar com 9'
        };
    }

    return {
        isValid: true,
        clean: cleanPhone,
        formatted: `+244 ${cleanPhone.substring(0,3)} ${cleanPhone.substring(3,6)} ${cleanPhone.substring(6)}`
    };
};

// =====================================================
// VALIDAÇÕES DE IBAN (ANGOLA)
// =====================================================

/**
 * Validar IBAN angolano
 * Formato: AO + 21 dígitos
 */
const validateAngolanIBAN = (iban) => {
    if (!iban || typeof iban !== 'string') {
        return { isValid: false, error: 'IBAN inválido' };
    }

    // Remover espaços
    const cleanIban = iban.replace(/\s/g, '').toUpperCase();

    // Regex para IBAN angolano
    const ibanRegex = /^AO[0-9]{21}$/;

    if (!ibanRegex.test(cleanIban)) {
        return {
            isValid: false,
            error: 'IBAN deve começar com AO seguido de 21 dígitos'
        };
    }

    // Validar dígitos de controle (algoritmo MOD 97)
    const rearranged = cleanIban.substring(4) + cleanIban.substring(0, 4);
    const numeric = rearranged.split('').map(c => {
        const code = c.charCodeAt(0);
        return code >= 65 ? code - 55 : c;
    }).join('');

    const remainder = BigInt(numeric) % 97n;

    if (remainder !== 1n) {
        return {
            isValid: false,
            error: 'Dígitos de controle do IBAN inválidos'
        };
    }

    return {
        isValid: true,
        clean: cleanIban,
        formatted: cleanIban.replace(/(.{4})/g, '$1 ').trim()
    };
};

// =====================================================
// VALIDAÇÕES DE VALORES MONETÁRIOS
// =====================================================

/**
 * Validar valor monetário
 */
const validateAmount = (amount, options = {}) => {
    const {
        min = 0,
        max = Infinity,
        decimals = 2,
        currency = 'KZ'
    } = options;

    if (typeof amount !== 'number' || isNaN(amount)) {
        return { isValid: false, error: 'Valor deve ser um número' };
    }

    if (amount < min) {
        return {
            isValid: false,
            error: `Valor mínimo é ${min.toFixed(decimals)} ${currency}`
        };
    }

    if (amount > max) {
        return {
            isValid: false,
            error: `Valor máximo é ${max.toFixed(decimals)} ${currency}`
        };
    }

    // Verificar casas decimais
    const decimalPlaces = (amount.toString().split('.')[1] || '').length;
    if (decimalPlaces > decimals) {
        return {
            isValid: false,
            error: `Máximo ${decimals} casas decimais`
        };
    }

    return { isValid: true };
};

// =====================================================
// VALIDAÇÕES DE SENHA
// =====================================================

/**
 * Validar força da senha
 */
const validatePasswordStrength = (password) => {
    const checks = {
        minLength: password.length >= 8,
        hasUpperCase: /[A-Z]/.test(password),
        hasLowerCase: /[a-z]/.test(password),
        hasNumbers: /\d/.test(password),
        hasSpecial: /[@$!%*?&]/.test(password),
        noSpaces: !/\s/.test(password)
    };

    const passedChecks = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;

    const strength = passedChecks === totalChecks ? 'strong' :
                     passedChecks >= totalChecks - 2 ? 'medium' : 'weak';

    const errors = [];
    if (!checks.minLength) errors.push('mínimo 8 caracteres');
    if (!checks.hasUpperCase) errors.push('pelo menos 1 maiúscula');
    if (!checks.hasLowerCase) errors.push('pelo menos 1 minúscula');
    if (!checks.hasNumbers) errors.push('pelo menos 1 número');
    if (!checks.hasSpecial) errors.push('pelo menos 1 caractere especial (@$!%*?&)');
    if (!checks.noSpaces) errors.push('não pode conter espaços');

    return {
        isValid: passedChecks === totalChecks,
        strength,
        checks,
        errors
    };
};

// =====================================================
// VALIDAÇÕES DE EMAIL
// =====================================================

/**
 * Validar email com verificação de domínio
 */
const validateEmail = (email, options = {}) => {
    const {
        checkDomain = true,
        disposableAllowed = false
    } = options;

    // Validação básica Joi
    const schema = Joi.string().email();
    const { error } = schema.validate(email);

    if (error) {
        return { isValid: false, error: 'Email inválido' };
    }

    // Lista de domínios temporários (simplificada)
    const disposableDomains = [
        'tempmail.com', 'throwaway.com', 'mailinator.com',
        'guerrillamail.com', 'sharklasers.com'
    ];

    if (checkDomain && !disposableAllowed) {
        const domain = email.split('@')[1];
        if (disposableDomains.includes(domain)) {
            return {
                isValid: false,
                error: 'Email temporário não permitido'
            };
        }
    }

    return { isValid: true };
};

// =====================================================
// VALIDAÇÕES DE PIN
// =====================================================

/**
 * Validar PIN de 4 dígitos
 */
const validatePin = (pin) => {
    if (!pin || typeof pin !== 'string') {
        return { isValid: false, error: 'PIN inválido' };
    }

    const pinRegex = /^[0-9]{4}$/;

    if (!pinRegex.test(pin)) {
        return {
            isValid: false,
            error: 'PIN deve ter exatamente 4 dígitos numéricos'
        };
    }

    // Evitar PINs óbvios
    const obviousPins = ['0000', '1111', '1234', '4321', '9999'];
    if (obviousPins.includes(pin)) {
        return {
            isValid: false,
            error: 'PIN muito óbvio. Escolha um mais seguro'
        };
    }

    return { isValid: true };
};

// =====================================================
// VALIDAÇÕES DE UUID
// =====================================================

/**
 * Validar UUID
 */
const validateUUID = (uuid) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(uuid)) {
        return { isValid: false, error: 'UUID inválido' };
    }

    return { isValid: true };
};

// =====================================================
// VALIDAÇÕES DE DATA
// =====================================================

/**
 * Validar data
 */
const validateDate = (date, options = {}) => {
    const {
        min = null,
        max = null,
        format = 'YYYY-MM-DD'
    } = options;

    const momentDate = moment(date, format, true);

    if (!momentDate.isValid()) {
        return { isValid: false, error: 'Data inválida' };
    }

    if (min && momentDate.isBefore(min)) {
        return {
            isValid: false,
            error: `Data deve ser após ${moment(min).format(format)}`
        };
    }

    if (max && momentDate.isAfter(max)) {
        return {
            isValid: false,
            error: `Data deve ser antes de ${moment(max).format(format)}`
        };
    }

    return {
        isValid: true,
        date: momentDate.toDate(),
        formatted: momentDate.format(format)
    };
};

// =====================================================
// VALIDAÇÕES DE LOCALIZAÇÃO
// =====================================================

/**
 * Validar coordenadas geográficas (Angola)
 */
const validateAngolaCoordinates = (latitude, longitude) => {
    // Angola bounds aproximados
    const bounds = {
        lat: { min: -18.0, max: -4.0 },
        lng: { min: 11.0, max: 24.0 }
    };

    if (latitude < bounds.lat.min || latitude > bounds.lat.max) {
        return {
            isValid: false,
            error: `Latitude deve estar entre ${bounds.lat.min} e ${bounds.lat.max}`
        };
    }

    if (longitude < bounds.lng.min || longitude > bounds.lng.max) {
        return {
            isValid: false,
            error: `Longitude deve estar entre ${bounds.lng.min} e ${bounds.lng.max}`
        };
    }

    return { isValid: true };
};

// =====================================================
// VALIDAÇÕES DE ARQUIVO
// =====================================================

/**
 * Validar arquivo de documento
 */
const validateDocumentFile = (file, options = {}) => {
    const {
        maxSize = 5 * 1024 * 1024, // 5MB
        allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
    } = options;

    if (!file) {
        return { isValid: false, error: 'Nenhum arquivo fornecido' };
    }

    if (file.size > maxSize) {
        return {
            isValid: false,
            error: `Arquivo muito grande. Máximo: ${maxSize / 1024 / 1024}MB`
        };
    }

    if (!allowedTypes.includes(file.mimetype)) {
        return {
            isValid: false,
            error: `Tipo de arquivo não permitido. Permitidos: ${allowedTypes.join(', ')}`
        };
    }

    return { isValid: true };
};

// =====================================================
// UTILITÁRIOS DE SEGURANÇA
// =====================================================

/**
 * Sanitizar input (prevenção XSS básica)
 */
const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;

    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
};

/**
 * Gerar hash simples para dados sensíveis (logs)
 */
const hashSensitiveData = (data) => {
    if (!data) return null;
    const hash = crypto.createHash('sha256');
    hash.update(data + process.env.JWT_SECRET);
    return hash.digest('hex').substring(0, 16);
};

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
    // Documentos
    validateBI,
    validatePassport,
    validateDocument,

    // Idade
    validateMinimumAge,

    // Telefone
    validateAngolanPhone,

    // IBAN
    validateAngolanIBAN,

    // Valores
    validateAmount,

    // Senha
    validatePasswordStrength,

    // Email
    validateEmail,

    // PIN
    validatePin,

    // UUID
    validateUUID,

    // Data
    validateDate,

    // Localização
    validateAngolaCoordinates,

    // Arquivo
    validateDocumentFile,

    // Utilitários
    sanitizeInput,
    hashSensitiveData
};