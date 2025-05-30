// File: src/middlewares/errorHandler.js
// Mô tả: Middleware xử lý lỗi tập trung cho ứng dụng Express.
// Middleware này sẽ bắt các lỗi được truyền qua `next(err)` từ các route handlers hoặc các middleware khác.

/**
 * Middleware xử lý lỗi chung.
 * @param {Error} err - Đối tượng lỗi được truyền tới.
 * @param {object} req - Đối tượng request của Express.
 * @param {object} res - Đối tượng response của Express.
 * @param {function} next - Hàm callback để chuyển control (ít khi dùng trong error handler cuối cùng).
 */
function errorHandler(err, req, res, next) {
    // Log lỗi ra console để theo dõi và debug phía server.
    // Trong môi trường production, nên sử dụng một thư viện logger chuyên dụng (ví dụ: Winston, Pino)
    // để ghi log vào file hoặc một dịch vụ quản lý log tập trung.
    console.error('Unhandled Error Caught by errorHandler:', err);

    // Xác định mã trạng thái HTTP.
    // Nếu lỗi có thuộc tính `statusCode` (ví dụ: lỗi từ các API tùy chỉnh), sử dụng nó.
    // Ngược lại, mặc định là 500 (Internal Server Error).
    const statusCode = err.statusCode || 500;

    // Xác định thông điệp lỗi.
    // Nếu lỗi có thuộc tính `message`, sử dụng nó.
    // Ngược lại, cung cấp một thông điệp lỗi chung chung để tránh lộ chi tiết lỗi nhạy cảm cho client.
    const message = err.message || 'Đã có lỗi không mong muốn xảy ra trên server. Vui lòng thử lại sau.';

    // (Tùy chọn) Xử lý các loại lỗi cụ thể để có phản hồi chi tiết hơn.
    // Ví dụ, nếu là lỗi validation từ Joi hoặc Express Validator:
    // if (err.isJoi) {
    //     return res.status(400).json({
    //         success: false,
    //         status: 400,
    //         message: 'Dữ liệu đầu vào không hợp lệ.',
    //         errors: err.details.map(d => ({ field: d.path.join('.'), message: d.message }))
    //     });
    // }

    // Trả về phản hồi lỗi dưới dạng JSON cho client.
    res.status(statusCode).json({
        success: false, // Cờ cho biết request không thành công.
        status: statusCode, // Mã trạng thái HTTP.
        message: message, // Thông điệp lỗi.
        // (Tùy chọn) Chỉ trả về stack trace trong môi trường development để debug.
        // Không nên để lộ stack trace trong môi trường production vì lý do bảo mật.
        // stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    // Không gọi next(err) ở đây nữa vì đây là handler cuối cùng cho lỗi này.
}

module.exports = errorHandler;