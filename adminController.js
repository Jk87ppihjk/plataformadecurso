const db = require('./database');
const cloudinary = require('./cloudinaryConfig');

// Função auxiliar para upload de buffer para o Cloudinary (Sem alterações)
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

// 1. Criar Curso (Sem alterações)
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

// 2. Criar Módulo (COM NOVO CAMPO DE DRIP)
exports.createModule = async (req, res) => {
    try {
        // Recebe o novo campo: release_days_after_enrollment
        const { courseId, title, module_order, release_days_after_enrollment } = req.body;

        const [result] = await db.query(
            'INSERT INTO modules (course_id, title, module_order, release_days_after_enrollment) VALUES (?, ?, ?, ?)',
            [courseId, title, module_order, release_days_after_enrollment || 0] // Default 0 (liberado imediatamente)
        );

        res.status(201).json({ message: 'Módulo criado com sucesso!', moduleId: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao criar módulo' });
    }
};

// 3. Criar Aula (COM CAMPO DE LINKS DE MATERIAL)
exports.createLesson = async (req, res) => {
    try {
        // Recebe o novo campo: materials_link
        const { moduleId, title, duration, lesson_order, materials_link } = req.body;
        const file = req.file; // O vídeo vem aqui (opcional)

        let video_url = '';

        if (file) {
            // resource_type: 'video' é crucial para videos no Cloudinary
            const uploadResult = await uploadToCloudinary(file.buffer, 'courses_videos', 'video');
            video_url = uploadResult.secure_url;
        }

        await db.query(
            'INSERT INTO lessons (module_id, title, duration, video_url, lesson_order, materials_link) VALUES (?, ?, ?, ?, ?, ?)',
            [moduleId, title, duration, video_url, lesson_order, materials_link || null] // materials_link é opcional
        );

        res.status(201).json({ message: 'Aula criada com sucesso!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao criar aula' });
    }
};
