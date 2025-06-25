// File: src/server.js
// Mô tả: File chính khởi tạo và cấu hình server Express cho ứng dụng GALAXY Cinema.
console.log('Current Working Directory (from server.js):', process.cwd()); // Log CWD

require('dotenv').config(); // Nạp các biến môi trường từ file .env ngay từ đầu ứng dụng.

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swaggerConfig');

// Import các modules routes của ứng dụng
const authRoutes = require('./routes/authRoutes');
const showtimeRoutes = require('./routes/showtimeRoutes');
const cinemaRoomRoutes = require('./routes/cinemaRoomRoutes');
const cinemaRoutes = require('./routes/cinemaRoutes');
const seatLayoutRoutes = require('./routes/seatLayoutRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const bookingRoutes = require('./routes/bookingRoutes');

// Import database connection
const { getConnection, testConnection } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// === Cấu hình Security & Performance Middleware ===

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https:"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
    crossOriginEmbedderPolicy: false
}));

// CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        // Cho phép requests không có origin (mobile apps, postman, etc.)
        // và requests có origin là null (ví dụ: file:// URLs, sandboxed iframes)
        if (!origin || origin === 'null') {
            return callback(null, true);
        }

        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:5173', // Vite dev server
            'http://127.0.0.1:5173',
            ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
        ];

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn(`CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Rate limiting
const createRateLimiter = (windowMs, max, message) => {
    return rateLimit({
        windowMs,
        max,
        message: {
            success: false,
            message,
            retryAfter: Math.ceil(windowMs / 1000)
        },
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        keyGenerator: (req) => {
            return req.ip;
        }
    });
};

// General API rate limiting
const generalLimiter = createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    100, // 100 requests per window
    'Quá nhiều requests từ IP này. Vui lòng thử lại sau 15 phút.'
);

// Apply rate limiting
app.use('/api/', generalLimiter);

// Body parsing middleware
app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf);
        } catch (e) {
            res.status(400).json({
                success: false,
                message: 'Invalid JSON format'
            });
            throw new Error('Invalid JSON');
        }
    }
}));

app.use(express.urlencoded({
    extended: true,
    limit: '10mb'
}));

// Request logging middleware (chỉ trong development)
if (NODE_ENV === 'development') {
    app.use((req, res, next) => {
        const start = Date.now();

        res.on('finish', () => {
            const duration = Date.now() - start;
            const statusColor = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m'; // Red for errors, green for success
            console.log(
                `${statusColor}${req.method}\x1b[0m ${req.originalUrl} - ${statusColor}${res.statusCode}\x1b[0m (${duration}ms)`
            );
        });

        next();
    });
}

// === Kết nối Cơ sở dữ liệu ===
const initializeDatabase = async () => {
    try {
        await getConnection();
        console.log('✅ Database connection established');

        // Test connection
        const isConnected = await testConnection();
        if (!isConnected) {
            throw new Error('Database connection test failed');
        }
        console.log('✅ Database connection test passed');

    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        if (NODE_ENV === 'production') {
            process.exit(1);
        }
    }
};

// Initialize database
initializeDatabase();

// === Cấu hình Swagger UI ===
const swaggerOptions = {
    explorer: true,
    swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'none',
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
        tryItOutEnabled: true
    },
    customCss: `
        .swagger-ui .topbar { display: none }
        .swagger-ui .info .title { color: #1f2937; }
    `,
    customSiteTitle: "GALAXY Cinema API Documentation"
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerOptions));
console.info(`📚 Swagger UI available at: http://localhost:${PORT}/api-docs`);

// === Health Check Routes ===
app.get('/health', async (req, res) => {
    try {
        const dbStatus = await testConnection();
        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();

        res.status(200).json({
            success: true,
            status: 'OK',
            timestamp: new Date().toISOString(),
            uptime: {
                seconds: Math.floor(uptime),
                formatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`
            },
            services: {
                database: dbStatus ? 'Connected' : 'Disconnected',
                // bookingExpiration: bookingExpirationService.isRunning ? 'Running' : 'Stopped',
                // showtimeExpiration: showtimeExpirationService.isRunning ? 'Running' : 'Stopped' // ✅ Thêm showtime expiration status
            },
            system: {
                nodeVersion: process.version,
                platform: process.platform,
                environment: NODE_ENV,
                memory: {
                    used: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
                    total: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
                    rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB'
                }
            }
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(503).json({
            success: false,
            status: 'Service Unavailable',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

// Detailed health check for monitoring systems
app.get('/health/detailed', async (req, res) => {
    try {
        const checks = {
            database: await testConnection(),
            // bookingService: bookingExpirationService.isRunning,
            showtimeService: showtimeExpirationService.isRunning, // ✅ Thêm showtime service check
            memory: process.memoryUsage().heapUsed < 500 * 1024 * 1024, // Less than 500MB
            uptime: process.uptime() > 0
        };

        const allHealthy = Object.values(checks).every(check => check === true);

        res.status(allHealthy ? 200 : 503).json({
            success: allHealthy,
            status: allHealthy ? 'Healthy' : 'Unhealthy',
            checks,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            success: false,
            status: 'Error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// === Đăng ký Routes cho API ===
app.use('/api/auth', authRoutes);
app.use('/api/showtimes', showtimeRoutes);
app.use('/api/cinema-rooms', cinemaRoomRoutes);
app.use('/api/cinemas', cinemaRoutes);
app.use('/api/seat-layouts', seatLayoutRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/bookings', bookingRoutes);
// Route cơ bản để kiểm tra server
// app.get('/', (req, res) => {
//     res.status(200).json({
//         success: true,
//         message: 'Chào mừng bạn đến với API Server cho GALAXY Cinema! 🎬',
//         status: 'Server đang chạy',
//         version: '1.0.0',
//         environment: NODE_ENV,
//         services: {
//             bookingExpiration: bookingExpirationService.isRunning ? 'Running' : 'Stopped',
//             showtimeExpiration: showtimeExpirationService.isRunning ? 'Running' : 'Stopped' // ✅ Thêm showtime service status
//         },
//         endpoints: {
//             documentation: `http://localhost:${PORT}/api-docs`,
//             health: `http://localhost:${PORT}/health`,
//             detailedHealth: `http://localhost:${PORT}/health/detailed`
//         },
//         apiRoutes: {
//             auth: '/api/auth',
//             bookings: '/api/bookings',
//             cinemaRooms: '/api/cinema-rooms',
//             movies: '/api/movies',
//             members: '/api/members',
//             statistics: '/api/booking-statistics',
//             expiration: '/api/booking-expiration',
//             seats: '/api/seats'
//         }
//     });
// });

// API version endpoint
app.get('/api', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'GALAXY Cinema API v1.0.0',
        version: '1.0.0',
        documentation: `http://localhost:${PORT}/api-docs`,
        availableEndpoints: [
            'GET /api/auth - Authentication endpoints',
            'GET /api/movies - Movie management',
            'GET /api/bookings - Booking management',
            'GET /api/members - Member management',
            'GET /api/cinema-rooms - Cinema room management',
            'GET /api/booking-statistics - Booking statistics',
            'GET /api/booking-expiration - Booking expiration management',
            'GET /api/seats - Seat management'
        ]
    });
});

// === Background Services ===
const startServices = async () => { // ✅ Thay đổi thành async function
    try {
        console.log('🔄 Starting background services...');

        //         // Khởi động booking expiration service
        //         bookingExpirationService.start();
        //         console.log(`   ✅ Booking Expiration Service: ${bookingExpirationService.isRunning ? 'Running' : 'Failed'}`);

        //         // ✅ Khởi động showtime expiration service
        //         await showtimeExpirationService.start();
        //         console.log(`   ✅ Showtime Expiration Service: ${showtimeExpirationService.isRunning ? 'Running' : 'Failed'}`);

        //         console.log('✅ All background services started successfully');

    } catch (error) {
        console.error('❌ Error starting background services:', error);
    }
};

// === Error Handling Middleware ===

// Validation error handler (đã được handle trong validation middleware)
// Global error handler
app.use((err, req, res, next) => {
    // Log error details
    console.error('=== Global Error Handler ===');
    console.error('Time:', new Date().toISOString());
    console.error('URL:', req.originalUrl);
    console.error('Method:', req.method);
    console.error('IP:', req.ip);
    console.error('Error:', err);
    console.error('============================');

    // Default error response
    let statusCode = err.statusCode || err.status || 500;
    let message = err.message || 'Có lỗi xảy ra trên server. Vui lòng thử lại sau.';

    // Handle specific error types
    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = 'Dữ liệu không hợp lệ';
    } else if (err.name === 'UnauthorizedError') {
        statusCode = 401;
        message = 'Token không hợp lệ hoặc đã hết hạn';
    } else if (err.code === 'LIMIT_FILE_SIZE') {
        statusCode = 413;
        message = 'File quá lớn. Kích thước tối đa là 10MB';
    } else if (err.type === 'entity.parse.failed') {
        statusCode = 400;
        message = 'Dữ liệu JSON không hợp lệ';
    }

    // Response format
    const errorResponse = {
        success: false,
        message,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
        method: req.method
    };

    // Add stack trace in development
    if (NODE_ENV === 'development') {
        errorResponse.stack = err.stack;
        errorResponse.details = err;
    }

    res.status(statusCode).json(errorResponse);
});

// 404 handler - phải đặt sau tất cả routes
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.originalUrl} không tồn tại`,
        timestamp: new Date().toISOString(),
        availableEndpoints: {
            documentation: '/api-docs',
            health: '/health',
            api: '/api',
            auth: '/api/auth',
            bookings: '/api/bookings',
            cinemaRooms: '/api/cinema-rooms',
            movies: '/api/movies',
            members: '/api/members',
            statistics: '/api/booking-statistics',
            expiration: '/api/booking-expiration',
            seats: '/api/seats'
        }
    });
});

// === Graceful Shutdown ===
const gracefulShutdown = (signal) => {
    console.log(`🔄 Graceful shutdown initiated by ${signal}...`);

    // Dừng background services
    try {
        // bookingExpirationService.stop();
        // console.log('✅ Booking Expiration Service stopped');

        // // ✅ Dừng showtime expiration service
        // showtimeExpirationService.stop();
        // console.log('✅ Showtime Expiration Service stopped');

        // console.log('✅ All background services stopped');
    } catch (error) {
        console.error('❌ Error stopping background services:', error);
    }

    // Đóng server
    server.close((err) => {
        if (err) {
            console.error('❌ Error closing HTTP server:', err);
            process.exit(1);
        }

        console.log('✅ HTTP server closed');
        process.exit(0);
    });

    // Force exit sau 10 giây nếu không thể shutdown gracefully
    setTimeout(() => {
        console.error('❌ Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};

// Event listeners cho graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Xử lý uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    console.error('Stack:', error.stack);

    // Graceful shutdown
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise);
    console.error('Reason:', reason);

    // Graceful shutdown
    gracefulShutdown('UNHANDLED_REJECTION');
});

// === Khởi động Server ===
const server = app.listen(PORT, () => {
    console.log('\n🎬 ===============================================');
    console.log('🚀 GALAXY CINEMA API SERVER STARTED');
    console.log('===============================================');
    console.info(`🌐 Server running on: http://localhost:${PORT}`);
    console.info(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
    console.info(`🏥 Health Check: http://localhost:${PORT}/health`);
    console.info(`🔧 Environment: ${NODE_ENV}`);
    console.info(`📅 Started at: ${new Date().toISOString()}`);
    console.log('===============================================\n');

    // Khởi động background services sau khi server đã sẵn sàng
    if (NODE_ENV !== 'test') {
        setTimeout(async () => { // ✅ Thay đổi thành async
            await startServices();
        }, 1000); // Delay 1 giây để đảm bảo server đã sẵn sàng
    }
});

// Handle server errors
server.on('error', (error) => {
    if (error.syscall !== 'listen') {
        throw error;
    }

    switch (error.code) {
        case 'EACCES':
            console.error(`❌ Port ${PORT} requires elevated privileges`);
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(`❌ Port ${PORT} is already in use`);
            process.exit(1);
            break;
        default:
            throw error;
    }
});

// Export app để có thể sử dụng trong testing
module.exports = app;
