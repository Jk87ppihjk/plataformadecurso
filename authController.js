const db = require('./database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Todos os campos são obrigatórios' });
        }

        // Verifica se usuário já existe
        const [existingUser] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            return res.status(409).json({ message: 'Email já cadastrado' });
        }

        // Criptografa a senha
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insere no banco
        await db.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hashedPassword]);

        res.status(201).json({ message: 'Usuário criado com sucesso!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor' });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        
        if (users.length === 0) {
            return res.status(401).json({ message: 'Credenciais inválidas' });
        }

        const user = users[0];
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Credenciais inválidas' });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1d' });

        res.json({
            message: 'Login realizado com sucesso',
            token,
            user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar_url }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor' });
    }
};
