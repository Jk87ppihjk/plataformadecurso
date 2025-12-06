const db = require('./database');
const paymentController = require('./pgmt');

// Matricular em um curso (Sem alterações)
exports.enroll = async (req, res) => {
    try {
        const userId = req.user.id;
        const { courseId } = req.body;

        await db.query('INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)', [userId, courseId]);
        res.status(201).json({ message: 'Matrícula realizada com sucesso!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao matricular' });
    }
};

// ------------------------------------
// NOVO: PROCESSAMENTO DE PAGAMENTO REAL (ABACATEPAY)
// ------------------------------------
exports.processPaymentAndEnroll = async (req, res) => {
    try {
        const userId = req.user.id;
        const { courseId, paymentMethod, cardDetails, personalDetails } = req.body;

        if (!courseId || !paymentMethod || !personalDetails || !personalDetails.email || !personalDetails.cpf) {
             return res.status(400).json({ message: 'Dados de compra incompletos.' });
        }
        
        // 1. Obter o preço do curso (para enviar ao gateway)
        const [courseRows] = await db.query('SELECT price, discount_price FROM courses WHERE id = ?', [courseId]);
        if (courseRows.length === 0) {
            return res.status(404).json({ message: 'Curso não encontrado.' });
        }
        const course = courseRows[0];
        // Calcula o preço final (se houver desconto)
        const finalPrice = parseFloat(course.discount_price) > 0 ? parseFloat(course.discount_price) : parseFloat(course.price);

        let paymentResult;
        
        // 2. Chamar o Gateway de Pagamento (AbacatePay Mock)
        if (paymentMethod === 'credit') {
            if (!cardDetails) return res.status(400).json({ message: 'Dados do cartão incompletos.' });
            paymentResult = await paymentController.processCreditCardPayment(cardDetails, finalPrice, personalDetails);

        } else if (paymentMethod === 'pix') {
            paymentResult = await paymentController.generatePixPayment(finalPrice, personalDetails);
            
        } else {
            return res.status(400).json({ message: 'Método de pagamento inválido.' });
        }
        
        // 3. Verifica o Status da Transação
        if (paymentResult.status === 'APROVED' || paymentResult.status === 'PENDING') {
             // 4. Realiza a Matrícula (Enrollment) - Acesso liberado no sistema.
            const [existing] = await db.query('SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?', [userId, courseId]);
            if (existing.length === 0) {
                await db.query('INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)', [userId, courseId]);
            }
        } else {
             // Pagamento DECLINED
             return res.status(400).json({ message: `Pagamento ${paymentResult.status}: ${paymentResult.message || 'Erro no processamento.'}` });
        }
        
        // 5. Retorna o resultado da transação
        res.json({
            message: `Compra finalizada. Acesso ao curso ${paymentResult.status === 'APROVED' ? 'liberado' : 'pendente'}.`,
            paymentStatus: paymentResult.status,
            courseId: courseId,
            details: paymentResult
        });

    } catch (error) {
        console.error('Erro no processamento de pagamento e matrícula:', error);
        res.status(500).json({ message: 'Erro interno ao finalizar a compra' });
    }
};

