// File: src/routes/payosRoutes.js
const express = require('express');
const PayOSController = require('../controllers/payosController');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();
const payosController = new PayOSController();

/**
 * @swagger
 * tags:
 *   name: PayOS
 *   description: API thanh toán PayOS
 */

/**
 * @swagger
 * /api/payos/pending-payment-url:
 *   get:
 *     summary: Tự động tìm và tạo URL thanh toán cho đơn đang chờ (Yêu cầu đăng nhập)
 *     description: >
 *       API này tự động tìm đơn đặt vé đang chờ thanh toán của người dùng và tạo link thanh toán PayOS.
 *       Không cần chỉ định bookingId, hệ thống sẽ tự động tìm đơn đặt vé gần nhất đang ở trạng thái pending.
 *       API này đặc biệt hữu ích khi người dùng chỉ có thể tạo một đơn đặt vé đang chờ thanh toán tại một thời điểm.
 *     tags: [PayOS]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tạo link thanh toán thành công
 *       401:
 *         description: Chưa đăng nhập
 *       404:
 *         description: Không tìm thấy đơn đặt vé đang chờ thanh toán
 *       500:
 *         description: Lỗi server khi tạo link thanh toán
 */
router.get('/pending-payment-url', authMiddleware, (req, res) => {
    payosController.getPaymentUrlForPendingBooking(req, res);
});

/**
 * @swagger
 * /api/payos/payment-url/{bookingId}:
 *   get:
 *     summary: Lấy URL thanh toán cho đơn đặt vé (Yêu cầu đăng nhập)
 *     description: >
 *       API này cho phép người dùng đã đăng nhập tạo link thanh toán PayOS cho đơn đặt vé của họ.
 *       URL thanh toán được tạo sẽ chuyển hướng người dùng đến trang thanh toán của PayOS để hoàn thành giao dịch.
 *       API chỉ cho phép tạo URL thanh toán cho đơn đặt vé thuộc về người dùng hiện tại.
 *     tags: [PayOS]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         description: ID của đơn đặt vé
 *         schema:
 *           type: integer
 *           example: 123
 *     responses:
 *       200:
 *         description: Tạo link thanh toán thành công
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền tạo thanh toán cho đơn này
 *       404:
 *         description: Không tìm thấy đơn đặt vé
 */
router.get('/payment-url/:bookingId', authMiddleware, (req, res) => {
    payosController.getPaymentUrl(req, res);
});

/**
 * @swagger
 * /api/payos/return:
 *   get:
 *     summary: Xử lý return từ PayOS (Public)
 *     description: >
 *       API này xử lý việc người dùng quay về từ trang thanh toán PayOS.
 *       Là điểm đến khi người dùng hoàn thành hoặc hủy thanh toán và được chuyển hướng về ứng dụng.
 *       Thường sẽ chuyển hướng người dùng đến trang thông tin đặt vé sau khi xác nhận trạng thái thanh toán.
 *     tags: [PayOS]
 *     parameters:
 *       - in: query
 *         name: orderCode
 *         required: true
 *         description: Mã đơn hàng
 *         schema:
 *           type: string
 *           example: "123456789"
 *     responses:
 *       302:
 *         description: Chuyển hướng đến trang kết quả thanh toán
 *       400:
 *         description: Thiếu mã đơn hàng
 *       404:
 *         description: Không tìm thấy đơn hàng
 */
router.get('/return', (req, res) => {
    payosController.handleReturn(req, res);
});

/**
 * @swagger
 * /api/payos/cancel:
 *   get:
 *     summary: Xử lý cancel từ PayOS (Public)
 *     description: >
 *       API này xử lý việc người dùng hủy thanh toán trên PayOS.
 *       Được gọi khi người dùng nhấn nút hủy thanh toán trên trang PayOS và được chuyển hướng về ứng dụng.
 *       Thường sẽ chuyển hướng người dùng trở lại trang đặt vé để thử lại hoặc chọn phương thức thanh toán khác.
 *     tags: [PayOS]
 *     responses:
 *       302:
 *         description: Chuyển hướng đến trang đặt vé
 *       500:
 *         description: Lỗi xử lý hủy thanh toán
 */
router.get('/cancel', (req, res) => {
    payosController.handleCancel(req, res);
});

/**
 * @swagger
 * /api/payos/webhook:
 *   post:
 *     summary: Xử lý webhook từ PayOS (Public)
 *     description: >
 *       API này nhận và xử lý các thông báo webhook từ PayOS.
 *       Được gọi bởi PayOS khi có cập nhật về trạng thái thanh toán (thành công, thất bại, hết hạn).
 *       Cập nhật trạng thái đơn hàng và thông báo cho người dùng tương ứng.
 *     tags: [PayOS]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook xử lý thành công
 *       400:
 *         description: Webhook không hợp lệ
 *       500:
 *         description: Lỗi server khi xử lý webhook
 */
router.post('/webhook', (req, res) => {
    payosController.handleWebhook(req, res);
});

/**
 * @swagger
 * /api/payos/status/{orderCode}:
 *   get:
 *     summary: Lấy trạng thái thanh toán (Yêu cầu đăng nhập)
 *     description: >
 *       API này cho phép người dùng đã đăng nhập kiểm tra trạng thái thanh toán của một đơn hàng.
 *       Người dùng chỉ có thể kiểm tra trạng thái thanh toán của đơn hàng thuộc về họ.
 *       API này thường được sử dụng sau khi thanh toán để xác nhận trạng thái giao dịch.
 *     tags: [PayOS]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderCode
 *         required: true
 *         description: Mã đơn hàng
 *         schema:
 *           type: string
 *           example: "123456789"
 *     responses:
 *       200:
 *         description: Thông tin trạng thái thanh toán
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền kiểm tra đơn này
 *       404:
 *         description: Không tìm thấy đơn hàng
 */
