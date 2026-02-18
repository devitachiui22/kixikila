# KixikilaHub Backend

Plataforma de Kixikila Digital para Angola - Fintech Social de Poupança Colaborativa.

## 📋 Sobre o Projeto

KixikilaHub é uma plataforma completa para gestão de grupos de poupança (kixikilas) em Angola, permitindo que usuários criem e participem de grupos de poupança, realizem depósitos, saques e gerenciem suas finanças de forma colaborativa.

### Características Principais

- **Autenticação Segura**: Login com email/senha ou Google, verificação de email obrigatória
- **KYC**: Verificação de identidade com BI ou Passaporte
- **Wallet Digital**: Carteira com saldo disponível e bloqueado, PIN de segurança
- **Grupos Kixikila**: Criação e gestão de grupos de poupança com ciclos automáticos
- **Chat em Tempo Real**: Comunicação entre membros do grupo via WebSocket
- **Pagamentos Simulados**: Mocks realistas para Multicaixa Express, IBAN e Kwik
- **Segurança Financeira**: Limites diários, taxas transparentes, auditoria completa

## 🚀 Tecnologias

- **Runtime**: Node.js 20.x LTS
- **Framework**: Express 4.18.x
- **Banco de Dados**: PostgreSQL 15.x (Neon Serverless)
- **Autenticação**: JWT + Bcrypt
- **Realtime**: Socket.IO
- **Validação**: Joi
- **Logs**: Winston
- **Rate Limiting**: express-rate-limit
- **Segurança**: Helmet, CORS, XSS-Clean, HPP
- **Upload**: Multer + Sharp
- **Agendamento**: node-cron
- **Email**: Nodemailer

## 📁 Estrutura do Projeto
