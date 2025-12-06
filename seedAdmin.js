const db = require('./database');
const bcrypt = require('bcrypt');

async function createAdmin() {
    try {
        const email = 'adm123@admin.com'; // Usaremos este email para login ou apenas o nome se preferir lógica diferente, mas mantive padrão email
        const password = 'adm123';
        const name = 'Administrador';

        // Verifica se já existe
        const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            console.log('Admin já existe.');
            process.exit();
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await db.query(
            'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', 
            [name, email, hashedPassword, 'admin']
        );

        console.log('Admin criado com sucesso!');
        console.log('Login: adm123@admin.com'); // Ajuste conforme seu frontend envia o login (email ou user)
        console.log('Senha: adm123');
        process.exit();

    } catch (error) {
        console.error('Erro ao criar admin:', error);
        process.exit(1);
    }
}

createAdmin();
