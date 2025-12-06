const db = require('./database');

// Lista todos os cursos com filtros E AVALIAÇÃO REAL
exports.getAllCourses = async (req, res) => {
    try {
        const { category, search } = req.query;

        // Query avançada: Busca dados do curso + Média de Reviews (LEFT JOIN)
        let query = `
            SELECT 
                c.id, c.title, c.description, c.instructor_name, 
                c.price, c.discount_price, c.category, c.tags, 
                c.cover_image_url, c.created_at,
                COALESCE(AVG(r.rating), 0) as average_rating,
                COUNT(r.id) as total_reviews
            FROM courses c
            LEFT JOIN course_reviews r ON c.id = r.course_id
            WHERE 1=1
        `;
        
        let params = [];

        if (category && category !== 'Todos') {
            query += ' AND c.category = ?';
            params.push(category);
        }

        if (search) {
            query += ' AND (c.title LIKE ? OR c.tags LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        // Agrupa por curso para o cálculo da média funcionar
        query += ' GROUP BY c.id';
        
        // Ordena pelos mais recentes
        query += ' ORDER BY c.created_at DESC';

        const [courses] = await db.query(query, params);

        // Formata a média para 1 casa decimal (ex: 4.5)
        const formattedCourses = courses.map(course => ({
            ...course,
            average_rating: parseFloat(course.average_rating).toFixed(1)
        }));

        res.json(formattedCourses);
    } catch (error) {
        console.error(error);
        // Fallback: Se a tabela reviews não existir, retorna sem erro fatal
        if (error.code === 'ER_NO_SUCH_TABLE') {
             console.warn("Aviso: Tabela course_reviews não encontrada. Retornando cursos sem rating.");
             const [basicCourses] = await db.query('SELECT * FROM courses');
             return res.json(basicCourses);
        }
        res.status(500).json({ message: 'Erro ao buscar cursos' });
    }
};

// Detalhes completos de um curso (Tela Detalhes do Curso)
exports.getCourseDetails = async (req, res) => {
    try {
        const { id } = req.params;

        // Dados básicos do curso
        const [courses] = await db.query('SELECT * FROM courses WHERE id = ?', [id]);
        if (courses.length === 0) return res.status(404).json({ message: 'Curso não encontrado' });
        const course = courses[0];

        // Avaliação Média e Contagem
        try {
            const [reviewStats] = await db.query('SELECT AVG(rating) as average_rating, COUNT(id) as total_reviews FROM course_reviews WHERE course_id = ?', [id]);
            course.average_rating = reviewStats[0].average_rating ? parseFloat(reviewStats[0].average_rating).toFixed(1) : '0.0';
            course.total_reviews = reviewStats[0].total_reviews;
        } catch (reviewError) {
             course.average_rating = '0.0';
             course.total_reviews = 0;
        }

        // Módulos e Aulas
        const [modules] = await db.query('SELECT * FROM modules WHERE course_id = ? ORDER BY module_order', [id]);
        
        for (let mod of modules) {
            const [lessons] = await db.query('SELECT id, title, duration, video_url, lesson_order, is_free_preview FROM lessons WHERE module_id = ? ORDER BY lesson_order', [mod.id]);
            mod.lessons = lessons;
        }

        course.modules = modules;
        res.json(course);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar detalhes do curso' });
    }
};
