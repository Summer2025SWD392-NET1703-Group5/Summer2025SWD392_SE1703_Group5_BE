// File: src/routes/notificationRoutes.js
const express = require('express');
const NotificationController = require('../controllers/notificationController');
const { authMiddleware } = require('../middlewares/authMiddleware'); // Sửa từ '../middleware/' thành '../middlewares/'

const router = express.Router();
const notificationController = new NotificationController();

// Middleware xác thực cho tất cả routes
router.use(authMiddleware);

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: API quản lý thông báo người dùng
 */

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Lấy danh sách thông báo của người dùng (Yêu cầu đăng nhập)
 *     description: >
 *       API này cho phép người dùng đã đăng nhập xem tất cả thông báo của họ,
 *       bao gồm thông tin về đặt vé, điểm thưởng, nhắc nhở và các thông báo hệ thống khác.
 *       Mỗi người dùng chỉ có thể xem thông báo của chính mình.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách thông báo thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotificationListResponse'
 *             example:
 *               Success: true
 *               TotalCount: 10
 *               UnreadCount: 3
 *               Notifications:
 *                 - Notification_ID: 123
 *                   Title: "Đặt vé thành công"
 *                   Content: "Bạn đã đặt vé thành công cho phim 'Avengers' vào lúc 19:30 25/05/2025"
 *                   Creation_Date: "2025-05-29T10:30:00.000Z"
 *                   Is_Read: false
 *                   Read_Date: null
 *                   Type: "success"
 *                   Related_ID: 456
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "Không tìm thấy thông tin người dùng"
 *       500:
 *         description: Lỗi server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "Đã xảy ra lỗi khi lấy danh sách thông báo"
 */
router.get('/', (req, res) => notificationController.getNotifications(req, res));

module.exports = router;
