// utils/logger.js
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Tạo thư mục logs nếu chưa có
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log(`✅ Đã tạo thư mục logs: ${logsDir}`);
}

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'cinema-booking' },
    transports: [
        // File logs
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error'
        }),
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log')
        }),
        new winston.transports.File({
            filename: path.join(logsDir, 'booking-expiration.log'),
            level: 'info'
        })
    ]
});

// Nếu không phải production, log ra console
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

// Log khởi tạo thành công
logger.info('Winston logger đã được khởi tạo thành công', {
    logsDirectory: logsDir,
    environment: process.env.NODE_ENV || 'development'
});

module.exports = logger;