// Listar cursos do usuário com progresso (Sem alterações)
exports.getMyCourses = async (req, res) => {
    try {
        const userId = req.user.id;
        const { status } = req.query;

        let query = `
            SELECT c.*, e.last_accessed,
            (SELECT COUNT(*) FROM lessons l 
             JOIN modules m ON l.module_id = m.id 
             WHERE m.course_id = c.id) as total_lessons,
            (SELECT COUNT(*) FROM progress p 
             JOIN lessons l ON p.lesson_id = l.id 
             JOIN modules m ON l.module_id = m.id 
             WHERE p.user_id = ? AND m.course_id = c.id AND p.completed = TRUE) as completed_lessons
            FROM courses c
            JOIN enrollments e ON c.id = e.course_id
            WHERE e.user_id = ?
        `;

        const [rows] = await db.query(query, [userId, userId]);

        const courses = rows.map(course => {
            const progress = course.total_lessons > 0 
                ? Math.round((course.completed_lessons / course.total_lessons) * 100) 
                : 0;
            return { ...course, progress };
        });

        if (status === 'Em andamento') {
            res.json(courses.filter(c => c.progress < 100));
        } else if (status === 'Concluídos') {
            res.json(courses.filter(c => c.progress === 100));
        } else {
            res.json(courses);
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar meus cursos' });
    }
};

// Marcar aula como concluída (Sem alterações)
exports.completeLesson = async (req, res) => {
    try {
        const userId = req.user.id;
        const { lessonId } = req.body;

        await db.query(
            'INSERT IGNORE INTO progress (user_id, lesson_id, completed) VALUES (?, ?, TRUE)', 
            [userId, lessonId]
        );
        res.json({ message: 'Aula concluída' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao atualizar progresso' });
    }
};

// FUNÇÃO ATUALIZADA: Busca o conteúdo do curso aplicando a lógica de liberação (Content Drip)
exports.getCourseModulesAndLessons = async (req, res) => {
    try {
        const userId = req.user.id;
        // NOVO: Captura a role do token JWT
        const userRole = req.user.role; 
        const { courseId } = req.params;

        let enrolledDate;
        let isEnrolled = false;
        const now = new Date();

        // 1. Lógica de Matrícula e Permissão (CORREÇÃO APLICADA AQUI)
        if (userRole === 'admin') {
            // Se for admin, pulamos o check de matrícula e assumimos que está "matriculado" agora
            isEnrolled = true;
            enrolledDate = now;
        } else {
            // Se for aluno (student), verifica a matrícula
            const [enrollmentRows] = await db.query('SELECT enrolled_at FROM enrollments WHERE user_id = ? AND course_id = ?', [userId, courseId]);
            
            if (enrollmentRows.length > 0) {
                isEnrolled = true;
                enrolledDate = new Date(enrollmentRows[0].enrolled_at);
            }
        }

        // Se o usuário não for admin E não estiver matriculado, nega o acesso
        if (!isEnrolled) {
            return res.status(403).json({ message: 'Acesso negado. Usuário não matriculado neste curso.' });
        }
        
        // 2. Buscar Módulos
        const [modules] = await db.query(
            'SELECT * FROM modules WHERE course_id = ? ORDER BY module_order', 
            [courseId]
        );
        
        // 3. Aplicar Lógica de Liberação
        for (let mod of modules) {
            const daysToWait = mod.release_days_after_enrollment || 0;
            
            const releaseDate = new Date(enrolledDate);
            releaseDate.setDate(releaseDate.getDate() + daysToWait);

            // Admin vê todos os módulos (isReleased = true). Aluno segue o Content Drip.
            const isReleased = userRole === 'admin' ? true : (now >= releaseDate);
            
            mod.is_released = isReleased;
            
            if (mod.is_released) {
                // Se liberado, busca as aulas e materiais
                const [lessons] = await db.query(
                    'SELECT id, title, duration, video_url, materials_link, lesson_order FROM lessons WHERE module_id = ? ORDER BY lesson_order', 
                    [mod.id]
                );
                
                // Buscar progresso do aluno para cada aula
                for (let lesson of lessons) {
                    const [progress] = await db.query('SELECT completed FROM progress WHERE user_id = ? AND lesson_id = ?', [userId, lesson.id]);
                    lesson.completed = progress.length > 0 ? progress[0].completed : false;
                }
                
                mod.lessons = lessons;
            } else {
                // Se não liberado, envia a data de liberação e esconde o conteúdo
                mod.lessons = [];
                mod.release_date = releaseDate.toISOString().split('T')[0]; 
            }
        }

        res.json(modules);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar conteúdo do curso' });
    }
};
