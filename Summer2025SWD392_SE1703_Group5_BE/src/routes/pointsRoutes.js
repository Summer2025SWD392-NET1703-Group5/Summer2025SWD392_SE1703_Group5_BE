// src/routes/pointsRoutes.js
const express = require('express');
const router = express.Router();
const pointsController = require('../controllers/pointsController');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');

/**
 * @swagger
 * components:
 *   schemas:
 *     UserPointsDTO:
 *       type: object
 *       properties:
 *         user_id:
 *           type: integer
 *           description: ID của người dùng
 *         total_points:
 *           type: integer
 *           description: Tổng số điểm hiện có
 *         last_updated:
 *           type: string
 *           format: date-time
 *           description: Thời gian cập nhật cuối cùng
 *       example:
 *         user_id: 123
 *         total_points: 1500
 *         last_updated: "2024-01-15T10:30:00Z"
 * 
 *     PointsEarningDTO:
 *       type: object
 *       properties:
 *         earning_id:
 *           type: integer
 *           description: ID bản ghi tích điểm
 *         user_id:
 *           type: integer
 *           description: ID người dùng
 *         booking_id:
 *           type: integer
 *           description: ID đơn đặt vé
 *         actual_amount:
 *           type: number
 *           format: decimal
 *           description: Số tiền thực tế
 *         points_earned:
 *           type: integer
 *           description: Số điểm được tích
 *         date:
 *           type: string
 *           format: date-time
 *           description: Ngày tích điểm
 *       example:
 *         earning_id: 456
 *         user_id: 123
 *         booking_id: 789
 *         actual_amount: 150000
 *         points_earned: 7500
 *         date: "2024-01-15T14:30:00Z"
 * 
 *     PointsRedemptionDTO:
 *       type: object
 *       properties:
 *         redemption_id:
 *           type: integer
 *           description: ID bản ghi đổi điểm
 *         user_id:
 *           type: integer
 *           description: ID người dùng
 *         points_redeemed:
 *           type: integer
 *           description: Số điểm đã đổi
 *         date:
 *           type: string
 *           format: date-time
 *           description: Ngày đổi điểm
 *         status:
 *           type: string
 *           description: Trạng thái giao dịch
 *         note:
 *           type: string
 *           description: Ghi chú
 *       example:
 *         redemption_id: 321
 *         user_id: 123
 *         points_redeemed: 1000
 *         date: "2024-01-15T16:00:00Z"
 *         status: "Completed"
 *         note: "Áp dụng điểm giảm giá cho booking 789"
 * 
 *     BookingResponseDTO:
 *       type: object
 *       properties:
 *         booking_id:
 *           type: integer
 *           description: ID đơn đặt vé
 *         original_total_amount:
 *           type: number
 *           format: decimal
 *           description: Tổng tiền ban đầu
 *         discounted_total_amount:
 *           type: number
 *           format: decimal
 *           description: Tổng tiền sau giảm giá
 *         points_used:
 *           type: integer
 *           description: Số điểm đã sử dụng
 *         current_points:
 *           type: integer
 *           description: Số điểm còn lại
 *         user_id:
 *           type: integer
 *           description: ID người dùng
 *         movie_name:
 *           type: string
 *           description: Tên phim
 *         room_name:
 *           type: string
 *           description: Tên phòng chiếu
 *         show_date:
 *           type: string
 *           format: date
 *           description: Ngày chiếu
 *         start_time:
 *           type: string
 *           format: time
 *           description: Giờ chiếu
 *       example:
 *         booking_id: 789
 *         original_total_amount: 200000
 *         discounted_total_amount: 150000
 *         points_used: 5000
 *         current_points: 10000
 *         user_id: 123
 *         movie_name: "Spider-Man: No Way Home"
 *         room_name: "Phòng VIP 1"
 *         show_date: "2024-01-20"
 *         start_time: "19:30:00"
 */

/**
 * @swagger
 * /api/points/my-points:
 *   get:
 *     summary: Lấy thông tin điểm hiện tại của người dùng đăng nhập (Yêu cầu đăng nhập)
 *     tags: [Points]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin điểm của người dùng
 *       401:
 *         description: Không thể xác thực người dùng
 *       500:
 *         description: Lỗi server
 */
router.get('/my-points', authMiddleware, pointsController.getMyPoints);

/**
 * @swagger
 * /api/points/earning-history:
 *   get:
 *     summary: Lấy lịch sử tích điểm của người dùng đăng nhập (Yêu cầu đăng nhập)
 *     tags: [Points]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách lịch sử tích điểm
 *       401:
 *         description: Không thể xác thực người dùng
 *       500:
 *         description: Lỗi server
 */
