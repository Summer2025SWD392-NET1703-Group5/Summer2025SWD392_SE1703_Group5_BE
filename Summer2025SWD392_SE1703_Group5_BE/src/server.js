// File: src/server.js
// Mô tả: File chính khởi tạo và cấu hình server Express cho ứng dụng GALAXY Cinema.
process.env.TZ = 'Asia/Ho_Chi_Minh';
console.log('Đang thực thi file server.js, Thư mục làm việc hiện tại:', process.cwd());

// Nạp các biến môi trường từ file .env ngay từ đầu ứng dụng.
require('dotenv').config();
console.log('✅ Biến môi trường đã được nạp.');

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swaggerConfig');
const { createServer } = require('http');
const { Server } = require('socket.io');

// Import các modules routes của ứng dụng
console.log('🔄 Đang nạp các modules routes...');
const authRoutes = require('./routes/authRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const cinemaRoomRoutes = require('./routes/cinemaRoomRoutes');
const movieRoutes = require('./routes/movieRoutes');
const bookingExpirationRoutes = require('./routes/bookingExpirationRoutes');
const bookingStatisticsRoutes = require('./routes/bookingStatisticsRoutes');
const memberRoutes = require('./routes/memberRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const payosRoutes = require('./routes/payosRoutes');
const pointsRoutes = require('./routes/pointsRoutes');
const promotionRoutes = require('./routes/promotionRoutes');
const salesReportRoutes = require('./routes/salesReportRoutes');
const scoreHistoryRoutes = require('./routes/scoreHistoryRoutes');
const seatRoutes = require('./routes/seatRoutes');
const showtimeExpirationRoutes = require('./routes/showtimeExpirationRoutes');
const seatLayoutRoutes = require('./routes/seatLayoutRoutes');
const showtimeRoutes = require('./routes/showtimeRoutes');
const staffPerformanceRoutes = require('./routes/staffPerformanceRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const ticketPricingRoutes = require('./routes/ticketPricingRoutes');
const ticketCancellationRoutes = require('./routes/ticketCancellationRoutes'); // ✅ Thêm import ticket cancellation routes
const promotionExpirationRoutes = require('./routes/promotionExpirationRoutes'); // ✅ Thêm import promotion expiration routes
const userRoutes = require('./routes/userRoutes');
const cinemaRoutes = require('./routes/cinemaRoutes');
const referenceRoutes = require('./routes/referenceRoutes'); // Thêm import referenceRoutes
const movieStatusRoutes = require('./routes/movieStatusRoutes'); // Thêm import movieStatusRoutes
const exportImportRoutes = require('./routes/exportImportRoutes'); // Thêm import exportImportRoutes
const seatSelectionRoutes = require('./routes/seatSelectionRoutes'); // Thêm import seatSelectionRoutes
console.log('✅ Tất cả routes đã được nạp.');

// Import các services chạy nền
console.log('🔄 Đang nạp các services chạy nền...');
const bookingExpirationService = require('./services/bookingExpirationService');
const showtimeExpirationService = require('./services/showtimeExpirationService');
const movieStatusService = require('./services/movieStatusService');
const ticketCancellationService = require('./services/ticketCancellationService'); // ✅ Thêm ticket cancellation service
const promotionExpirationService = require('./services/promotionExpirationService'); // ✅ Thêm promotion expiration service
console.log('✅ Services chạy nền đã được nạp.');

// Import kết nối cơ sở dữ liệu
const { getConnection, testConnection } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
console.log(`🔧 Môi trường hoạt động: ${NODE_ENV}`);

// === Cấu hình Security & Performance Middleware ===
console.log('🔄 Đang cấu hình các middleware...');

// Helmet: Bảo vệ ứng dụng khỏi các lỗ hổng web phổ biến bằng cách đặt các HTTP header phù hợp.
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
console.log('✅ Middleware Helmet đã được kích hoạt.');

// CORS: Cho phép các request từ các domain khác (cross-origin).
app.use(cors({
    origin: '*', // Chú ý: Trong môi trường production, nên giới hạn lại chỉ các domain được phép.
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
console.log('✅ Middleware CORS đã được kích hoạt.');

// Compression: Nén các phản hồi HTTP để giảm kích thước và tăng tốc độ tải.
app.use(compression());
console.log('✅ Middleware Compression đã được kích hoạt.');

// Tạo cache cho kết nối database để tăng tốc độ và tái sử dụng kết nối.
let dbConnectionCache = null;
const getDbConnection = async () => {
    if (!dbConnectionCache) {
        console.log('⚠️ Đang tạo kết nối database mới cho cache...');
        dbConnectionCache = await getConnection();
    }
    return dbConnectionCache;
};

app.set('dbConnectionCache', getDbConnection);
console.log('✅ Cache cho kết nối database đã được thiết lập.');

// Body Parsing: Middleware để xử lý (parse) body của request (JSON, URL-encoded).
app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf);
        } catch (e) {
            console.error('Lỗi JSON không hợp lệ:', e.message);
            res.status(400).json({ success: false, message: 'Dữ liệu JSON không hợp lệ' });
            throw new Error('Invalid JSON');
        }
    }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
console.log('✅ Middleware xử lý body (JSON, URL-encoded) đã được kích hoạt.');

// Disable caching toàn cục cho tất cả API responses
app.use((req, res, next) => {
    res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    next();
});
// Request Logging: DISABLED để tăng tốc API
// if (NODE_ENV === 'development') {
//     app.use((req, res, next) => {
//         const start = Date.now();
//         res.on('finish', () => {
//             const duration = Date.now() - start;
//             const statusColor = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
//             console.log(`[DEV LOG] ${statusColor}${req.method}\x1b[0m ${req.originalUrl} - ${statusColor}${res.statusCode}\x1b[0m (${duration}ms)`);
//         });
//         next();
//     });
//     console.log('✅ Middleware ghi log request (development) đã được kích hoạt.');
// }

// === Kết nối Cơ sở dữ liệu ===
const initializeDatabase = async () => {
    try {
        console.log('🔄 Đang khởi tạo kết nối cơ sở dữ liệu...');
        dbConnectionCache = await getConnection();
        console.log('✅ Kết nối database đã được thiết lập và cache lại.');
        const isConnected = await testConnection();
        if (!isConnected) {
            throw new Error('Kiểm tra kết nối database thất bại.');
        }
        console.log('✅ Kiểm tra kết nối database thành công.');
    } catch (error) {
        console.error('❌ Lỗi nghiêm trọng khi khởi tạo database:', error);
        // Trong môi trường production, thoát ứng dụng nếu không kết nối được DB.
        if (NODE_ENV === 'production') {
            process.exit(1);
        }
    }
};

initializeDatabase();

// === Cấu hình Swagger UI ===
const swaggerOptions = {
    explorer: true,
    customCss: `.swagger-ui .topbar { display: none } .swagger-ui .info .title { color: #1f2937; }`,
    customSiteTitle: "Tài liệu API - GALAXY Cinema"
};
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerOptions));
console.log(`📚 Tài liệu API Swagger UI có sẵn tại: http://localhost:${PORT}/api-docs`);

// === Các Route kiểm tra sức khỏe hệ thống (Health Check) ===
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
                bookingExpiration: bookingExpirationService.isRunning ? 'Running' : 'Stopped',
                showtimeExpiration: showtimeExpirationService.isRunning ? 'Running' : 'Stopped',
                movieStatus: movieStatusService.isRunning ? 'Running' : 'Stopped',
                ticketCancellation: ticketCancellationService.isRunning ? 'Running' : 'Stopped', // ✅ Thêm ticket cancellation status
                promotionExpiration: promotionExpirationService.isRunning ? 'Running' : 'Stopped' // ✅ Thêm promotion expiration status
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
            bookingService: bookingExpirationService.isRunning,
            showtimeService: showtimeExpirationService.isRunning,
            movieStatusService: movieStatusService.isRunning,
            ticketCancellationService: ticketCancellationService.isRunning, // ✅ Thêm ticket cancellation service check
            promotionExpirationService: promotionExpirationService.isRunning, // ✅ Thêm promotion expiration service check
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

// === Đăng ký Routes cho các API ===
console.log('🔄 Đang đăng ký các routes cho ứng dụng...');
app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/cinema-rooms', cinemaRoomRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/booking-expiration', bookingExpirationRoutes);
app.use('/api/booking-statistics', bookingStatisticsRoutes);
app.use('/api/member', memberRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/payos', payosRoutes);
app.use('/api/points', pointsRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/sales-report', salesReportRoutes);
app.use('/api/score-history', scoreHistoryRoutes);
app.use('/api/seats', seatRoutes);
app.use('/api/showtime-expiration', showtimeExpirationRoutes);
app.use('/api/seat-layouts', seatLayoutRoutes);
app.use('/api/showtimes', showtimeRoutes);
app.use('/api/staff-performance', staffPerformanceRoutes);
app.use('/api/ticket-pricing', ticketPricingRoutes);
app.use('/api/ticket', ticketRoutes);
app.use('/api/ticket-cancellation', ticketCancellationRoutes); // ✅ Thêm route cho ticket cancellation
app.use('/api/promotion-expiration', promotionExpirationRoutes); // ✅ Thêm route cho promotion expiration
app.use('/api/user', userRoutes);
app.use('/api/cinemas', cinemaRoutes);
app.use('/api/references', referenceRoutes);
app.use('/api/movie-status', movieStatusRoutes); // Thêm route cho movie status
app.use('/api/export-import', exportImportRoutes); // Thêm route cho export/import
app.use('/api/seat-selection', seatSelectionRoutes); // Thêm route cho real-time seat selection
console.log('✅ Tất cả các routes đã được đăng ký thành công.');

// Route cơ bản để kiểm tra server
app.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Chào mừng bạn đến với API Server cho GALAXY Cinema! 🎬',
        status: 'Server đang chạy',
        version: '1.0.0',
        environment: NODE_ENV,
        services: {
            bookingExpiration: bookingExpirationService.isRunning ? 'Running' : 'Stopped',
            showtimeExpiration: showtimeExpirationService.isRunning ? 'Running' : 'Stopped',
            movieStatus: movieStatusService.isRunning ? 'Running' : 'Stopped',
            ticketCancellation: ticketCancellationService.isRunning ? 'Running' : 'Stopped', // ✅ Thêm ticket cancellation service
            promotionExpiration: promotionExpirationService.isRunning ? 'Running' : 'Stopped' // ✅ Thêm promotion expiration service
        },
        endpoints: {
            documentation: `http://localhost:${PORT}/api-docs`,
            health: `http://localhost:${PORT}/health`,
            detailedHealth: `http://localhost:${PORT}/health/detailed`
        },
        apiRoutes: {
            auth: '/api/auth',
            bookings: '/api/bookings',
            cinemaRooms: '/api/cinema-rooms',
            movies: '/api/movies',
            members: '/api/members',
            statistics: '/api/booking-statistics',
            expiration: '/api/booking-expiration',
            seats: '/api/seats',
            user: '/api/user',
            movieStatus: '/api/movie-status', // Thêm movie status route
            exportImport: '/api/export-import' // Thêm export/import route
        }
    });
});

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
            'GET /api/seats - Seat management',
            'GET /api/user - User management',
            'GET /api/movie-status - Movie status management', // Thêm movie status endpoint
            'GET /api/export-import - Export/Import management' // Thêm export/import endpoint
        ]
    });
});

