// =====================================================
// KIXIKILAHUB - SERVIÇO DE EMAIL
// Envio de emails de verificação, recuperação de senha e notificações
// =====================================================

const nodemailer = require('nodemailer');
const config = require('../config/env');
const logger = require('../utils/logger');

// Configuração do transporter
let transporter;

if (config.server.isProduction) {
    // Configuração real de produção
    transporter = nodemailer.createTransport({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.secure,
        auth: {
            user: config.email.user,
            pass: config.email.password
        },
        tls: {
            rejectUnauthorized: false
        }
    });
} else {
    // Em desenvolvimento, usar ethereal.email para testes
    // Ou log apenas
    logger.info('📧 Modo de desenvolvimento: emails serão apenas logados');

    // Criar transporter de teste (ethereal)
    nodemailer.createTestAccount((err, account) => {
        if (err) {
            logger.warn('Não foi possível criar conta de teste ethereal:', err);
            return;
        }

        transporter = nodemailer.createTransport({
            host: account.smtp.host,
            port: account.smtp.port,
            secure: account.smtp.secure,
            auth: {
                user: account.user,
                pass: account.pass
            }
        });

        logger.info('📧 Transporter de teste criado com ethereal.email');
    });
}

// =====================================================
// ENVIAR EMAIL DE VERIFICAÇÃO
// =====================================================
const sendVerificationEmail = async (email, name, token) => {
    const verificationUrl = `${config.email.verificationUrl}?token=${token}`;

    const mailOptions = {
        from: config.email.from,
        to: email,
        subject: 'Bem-vindo ao KixikilaHub - Verifique seu email',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: 'Arial', sans-serif;
                        line-height: 1.6;
                        color: #333;
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                    }
                    .header {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 30px;
                        text-align: center;
                        border-radius: 10px 10px 0 0;
                    }
                    .content {
                        background: #f9f9f9;
                        padding: 30px;
                        border-radius: 0 0 10px 10px;
                    }
                    .button {
                        display: inline-block;
                        padding: 12px 24px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        text-decoration: none;
                        border-radius: 5px;
                        margin: 20px 0;
                        font-weight: bold;
                    }
                    .footer {
                        margin-top: 20px;
                        text-align: center;
                        color: #666;
                        font-size: 12px;
                    }
                    .warning {
                        background: #fff3cd;
                        border: 1px solid #ffeeba;
                        color: #856404;
                        padding: 10px;
                        border-radius: 5px;
                        margin: 20px 0;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>KixikilaHub</h1>
                    <p>Sua plataforma de poupança colaborativa</p>
                </div>
                <div class="content">
                    <h2>Olá, ${name}!</h2>
                    <p>Bem-vindo ao KixikilaHub! Estamos muito felizes em tê-lo conosco.</p>
                    <p>Para começar a usar sua conta, por favor verifique seu endereço de email clicando no botão abaixo:</p>

                    <div style="text-align: center;">
                        <a href="${verificationUrl}" class="button">Verificar meu email</a>
                    </div>

                    <p>Se o botão não funcionar, copie e cole o seguinte link no seu navegador:</p>
                    <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">
                        ${verificationUrl}
                    </p>

                    <div class="warning">
                        <strong>⚠️ Importante:</strong> Este link é válido por 24 horas.
                        Se você não solicitou esta verificação, ignore este email.
                    </div>
                </div>
                <div class="footer">
                    <p>© ${new Date().getFullYear()} KixikilaHub. Todos os direitos reservados.</p>
                    <p>Luanda, Angola</p>
                </div>
            </body>
            </html>
        `
    };

    return sendEmail(mailOptions);
};

// =====================================================
// ENVIAR EMAIL DE RECUPERAÇÃO DE SENHA
// =====================================================
const sendPasswordResetEmail = async (email, name, token) => {
    const resetUrl = `${config.server.clientUrl}/reset-password?token=${token}`;

    const mailOptions = {
        from: config.email.from,
        to: email,
        subject: 'KixikilaHub - Recuperação de Senha',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: 'Arial', sans-serif;
                        line-height: 1.6;
                        color: #333;
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                    }
                    .header {
                        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                        color: white;
                        padding: 30px;
                        text-align: center;
                        border-radius: 10px 10px 0 0;
                    }
                    .content {
                        background: #f9f9f9;
                        padding: 30px;
                        border-radius: 0 0 10px 10px;
                    }
                    .button {
                        display: inline-block;
                        padding: 12px 24px;
                        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                        color: white;
                        text-decoration: none;
                        border-radius: 5px;
                        margin: 20px 0;
                        font-weight: bold;
                    }
                    .footer {
                        margin-top: 20px;
                        text-align: center;
                        color: #666;
                        font-size: 12px;
                    }
                    .warning {
                        background: #fff3cd;
                        border: 1px solid #ffeeba;
                        color: #856404;
                        padding: 10px;
                        border-radius: 5px;
                        margin: 20px 0;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>KixikilaHub</h1>
                    <p>Recuperação de Senha</p>
                </div>
                <div class="content">
                    <h2>Olá, ${name}!</h2>
                    <p>Recebemos uma solicitação para redefinir sua senha no KixikilaHub.</p>
                    <p>Clique no botão abaixo para criar uma nova senha:</p>

                    <div style="text-align: center;">
                        <a href="${resetUrl}" class="button">Redefinir minha senha</a>
                    </div>

                    <p>Se o botão não funcionar, copie e cole o seguinte link no seu navegador:</p>
                    <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">
                        ${resetUrl}
                    </p>

                    <div class="warning">
                        <strong>⚠️ Importante:</strong> Este link é válido por 1 hora.
                        Se você não solicitou esta recuperação, ignore este email e sua senha permanecerá a mesma.
                    </div>
                </div>
                <div class="footer">
                    <p>© ${new Date().getFullYear()} KixikilaHub. Todos os direitos reservados.</p>
                    <p>Luanda, Angola</p>
                </div>
            </body>
            </html>
        `
    };

    return sendEmail(mailOptions);
};