router.get('/status/:orderCode', authMiddleware, (req, res) => {
    payosController.getPaymentStatus(req, res);
});

/**
 * @swagger
 * /api/payos/check-status/{orderCode}:
 *   get:
 *     summary: Kiểm tra trạng thái thanh toán trực tiếp từ PayOS (Yêu cầu đăng nhập)
 *     description: >
 *       API này kiểm tra trạng thái thanh toán trực tiếp từ PayOS và tự động cập nhật database nếu có thay đổi.
 *       Đặc biệt hữu ích trong môi trường local khi webhook không hoạt động.
 *       Nếu PayOS cho biết đã thanh toán nhưng database vẫn PENDING, API sẽ tự động cập nhật.
 *     tags: [PayOS]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderCode
 *         required: true
 *         description: Mã đơn hàng
 *         schema:
 *           type: string
 *           example: "123456789"
 *     responses:
 *       200:
 *         description: Thông tin trạng thái thanh toán từ PayOS
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền kiểm tra đơn này
 *       404:
 *         description: Không tìm thấy đơn hàng
 */
router.get('/check-status/:orderCode', authMiddleware, (req, res) => {
    payosController.checkPaymentStatusFromPayOS(req, res);
});

/**
 * @swagger
 * /api/payos/cancel/{orderCode}:
 *   delete:
 *     summary: Hủy link thanh toán (Yêu cầu đăng nhập)
 *     description: >
 *       API này cho phép người dùng đã đăng nhập hủy link thanh toán PayOS cho đơn hàng của họ.
 *       Chỉ có thể hủy link thanh toán khi trạng thái đơn hàng là PENDING (chưa thanh toán).
 *       Người dùng chỉ có thể hủy link thanh toán của đơn hàng thuộc về họ.
 *     tags: [PayOS]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderCode
 *         required: true
 *         description: Mã đơn hàng cần hủy
 *         schema:
 *           type: string
 *           example: "123456789"
 *     responses:
 *       200:
 *         description: Hủy link thanh toán thành công
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền hủy đơn này
 *       404:
 *         description: Không tìm thấy đơn hàng
 *       409:
 *         description: Đơn hàng đã thanh toán, không thể hủy
 */
router.delete('/cancel/:orderCode', authMiddleware, (req, res) => {
    payosController.cancelPaymentLink(req, res);
});

/**
 * @swagger
 * /api/payos/staff/create-payment-link/{bookingId}:
 *   post:
 *     summary: Staff tạo link thanh toán PayOS cho bất kỳ booking nào
 *     description: >
 *       API này cho phép Staff/Admin tạo link thanh toán PayOS cho bất kỳ booking nào, 
 *       kể cả booking của khách vãng lai (không có tài khoản).
 *       Không yêu cầu kiểm tra quyền sở hữu booking.
 *     tags: [PayOS]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         description: ID của đơn đặt vé
 *         schema:
 *           type: integer
 *           example: 123
 *     responses:
 *       200:
 *         description: Tạo link thanh toán thành công
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
 *                   example: "Tạo link thanh toán thành công"
 *                 data:
 *                   type: object
 *                   properties:
 *                     checkoutUrl:
 *                       type: string
 *                       description: Link thanh toán PayOS
 *                     orderCode:
 *                       type: string
 *                       description: Mã đơn hàng
 *                     customerName:
 *                       type: string
 *                       description: Tên khách hàng
 *                     customerEmail:
 *                       type: string
 *                       description: Email khách hàng (có thể null)
 *                     isWalkInCustomer:
 *                       type: boolean
 *                       description: Có phải khách vãng lai không
 *                     amount:
 *                       type: number
 *                       description: Số tiền thanh toán
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền (chỉ Staff/Admin/Manager)
 *       404:
 *         description: Không tìm thấy đơn đặt vé
 *       400:
 *         description: Đơn đặt vé không hợp lệ hoặc đã hết hạn
 */
router.post('/staff/create-payment-link/:bookingId', authMiddleware, (req, res) => {
    payosController.createPaymentLinkForStaff(req, res);
});

/**
 * @swagger
 * /api/payos/staff/payment-info/{bookingId}:
 *   get:
 *     summary: Staff lấy thông tin thanh toán cho bất kỳ booking nào
 *     description: >
 *       API này cho phép Staff/Admin lấy thông tin thanh toán cho bất kỳ booking nào,
 *       không yêu cầu kiểm tra quyền sở hữu booking.
 *     tags: [PayOS]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         description: ID của đơn đặt vé
 *         schema:
 *           type: integer
 *           example: 123
 *     responses:
 *       200:
 *         description: Thông tin thanh toán
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     orderCode:
 *                       type: string
 *                       description: Mã đơn hàng
 *                     bookingId:
 *                       type: integer
 *                       description: ID booking
 *                     amount:
 *                       type: number
 *                       description: Số tiền
 *                     status:
 *                       type: string
 *                       description: Trạng thái thanh toán
 *                     paymentMethod:
 *                       type: string
 *                       description: Phương thức thanh toán
 *                     customerName:
 *                       type: string
 *                       description: Tên khách hàng
 *                     customerEmail:
 *                       type: string
 *                       description: Email khách hàng
 *                     isWalkInCustomer:
 *                       type: boolean
 *                       description: Có phải khách vãng lai không
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền (chỉ Staff/Admin/Manager)
 *       404:
 *         description: Không tìm thấy thông tin thanh toán
 */
router.get('/staff/payment-info/:bookingId', authMiddleware, (req, res) => {
    payosController.getPaymentInfoForStaff(req, res);
});

module.exports = router;
