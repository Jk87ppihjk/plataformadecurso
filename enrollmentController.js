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

// Busca o conteúdo do curso 
exports.getCourseModulesAndLessons = async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role; 
        const { courseId } = req.params;

        let enrolledDate;
        let isEnrolled = false;
        const now = new Date();

        // 1. Checa a matrícula
        let priceValue = 1; // Assume pago por padrão
        
        if (userRole === 'admin') {
            isEnrolled = true;
            enrolledDate = now;
        } else {
            // NOVO: Checa se o curso é pago. Se for gratuito, considera matriculado
            const [courseRows] = await db.query('SELECT price, discount_price FROM courses WHERE id = ?', [courseId]);
            priceValue = courseRows.length > 0 ? (parseFloat(courseRows[0].discount_price) > 0 ? parseFloat(courseRows[0].discount_price) : parseFloat(courseRows[0].price)) : 1;
            
            if (priceValue <= 0) {
                 isEnrolled = true;
                 enrolledDate = now; 
            } else {
                const [enrollmentRows] = await db.query('SELECT enrolled_at FROM enrollments WHERE user_id = ? AND course_id = ?', [userId, courseId]);
                
                if (enrollmentRows.length > 0) {
                    isEnrolled = true;
                    enrolledDate = new Date(enrollmentRows[0].enrolled_at);
                }
            }
        }
        
        // Se o curso for pago e o usuário não estiver matriculado, permite apenas ver as aulas gratuitas
        if (!isEnrolled && priceValue > 0) {
            // Continua a execução, mas as aulas com is_free_preview=false terão o conteúdo bloqueado
        }

        // 2. BUSCA OS MÓDULOS
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
            
            // 3. BUSCA AS AULAS (COM TRATAMENTO DE ERRO DE ROBUSTEZ)
            let lessons = [];
            try {
                 // Tenta buscar as aulas. Se a coluna 'is_free_preview' não existir, vai dar ERRO AQUI.
                const [lessonsResult] = await db.query(
                    'SELECT id, title, duration, video_url, materials_link, lesson_order, is_free_preview FROM lessons WHERE module_id = ? ORDER BY lesson_order', 
                    [mod.id]
                );
                lessons = lessonsResult;
            } catch (dbError) {
                // Se falhar (provavelmente por colunas faltando), loga o erro, garante que o array está vazio 
                // e PULA para o próximo módulo. Isso evita o TypeError na linha 143.
                console.error(`DB_ERROR: Falha ao buscar aulas. (Coluna 'is_free_preview' faltando?)`, dbError);
                mod.lessons = []; // Garante que é um array vazio para o frontend
                mod.is_error = true; 
                continue; // Pula para a próxima iteração do loop
            }
            
            mod.lessons = lessons.map(lesson => {
                // Checa o progresso
                let completed = false;
                if (isEnrolled) { // Só checa progresso se estiver matriculado
                    const [progress] = db.query('SELECT completed FROM progress WHERE user_id = ? AND lesson_id = ?', [userId, lesson.id]);
                    completed = progress.length > 0 ? progress[0].completed : false;
                }
                lesson.completed = completed;

                // 4. Lógica de Acesso: Acesso se estiver matriculado E módulo liberado OU se a aula for um preview gratuito.
                const canAccessContent = (isEnrolled && mod.is_released) || lesson.is_free_preview;

                // Se não puder acessar o conteúdo, remove a URL do vídeo/material.
                if (!canAccessContent) {
                    lesson.video_url = null;
                    lesson.materials_link = null;
                    lesson.can_access = false; // Flag para o frontend
                } else {
                    lesson.can_access = true;
                }

                return lesson;
            });

            // Se o usuário NÃO ESTIVER MATRICULADO e o curso for pago, filtra para mostrar APENAS as aulas gratuitas
            if (!isEnrolled && priceValue > 0) {
                 mod.lessons = mod.lessons.filter(l => l.is_free_preview === true);
                 // Se o módulo não tiver nenhuma aula gratuita, limpa
                 if (mod.lessons.length === 0) {
                     mod.lessons = [];
                 }
            } else if (!mod.is_released && isEnrolled) {
                 // Se estiver matriculado mas o módulo tem content drip, remove o conteúdo do vídeo das aulas não gratuitas
                 mod.lessons = mod.lessons.map(l => {
                    if (!l.is_free_preview) {
                        l.video_url = null;
                        l.materials_link = null;
                        l.can_access = false;
                    }
                    return l;
                 });
                 mod.release_date = releaseDate.toISOString().split('T')[0];
            }
        }
        
        res.json(modules);

    } catch (error) {
        // Se o erro for um erro de DB mais genérico (ex: Tabela faltando), ele cairá aqui
        console.error("Erro FATAL ao buscar módulos/aulas. DB Schema Corrompido?", error);
        res.status(500).json({ message: 'Erro ao buscar conteúdo do curso' });
    }
};

// ------------------------------------
// NOVO: PROCESSAMENTO DE PAGAMENTO (MULTI-GATEWAY)
// ------------------------------------
exports.processPaymentAndEnroll = async (req, res) => {
    try {
        const userId = req.user.id;
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

        // NOVO: 1.1. Verifica se o curso é gratuito (priceValue == 0)
        if (priceValue <= 0) {
            const [existing] = await db.query('SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?', [userId, courseId]);
            if (existing.length === 0) {
                await db.query('INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)', [userId, courseId]);
                console.log(`✅ MATRÍCULA GRATUITA REALIZADA | User ID: ${userId} | Curso: ${course.title} (ID: ${courseId})`);
            } else {
                console.log(`⚠️ MATRÍCULA GRATUITA DUPLICADA | User ID: ${userId} | Curso: ${course.title} (ID: ${courseId})`);
            }
            
            return res.json({
                message: `Matrícula gratuita concluída.`,
                paymentStatus: 'APROVED', 
                courseId: courseId,
                details: { status: 'FREE_COURSE' },
            });
        }
        // Fim da verificação gratuita
        
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
                
                // NOVO LOG DE SUCESSO E MATRÍCULA REALIZADA
                console.log(`✅ MATRÍCULA REALIZADA | Status: ${paymentResult.status} | User ID: ${userId} | Curso: ${course.title} (ID: ${courseId}) | Gateway: ${gateway}`);
            } else {
                 // NOVO LOG DE MATRÍCULA DUPLICADA
                console.log(`⚠️ MATRÍCULA DUPLICADA | Status: ${paymentResult.status} | User ID: ${userId} | Curso: ${course.title} (ID: ${courseId}) | Usuário já matriculado.`);
            }
        } else {
             // NOVO LOG DE PAGAMENTO RECUSADO
             console.log(`❌ PAGAMENTO RECUSADO | Status: ${paymentResult.status} | User ID: ${userId} | Curso: ${course.title} (ID: ${courseId}) | Mensagem: ${paymentResult.message || 'Erro desconhecido.'}`);

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