// === Các Tiến trình chạy nền (Background Services) ===
const startServices = async () => {
    try {
        console.log('🔄 Đang khởi động các tiến trình chạy nền...');
        await bookingExpirationService.start(); // ✅ Sửa thành await vì start() bây giờ là async
        console.log(`   ✅ Service kiểm tra hạn đặt vé: ${bookingExpirationService.isRunning ? 'Đang chạy' : 'Thất bại'}`);
        await showtimeExpirationService.start();
        console.log(`   ✅ Service kiểm tra hạn suất chiếu: ${showtimeExpirationService.isRunning ? 'Đang chạy' : 'Thất bại'}`);
        await movieStatusService.start();
        console.log(`   ✅ Service cập nhật trạng thái phim: ${movieStatusService.isRunning ? 'Đang chạy' : 'Thất bại'}`);
        await ticketCancellationService.start(); // ✅ Khởi động ticket cancellation service
        console.log(`   ✅ Service hủy vé quá hạn: ${ticketCancellationService.isRunning ? 'Đang chạy' : 'Thất bại'}`);
        await promotionExpirationService.start(); // ✅ Khởi động promotion expiration service
        console.log(`   ✅ Service ẩn promotion hết hạn: ${promotionExpirationService.isRunning ? 'Đang chạy' : 'Thất bại'}`);
        console.log('✅ Tất cả các tiến trình chạy nền đã được khởi động.');
    } catch (error) {
        console.error('❌ Lỗi khi khởi động các tiến trình chạy nền:', error);
    }
};

