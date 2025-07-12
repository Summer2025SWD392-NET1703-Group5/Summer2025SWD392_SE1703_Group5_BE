// routes/bookingExpirationRoutes.js
const express = require('express');
const router = express.Router();
const bookingExpirationController = require('../controllers/bookingExpirationController');

// Import middleware từ authMiddleware (đã có sẵn authorizeRoles)
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');

// Middleware xác thực cho tất cả routes
router.use(authMiddleware);

// Routes chỉ dành cho Admin
router.use(authorizeRoles('Admin'));

/**
 * @swagger
 * components:
 *   schemas:
 *     BookingExpirationResult:
 *       type: object
 *       properties:
 *         bookingId:
 *           type: integer
 *           description: ID của booking
 *         userId:
 *           type: integer
 *           description: ID của user
 *         success:
 *           type: boolean
 *           description: Trạng thái xử lý
 *         originalStatus:
 *           type: string
 *           description: Trạng thái ban đầu
 *         pointsRefunded:
 *           type: integer
 *           description: Số điểm đã hoàn trả
 *         message:
 *           type: string
 *           description: Thông báo kết quả
 *     
 *     BookingNearExpiration:
 *       type: object
 *       properties:
 *         Booking_ID:
 *           type: integer
 *           description: ID của booking
 *         User_ID:
 *           type: integer
 *           description: ID của user
 *         User_Name:
 *           type: string
 *           description: Tên người dùng
 *         User_Email:
 *           type: string
 *           description: Email người dùng
 *         Total_Amount:
 *           type: number
 *           format: float
 *           description: Tổng số tiền
 *         Payment_Deadline:
 *           type: string
 *           format: date-time
 *           description: Hạn thanh toán
 *         Minutes_Left:
 *           type: integer
 *           description: Số phút còn lại
 *     
 *     ExpirationStats:
 *       type: object
 *       properties:
 *         total_expired:
 *           type: integer
 *           description: Tổng số booking quá hạn
 *         total_amount_lost:
 *           type: number
 *           format: float
 *           description: Tổng số tiền mất
 *         total_points_refunded:
 *           type: integer
 *           description: Tổng điểm đã hoàn trả
 *         date:
 *           type: string
 *           format: date
 *           description: Ngày thống kê
 *     
 *     ServiceStatus:
 *       type: object
 *       properties:
 *         isRunning:
 *           type: boolean
 *           description: Trạng thái service
 *         message:
 *           type: string
 *           description: Thông báo trạng thái
 *         currentTime:
 *           type: string
 *           format: date-time
 *           description: Thời gian hiện tại
 *   
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 * 
 * security:
 *   - bearerAuth: []
 * 
 * tags:
 *   name: Booking Expiration
 *   description: API quản lý booking quá hạn thanh toán
 */

/**
 * @swagger
 * /api/booking-expiration/check-expired:
 *   get:
 *     summary: Kiểm tra và xử lý booking quá hạn thanh toán
 *     tags: [Booking Expiration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Kiểm tra thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Kiểm tra booking quá hạn hoàn tất"
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Đã xử lý 3 booking quá hạn"
 *                     results:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/BookingExpirationResult'
 *       401:
 *         description: Không có quyền truy cập
 *       403:
 *         description: Chỉ Admin mới có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/check-expired', bookingExpirationController.checkExpiredBookings);

/**
 * @swagger
 * /api/booking-expiration/force-check/{bookingId}:
 *   get:
 *     summary: Force check một booking cụ thể
 *     tags: [Booking Expiration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của booking cần kiểm tra
 *         example: 123
 *     responses:
 *       200:
 *         description: Kiểm tra thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Đã xử lý booking 123"
 *                 data:
 *                   $ref: '#/components/schemas/BookingExpirationResult'
 *       400:
 *         description: Booking chưa quá hạn hoặc không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Booking 123 chưa quá hạn"
 *       401:
 *         description: Không có quyền truy cập
 *       403:
 *         description: Chỉ Admin mới có quyền truy cập
 *       404:
 *         description: Không tìm thấy booking
 *       500:
 *         description: Lỗi server
 */
router.get('/force-check/:bookingId', bookingExpirationController.forceCheckBooking);

/**
 * @swagger
 * /api/booking-expiration/stats:
 *   get:
 *     summary: Lấy thống kê booking quá hạn theo khoảng thời gian
 *     tags: [Booking Expiration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày bắt đầu (YYYY-MM-DD)
 *         example: "2024-01-01"
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày kết thúc (YYYY-MM-DD)
 *         example: "2024-01-31"
 *     responses:
 *       200:
 *         description: Lấy thống kê thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Lấy thống kê thành công"
 *                 data:
 *                   type: object
 *                   properties:
 *                     period:
 *                       type: object
 *                       properties:
 *                         startDate:
 *                           type: string
 *                           format: date
 *                         endDate:
 *                           type: string
 *                           format: date
 *                     stats:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ExpirationStats'
 *       400:
 *         description: Thiếu tham số hoặc định dạng ngày không hợp lệ
 *       401:
 *         description: Không có quyền truy cập
 *       403:
 *         description: Chỉ Admin mới có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/stats', bookingExpirationController.getExpirationStats);

/**
 * @swagger
 * /api/booking-expiration/near-expiration:
 *   get:
 *     summary: Lấy danh sách booking sắp hết hạn thanh toán
 *     tags: [Booking Expiration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: minutes
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 5
 *           maximum: 120
 *           default: 30
 *         description: Số phút trước khi hết hạn để cảnh báo
 *         example: 30
 *     responses:
 *       200:
 *         description: Lấy danh sách thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Tìm thấy 5 booking sắp hết hạn"
 *                 data:
 *                   type: object
 *                   properties:
 *                     minutesBefore:
 *                       type: integer
 *                       example: 30
 *                     count:
 *                       type: integer
 *                       example: 5
 *                     bookings:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/BookingNearExpiration'
 *       400:
 *         description: Tham số không hợp lệ
 *       401:
 *         description: Không có quyền truy cập
 *       403:
 *         description: Chỉ Admin mới có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/near-expiration', bookingExpirationController.getBookingsNearExpiration);

/**
 * @swagger
 * /api/booking-expiration/status:
 *   get:
 *     summary: Lấy trạng thái hoạt động của service
 *     tags: [Booking Expiration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy trạng thái thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ServiceStatus'
 *       401:
 *         description: Không có quyền truy cập
 *       403:
 *         description: Chỉ Admin mới có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/status', bookingExpirationController.getServiceStatus);

/**
 * @swagger
 * /api/booking-expiration/start:
 *   post:
 *     summary: Khởi động service kiểm tra booking quá hạn
 *     tags: [Booking Expiration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Khởi động service thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Service đã được khởi động"
 *                 isRunning:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: Không có quyền truy cập
 *       403:
 *         description: Chỉ Admin mới có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.post('/start', bookingExpirationController.startService);

/**
 * @swagger
 * /api/booking-expiration/stop:
 *   post:
 *     summary: Dừng service kiểm tra booking quá hạn
 *     tags: [Booking Expiration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dừng service thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Service đã được dừng"
 *                 isRunning:
 *                   type: boolean
 *                   example: false
 *       401:
 *         description: Không có quyền truy cập
 *       403:
 *         description: Chỉ Admin mới có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.post('/stop', bookingExpirationController.stopService);

module.exports = router;