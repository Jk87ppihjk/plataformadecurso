const db = require('./database');

// ------------------------------------
// AVALIAÇÕES (CURSO)
// ------------------------------------

// Criar/Atualizar avaliação de um curso
exports.submitCourseReview = async (req, res) => {
    try {
        const userId = req.user.id;
        const { courseId, rating, comment } = req.body;

        if (!courseId || !rating || rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'Dados de avaliação inválidos. Necessário courseId e rating (1-5).' });
        }

        // 1. Checa a matrícula (ou se o curso é gratuito)
        const [course] = await db.query('SELECT price, discount_price FROM courses WHERE id = ?', [courseId]);
        const price = course.length > 0 ? (parseFloat(course[0].discount_price) > 0 ? parseFloat(course[0].discount_price) : parseFloat(course[0].price)) : 1;

        if (price > 0) {
            const [enrollment] = await db.query('SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?', [userId, courseId]);
            if (enrollment.length === 0) {
                 return res.status(403).json({ message: 'Acesso negado. Apenas alunos matriculados podem avaliar este curso.' });
            }
        }

        // 2. Insere ou Atualiza (UPSERT)
        const query = `
            INSERT INTO course_reviews (course_id, user_id, rating, comment) 
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                rating = VALUES(rating), 
                comment = VALUES(comment),
                created_at = CURRENT_TIMESTAMP
        `;
        
        await db.query(query, [courseId, userId, rating, comment || null]);

        res.status(201).json({ message: 'Avaliação submetida/atualizada com sucesso.' });

    } catch (error) {
        console.error('Erro ao submeter avaliação:', error);
        res.status(500).json({ message: 'Erro interno ao submeter avaliação.' });
    }
};

// Obter avaliações de um curso
exports.getCourseReviews = async (req, res) => {
    try {
        const { courseId } = req.params;

        const [reviews] = await db.query(`
            SELECT 
                r.id, r.rating, r.comment, r.created_at, 
                u.name as user_name, u.avatar_url as user_avatar
            FROM course_reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.course_id = ?
            ORDER BY r.created_at DESC
        `, [courseId]);

        res.json(reviews);
    } catch (error) {
        console.error('Erro ao buscar avaliações:', error);
        res.status(500).json({ message: 'Erro interno ao buscar avaliações.' });
    }
};


// ------------------------------------
// COMENTÁRIOS (AULA)
// ------------------------------------

// Adicionar um comentário (ou resposta) a uma aula
exports.submitLessonComment = async (req, res) => {
    try {
        const userId = req.user.id;
        const { lessonId, comment, parentCommentId = null } = req.body;

        if (!lessonId || !comment) {
            return res.status(400).json({ message: 'Dados de comentário inválidos. Necessário lessonId e comment.' });
        }
        
        // 1. Checa a matrícula (apenas alunos matriculados podem comentar aulas)
        const [lesson] = await db.query('SELECT m.course_id FROM lessons l JOIN modules m ON l.module_id = m.id WHERE l.id = ?', [lessonId]);
        if (lesson.length === 0) return res.status(404).json({ message: 'Aula não encontrada.' });
        const courseId = lesson[0].course_id;

        // Se o curso for pago, checa a matrícula
        const [course] = await db.query('SELECT price, discount_price FROM courses WHERE id = ?', [courseId]);
        const price = course.length > 0 ? (parseFloat(course[0].discount_price) > 0 ? parseFloat(course[0].discount_price) : parseFloat(course[0].price)) : 1;

        if (price > 0) {
            const [enrollment] = await db.query('SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?', [userId, courseId]);
            if (enrollment.length === 0) {
                 return res.status(403).json({ message: 'Acesso negado. Apenas alunos matriculados podem comentar aulas deste curso.' });
            }
        }
        
        // 2. Insere o comentário
        const [result] = await db.query(
            'INSERT INTO lesson_comments (lesson_id, user_id, comment, parent_comment_id) VALUES (?, ?, ?, ?)',
            [lessonId, userId, comment, parentCommentId]
        );

        res.status(201).json({ message: 'Comentário submetido com sucesso.', commentId: result.insertId });

    } catch (error) {
        console.error('Erro ao submeter comentário:', error);
        res.status(500).json({ message: 'Erro interno ao submeter comentário.' });
    }
};

// Obter comentários de uma aula
exports.getLessonComments = async (req, res) => {
    try {
        const { lessonId } = req.params;

        // Traz apenas os comentários pais (parent_comment_id IS NULL)
        const [parentComments] = await db.query(`
            SELECT 
                lc.id, lc.comment, lc.created_at, 
                u.name as user_name, u.avatar_url as user_avatar,
                lc.parent_comment_id
            FROM lesson_comments lc
            JOIN users u ON lc.user_id = u.id
            WHERE lc.lesson_id = ? AND lc.parent_comment_id IS NULL
            ORDER BY lc.created_at ASC
        `, [lessonId]);

        // Para cada comentário pai, busca as respostas (simplesmente anexadas)
        for (let comment of parentComments) {
            const [replies] = await db.query(`
                SELECT 
                    lc.id, lc.comment, lc.created_at, 
                    u.name as user_name, u.avatar_url as user_avatar,
                    lc.parent_comment_id
                FROM lesson_comments lc
                JOIN users u ON lc.user_id = u.id
                WHERE lc.parent_comment_id = ?
                ORDER BY lc.created_at ASC
            `, [comment.id]);
            comment.replies = replies;
        }

        res.json(parentComments);
    } catch (error) {
        console.error('Erro ao buscar comentários:', error);
        res.status(500).json({ message: 'Erro interno ao buscar comentários.' });
    }
};

// NOVO: Função para obter link de compartilhamento (simples, apenas constrói a URL)
exports.getShareLink = async (req, res) => {
    try {
        const { courseId } = req.params;
        // NOTA: Em um projeto real, você usaria uma variável de ambiente (process.env.FRONTEND_URL)
        const baseUrl = process.env.FRONTEND_URL || 'https://plataformadecurso.com'; 
        
        res.json({ 
            shareUrl: `${baseUrl}/courses/${courseId}` 
        });
    } catch (error) {
        console.error('Erro ao gerar link de compartilhamento:', error);
        res.status(500).json({ message: 'Erro interno ao gerar link de compartilhamento.' });
    }
};
