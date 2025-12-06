// jk87ppihjk/plataformadecurso/plataformadecurso-b9c6e7aa4fd932f59defd62dc89fd320bb2ee6e0/pgmt.js

const axios = require('axios');
const db = require('./database');
require('dotenv').config();

// Configurações Mock do AbacatePay
const ABACATEPAY_API_KEY = process.env.ABACATEPAY_API_KEY || 'MOCK_API_KEY';
const API_ENDPOINT = 'https://api.abacatepay.com/v1'; // Endpoint AbacatePay

// Função auxiliar para simular a criação de cliente (Necessário para a cobrança)
exports.createCustomer = async (customerData) => {
    console.log(`[ABACATEPAY MOCK] Tentando criar cliente: ${customerData.email}`);
    
    // Simulação de resposta da API
    return {
        id: `cust-${Math.random().toString(36).substring(2).toUpperCase()}`,
        status: 'created',
        message: 'Cliente criado com sucesso (MOCK).'
    };

    /*
    // Código real: Descomentar em produção
    const response = await axios.post(`${API_ENDPOINT}/customer/create`, customerData, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ABACATEPAY_API_KEY}` },
    });
    return response.data;
    */
};


/**
 * Simula a criação de uma cobrança (Billing) para Cartão ou PIX.
 * @param {string} courseExternalId - ID do curso (para o produto AbacatePay).
 * @param {string} courseTitle - Nome do curso.
 * @param {number} priceInCents - Preço do curso em CENTAVOS.
 * @param {string} paymentMethod - 'PIX' ou 'CREDIT_CARD'.
 * @param {object} customerData - Dados do cliente (name, email, taxId, cellphone).
 * @param {object} cardDetails - Dados do cartão (se aplicável).
 * @returns {object} Dados da cobrança criada.
 */
exports.createBilling = async (courseExternalId, courseTitle, priceInCents, paymentMethod, customerData, cardDetails = null) => {
    
    const priceValue = (priceInCents / 100).toFixed(2);
    
    // Simulação do payload, seguindo a estrutura da AbacatePay
    const data = {
        frequency: 'ONE_TIME',
        methods: [paymentMethod],
        products: [
            {
                externalId: courseExternalId,
                name: courseTitle,
                description: `Matrícula no curso ${courseTitle}.`,
                quantity: 1,
                price: priceInCents, // Preço em centavos
            },
        ],
        returnUrl: 'https://plataformadecurso.onrender.com/billing',
        completionUrl: 'https://plataformadecurso.onrender.com/completion',
        customer: customerData,
    };

    console.log(`[ABACATEPAY MOCK] Tentando criar cobrança via ${paymentMethod} no valor de R$${priceValue}`);

    if (paymentMethod === 'PIX') {
        const pixCode = `PIX-ABACATEPAY-${Date.now()}`;
        
        // CORREÇÃO: Usando a API pública 'api.qrserver.com' para gerar a imagem do QR Code
        const qrCodeData = `Valor: ${priceValue}|CPF: ${customerData.taxId}|Code: ${pixCode}`;
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeData)}`;
        
        return {
            status: 'PENDING',
            transactionId: `ABCT-PIX-${Date.now()}`,
            pixCode: pixCode,
            qrCodeUrl: qrCodeUrl, // URL que o frontend vai usar para renderizar
            expirationTime: 1800, // 30 minutos
            message: 'Cobrança PIX gerada. Aguardando pagamento.',
        };
    } 
    
    if (paymentMethod === 'CREDIT_CARD') {
        if (cardDetails && cardDetails.cvv === '000') {
            return { status: 'DECLINED', message: 'Pagamento recusado pela operadora (CVV 000).', transactionId: null };
        }

        return {
            status: 'APROVED',
            transactionId: `ABCT-CC-${Date.now()}`,
            last4Digits: cardDetails ? cardDetails.cardNumber.slice(-4) : 'MOCK',
            message: 'Pagamento via Cartão de Crédito aprovado.',
        };
    }
    
    return { status: 'ERROR', message: 'Método de pagamento não suportado.' };
};
