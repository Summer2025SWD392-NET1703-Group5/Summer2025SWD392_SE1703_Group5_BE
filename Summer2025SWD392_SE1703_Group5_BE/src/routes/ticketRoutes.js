'use strict';

const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');
const TicketService = require('../services/ticketService');
const logger = require('../utils/logger');
const { sequelize } = require('../models');

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     Ticket:
 *       type: object
 *       properties:
 *         Ticket_ID:
 *           type: integer
 *         Booking_ID:
 *           type: integer
 *         Seat_ID:
 *           type: integer
 *         Ticket_Code:
 *           type: string
 *         Base_Price:
 *           type: number
 *         Discount_Amount:
 *           type: number
 *         Final_Price:
 *           type: number
 *         Is_Checked_In:
 *           type: boolean
 *         Check_In_Time:
 *           type: string
 *           format: date-time
 *         Status:
 *           type: string
 *     SendTicketEmailRequest:
 *       type: object
 *       properties:
 *         BookingId:
 *           type: integer
 *         Email:
 *           type: string
 */

/**
 * @swagger
 * tags:
 *  name: Tickets
 *  description: API quản lý vé xem phim
 */

/**
 * @swagger
 * /api/ticket/booking/{bookingId}:
 *   get:
 *     summary: Lấy thông tin vé theo mã đặt vé (Public)
 *     description: >
 *       API này cho phép tất cả người dùng xem thông tin vé theo mã đơn đặt vé.
 *       Người dùng chỉ có thể xem thông tin vé của đơn đặt vé mà họ có quyền truy cập.
 *     tags: [Tickets]
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của đơn đặt vé
 *     responses:
 *       200:
 *         description: Danh sách vé
 *       400:
 *         description: ID đơn đặt vé không hợp lệ
 *       404:
 *         description: Không tìm thấy vé
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/booking/:bookingId', ticketController.getTicketsByBookingId);

/**
 * @swagger
 * /api/ticket/code/{ticketCode}:
 *   get:
 *     summary: Lấy thông tin vé theo mã vé (Public)
 *     description: >
 *       API này cho phép tất cả người dùng xem thông tin chi tiết của một vé dựa trên mã vé.
 *       Mã vé là một chuỗi duy nhất được tạo khi đặt vé thành công.
 *     tags: [Tickets]
 *     parameters:
 *       - in: path
 *         name: ticketCode
 *         schema:
 *           type: string
 *         required: true
 *         description: Mã vé
 *     responses:
 *       200:
 *         description: Thông tin vé
 *       400:
 *         description: Mã vé không hợp lệ
 *       404:
 *         description: Không tìm thấy vé
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/code/:ticketCode', ticketController.getTicketByCode);

/**
 * @swagger
 * /api/ticket/verify/{ticketCode}:
 *   get:
 *     summary: Kiểm tra tình trạng vé (Chỉ Admin/Staff)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin hoặc Staff kiểm tra tính hợp lệ và tình trạng của vé.
 *       Kết quả trả về thông tin về vé, đơn đặt vé, trạng thái thanh toán và trạng thái check-in.
 *       API này được sử dụng để xác minh vé trước khi khách hàng vào rạp.
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketCode
 *         schema:
 *           type: string
 *         required: true
 *         description: Mã vé
 *     responses:
 *       200:
 *         description: Kết quả kiểm tra vé
 *       400:
 *         description: Mã vé không hợp lệ
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       404:
 *         description: Không tìm thấy vé
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/verify/:ticketCode', authMiddleware, authorizeRoles('Admin', 'Staff'), ticketController.verifyTicket);

/**
 * @swagger
 * /api/ticket/scan/{ticketCode}:
 *   post:
 *     summary: Quét vé để check-in (Chỉ Admin/Staff)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin hoặc Staff quét mã vé để thực hiện check-in cho khách hàng.
 *       Check-in sẽ được ghi nhận thời gian, người thực hiện và chỉ có thể check-in một lần cho mỗi vé.
 *       Các vé đã hết hạn hoặc đã check-in trước đó sẽ không thể check-in lại.
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketCode
 *         schema:
 *           type: string
 *         required: true
 *         description: Mã vé
 *     responses:
 *       200:
 *         description: Check-in thành công
 *       400:
 *         description: Mã vé không hợp lệ hoặc đã check-in
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       404:
 *         description: Không tìm thấy vé
 *       500:
 *         description: Lỗi hệ thống
 */
