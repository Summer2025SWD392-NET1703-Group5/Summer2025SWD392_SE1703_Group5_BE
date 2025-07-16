// File: src/middlewares/payosLogger.js
const winston = require('winston');
const path = require('path');

// Tạo logger riêng cho PayOS
const payosLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'payos' },
    transports: [
        // File log cho PayOS transactions
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/payos-transactions.log'),
            level: 'info',
            maxsize: 5242880, // 5MB
            maxFiles: 10
        }),

        // File log cho PayOS errors
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/payos-errors.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),

        // Console output trong development
        ...(process.env.NODE_ENV === 'development' ? [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                )
            })
        ] : [])
    ]
});

module.exports = payosLogger;