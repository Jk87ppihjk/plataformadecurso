const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// Importar Controllers
const authController = require('./authController');
const courseController = require('./courseController');
const enrollmentController = require('./enrollmentController');

// Middleware de Autenticação
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Rotas Públicas
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/courses', courseController.getAllCourses);
router.get('/courses/:id', courseController.getCourseDetails);

// Rotas Privadas (Requerem Login)
router.post('/enroll', authenticateToken, enrollmentController.enroll);
router.get('/my-courses', authenticateToken, enrollmentController.getMyCourses);
router.post('/lessons/complete', authenticateToken, enrollmentController.completeLesson);

module.exports = router;