router.post('/scan/:ticketCode', authMiddleware, authorizeRoles('Admin', 'Staff'), ticketController.scanTicket);

/**
 * @swagger
 * /api/ticket/scan-list:
 *   get:
 *     summary: Lấy danh sách vé cần quét trong ngày (Chỉ Admin/Staff)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin hoặc Staff xem danh sách các vé cần quét (check-in) trong ngày.
 *       Danh sách này được sử dụng tại quầy vé để quản lý việc check-in của khách hàng.
 *       Có thể lọc theo ngày cụ thể hoặc mặc định lấy ngày hiện tại.
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày cần lấy danh sách vé
 *     responses:
 *       200:
 *         description: Danh sách vé
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/scan-list', authMiddleware, authorizeRoles('Admin', 'Staff'), ticketController.getTicketsToScan);

/**
 * @swagger
 * /api/ticket/email:
 *   post:
 *     summary: Gửi vé qua email (Public - Yêu cầu đăng nhập)
 *     description: >
 *       API này cho phép người dùng đã đăng nhập gửi thông tin vé của họ qua email.
 *       Người dùng cần cung cấp ID đơn đặt vé và địa chỉ email nhận vé.
 *       Chỉ có thể gửi email cho đơn đặt vé mà người dùng có quyền truy cập.
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SendTicketEmailRequest'
 *     responses:
 *       200:
 *         description: Gửi email thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền truy cập đơn đặt vé này
 *       404:
 *         description: Không tìm thấy đơn đặt vé
 *       500:
 *         description: Lỗi hệ thống
 */
