// File: src/config/swaggerConfig.js
// Mô tả: Cấu hình cho swagger-jsdoc để tự động tạo tài liệu API Swagger/OpenAPI từ các chú thích trong code.

const swaggerJsdoc = require('swagger-jsdoc'); // Import thư viện swagger-jsdoc.
const path = require('path'); // Ensure path is required if using path.join

// Các tùy chọn cấu hình cho swagger-jsdoc.
const options = {
    definition: { // Định nghĩa cơ bản của OpenAPI specification.
        openapi: '3.0.0', // Phiên bản OpenAPI.
        info: { // Thông tin chung về API.
            title: 'GALAXY Cinema API', // Tiêu đề của API.
            version: '1.0.0', // Phiên bản hiện tại của API.
            description: 'Tài liệu API cho ứng dụng GALAXY Cinema. Bao gồm các endpoints để quản lý phim, người dùng, đặt vé, v.v.',
            contact: { // Thông tin liên hệ (tùy chọn).
                name: 'GALAXY Software Team', // Tên người/nhóm phát triển.
                email: 'devteam@GALAXYsoftware.com', // Email liên hệ.
            },
        },
        servers: [ // Danh sách các server mà API được host.
            {
                url: `http://localhost:${process.env.PORT || 3000}`, // Xóa /api ở cuối
                description: 'Development Server', // Mô tả về server.
            },
        ],
        components: { // Các thành phần tái sử dụng được trong API.
            securitySchemes: { // Định nghĩa các cơ chế bảo mật.
                // FIX: Sử dụng apiKey thay vì bearerAuth để đơn giản hóa
                ApiKeyAuth: {
                    type: 'apiKey', // Loại authentication là API Key
                    in: 'header', // API Key được gửi qua header
                    name: 'Authorization', // Tên của header
                    description: 'Nhập JWT token (không cần "Bearer"). Ví dụ: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
                },
            },
        },
    },
    // Đường dẫn đến các file chứa chú thích API (JSDoc) mà swagger-jsdoc sẽ quét.
    apis: [
        path.join(__dirname, '../routes/*.js'),
        // path.join(__dirname, '../controllers/*.js'), // Removed as per user request
        // path.join(__dirname, '../models/*.js'), // Si vous avez des DTOs dans les modèles
        // path.join(__dirname, './authRoutes.js'), // Exemple si vous avez des routes spécifiques à ajouter
    ],
};

// Tạo đối tượng swaggerSpec (OpenAPI specification) từ các options đã định nghĩa.
const swaggerSpec = swaggerJsdoc(options);



// Export swaggerSpec để sử dụng trong file server.js.
module.exports = swaggerSpec;