// =====================================================
// ENVIAR NOTIFICAÇÃO DE PAGAMENTO
// =====================================================
const sendPaymentNotification = async (email, name, paymentDetails) => {
    const mailOptions = {
        from: config.email.from,
        to: email,
        subject: `KixikilaHub - Pagamento ${paymentDetails.type === 'deposit' ? 'Recebido' : 'Realizado'}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: 'Arial', sans-serif;
                        line-height: 1.6;
                        color: #333;
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                    }
                    .header {
                        background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
                        color: white;
                        padding: 30px;
                        text-align: center;
                        border-radius: 10px 10px 0 0;
                    }
                    .content {
                        background: #f9f9f9;
                        padding: 30px;
                        border-radius: 0 0 10px 10px;
                    }
                    .details {
                        background: white;
                        padding: 20px;
                        border-radius: 10px;
                        margin: 20px 0;
                        border: 1px solid #ddd;
                    }
                    .amount {
                        font-size: 24px;
                        font-weight: bold;
                        color: ${paymentDetails.type === 'deposit' ? '#28a745' : '#dc3545'};
                        text-align: center;
                        margin: 20px 0;
                    }
                    .footer {
                        margin-top: 20px;
                        text-align: center;
                        color: #666;
                        font-size: 12px;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>KixikilaHub</h1>
                    <p>Notificação de Pagamento</p>
                </div>
                <div class="content">
                    <h2>Olá, ${name}!</h2>

                    <div class="amount">
                        ${paymentDetails.type === 'deposit' ? '+' : '-'} ${paymentDetails.amount.toLocaleString()} KZ
                    </div>

                    <div class="details">
                        <h3>Detalhes da Transação:</h3>
                        <p><strong>Tipo:</strong> ${paymentDetails.type === 'deposit' ? 'Depósito' : 'Saque'}</p>
                        <p><strong>Método:</strong> ${paymentDetails.method}</p>
                        <p><strong>Data:</strong> ${new Date(paymentDetails.date).toLocaleString('pt-AO')}</p>
                        <p><strong>Referência:</strong> ${paymentDetails.reference}</p>
                        <p><strong>Taxa:</strong> ${paymentDetails.fee.toLocaleString()} KZ</p>
                        <p><strong>Valor Líquido:</strong> ${paymentDetails.netAmount.toLocaleString()} KZ</p>
                    </div>

                    <p>Seu saldo atual é: <strong>${paymentDetails.newBalance.toLocaleString()} KZ</strong></p>
                </div>
                <div class="footer">
                    <p>© ${new Date().getFullYear()} KixikilaHub. Todos os direitos reservados.</p>
                    <p>Luanda, Angola</p>
                </div>
            </body>
            </html>
        `
    };

    return sendEmail(mailOptions);
};

