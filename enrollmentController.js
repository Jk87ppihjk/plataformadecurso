const db = require('./database');
const abacateController = require('./pgmt'); // Importa o controller AbacatePay (original)
const mpController = require('./mp'); // Importa o novo controller Mercado Pago

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

// Busca o conteúdo do curso (Sem alterações)
exports.getCourseModulesAndLessons = async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role; 
        const { courseId } = req.params;

        let enrolledDate;
        let isEnrolled = false;
        const now = new Date();

        if (userRole === 'admin') {
            isEnrolled = true;
            enrolledDate = now;
        } else {
            const [enrollmentRows] = await db.query('SELECT enrolled_at FROM enrollments WHERE user_id = ? AND course_id = ?', [userId, courseId]);
            
            if (enrollmentRows.length > 0) {
                isEnrolled = true;
                enrolledDate = new Date(enrollmentRows[0].enrolled_at);
            }
        }

        if (!isEnrolled) {
            return res.status(403).json({ message: 'Acesso negado. Usuário não matriculado neste curso.' });
        }
        
        const [modules] = await db.query(
            'SELECT * FROM modules WHERE course_id = ? ORDER BY module_order', 
            [courseId]
        );
        
        for (let mod of modules) {
            const daysToWait = mod.release_days_after_enrollment || 0;
            const releaseDate = new Date(enrolledDate);
            releaseDate.setDate(releaseDate.getDate() + daysToWait);

            const isReleased = userRole === 'admin' ? true : (now >= releaseDate);
            mod.is_released = isReleased;
            
            if (mod.is_released) {
                const [lessons] = await db.query(
                    'SELECT id, title, duration, video_url, materials_link, lesson_order FROM lessons WHERE module_id = ? ORDER BY lesson_order', 
                    [mod.id]
                );
                
                for (let lesson of lessons) {
                    const [progress] = await db.query('SELECT completed FROM progress WHERE user_id = ? AND lesson_id = ?', [userId, lesson.id]);
                    lesson.completed = progress.length > 0 ? progress[0].completed : false;
                }
                mod.lessons = lessons;
            } else {
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

// ------------------------------------
// NOVO: PROCESSAMENTO DE PAGAMENTO (MULTI-GATEWAY)
// ------------------------------------
exports.processPaymentAndEnroll = async (req, res) => {
    try {
        const userId = req.user.id;
        // Agora aceita 'gateway' no body. Default é 'abacate'
        const { courseId, paymentMethod, cardDetails, personalDetails, gateway = 'abacate' } = req.body;

        if (!courseId || !personalDetails || !personalDetails.email || !personalDetails.fullName) {
             return res.status(400).json({ message: 'Dados de compra incompletos.' });
        }
        
        // 1. Obter preço do curso
        const [courseRows] = await db.query('SELECT title, price, discount_price FROM courses WHERE id = ?', [courseId]);
        if (courseRows.length === 0) {
            return res.status(404).json({ message: 'Curso não encontrado.' });
        }
        const course = courseRows[0];
        const priceValue = parseFloat(course.discount_price) > 0 ? parseFloat(course.discount_price) : parseFloat(course.price);

        let paymentResult;

        // ----------------------------------------
        // OPÇÃO A: MERCADO PAGO
        // ----------------------------------------
        if (gateway === 'mercadopago') {
            const mpMethodId = paymentMethod === 'pix' ? 'pix' : (cardDetails?.payment_method_id || 'credit_card');
            
            const mpData = {
                transaction_amount: priceValue, // MP aceita float (ex: 100.50)
                description: `Curso: ${course.title}`,
                payment_method_id: mpMethodId,
                email: personalDetails.email,
                identification: {
                    type: 'CPF', 
                    number: personalDetails.cpf ? personalDetails.cpf.replace(/[^0-9]/g, '') : ''
                }
            };

            // Se for cartão, adiciona campos específicos do cardDetails
            if (mpMethodId !== 'pix' && cardDetails) {
                mpData.token = cardDetails.token;
                mpData.installments = cardDetails.installments;
                mpData.issuer_id = cardDetails.issuer_id;
            }

            paymentResult = await mpController.processPayment(mpData);
        } 
        
        // ----------------------------------------
        // OPÇÃO B: ABACATE PAY (Default)
        // ----------------------------------------
        else {
            const priceInCents = Math.round(priceValue * 100);
            const customerData = {
                name: personalDetails.fullName,
                cellphone: personalDetails.cellphone || '(11) 99999-9999', 
                email: personalDetails.email,
                taxId: personalDetails.cpf ? personalDetails.cpf.replace(/[^0-9]/g, '') : '',
            };
            
            const abacateMethod = paymentMethod === 'credit' ? 'CREDIT_CARD' : 'PIX';

            paymentResult = await abacateController.createBilling(
                `COURSE-${courseId}`,
                course.title,
                priceInCents,
                abacateMethod,
                customerData,
                cardDetails 
            );
        }

        // ----------------------------------------
        // VERIFICAÇÃO E MATRÍCULA
        // ----------------------------------------
        if (paymentResult.status === 'APROVED' || paymentResult.status === 'PENDING') {
            
            const [existing] = await db.query('SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?', [userId, courseId]);
            if (existing.length === 0) {
                await db.query('INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)', [userId, courseId]);
            }
        } else {
             return res.status(400).json({ message: `Pagamento não concluído. Status: ${paymentResult.status} - ${paymentResult.message || ''}` });
        }
        
        res.json({
            message: `Processamento concluído. Status: ${paymentResult.status}`,
            paymentStatus: paymentResult.status,
            courseId: courseId,
            details: paymentResult, // Inclui QR Code (Base64/Text) se for Pix MP
        });

    } catch (error) {
        console.error('Erro no processamento de pagamento:', error);
        res.status(500).json({ message: 'Erro interno ao finalizar a compra' });
    }
};
