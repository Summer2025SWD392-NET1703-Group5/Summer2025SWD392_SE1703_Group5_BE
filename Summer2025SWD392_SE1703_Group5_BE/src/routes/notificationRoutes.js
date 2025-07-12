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

/**
 * @swagger
 * /api/notifications/unread-count:
 *   get:
 *     summary: Lấy số lượng thông báo chưa đọc (Yêu cầu đăng nhập)
 *     description: >
 *       API này cho phép người dùng đã đăng nhập kiểm tra số lượng thông báo chưa đọc của họ
 *       trong vòng 7 ngày gần đây. Thường được sử dụng để hiển thị số thông báo trên biểu tượng
 *       thông báo trong giao diện người dùng.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy số lượng thông báo chưa đọc thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnreadCountResponse'
 *             example:
 *               success: true
 *               unreadCount: 5
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Lỗi server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/unread-count', (req, res) => notificationController.getUnreadCount(req, res));

/**
 * @swagger
 * /api/notifications/mark-all-read:
 *   put:
 *     summary: Đánh dấu tất cả thông báo là đã đọc (Yêu cầu đăng nhập)
 *     description: >
 *       API này cho phép người dùng đã đăng nhập đánh dấu tất cả thông báo chưa đọc của họ thành đã đọc.
 *       Hệ thống sẽ cập nhật trạng thái của tất cả thông báo và trả về số lượng thông báo đã được cập nhật.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Đánh dấu thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MarkAsReadResponse'
 *             example:
 *               success: true
 *               message: "Đã đánh dấu 3 thông báo là đã đọc"
 *               updatedCount: 3
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Lỗi server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/mark-all-read', (req, res) => notificationController.markAllNotificationsAsRead(req, res));

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   put:
 *     summary: Đánh dấu một thông báo cụ thể là đã đọc (Yêu cầu đăng nhập)
 *     description: >
 *       API này cho phép người dùng đã đăng nhập đánh dấu một thông báo cụ thể của họ thành đã đọc.
 *       Hệ thống sẽ kiểm tra xem thông báo có thuộc về người dùng không trước khi thực hiện cập nhật.
 *       Người dùng chỉ có thể cập nhật thông báo của chính mình.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID của thông báo cần đánh dấu đã đọc
 *         schema:
 *           type: integer
 *           example: 123
 *     responses:
 *       200:
 *         description: Đánh dấu thành công
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
 *                   example: "Đã đánh dấu thông báo là đã đọc"
 *       400:
 *         description: ID thông báo không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "ID thông báo không hợp lệ"
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Không tìm thấy thông báo hoặc thông báo không thuộc về người dùng
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: "Không tìm thấy thông báo hoặc bạn không có quyền truy cập"
 *       500:
 *         description: Lỗi server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:id/read', (req, res) => notificationController.markNotificationAsRead(req, res));

module.exports = router;