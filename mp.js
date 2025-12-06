const { MercadoPagoConfig, Payment } = require('mercadopago');
require('dotenv').config();

// Inicializa o SDK com o Access Token (configure MP_ACCESS_TOKEN no seu .env)
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const payment = new Payment(client);

exports.processPayment = async (paymentData) => {
    try {
        const {
            transaction_amount,
            description,
            payment_method_id, // 'pix', 'master', 'visa'...
            email,
            token, // Apenas Cartão
            installments, // Apenas Cartão
            issuer_id, // Apenas Cartão
            identification // { type: 'CPF', number: '...' }
        } = paymentData;

        // Monta o objeto de requisição para o Mercado Pago
        const requestBody = {
            transaction_amount: Number(transaction_amount),
            description: description,
            payment_method_id: payment_method_id,
            payer: {
                email: email,
                identification: identification
            },
        };

        // Se NÃO for Pix, adiciona dados do cartão
        if (payment_method_id !== 'pix') {
            requestBody.token = token;
            requestBody.installments = Number(installments);
            requestBody.issuer_id = issuer_id;
        }

        console.log(`[MERCADO PAGO] Criando pagamento: ${payment_method_id} - R$${transaction_amount}`);

        // Chama a API do Mercado Pago
        const response = await payment.create({ body: requestBody });
        
        // Mapeia o status do MP para o padrão do nosso sistema
        // MP Status: approved, pending, in_process, rejected
        let systemStatus = 'ERROR';
        if (response.status === 'approved') systemStatus = 'APROVED';
        if (response.status === 'pending' || response.status === 'in_process') systemStatus = 'PENDING';
        if (response.status === 'rejected') systemStatus = 'DECLINED';

        // Prepara o retorno
        const result = {
            status: systemStatus,
            transactionId: response.id,
            message: response.status_detail,
            raw: response // Retorna o objeto original se precisar debugar
        };

        // Se for PIX, adiciona o QR Code (Base64 e Copia e Cola)
        if (payment_method_id === 'pix') {
            const pointOfInteraction = response.point_of_interaction;
            if (pointOfInteraction && pointOfInteraction.transaction_data) {
                result.qrCodeBase64 = pointOfInteraction.transaction_data.qr_code_base64;
                result.qrCodeText = pointOfInteraction.transaction_data.qr_code;
                result.ticketUrl = pointOfInteraction.transaction_data.ticket_url; // Link externo se quiser
            }
        }

        return result;

    } catch (error) {
        console.error('[MERCADO PAGO ERROR]', error);
        return {
            status: 'ERROR',
            message: error.message || 'Erro ao processar pagamento no Mercado Pago'
        };
    }
};