router.post('/email', authMiddleware, authorizeRoles('Admin', 'Manager', 'User', 'Customer'), async (req, res) => {
    try {
        const { BookingId, Email } = req.body;

        // Validate input
        if (!BookingId || !Email) {
            return res.status(400).json({ 
                success: false, 
                message: 'BookingId và Email không được để trống' 
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(Email)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email không đúng định dạng' 
            });
        }

        const parsedBookingId = parseInt(BookingId, 10);
        if (isNaN(parsedBookingId) || parsedBookingId <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'ID booking không hợp lệ' 
            });
        }

        const ticketService = new TicketService();
        const result = await ticketService.sendTicketByEmailAsync(parsedBookingId, Email);

        if (result) {
            res.status(200).json({ 
                success: true, 
                message: 'Vé đã được gửi qua email thành công',
                bookingId: parsedBookingId,
                email: Email
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: 'Không thể gửi vé qua email' 
            });
        }
    } catch (error) {
        logger.error(`Lỗi khi gửi vé qua email: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            message: 'Đã xảy ra lỗi khi gửi vé qua email',
            error: error.message
        });
    }
});

/**
 * @swagger
 * /api/ticket/my-tickets:
 *   get:
 *     summary: Lấy danh sách vé của người dùng đã đăng nhập
 *     description: >
 *       API này cho phép người dùng đã đăng nhập xem danh sách các vé của họ.
 *       Kết quả được sắp xếp theo ngày đặt vé giảm dần (mới nhất đầu tiên).
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách vé của người dùng
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/my-tickets', authMiddleware, ticketController.getMyTickets);

/**
 * @swagger
 * /api/ticket/checkin-stats:
 *   get:
 *     summary: Lấy thống kê check-in (Chỉ Admin/Staff)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin hoặc Staff xem thống kê check-in cho các suất chiếu.
 *       Có thể chỉ định ngày cụ thể hoặc mặc định lấy thống kê cho ngày hiện tại.
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày cần lấy thống kê check-in
 *     responses:
 *       200:
 *         description: Thống kê check-in
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/checkin-stats', authMiddleware, authorizeRoles('Admin', 'Staff'), ticketController.getCheckInStats);

/**
 * @swagger
 * /api/ticket/all:
 *   get:
 *     summary: Lấy tất cả vé trong hệ thống (Chỉ Admin)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin xem tất cả các vé trong hệ thống.
 *       Kết quả được phân trang và sắp xếp theo ID vé giảm dần (mới nhất đầu tiên).
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách tất cả vé
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/all', authMiddleware, authorizeRoles('Admin'), ticketController.getAllTickets);

/**
 * @swagger
 * /api/ticket/cleanup:
 *   post:
 *     summary: Dọn dẹp vé không hợp lệ (Chỉ Admin)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin dọn dẹp các vé không còn hợp lệ trong hệ thống.
 *       Các vé thuộc các đơn đặt vé đã hủy hoặc hết hạn sẽ bị xóa.
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Đã dọn dẹp vé cũ thành công
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       500:
 *         description: Lỗi hệ thống
 */
router.post('/cleanup', authMiddleware, authorizeRoles('Admin'), ticketController.cleanupTickets);

/**
 * @swagger
 * /api/ticket/update-status:
 *   post:
 *     summary: Cập nhật trạng thái vé (Chỉ Admin)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin cập nhật trạng thái các vé.
 *       Thường được sử dụng để sửa lỗi hoặc cập nhật hàng loạt trạng thái vé.
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Đã cập nhật trạng thái vé thành công
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       500:
 *         description: Lỗi hệ thống
 */
router.post('/update-status', authMiddleware, authorizeRoles('Admin'), ticketController.updateTicketStatus);

/**
 * @swagger
 * /api/ticket/{ticketId}:
 *   get:
 *     summary: Lấy thông tin chi tiết vé theo ID
 *     description: >
 *       API này cho phép lấy thông tin đầy đủ của một vé theo ID, bao gồm:
 *       - Thông tin rạp chiếu và phòng chiếu
 *       - Thông tin phim và suất chiếu  
 *       - Thông tin ghế ngồi
 *       - Mã QR code
 *       - Hướng dẫn sử dụng
 *       Thường được sử dụng để hiển thị vé điện tử trên mobile app hoặc website.
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của vé cần lấy thông tin
 *     responses:
 *       200:
 *         description: Thông tin chi tiết vé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 ticket_details:
 *                   type: object
 *                   properties:
 *                     ticket_id:
 *                       type: integer
 *                     ticket_code:
 *                       type: string
 *                     status:
 *                       type: string
 *                     is_checked_in:
 *                       type: boolean
 *                     final_price:
 *                       type: number
 *                 cinema_info:
 *                   type: object
 *                   properties:
 *                     cinema_name:
 *                       type: string
 *                     cinema_address:
 *                       type: string
 *                 room_info:
 *                   type: object
 *                   properties:
 *                     room_name:
 *                       type: string
 *                     room_type:
 *                       type: string
 *                 seat_info:
 *                   type: object
 *                   properties:
 *                     seat_label:
 *                       type: string
 *                     seat_type:
 *                       type: string
 *                 showtime_info:
 *                   type: object
 *                   properties:
 *                     show_date_formatted:
 *                       type: string
 *                     show_time_formatted:
 *                       type: string
 *                 movie_info:
 *                   type: object
 *                   properties:
 *                     movie_name:
 *                       type: string
 *                     movie_poster:
 *                       type: string
 *                 qr_code:
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: string
 *                     image_url:
 *                       type: string
 *                 usage_instructions:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: ID vé không hợp lệ
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền truy cập vé này
 *       404:
 *         description: Không tìm thấy vé
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/:ticketId', authMiddleware, ticketController.getTicketById);

/**
 * @swagger
 * /api/ticket/{ticketId}/download:
 *   get:
 *     summary: Xem vé dưới dạng HTML
 *     description: >
 *       API này cho phép người dùng xem vé dưới dạng một trang HTML.
 *       Người dùng chỉ có thể xem vé của chính họ hoặc Admin/Staff có thể xem bất kỳ vé nào.
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của một trong các vé thuộc đơn đặt vé cần xem
 *     responses:
 *       200:
 *         description: Trang HTML của vé
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *       400:
 *         description: ID vé không hợp lệ
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền truy cập vé này
 *       404:
 *         description: Không tìm thấy vé
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/:ticketId/download', authMiddleware, ticketController.getTicketHtml);

module.exports = router;