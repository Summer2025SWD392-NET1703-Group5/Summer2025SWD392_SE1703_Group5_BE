const express = require('express');
const router = express.Router();
const promotionController = require('../controllers/promotionController');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Promotions
 *   description: Promotion/Discount management system
 */

// Public routes (không cần authentication)

/**
 * @swagger
 * /api/promotions/available:
 *   get:
 *     summary: Lấy danh sách tất cả các khuyến mãi (Public)
 *     description: >
 *       API này cho phép tất cả người dùng (kể cả chưa đăng nhập) xem danh sách các khuyến mãi hiện có trong hệ thống.
 *       Kết quả bao gồm các khuyến mãi đang có hiệu lực để khách hàng có thể sử dụng khi đặt vé.
 *     tags: [Promotions]
 *     responses:
 *       200:
 *         description: Danh sách tất cả các khuyến mãi
 */
router.get('/available', promotionController.getAvailablePromotions);

/**
 * @swagger
 * /api/promotions/validate/{code}:
 *   get:
 *     summary: Validate promotion code (Yêu cầu đăng nhập)
 *     description: >
 *       API này cho phép người dùng đã đăng nhập kiểm tra tính hợp lệ của mã khuyến mãi.
 *       Hệ thống sẽ kiểm tra mã có tồn tại không, còn hiệu lực không, và người dùng có đủ điều kiện sử dụng không.
 *       Nếu hợp lệ, API sẽ trả về thông tin chi tiết về khuyến mãi và số tiền được giảm.
 *     tags: [Promotions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Mã khuyến mãi cần kiểm tra (ví dụ TEST)
 *       - in: query
 *         name: totalAmount
 *         schema:
 *           type: number
 *         description: Tổng số tiền đơn hàng (nếu có)
 *     responses:
 *       200:
 *         description: Kết quả kiểm tra mã khuyến mãi
 */
router.get('/validate/:code', authMiddleware, promotionController.validatePromotionCode);

/**
 * @swagger
 * /api/promotions/apply:
 *   post:
 *     summary: Apply promotion to booking (Yêu cầu đăng nhập)
 *     description: >
 *       API này cho phép người dùng đã đăng nhập áp dụng mã khuyến mãi vào đơn đặt vé của mình.
 *       Người dùng chỉ có thể áp dụng mã khuyến mãi cho đơn đặt vé của chính mình.
 *       Hệ thống sẽ kiểm tra tính hợp lệ của mã khuyến mãi và áp dụng giảm giá nếu đủ điều kiện.
 *     tags: [Promotions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bookingId
 *               - promotionCode
 *             properties:
 *               bookingId:
 *                 type: integer
 *               promotionCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Promotion applied successfully
 *       400:
 *         description: Mã khuyến mãi không hợp lệ hoặc không áp dụng được
 *       403:
 *         description: Không có quyền áp dụng khuyến mãi cho đơn này
 *       404:
 *         description: Không tìm thấy đơn đặt vé hoặc mã khuyến mãi
 */
router.post('/apply', authMiddleware, promotionController.applyPromotion);

/**
 * @swagger
 * /api/promotions/remove/{bookingId}:
 *   delete:
 *     summary: Remove promotion from booking (Yêu cầu đăng nhập)
 *     description: >
 *       API này cho phép người dùng đã đăng nhập xóa mã khuyến mãi đã áp dụng khỏi đơn đặt vé của mình.
 *       Người dùng chỉ có thể xóa mã khuyến mãi khỏi đơn đặt vé của chính mình.
 *       Hệ thống sẽ cập nhật lại tổng tiền sau khi xóa khuyến mãi.
 *     tags: [Promotions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Promotion removed successfully
 *       403:
 *         description: Không có quyền xóa khuyến mãi cho đơn này
 *       404:
 *         description: Không tìm thấy đơn đặt vé hoặc đơn không có khuyến mãi nào
 */
router.delete('/remove/:bookingId', authMiddleware, promotionController.removePromotion);

