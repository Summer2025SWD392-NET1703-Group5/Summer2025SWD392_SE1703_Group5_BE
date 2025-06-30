class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true; // Lỗi có thể dự đoán được, không phải bug của hệ thống

        Error.captureStackTrace(this, this.constructor);
    }
}

class BadRequestError extends AppError {
    constructor(message = 'Bad Request') {
        super(message, 400);
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Not Found') {
        super(message, 404);
    }
}

class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized') {
        super(message, 401);
    }
}

class ForbiddenError extends AppError {
    constructor(message = 'Forbidden') {
        super(message, 403);
    }
}

// Middleware xử lý lỗi tập trung (đặt ở cuối file server.js hoặc app.js)
// const globalErrorHandler = (err, req, res, next) => {
//   err.statusCode = err.statusCode || 500;
//   err.status = err.status || 'error';

//   // Log lỗi chi tiết ở môi trường dev
//   if (process.env.NODE_ENV === 'development') {
//     console.error('ERROR ????', err);
//     return res.status(err.statusCode).json({
//       status: err.status,
//       error: err,
//       message: err.message,
//       stack: err.stack,
//     });
//   }

//   // Lỗi do người dùng (operational, trusted error: send message to client)
//   if (err.isOperational) {
//     return res.status(err.statusCode).json({
//       status: err.status,
//       message: err.message,
//     });
//   }

//   // Lỗi lập trình hoặc lỗi không xác định: không nên rò rỉ chi tiết lỗi
//   // 1) Log lỗi
//   console.error('ERROR ????', err);
//   // 2) Gửi thông báo chung
//   return res.status(500).json({
//     status: 'error',
//     message: 'Something went very wrong!',
//   });
// };

module.exports = {
    AppError,
    BadRequestError,
    NotFoundError,
    UnauthorizedError,
    ForbiddenError,
    // globalErrorHandler, // Bạn có thể export và sử dụng middleware này
}; 