// =====================================================
// ENVIAR NOTIFICAÇÃO DE GRUPO
// =====================================================
const sendGroupNotification = async (email, name, groupDetails) => {
    const mailOptions = {
        from: config.email.from,
        to: email,
        subject: `KixikilaHub - Atualização do Grupo ${groupDetails.groupName}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: 'Arial', sans-serif;
                        line-height: 1.6;
                        color: #333;
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                    }
                    .header {
                        background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
                        color: white;
                        padding: 30px;
                        text-align: center;
                        border-radius: 10px 10px 0 0;
                    }
                    .content {
                        background: #f9f9f9;
                        padding: 30px;
                        border-radius: 0 0 10px 10px;
                    }
                    .info {
                        background: white;
                        padding: 20px;
                        border-radius: 10px;
                        margin: 20px 0;
                        border: 1px solid #ddd;
                    }
                    .highlight {
                        background: #e3f2fd;
                        padding: 15px;
                        border-radius: 5px;
                        margin: 10px 0;
                    }
                    .footer {
                        margin-top: 20px;
                        text-align: center;
                        color: #666;
                        font-size: 12px;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>KixikilaHub</h1>
                    <p>Notificação de Grupo</p>
                </div>
                <div class="content">
                    <h2>Olá, ${name}!</h2>

                    <div class="info">
                        <h3>${groupDetails.groupName}</h3>
                        <p>${groupDetails.message}</p>
                    </div>

                    ${groupDetails.highlight ? `
                        <div class="highlight">
                            <strong>${groupDetails.highlight}</strong>
                        </div>
                    ` : ''}

                    ${groupDetails.nextPayment ? `
                        <p><strong>Próximo pagamento:</strong> ${new Date(groupDetails.nextPayment).toLocaleDateString('pt-AO')}</p>
                    ` : ''}
                </div>
                <div class="footer">
                    <p>© ${new Date().getFullYear()} KixikilaHub. Todos os direitos reservados.</p>
                    <p>Luanda, Angola</p>
                </div>
            </body>
            </html>
        `
    };

    return sendEmail(mailOptions);
};

// =====================================================
// FUNÇÃO GENÉRICA PARA ENVIAR EMAIL
// =====================================================
const sendEmail = async (mailOptions) => {
    try {
        if (!transporter) {
            // Se não há transporter configurado, apenas log
            logger.info('📧 Email seria enviado:', {
                to: mailOptions.to,
                subject: mailOptions.subject,
                html: mailOptions.html.substring(0, 200) + '...'
            });
            return { success: true, preview: null };
        }

        const info = await transporter.sendMail(mailOptions);

        if (config.server.isDevelopment) {
            // Em desenvolvimento, mostrar preview do ethereal
            const previewUrl = nodemailer.getTestMessageUrl(info);
            logger.info(`📧 Email enviado: ${previewUrl}`);
            return { success: true, preview: previewUrl };
        }

        logger.info(`📧 Email enviado para ${mailOptions.to}`);
        return { success: true };

    } catch (error) {
        logger.error('❌ Erro ao enviar email:', error);
        return { success: false, error: error.message };
    }
};

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendPaymentNotification,
    sendGroupNotification,
    sendEmail
};