/**
 * @swagger
 * /api/promotions:
 *   get:
 *     summary: Get all promotions (Chỉ Admin)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin xem danh sách tất cả các khuyến mãi trong hệ thống.
 *       Kết quả bao gồm cả các khuyến mãi đã hết hiệu lực, đã bị vô hiệu hóa hoặc chưa được kích hoạt.
 *       API này thường được sử dụng trong trang quản trị khuyến mãi.
 *     tags: [Promotions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All promotions retrieved successfully
 *       403:
 *         description: Không có quyền truy cập
 */
router.get('/', authMiddleware, authorizeRoles('Admin'), promotionController.getAllPromotions);

/**
 * @swagger
 * /api/promotions/{id}:
 *   get:
 *     summary: Get promotion details by ID (Chỉ Admin/Staff/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin, Staff hoặc Manager xem thông tin chi tiết của một khuyến mãi cụ thể.
 *       Kết quả bao gồm đầy đủ thông tin về khuyến mãi như tiêu đề, mã, loại giảm giá, điều kiện áp dụng, v.v.
 *     tags: [Promotions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Promotion details retrieved successfully
 *       403:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy khuyến mãi
 */
router.get('/:id', authMiddleware, authorizeRoles('Admin', 'Staff', 'Manager'), promotionController.getPromotion);

/**
 * @swagger
 * /api/promotions:
 *   post:
 *     summary: Create new promotion (Chỉ Admin)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin tạo một khuyến mãi mới trong hệ thống.
 *       Người dùng cần cung cấp thông tin đầy đủ về khuyến mãi như tiêu đề, mã, loại giảm giá, thời gian hiệu lực, v.v.
 *       Các khuyến mãi mới được tạo có thể áp dụng cho tất cả người dùng hoặc các nhóm người dùng cụ thể.
 *     tags: [Promotions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - Title
 *               - Promotion_Code
 *               - Start_Date
 *               - End_Date
 *               - Discount_Type
 *               - Discount_Value
 *             properties:
 *               Title:
 *                 type: string
 *                 example: "Khuyến mãi 50% Ngày Lễ"
 *               Promotion_Code:
 *                 type: string
 *                 example: "HOLIDAY50"
 *               Start_Date:
 *                 type: string
 *                 format: date-time
 *                 example: "2023-12-01T00:00:00"
 *               End_Date:
 *                 type: string
 *                 format: date-time
 *                 example: "2023-12-31T23:59:59"
 *               Discount_Type:
 *                 type: string
 *                 enum: [Percentage, Fixed]
 *                 example: "Percentage"
 *               Discount_Value:
 *                 type: number
 *                 example: 50
 *               Minimum_Purchase:
 *                 type: number
 *                 example: 100000
 *               Maximum_Discount:
 *                 type: number
 *                 example: 200000
 *               Applicable_For:
 *                 type: string
 *                 enum: [All Users, New Users, VIP Users]
 *                 example: "All Users"
 *               Usage_Limit:
 *                 type: integer
 *                 example: 100
 *               Status:
 *                 type: string
 *                 enum: [Active, Inactive]
 *                 example: "Active"
 *               Promotion_Detail:
 *                 type: string
 *                 example: "Khuyến mãi giảm 50% cho tất cả vé xem phim dịp lễ"
 *     responses:
 *       201:
 *         description: Promotion created successfully
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       403:
 *         description: Không có quyền truy cập
 */
router.post('/', authMiddleware, authorizeRoles('Admin'), promotionController.createPromotion);

