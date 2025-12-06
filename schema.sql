-- Criação do Banco de Dados (Execute isso no seu MySQL Workbench ou phpMyAdmin)

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS courses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    instructor_name VARCHAR(255),
    instructor_avatar VARCHAR(500),
    price DECIMAL(10, 2) NOT NULL,
    discount_price DECIMAL(10, 2), -- Para o "R$ 99,90" vs "R$ 249,90"
    rating DECIMAL(2, 1) DEFAULT 0.0,
    students_count INT DEFAULT 0,
    category VARCHAR(100), -- Ex: 'Design', 'Programação'
    cover_image_url VARCHAR(500), -- URL do Cloudinary
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS modules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT,
    title VARCHAR(255) NOT NULL,
    module_order INT,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lessons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    module_id INT,
    title VARCHAR(255) NOT NULL,
    duration VARCHAR(50), -- Ex: "12:10"
    video_url VARCHAR(500), -- URL do vídeo no Cloudinary
    lesson_order INT,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS enrollments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    course_id INT,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS progress (
    user_id INT,
    lesson_id INT,
    completed BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (user_id, lesson_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);