router.get('/earning-history', authMiddleware, pointsController.getEarningHistory);

/**
 * @swagger
 * /api/points/redemption-history:
 *   get:
 *     summary: Lấy lịch sử sử dụng điểm của người dùng đăng nhập (Yêu cầu đăng nhập)
 *     tags: [Points]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách lịch sử sử dụng điểm
 *       401:
 *         description: Không thể xác thực người dùng
 *       500:
 *         description: Lỗi server
 */
router.get('/redemption-history', authMiddleware, pointsController.getRedemptionHistory);

/**
 * @swagger
 * /api/points/users/{userId}:
 *   get:
 *     summary: Lấy thông tin điểm của một người dùng cụ thể (Chỉ Admin)
 *     tags: [Points - Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của người dùng cần lấy thông tin điểm
 *         example: 123
 *     responses:
 *       200:
 *         description: Thông tin điểm của người dùng
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/users/:userId', authMiddleware, authorizeRoles('Admin'), pointsController.getUserPoints);

    /**
 * @swagger
 * /api/points/user/{userId}:
 *   get:
 *     summary: Lấy thông tin điểm của một người dùng theo User ID (API công khai)
 *     tags: [Points]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của người dùng cần lấy thông tin điểm
 *         example: 123
 *     responses:
 *       200:
 *         description: Thông tin điểm của người dùng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/UserPointsDTO'
 *       400:
 *         description: ID người dùng không hợp lệ
 *       500:
 *         description: Lỗi server
 */
router.get('/user/:userId', pointsController.getPointsByUserId);

/**
 * @swagger
 * /api/points/users/{userId}/earning-history:
 *   get:
 *     summary: Lấy lịch sử tích điểm của một người dùng cụ thể (Chỉ Admin)
 *     tags: [Points - Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của người dùng cần lấy lịch sử tích điểm
 *         example: 123
 *     responses:
 *       200:
 *         description: Danh sách lịch sử tích điểm
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/users/:userId/earning-history', authMiddleware, authorizeRoles('Admin'), async (req, res) => {
    try {
        const { userId } = req.params;
        const history = await pointsService.getPointsEarningHistory(parseInt(userId));
        return res.status(200).json(history);
    } catch (error) {
        logger.error(`Error getting points earning history for user ${userId}:`, error);
        return res.status(500).json({
            message: 'Có lỗi xảy ra khi lấy lịch sử tích điểm'
        });
    }
});

/**
 * @swagger
 * /api/points/users/{userId}/redemption-history:
 *   get:
 *     summary: Lấy lịch sử sử dụng điểm của một người dùng cụ thể (Chỉ Admin)
 *     tags: [Points - Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của người dùng cần lấy lịch sử sử dụng điểm
 *         example: 123
 *     responses:
 *       200:
 *         description: Danh sách lịch sử sử dụng điểm
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/users/:userId/redemption-history', authMiddleware, authorizeRoles('Admin'), async (req, res) => {
    try {
        const { userId } = req.params;
        const history = await pointsService.getPointsRedemptionHistory(parseInt(userId));
        return res.status(200).json(history);
    } catch (error) {
        logger.error(`Error getting points redemption history for user ${userId}:`, error);
        return res.status(500).json({
            message: 'Có lỗi xảy ra khi lấy lịch sử sử dụng điểm'
        });
    }
});

/**
 * @swagger
 * /api/points/booking/{bookingId}/apply-discount:
 *   post:
 *     summary: Áp dụng điểm giảm giá cho booking (Yêu cầu đăng nhập)
 *     tags: [Points]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của đơn đặt vé cần áp dụng điểm giảm giá
 *         example: 789
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pointsToUse
 *             properties:
 *               pointsToUse:
 *                 type: integer
 *                 description: Số điểm muốn sử dụng để giảm giá
 *                 minimum: 1
 *                 example: 5000
 *           example:
 *             pointsToUse: 5000
 *     responses:
 *       200:
 *         description: Áp dụng điểm giảm giá thành công
 *       400:
 *         description: Yêu cầu không hợp lệ
 *       403:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy đơn đặt vé
 *       500:
 *         description: Lỗi server
 */
router.post('/booking/:bookingId/apply-discount', authMiddleware, pointsController.applyPointsDiscount);

/**
 * @swagger
 * /api/points/all:
 *   get:
 *     summary: Lấy danh sách điểm của tất cả người dùng (Chỉ Admin)
 *     tags: [Points]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách điểm của tất cả người dùng
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/all', authMiddleware, authorizeRoles(['Admin']), pointsController.getAllUserPoints);

module.exports = router;

