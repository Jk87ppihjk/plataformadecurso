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

// 1. Criar Curso
exports.createCourse = async (req, res) => {
    try {
        const { title, description, price, discount_price, category, instructor_name } = req.body;
        const file = req.file; // A imagem de capa vem aqui

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
        const { courseId, title, module_order } = req.body;

        const [result] = await db.query(
            'INSERT INTO modules (course_id, title, module_order) VALUES (?, ?, ?)',
            [courseId, title, module_order]
        );

        res.status(201).json({ message: 'Módulo criado com sucesso!', moduleId: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao criar módulo' });
    }
};

// 3. Criar Aula (Com Upload de Vídeo)
exports.createLesson = async (req, res) => {
    try {
        const { moduleId, title, duration, lesson_order } = req.body;
        const file = req.file; // O vídeo vem aqui

        let video_url = '';

        if (file) {
            // resource_type: 'video' é crucial para videos
            const uploadResult = await uploadToCloudinary(file.buffer, 'courses_videos', 'video');
            video_url = uploadResult.secure_url;
        }

        await db.query(
            'INSERT INTO lessons (module_id, title, duration, video_url, lesson_order) VALUES (?, ?, ?, ?, ?)',
            [moduleId, title, duration, video_url, lesson_order]
        );

        res.status(201).json({ message: 'Aula criada com sucesso!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao criar aula' });
    }
};
