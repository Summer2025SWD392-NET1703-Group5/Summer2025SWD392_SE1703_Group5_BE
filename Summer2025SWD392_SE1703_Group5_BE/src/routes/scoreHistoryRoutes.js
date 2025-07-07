const express = require('express');
const router = express.Router();
const scoreHistoryController = require('../controllers/scoreHistoryController');
const { authMiddleware } = require('../middlewares/authMiddleware'); // ⚠️ SỬA ĐÂY: destructure authMiddleware

/**
 * @swagger
 * components:
 *   schemas:
 *     CurrentPoints:
 *       type: object
 *       properties:
 *         user_id:
 *           type: integer
 *           description: ID của người dùng
 *         total_points:
 *           type: integer
 *           description: Tổng điểm hiện tại
 *         points_earned:
 *           type: integer
 *           description: Tổng điểm đã tích lũy
 *         points_used:
 *           type: integer
 *           description: Tổng điểm đã sử dụng
 *         last_updated:
 *           type: string
 *           format: date-time
 *           description: Thời gian cập nhật cuối
 *       example:
 *         user_id: 1
 *         total_points: 1500
 *         points_earned: 2000
 *         points_used: 500
 *         last_updated: "2024-05-29T12:30:00Z"
 * 
 *     EarningHistory:
 *       type: object
 *       properties:
 *         earning_id:
 *           type: integer
 *           description: ID của giao dịch tích điểm
 *         points_earned:
 *           type: integer
 *           description: Số điểm được tích
 *         earned_date:
 *           type: string
 *           format: date-time
 *           description: Ngày tích điểm
 *         booking_id:
 *           type: integer
 *           description: ID booking liên quan
 *         actual_amount:
 *           type: number
 *           format: decimal
 *           description: Số tiền thực tế của giao dịch
 *         description:
 *           type: string
 *           description: Mô tả giao dịch
 *         movie_name:
 *           type: string
 *           description: Tên phim (nếu có)
 *         show_date:
 *           type: string
 *           format: date
 *           description: Ngày chiếu (nếu có)
 *         booking_amount:
 *           type: number
 *           format: decimal
 *           description: Tổng tiền booking (nếu có)
 *       example:
 *         earning_id: 123
 *         points_earned: 100
 *         earned_date: "2024-05-29T10:30:00Z"
 *         booking_id: 456
 *         actual_amount: 200000
 *         description: "Tích điểm từ booking #456"
 *         movie_name: "Spider-Man: No Way Home"
 *         show_date: "2024-05-29"
 *         booking_amount: 200000
 * 
 *     RedemptionHistory:
 *       type: object
 *       properties:
 *         redemption_id:
 *           type: integer
 *           description: ID của giao dịch sử dụng điểm
 *         points_used:
 *           type: integer
 *           description: Số điểm đã sử dụng
 *         redeemed_date:
 *           type: string
 *           format: date-time
 *           description: Ngày sử dụng điểm
 *         status:
 *           type: string
 *           description: Trạng thái giao dịch
 *           enum: [completed, pending, cancelled]
 *         description:
 *           type: string
 *           description: Mô tả việc sử dụng điểm
 *         booking_id:
 *           type: integer
 *           nullable: true
 *           description: ID booking liên quan (nếu có)
 *         promotion_id:
 *           type: integer
 *           nullable: true
 *           description: ID khuyến mãi liên quan (nếu có)
 *       example:
 *         redemption_id: 789
 *         points_used: 50
 *         redeemed_date: "2024-05-29T11:00:00Z"
 *         status: "completed"
 *         description: "Sử dụng điểm"
 *         booking_id: null
 *         promotion_id: 10
 * 
 *     ScoreHistoryResponse:
 *       type: object
 *       properties:
 *         CurrentPoints:
 *           $ref: '#/components/schemas/CurrentPoints'
 *         EarningsHistory:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/EarningHistory'
 *         RedemptionsHistory:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/RedemptionHistory'
 * 
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           example: "Mã khách hàng không hợp lệ"
 * 
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /api/score-history/user/{userId}:
 *   get:
 *     summary: Lấy lịch sử tích và sử dụng điểm của khách hàng (Yêu cầu đăng nhập)
 *     description: |
 *       API này cho phép người dùng đã đăng nhập xem lịch sử tích điểm và sử dụng điểm của một khách hàng cụ thể.
 *       Kết quả bao gồm thông tin chi tiết về:
 *       - Điểm tích lũy hiện tại của khách hàng
 *       - Lịch sử các lần tích điểm (từ booking, khuyến mãi, v.v.)
 *       - Lịch sử các lần sử dụng điểm (đổi quà, giảm giá, v.v.)
 *       
 *       Người dùng chỉ có thể xem lịch sử điểm của chính mình, trừ khi người dùng có vai trò Admin, Staff hoặc Manager.
 *       **Chuyển đổi từ C# ScoreHistoryController.GetUserScoreHistory**
 *     tags:
 *       - Score History
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID của khách hàng cần lấy lịch sử điểm
 *         example: 1
 *     responses:
 *       200:
 *         description: Lấy lịch sử điểm thành công
 *       400:
 *         description: Mã khách hàng không hợp lệ
 *       401:
 *         description: Không có quyền truy cập
 *       403:
 *         description: Không có quyền xem lịch sử điểm của người dùng khác
 *       404:
 *         description: Không tìm thấy khách hàng
 *       500:
 *         description: Lỗi server nội bộ
 */

// Route definition
router.get('/user/:userId', authMiddleware, scoreHistoryController.getUserScoreHistory);

module.exports = router;
