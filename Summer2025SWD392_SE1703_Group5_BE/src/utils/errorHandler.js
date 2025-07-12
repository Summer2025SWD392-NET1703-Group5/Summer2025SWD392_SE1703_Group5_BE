class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;

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


module.exports = {
    AppError,
    BadRequestError,
    NotFoundError,
    UnauthorizedError,
    ForbiddenError,
}; 