const db = require('./database');
const cloudinary = require('./cloudinaryConfig');

// Função auxiliar para upload de buffer para o Cloudinary
const uploadToCloudinary = (buffer, folder, resourceType = 'image') => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: folder, resource_type: resourceType },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        uploadStream.end(buffer);
    });
};

// ------------------------------------
// CRIAÇÃO DE CONTEÚDO
// ------------------------------------

// 1. Criar Curso
exports.createCourse = async (req, res) => {
    try {
        const { title, description, price, discount_price, category, instructor_name } = req.body;
        const file = req.file;

        let cover_image_url = '';

        if (file) {
            const uploadResult = await uploadToCloudinary(file.buffer, 'courses_covers', 'image');
            cover_image_url = uploadResult.secure_url;
        }

        const [result] = await db.query(
            'INSERT INTO courses (title, description, price, discount_price, category, instructor_name, cover_image_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [title, description, price, discount_price, category, instructor_name, cover_image_url]
        );

        res.status(201).json({ message: 'Curso criado com sucesso!', courseId: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao criar curso' });
    }
};

// 2. Criar Módulo
exports.createModule = async (req, res) => {
    try {
        const { courseId, title, module_order, release_days_after_enrollment } = req.body;

        const [result] = await db.query(
            'INSERT INTO modules (course_id, title, module_order, release_days_after_enrollment) VALUES (?, ?, ?, ?)',
            [courseId, title, module_order, release_days_after_enrollment || 0]
        );

        res.status(201).json({ message: 'Módulo criado com sucesso!', moduleId: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao criar módulo' });
    }
};

// 3. Criar Aula (Com Upload de Vídeo e Materiais)
exports.createLesson = async (req, res) => {
    try {
        const { moduleId, title, duration, lesson_order, materials_link } = req.body;
        const file = req.file;

        let video_url = '';

        if (file) {
            const uploadResult = await uploadToCloudinary(file.buffer, 'courses_videos', 'video');
            video_url = uploadResult.secure_url;
        }

        await db.query(
            'INSERT INTO lessons (module_id, title, duration, video_url, lesson_order, materials_link) VALUES (?, ?, ?, ?, ?, ?)',
            [moduleId, title, duration, video_url, lesson_order, materials_link || null]
        );

        res.status(201).json({ message: 'Aula criada com sucesso!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao criar aula' });
    }
};

// ------------------------------------
// REORDENAÇÃO DE CONTEÚDO (DRAG-AND-DROP)
// ------------------------------------

// 4. Reordena Módulos
exports.reorderModules = async (req, res) => {
    try {
        // itemIds é um array de IDs na nova ordem [id1, id2, id3...]
        const { itemIds } = req.body; 
        
        if (!Array.isArray(itemIds) || itemIds.length === 0) {
            return res.status(400).json({ message: 'Lista de IDs inválida.' });
        }

        const promises = itemIds.map((id, index) => {
            const newOrder = index + 1;
            // Atualiza a ordem de cada módulo
            return db.query(
                'UPDATE modules SET module_order = ? WHERE id = ?', 
                [newOrder, id]
            );
        });

        await Promise.all(promises);

        res.json({ message: 'Ordem dos módulos atualizada com sucesso.' });
    } catch (error) {
        console.error('Erro ao reordenar módulos:', error);
        res.status(500).json({ message: 'Erro interno ao salvar a nova ordem.' });
    }
};

// 5. Reordena Aulas
exports.reorderLessons = async (req, res) => {
    try {
        // itemIds é um array de IDs na nova ordem [id1, id2, id3...]
        const { itemIds } = req.body; 
        
        if (!Array.isArray(itemIds) || itemIds.length === 0) {
            return res.status(400).json({ message: 'Lista de IDs inválida.' });
        }

        const promises = itemIds.map((id, index) => {
            const newOrder = index + 1;
            // Atualiza a ordem de cada aula
            return db.query(
                'UPDATE lessons SET lesson_order = ? WHERE id = ?', 
                [newOrder, id]
            );
        });

        await Promise.all(promises);

        res.json({ message: 'Ordem das aulas atualizada com sucesso.' });
    } catch (error) {
        console.error('Erro ao reordenar aulas:', error);
        res.status(500).json({ message: 'Erro interno ao salvar a nova ordem.' });
    }
};