// === Middleware xử lý lỗi tập trung (Global Error Handler) ===
app.use((err, req, res, next) => {
    console.error('=== LỖI TOÀN HỆ THỐNG ===');
    console.error('Thời gian:', new Date().toISOString());
    console.error('URL:', req.originalUrl);
    console.error('Phương thức:', req.method);
    console.error('IP:', req.ip);
    console.error('Lỗi:', err.message);
    if (NODE_ENV === 'development') {
        console.error('Stack Trace:', err.stack);
    }
    console.error('===========================');

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Có lỗi xảy ra trên server. Vui lòng thử lại sau.';

    const errorResponse = {
        success: false,
        message,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
    };

    res.status(statusCode).json(errorResponse);
});

// Xử lý Route không tồn tại (404 Handler) - phải đặt ở cuối cùng.
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: `Đường dẫn ${req.method} ${req.originalUrl} không tồn tại trên server.`
    });
});

// === Quá trình tắt ứng dụng một cách an toàn (Graceful Shutdown) ===
const gracefulShutdown = (signal) => {
    console.log(`🔄 Nhận được tín hiệu ${signal}. Bắt đầu quá trình tắt ứng dụng an toàn...`);

    // Dừng các services chạy nền
    bookingExpirationService.stop();
    showtimeExpirationService.stop();
    movieStatusService.stop();
    ticketCancellationService.stop(); // ✅ Dừng ticket cancellation service
    promotionExpirationService.stop(); // ✅ Dừng promotion expiration service
    console.log('✅ Đã dừng các services chạy nền.');

    // Đóng server Express
    server.close(() => {
        console.log('✅ Server HTTP đã đóng.');
        // Đóng kết nối database nếu cần
        // ...
        process.exit(0);
    });

    // Buộc tắt sau một khoảng thời gian nếu không thể đóng an toàn
    setTimeout(() => {
        console.error('❌ Không thể đóng các kết nối kịp thời, buộc phải tắt ứng dụng.');
        process.exit(1);
    }, 10000); // 10 giây
};

