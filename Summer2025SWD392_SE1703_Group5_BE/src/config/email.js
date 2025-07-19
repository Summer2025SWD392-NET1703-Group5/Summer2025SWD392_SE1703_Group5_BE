// File: src/config/email.js
// Mô tả: Cấu hình Nodemailer transporter để gửi email trong ứng dụng.

const nodemailer = require('nodemailer'); // Import thư viện Nodemailer.
require('dotenv').config(); // Nạp các biến môi trường từ file .env.

let transporterInstance = null; // Biến để lưu trữ instance của transporter (Singleton pattern).

/**
 * Reset transporter instance để force tạo mới với cấu hình mới
 */
function resetTransporter() {
    console.log('[email.js] Resetting transporter instance...');
    transporterInstance = null;
}

/**
 * Hàm để lấy (hoặc tạo nếu chưa có) instance của Nodemailer transporter.
 * Sử dụng Singleton pattern để đảm bảo chỉ có một instance transporter được tạo ra.
 * @returns {nodemailer.Transporter} Instance của Nodemailer transporter.
 */
function getTransporterInstance() {
    // Chỉ tạo mới transporter nếu nó chưa được khởi tạo.
    if (!transporterInstance) {
        console.log('[email.js] Creating new Nodemailer transporter instance...');

        // Cấu hình transporter với thông tin từ biến môi trường.
        transporterInstance = nodemailer.createTransport({
            host: process.env.EMAIL_HOST, // SMTP server host (ví dụ: 'smtp.gmail.com').
            port: parseInt(process.env.EMAIL_PORT, 10), // Cổng SMTP (ví dụ: 587 cho TLS, 465 cho SSL).
            secure: process.env.EMAIL_PORT === '465', // true nếu sử dụng SSL (cổng 465), false cho các cổng khác (TLS).
            auth: { // Thông tin xác thực với SMTP server.
                user: process.env.EMAIL_USER, // Địa chỉ email dùng để gửi.
                pass: process.env.EMAIL_PASSWORD // Mật khẩu của email đó (hoặc App Password nếu dùng Gmail).
            },
            // (Tùy chọn) Thêm các cấu hình khác nếu cần, ví dụ như TLS options:
            // tls: {
            //     rejectUnauthorized: false // Bỏ qua lỗi chứng chỉ không hợp lệ (chỉ dùng cho development).
            // }
        });

        // Kiểm tra cấu hình transporter (tùy chọn nhưng khuyến khích).
        // Hàm verify sẽ thử kết nối đến SMTP server và xác thực.
        console.log('[email.js] Verifying transporter configuration...');
        transporterInstance.verify((error, success) => {
            if (error) {
                console.error('❌ Lỗi cấu hình Nodemailer transporter hoặc không thể kết nối SMTP server:', error);
                // Quan trọng: Cần xử lý lỗi này một cách thích hợp, có thể thông báo hoặc dừng ứng dụng nếu email là critical.
                // transporterInstance = null; // Reset để có thể thử tạo lại sau này (nếu logic cho phép).
            } else {
                console.log('✅ Email transporter đã được cấu hình và xác thực thành công. Sẵn sàng gửi email!');
            }
        });
    }
    return transporterInstance; // Trả về instance transporter đã có hoặc vừa tạo.
}

// Export hàm getTransporterInstance để các module khác có thể lấy transporter.
// Sử dụng object với key `get` để có thể gọi `require('./email').get()`
module.exports = { 
    get: getTransporterInstance,
    reset: resetTransporter
};