/**
 * @swagger
 * /api/promotions/{id}:
 *   put:
 *     summary: Update promotion (Chỉ Admin)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin cập nhật thông tin của một khuyến mãi cụ thể.
 *       Có thể thay đổi hầu hết các thông tin của khuyến mãi, tuy nhiên một số trường có thể bị hạn chế cập nhật
 *       nếu khuyến mãi đã được sử dụng bởi người dùng. Hệ thống sẽ báo cáo nếu cập nhật bị giới hạn.
 *     tags: [Promotions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               Title:
 *                 type: string
 *                 example: "Khuyến mãi 50% Ngày Lễ (Updated)"
 *               Promotion_Code:
 *                 type: string
 *                 example: "HOLIDAY50"
 *               Start_Date:
 *                 type: string
 *                 format: date-time
 *                 example: "2023-12-01T00:00:00"
 *               End_Date:
 *                 type: string
 *                 format: date-time
 *                 example: "2023-12-31T23:59:59"
 *               Discount_Type:
 *                 type: string
 *                 enum: [Percentage, Fixed]
 *                 example: "Percentage"
 *               Discount_Value:
 *                 type: number
 *                 example: 50
 *               Minimum_Purchase:
 *                 type: number
 *                 example: 100000
 *               Maximum_Discount:
 *                 type: number
 *                 example: 200000
 *               Applicable_For:
 *                 type: string
 *                 enum: [All Users, New Users, VIP Users]
 *                 example: "All Users"
 *               Usage_Limit:
 *                 type: integer
 *                 example: 100
 *               Status:
 *                 type: string
 *                 enum: [Active, Inactive]
 *                 example: "Active"
 *               Promotion_Detail:
 *                 type: string
 *                 example: "Khuyến mãi giảm 50% cho tất cả vé xem phim dịp lễ"
 *     responses:
 *       200:
 *         description: Promotion updated successfully
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       403:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy khuyến mãi
 */
router.put('/:id', authMiddleware, authorizeRoles('Admin'), promotionController.updatePromotion);

/**
 * @swagger
 * /api/promotions/{id}:
 *   delete:
 *     summary: Delete promotion (Chỉ Admin)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin xóa một khuyến mãi khỏi hệ thống.
 *       Chỉ Admin mới có quyền xóa khuyến mãi để đảm bảo tính bảo mật và kiểm soát.
 *       Lưu ý rằng việc xóa khuyến mãi có thể ảnh hưởng đến đơn hàng đang sử dụng khuyến mãi đó.
 *     tags: [Promotions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Promotion deleted successfully
 *       403:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy khuyến mãi
 *       409:
 *         description: Không thể xóa khuyến mãi đang được sử dụng
 */
router.delete('/:id', authMiddleware, authorizeRoles('Admin'), promotionController.deletePromotion);

/**
 * @swagger
 * /api/promotions/customer/used-promotions:
 *   get:
 *     summary: Lấy danh sách mã khuyến mãi đã sử dụng của người dùng (Dành cho khách hàng)
 *     description: API này cho phép người dùng đã đăng nhập xem lịch sử mã khuyến mãi đã sử dụng
 *     tags: [Promotions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách mã khuyến mãi đã sử dụng thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       Promotion_ID:
 *                         type: integer
 *                         example: 1
 *                       Title:
 *                         type: string
 *                         example: "Khuyến mãi ngày lễ"
 *                       Promotion_Code:
 *                         type: string
 *                         example: "HOLIDAY2023"
 *                       Discount_Type:
 *                         type: string
 *                         example: "Percentage"
 *                       Discount_Value:
 *                         type: number
 *                         example: 10
 *                       Applied_Date:
 *                         type: string
 *                         format: date-time
 *                         example: "2023-12-20T08:30:00.000Z"
 *                       Discount_Amount:
 *                         type: number
 *                         example: 20000
 *                       Booking_ID:
 *                         type: integer
 *                         example: 123
 *                       Booking_Status:
 *                         type: string
 *                         example: "Confirmed"
 *                       Booking_Total:
 *                         type: number
 *                         example: 180000
 *                       Movie_Name:
 *                         type: string
 *                         example: "The Avengers"
 *                       Show_Date:
 *                         type: string
 *                         format: date
 *                         example: "2023-12-20"
 *                       Start_Time:
 *                         type: string
 *                         example: "19:30:00"
 *                       Discount_Description:
 *                         type: string
 *                         example: "Giảm 10% (20.000 VND)"
 *                 message:
 *                   type: string
 *                   example: "Lấy danh sách khuyến mãi đã sử dụng thành công"
 *       401:
 *         description: Chưa đăng nhập
 *       500:
 *         description: Lỗi server
 */
