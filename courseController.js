const db = require('./database');

// Lista todos os cursos com filtros opcionais (categoria, busca)
exports.getAllCourses = async (req, res) => {
    try {
        const { category, search } = req.query;
        // NOVO: Seleciona 'tags' para a listagem (opcional, mas bom ter)
        let query = 'SELECT id, title, description, instructor_name, price, discount_price, category, tags, cover_image_url, created_at FROM courses WHERE 1=1';
        let params = [];

        if (category && category !== 'Todos') {
            query += ' AND category = ?';
            params.push(category);
        }

        if (search) {
            query += ' AND title LIKE ? OR tags LIKE ?';
            params.push(`%${search}%`, `%${search}%`); // Permite buscar por título ou tag
        }

        const [courses] = await db.query(query, params);
        res.json(courses);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar cursos' });
    }
};

// Detalhes completos de um curso (Tela Detalhes do Curso)
exports.getCourseDetails = async (req, res) => {
    try {
        const { id } = req.params;

        // Dados básicos do curso (agora inclui 'tags')
        const [courses] = await db.query('SELECT * FROM courses WHERE id = ?', [id]);
        if (courses.length === 0) return res.status(404).json({ message: 'Curso não encontrado' });
        const course = courses[0];

        // NOVO: Cálculo da Avaliação Média e Contagem de Reviews
        // NOTA: Esta query requer que a tabela 'course_reviews' exista. Se não existir, causará ERRO 500.
        try {
            const [reviewStats] = await db.query('SELECT AVG(rating) as average_rating, COUNT(id) as total_reviews FROM course_reviews WHERE course_id = ?', [id]);
            course.average_rating = reviewStats[0].average_rating ? parseFloat(reviewStats[0].average_rating).toFixed(1) : '0.0';
            course.total_reviews = reviewStats[0].total_reviews;
        } catch (reviewError) {
             // Se a tabela course_reviews não existir, define como 0 e continua
             console.warn("DB_WARN: Tabela 'course_reviews' pode estar faltando. Definindo avaliações como zero.", reviewError);
             course.average_rating = '0.0';
             course.total_reviews = 0;
        }

        // Módulos e Aulas
        const [modules] = await db.query('SELECT * FROM modules WHERE course_id = ? ORDER BY module_order', [id]);
        
        // Para cada módulo, buscar as aulas
        for (let mod of modules) {
            // NOVO: Retorna o campo 'is_free_preview' que é usado no frontend (detalhes.html)
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
