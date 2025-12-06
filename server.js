const express = require('express');
const cors = require('cors');
const routes = require('./routes');
require('dotenv').config();

const app = express();

// Middlewares
app.use(cors({ origin: '*' })); // Liberado para todos os domínios
app.use(express.json()); // Para entender JSON no body das requisições (útil para dados não-arquivos)

// NOTA: O Multer não é usado como middleware global (app.use(multer...)).
// Ele é usado como middleware específico nas rotas de admin (routes.js) para lidar com multipart/form-data.

// Rotas
app.use('/api', routes);

// Rota de teste
app.get('/', (req, res) => {
    res.send('API Coursera Clone funcionando! (Admin e Uploads Ativos)');
});

// Inicialização do Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Conectado ao banco: ${process.env.DB_HOST}`);
});
