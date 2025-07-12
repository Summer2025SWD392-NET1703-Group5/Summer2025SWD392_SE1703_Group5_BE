// src/routes/seatSelectionRoutes.js
// Routes cho real-time seat selection

const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const seatSelectionController = require('../controllers/seatSelectionController');
const authMiddleware = require('../middlewares/authMiddleware');



/**
 * @swagger
 * components:
 *   schemas:
 *     SeatState:
 *       type: object
 *       properties:
 *         seatId:
 *           type: integer
 *           description: ID của ghế (Layout_ID)
 *         row:
 *           type: string
 *           description: Hàng ghế (A, B, C...)
 *         column:
 *           type: integer
 *           description: Cột ghế (1, 2, 3...)
 *         seatType:
 *           type: string
 *           description: Loại ghế (Thường, VIP)
 *         status:
 *           type: string
 *           enum: [available, selecting, booked]
 *           description: Trạng thái ghế
 *         userId:
 *           type: integer
 *           description: ID user đang chọn ghế (nếu có)
 *         timestamp:
 *           type: integer
 *           description: Thời gian chọn ghế (timestamp)
 *     
 *     SeatSelectionRequest:
 *       type: object
 *       required:
 *         - showtimeId
 *         - seatId
 *       properties:
 *         showtimeId:
 *           type: integer
 *           description: ID suất chiếu
 *         seatId:
 *           type: integer
 *           description: ID ghế cần chọn/bỏ chọn
 *     
 *     SeatStatistics:
 *       type: object
 *       properties:
 *         totalShowtimes:
 *           type: integer
 *           description: Số suất chiếu đang có người xem
 *         totalActiveSeats:
 *           type: integer
 *           description: Số ghế đang được chọn
 *         memoryUsage:
 *           type: object
 *           description: Thông tin sử dụng memory
 */

/**
 * @swagger
 * /api/seat-selection/showtime/{showtimeId}:
 *   get:
 *     summary: Lấy trạng thái tất cả ghế cho suất chiếu
 *     tags: [Seat Selection]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: showtimeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID suất chiếu
 *     responses:
 *       200:
 *         description: Lấy trạng thái ghế thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     showtimeId:
 *                       type: integer
 *                     seats:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/SeatState'
 *                     totalSeats:
 *                       type: integer
 *                     availableSeats:
 *                       type: integer
 *                     selectingSeats:
 *                       type: integer
 *                     bookedSeats:
 *                       type: integer
 *                 message:
 *                   type: string
 *       400:
 *         description: Dữ liệu đầu vào không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       404:
 *         description: Không tìm thấy suất chiếu
 *       500:
 *         description: Lỗi server
 */
router.get('/showtime/:showtimeId',
    authMiddleware.authMiddleware,
    param('showtimeId').isInt().withMessage('Showtime ID phải là số nguyên'),
    seatSelectionController.getShowtimeSeats
);

/**
 * @swagger
 * /api/seat-selection/select:
 *   post:
 *     summary: Chọn ghế (REST API backup cho WebSocket)
 *     tags: [Seat Selection]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SeatSelectionRequest'
 *     responses:
 *       200:
 *         description: Chọn ghế thành công
 *       400:
 *         description: Dữ liệu đầu vào không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       409:
 *         description: Ghế đang được chọn bởi người khác
 *       500:
 *         description: Lỗi server
 */
router.post('/select',
    authMiddleware.authMiddleware,
    [
        body('showtimeId').isInt().withMessage('Showtime ID phải là số nguyên'),
        body('seatId').isInt().withMessage('Seat ID phải là số nguyên')
    ],
    seatSelectionController.selectSeat
);

/**
 * @swagger
 * /api/seat-selection/deselect:
 *   post:
 *     summary: Bỏ chọn ghế (REST API backup cho WebSocket)
 *     tags: [Seat Selection]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SeatSelectionRequest'
 *     responses:
 *       200:
 *         description: Bỏ chọn ghế thành công
 *       400:
 *         description: Dữ liệu đầu vào không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền bỏ chọn ghế này
 *       500:
 *         description: Lỗi server
 */
router.post('/deselect',
    authMiddleware.authMiddleware,
    [
        body('showtimeId').isInt().withMessage('Showtime ID phải là số nguyên'),
        body('seatId').isInt().withMessage('Seat ID phải là số nguyên')
    ],
    seatSelectionController.deselectSeat
);

/**
 * @swagger
 * /api/seat-selection/statistics:
 *   get:
 *     summary: Lấy thống kê real-time (Admin only)
 *     tags: [Seat Selection]
 *     security:
 *       - bearerAuth: []
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
 *                 data:
 *                   $ref: '#/components/schemas/SeatStatistics'
 *                 message:
 *                   type: string
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/statistics',
    authMiddleware.authMiddleware,
    seatSelectionController.getStatistics
);

/**
 * @swagger
 * /api/seat-selection/release-user-seats:
 *   post:
 *     summary: Giải phóng ghế của user (Admin only)
 *     tags: [Seat Selection]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: integer
 *                 description: ID user cần giải phóng ghế
 *     responses:
 *       200:
 *         description: Giải phóng ghế thành công
 *       400:
 *         description: Dữ liệu đầu vào không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.post('/release-user-seats',
    authMiddleware.authMiddleware,
    body('userId').isInt().withMessage('User ID phải là số nguyên'),
    seatSelectionController.releaseUserSeats
);

/**
 * @swagger
 * /api/seat-selection/cleanup:
 *   post:
 *     summary: Cleanup ghế timeout (Admin only)
 *     tags: [Seat Selection]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cleanup thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.post('/cleanup',
    authMiddleware.authMiddleware,
    seatSelectionController.cleanupExpiredSeats
);

/**
 * @swagger
 * /api/seat-selection/expiring-seats:
 *   get:
 *     summary: Lấy danh sách ghế sắp hết hạn (Admin only)
 *     tags: [Seat Selection]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách thành công
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/expiring-seats',
    authMiddleware.authMiddleware,
    seatSelectionController.getExpiringSeats
);

/**
 * @swagger
 * /api/seat-selection/extend-hold:
 *   post:
 *     summary: Gia hạn thời gian giữ ghế
 *     tags: [Seat Selection]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SeatSelectionRequest'
 *     responses:
 *       200:
 *         description: Gia hạn thành công
 *       400:
 *         description: Dữ liệu đầu vào không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền gia hạn ghế này
 *       500:
 *         description: Lỗi server
 */
router.post('/extend-hold',
    authMiddleware.authMiddleware,
    [
        body('showtimeId').isInt().withMessage('Showtime ID phải là số nguyên'),
        body('seatId').isInt().withMessage('Seat ID phải là số nguyên')
    ],
    seatSelectionController.extendSeatHold
);

/**
 * @swagger
 * /api/seat-selection/health:
 *   get:
 *     summary: Health check cho WebSocket service
 *     tags: [Seat Selection]
 *     responses:
 *       200:
 *         description: Service đang hoạt động bình thường
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                     uptime:
 *                       type: number
 *                     timestamp:
 *                       type: string
 *                     stats:
 *                       $ref: '#/components/schemas/SeatStatistics'
 *                 message:
 *                   type: string
 *       500:
 *         description: Service có vấn đề
 */
router.get('/health', seatSelectionController.healthCheck);

module.exports = router;