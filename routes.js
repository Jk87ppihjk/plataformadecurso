const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');

// Configuração do Multer (Armazena na memória RAM temporariamente)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Importar Controllers
const authController = require('./authController');
const courseController = require('./courseController');
const enrollmentController = require('./enrollmentController');
const adminController = require('./adminController');

// Middleware de Autenticação Geral (Sem alterações)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Middleware Exclusivo para Admin (Sem alterações)
const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: 'Acesso negado. Apenas administradores.' });
    }
};

// Rotas Públicas (Sem alterações)
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/courses', courseController.getAllCourses);
router.get('/courses/:id', courseController.getCourseDetails);

// Rotas de Aluno (Autenticadas)
router.post('/enroll', authenticateToken, enrollmentController.enroll);
router.get('/my-courses', authenticateToken, enrollmentController.getMyCourses);

// ROTA PARA VISUALIZAÇÃO DE AULAS COM CHECAGEM DE DRIP
router.get('/my-courses/:courseId/content', authenticateToken, enrollmentController.getCourseModulesAndLessons); 

router.post('/lessons/complete', authenticateToken, enrollmentController.completeLesson);

// Rotas de Admin (Requer Login + Role Admin) (Sem alterações nos paths)
// Nota: O adminController.js foi atualizado para lidar com os novos campos.
router.post('/admin/courses', authenticateToken, requireAdmin, upload.single('file'), adminController.createCourse);
router.post('/admin/modules', authenticateToken, requireAdmin, adminController.createModule);
router.post('/admin/lessons', authenticateToken, requireAdmin, upload.single('file'), adminController.createLesson);

module.exports = router;
