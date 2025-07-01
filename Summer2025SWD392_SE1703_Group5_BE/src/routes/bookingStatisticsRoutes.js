// routes/bookingStatisticsRoutes.js
const express = require('express');
const router = express.Router();
const bookingStatisticsController = require('../controllers/bookingStatisticsController');

// Import middleware
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');

// Middleware xác thực cho tất cả routes
router.use(authMiddleware);

// Routes chỉ dành cho Admin và Staff
router.use(authorizeRoles('Admin', 'Staff', 'Manager'));

/**
 * @swagger
 * components:
 *   schemas:
 *     BookingStatisticsDTO:
 *       type: object
 *       properties:
 *         startDate:
 *           type: string
 *           format: date-time
 *           description: Ngày bắt đầu
 *         endDate:
 *           type: string
 *           format: date-time
 *           description: Ngày kết thúc
 *         totalBookings:
 *           type: integer
 *           description: Tổng số booking
 *         confirmedBookings:
 *           type: integer
 *           description: Số booking đã xác nhận
 *         cancelledBookings:
 *           type: integer
 *           description: Số booking đã hủy
 *         totalRevenue:
 *           type: number
 *           format: float
 *           description: Tổng doanh thu
 *         averageTicketsPerBooking:
 *           type: number
 *           format: float
 *           description: Trung bình số vé trên mỗi booking
 *         movieStatistics:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/MovieStatisticsDTO'
 *         roomStatistics:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/RoomStatisticsDTO'
 *         dailyStatistics:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DailyStatisticsDTO'
 *         paymentMethodStatistics:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PaymentMethodStatisticsDTO'
 *     
 *     MovieStatisticsDTO:
 *       type: object
 *       properties:
 *         movieId:
 *           type: integer
 *           description: ID phim
 *         movieName:
 *           type: string
 *           description: Tên phim
 *         totalBookings:
 *           type: integer
 *           description: Tổng số booking
 *         totalTickets:
 *           type: integer
 *           description: Tổng số vé
 *         totalRevenue:
 *           type: number
 *           format: float
 *           description: Tổng doanh thu
 *         averageTicketsPerBooking:
 *           type: number
 *           format: float
 *           description: Trung bình vé/booking
 *     
 *     RoomStatisticsDTO:
 *       type: object
 *       properties:
 *         roomId:
 *           type: integer
 *           description: ID phòng chiếu
 *         roomName:
 *           type: string
 *           description: Tên phòng chiếu
 *         totalBookings:
 *           type: integer
 *           description: Tổng số booking
 *         totalTickets:
 *           type: integer
 *           description: Tổng số vé
 *         totalRevenue:
 *           type: number
 *           format: float
 *           description: Tổng doanh thu
 *         occupancyRate:
 *           type: number
 *           format: float
 *           description: Tỷ lệ lấp đầy (%)
 *     
 *     DailyStatisticsDTO:
 *       type: object
 *       properties:
 *         date:
 *           type: string
 *           format: date
 *           description: Ngày
 *         totalBookings:
 *           type: integer
 *           description: Tổng booking trong ngày
 *         totalTickets:
 *           type: integer
 *           description: Tổng vé trong ngày
 *         totalRevenue:
 *           type: number
 *           format: float
 *           description: Doanh thu trong ngày
 *     
 *     PaymentMethodStatisticsDTO:
 *       type: object
 *       properties:
 *         paymentMethod:
 *           type: string
 *           description: Phương thức thanh toán
 *         totalBookings:
 *           type: integer
 *           description: Số booking sử dụng phương thức này
 *         totalAmount:
 *           type: number
 *           format: float
 *           description: Tổng số tiền
 *         percentage:
 *           type: number
 *           format: float
 *           description: Tỷ lệ phần trăm
 *   
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /api/booking-statistics:
 *   get:
 *     summary: Lấy thống kê đặt vé và doanh thu
 *     description: Lấy thống kê tổng quan về đặt vé và doanh thu theo khoảng thời gian (Admin/Staff)
 *     tags: [Booking Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày bắt đầu (YYYY-MM-DD)
 *         example: "2024-01-01"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày kết thúc (YYYY-MM-DD)
 *         example: "2024-12-31"
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
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/BookingStatisticsDTO'
 *       400:
 *         description: Tham số không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/', bookingStatisticsController.getBookingStatistics);

/**
 * @swagger
 * /api/booking-statistics/all:
 *   get:
 *     summary: Lấy tất cả dữ liệu thống kê
 *     description: Lấy tất cả dữ liệu thống kê để FE tự filter theo ngày (Admin/Staff)
 *     tags: [Booking Statistics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy tất cả thống kê thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/BookingStatisticsDTO'
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/all', bookingStatisticsController.getAllBookingStatistics);

/**
 * @swagger
 * /api/booking-statistics/movies:
 *   get:
 *     summary: Lấy thống kê theo phim
 *     description: Lấy thống kê đặt vé và doanh thu theo từng phim (Admin/Staff)
 *     tags: [Booking Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày bắt đầu (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày kết thúc (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Lấy thống kê phim thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MovieStatisticsDTO'
 *       400:
 *         description: Tham số không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/movies', bookingStatisticsController.getMovieStatistics);

/**
 * @swagger
 * /api/booking-statistics/rooms:
 *   get:
 *     summary: Lấy thống kê theo phòng chiếu
 *     description: Lấy thống kê đặt vé và doanh thu theo từng phòng chiếu (Admin/Staff)
 *     tags: [Booking Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày bắt đầu (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày kết thúc (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Lấy thống kê phòng chiếu thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/RoomStatisticsDTO'
 *       400:
 *         description: Tham số không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/rooms', bookingStatisticsController.getRoomStatistics);

/**
 * @swagger
 * /api/booking-statistics/daily:
 *   get:
 *     summary: Lấy thống kê theo ngày
 *     description: Lấy thống kê đặt vé và doanh thu theo từng ngày (Admin/Staff)
 *     tags: [Booking Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày bắt đầu (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày kết thúc (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Lấy thống kê theo ngày thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DailyStatisticsDTO'
 *       400:
 *         description: Tham số không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/daily', bookingStatisticsController.getDailyStatistics);

/**
 * @swagger
 * /api/booking-statistics/payment-methods:
 *   get:
 *     summary: Lấy thống kê theo phương thức thanh toán
 *     description: Lấy thống kê đặt vé và doanh thu theo phương thức thanh toán (Admin/Staff)
 *     tags: [Booking Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày bắt đầu (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày kết thúc (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Lấy thống kê phương thức thanh toán thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PaymentMethodStatisticsDTO'
 *       400:
 *         description: Tham số không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/payment-methods', bookingStatisticsController.getPaymentMethodStatistics);

module.exports = router;
