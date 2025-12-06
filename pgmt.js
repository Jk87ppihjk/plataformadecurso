// jk87ppihjk/plataformadecurso/plataformadecurso-b9c6e7aa4fd932f59defd62dc89fd320bb2ee6e0/pgmt.js

const db = require('./database');
// const axios = require('axios'); // Necessário em integração real, mas mockado aqui.

// Configurações mock do AbacatePay
const ABACATEPAY_API_KEY = process.env.ABACATEPAY_API_KEY || 'MOCK_API_KEY';
const ABACATEPAY_ENDPOINT = 'https://mock.abacatepay.com/v1';

/**
 * Simula o processamento de pagamento via Cartão de Crédito (Checkout Transparente).
 * @param {object} cardDetails - Dados do cartão (número, nome, cvv, validade).
 * @param {number} amount - Valor da transação.
 * @param {object} personalDetails - Dados do cliente.
 * @returns {object} status: 'APROVED' ou 'DECLINED', transactionId, last4Digits.
 */
exports.processCreditCardPayment = async (cardDetails, amount, personalDetails) => {
    // 1. Simulação: Validação de Segurança MOCK
    // Se o CVV for '000' ou o número do cartão terminar em '1111', simula recusa.
    if (cardDetails.cvv === '000' || cardDetails.cardNumber.endsWith('1111')) {
        return { status: 'DECLINED', message: 'Pagamento recusado pela operadora (Simulação de recusa).' };
    }
    
    // 2. Retorno Simulado de Sucesso
    return {
        status: 'APROVED',
        transactionId: `ABCT-${Date.now()}`,
        last4Digits: cardDetails.cardNumber.slice(-4),
        message: 'Pagamento via Cartão de Crédito aprovado.',
    };
};

/**
 * Simula a geração de um pagamento PIX e a criação de um QR Code/Código.
 * @param {number} amount - Valor da transação.
 * @param {object} personalDetails - Dados do cliente.
 * @returns {object} status: 'PENDING', pixCode, qrCodeUrl, expirationTime.
 */
exports.generatePixPayment = async (amount, personalDetails) => {
    // 1. Simulação: Código e QR Code
    const pixCode = `ABACATEPAY.PIX.${Math.random().toString(36).substring(2).toUpperCase()}`;
    
    // 2. Retorno Simulado
    return {
        status: 'PENDING', // O PIX deve sempre iniciar como PENDENTE
        transactionId: `ABCT-PIX-${Date.now()}`,
        pixCode: pixCode,
        qrCodeUrl: `https://via.placeholder.com/200?text=QR+Code+R$${amount}`, // QR Code de exemplo
        expirationTime: 1800, // 30 minutos
        message: 'Pagamento PIX gerado. Aguardando confirmação.',
    };
};