// Lắng nghe các tín hiệu tắt ứng dụng
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Ctrl+C

// Xử lý các lỗi không được bắt (Uncaught Exceptions)
process.on('uncaughtException', (error) => {
    console.error('❌ Lỗi UNCAUGHT EXCEPTION:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Xử lý các promise bị từ chối mà không có .catch()
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Lỗi UNHANDLED REJECTION tại:', promise, 'lý do:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
});

// === Khởi động Server ===
const server = createServer(app);

// ✅ Khởi tạo Socket.IO server
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

console.log('🔄 Đang khởi tạo WebSocket server cho real-time seat selection...');

// Import và khởi tạo WebSocket handlers
const { initSocketHandlers } = require('./websocket/socketHandler');
initSocketHandlers(io);

console.log('✅ WebSocket server đã được khởi tạo thành công!');

server.listen(PORT, () => {
    console.log('\n🎬 ===============================================');
    console.log('🚀 SERVER API GALAXY CINEMA ĐÃ KHỞI ĐỘNG');
    console.log('===============================================');
    console.info(`🌐 Server đang chạy tại: http://localhost:${PORT}`);
    console.info(`📚 Tài liệu API: http://localhost:${PORT}/api-docs`);
    console.info(`🔧 Môi trường: ${NODE_ENV}`);
    console.info(`📅 Thời gian khởi động: ${new Date().toISOString()}`);
    console.info(`🔌 WebSocket server sẵn sàng cho real-time seat selection`);
    console.log('===============================================\n');

    // Khởi động các tiến trình chạy nền sau khi server sẵn sàng.
    if (NODE_ENV !== 'test') {
        setTimeout(startServices, 1000);
    }
});

// Xử lý lỗi của server (ví dụ: cổng đã được sử dụng).
server.on('error', (error) => {
    if (error.syscall !== 'listen') throw error;
    switch (error.code) {
        case 'EACCES':
            console.error(`❌ Cổng ${PORT} yêu cầu quyền quản trị.`);
            process.exit(1);
        case 'EADDRINUSE':
            console.error(`❌ Cổng ${PORT} đã được sử dụng.`);
            process.exit(1);
        default:
            throw error;
    }
});

// Export app để có thể sử dụng cho việc kiểm thử (testing).
module.exports = app;

// Khởi tạo hệ thống queue
const logger = require('./utils/logger');
try {
  // Kiểm tra có biến môi trường redis hay không
  const hasRedis = process.env.REDIS_HOST || process.env.REDIS_URL;
  
  if (hasRedis) {
    logger.info('Khởi tạo hệ thống email queue với Redis...');
    require('./queues');
    logger.info('Hệ thống email queue đã được khởi tạo thành công!');
  } else {
    logger.info('⚠️ Không cấu hình Redis - hệ thống sẽ gửi email trực tiếp trong background');
  }
} catch (queueError) {
  logger.warn(`⚠️ Không thể khởi tạo queue (${queueError.message}) - email sẽ được gửi trực tiếp trong background`);
}