router.get('/customer/used-promotions', authMiddleware, promotionController.getUserPromotions);

/**
 * @swagger
 * /api/promotions/available/{bookingId}:
 *   get:
 *     summary: Lấy danh sách mã khuyến mãi phù hợp với booking và chưa được sử dụng
 *     description: >
 *       API này trả về danh sách các mã khuyến mãi mà người dùng có thể áp dụng cho booking cụ thể.
 *       Chỉ hiển thị những mã khuyến mãi còn hiệu lực, phù hợp với giá trị đơn hàng và chưa được người dùng sử dụng.
 *     tags: [Promotions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của đơn đặt vé
 *         example: 123
 *     responses:
 *       200:
 *         description: Danh sách mã khuyến mãi phù hợp
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
 *                   example: "Tìm thấy 3 mã khuyến mãi phù hợp"
 *                 booking_info:
 *                   type: object
 *                   properties:
 *                     Booking_ID:
 *                       type: integer
 *                       example: 123
 *                     Total_Amount:
 *                       type: number
 *                       example: 250000
 *                     User_Name:
 *                       type: string
 *                       example: "Nguyễn Văn A"
 *                 promotions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       Promotion_ID:
 *                         type: integer
 *                         example: 1
 *                       Title:
 *                         type: string
 *                         example: "Giảm giá 20% cho khách hàng mới"
 *                       Promotion_Code:
 *                         type: string
 *                         example: "NEWUSER20"
 *                       Discount_Description:
 *                         type: string
 *                         example: "Giảm 20% (tối đa 50,000đ)"
 *                       Discount_Amount:
 *                         type: number
 *                         example: 50000
 *                       Final_Amount:
 *                         type: number
 *                         example: 200000
 *       400:
 *         description: Booking ID không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       404:
 *         description: Không tìm thấy booking
 *       500:
 *         description: Lỗi server
 */
router.get('/available/:bookingId', authMiddleware, promotionController.getAvailablePromotionsForBooking);

/**
 * @swagger
 * /api/promotions/points/{bookingId}:
 *   delete:
 *     summary: Xóa điểm khỏi booking (hoàn lại điểm đã sử dụng)
 *     description: >
 *       API này cho phép xóa điểm đã sử dụng khỏi booking và hoàn lại điểm cho người dùng.
 *       Chỉ có thể thực hiện với booking có trạng thái "Pending" và đã sử dụng điểm.
 *     tags: [Promotions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của đơn đặt vé
 *         example: 123
 *     responses:
 *       200:
 *         description: Xóa điểm thành công
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
 *                   example: "Đã xóa thành công 50 điểm khỏi booking"
 *                 booking_id:
 *                   type: integer
 *                   example: 123
 *                 points_refunded:
 *                   type: integer
 *                   example: 50
 *                 discount_amount_removed:
 *                   type: number
 *                   example: 50000
 *                 new_total_amount:
 *                   type: number
 *                   example: 300000
 *                 user_new_points_balance:
 *                   type: integer
 *                   example: 150
 *       400:
 *         description: Booking ID không hợp lệ hoặc booking không có điểm được sử dụng
 *       401:
 *         description: Chưa xác thực
 *       404:
 *         description: Không tìm thấy booking
 *       500:
 *         description: Lỗi server
 */
router.delete('/points/:bookingId', authMiddleware, promotionController.removePointsFromBooking);

// 🔧 TEST: Route để test promotion expiration service
router.post('/test-expiration', authMiddleware, authorizeRoles('Admin'), promotionController.testPromotionExpiration);

// 🔧 FORCE: Route để force expire promotion hết hạn
router.post('/force-expire', authMiddleware, authorizeRoles('Admin'), promotionController.forceExpirePromotions);

module.exports = router;