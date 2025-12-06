const db = require('./database');

// Lista todos os cursos com filtros opcionais (categoria, busca)
exports.getAllCourses = async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = 'SELECT * FROM courses WHERE 1=1';
        let params = [];

        if (category && category !== 'Todos') {
            query += ' AND category = ?';
            params.push(category);
        }

        if (search) {
            query += ' AND title LIKE ?';
            params.push(`%${search}%`);
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

        // Dados básicos do curso
        const [courses] = await db.query('SELECT * FROM courses WHERE id = ?', [id]);
        if (courses.length === 0) return res.status(404).json({ message: 'Curso não encontrado' });
        const course = courses[0];

        // Módulos e Aulas
        const [modules] = await db.query('SELECT * FROM modules WHERE course_id = ? ORDER BY module_order', [id]);
        
        // Para cada módulo, buscar as aulas
        for (let mod of modules) {
            const [lessons] = await db.query('SELECT * FROM lessons WHERE module_id = ? ORDER BY lesson_order', [mod.id]);
            mod.lessons = lessons;
        }

        course.modules = modules;
        res.json(course);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar detalhes do curso' });
    }
};
