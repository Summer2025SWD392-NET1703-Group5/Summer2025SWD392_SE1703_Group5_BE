// src/routes/bookingRoutes.js
'use strict';

const express = require('express');
const router = express.Router();
const {
    GetAllBookings,
    CreateBooking,
    UpdateBookingPayment,
    CancelBooking,
    GetMyBookings,
    SearchBookings,
    ExportBookings,
    CheckPendingBooking,
    CheckPendingBookingForStaff,
} = require('../controllers/bookingController');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Booking
 *   description: Các API quản lý đặt vé (booking)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     BookingRequestDTO:
 *       type: object
 *       required:
 *         - Showtime_ID
 *         - layoutSeatIds    
 *       properties:
 *         Showtime_ID:
 *           type: integer
 *           description: ID của suất chiếu
 *         layoutSeatIds:
 *           type: array
 *           items:
 *             type: integer
 *           description: Danh sách ID của ghế được chọn
 *     BookingResponseDTO:
 *       type: object
 *       properties:
 *         Booking_ID:
 *           type: integer
 *         User_ID:
 *           type: integer
 *           nullable: true
 *         Booking_Date:
 *           type: string
 *           format: date-time
 *         Payment_Deadline:
 *           type: string
 *           format: date-time
 *         Total_Amount:
 *           type: number
 *         Status:
 *           type: string
 *         Seats:
 *           type: string
 *         Payment_Method:
 *           type: string
 *           nullable: true
 *         MovieName:
 *           type: string
 *         RoomName:
 *           type: string
 *         Show_Date:
 *           type: string
 *           format: date-time
 *         Start_Time:
 *           type: string
 *         IsStaffBooking:
 *           type: boolean
 *         CurrentPoints:
 *           type: integer
 *           nullable: true
 *         Tickets:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/TicketDTO'
 *         Showtime:
 *           $ref: '#/components/schemas/ShowtimeInfoDTO'
 *         MemberInfo:
 *           $ref: '#/components/schemas/MemberInfoDTO'
 *         Transaction_Date:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         Cancellation_Date:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         PointsRefunded:
 *           type: integer
 *           nullable: true
 *
 *     TicketDTO:
 *       type: object
 *       properties:
 *         Ticket_ID:
 *           type: integer
 *         Ticket_Code:
 *           type: string
 *         Seat_ID:
 *           type: integer
 *         Price:
 *           type: number
 *         Seat_Status:
 *           type: string
 *           nullable: true
 *
 *     ShowtimeInfoDTO:
 *       type: object
 *       properties:
 *         Showtime_ID:
 *           type: integer
 *         Show_Date:
 *           type: string
 *           format: date-time
 *         Start_Time:
 *           type: string
 *         Movie:
 *           $ref: '#/components/schemas/MovieInfoDTO'
 *         Room:
 *           $ref: '#/components/schemas/RoomDTO'
 *
 *     MovieInfoDTO:
 *       type: object
 *       properties:
 *         Movie_ID:
 *           type: integer
 *         Movie_Name:
 *           type: string
 *         Duration:
 *           type: integer
 *         Rating:
 *           type: string
 *         Poster_URL:
 *           type: string
 *
 *     RoomDTO:
 *       type: object
 *       properties:
 *         Cinema_Room_ID:
 *           type: integer
 *         Room_Name:
 *           type: string
 *         Room_Type:
 *           type: string
 *
 *     MemberInfoDTO:
 *       type: object
 *       properties:
 *         User_ID:
 *           type: integer
 *         Full_Name:
 *           type: string
 *         Phone_Number:
 *           type: string
 *         Email:
 *           type: string
 *
 *     BookingHistoryDTO:
 *       type: object
 *       properties:
 *         Booking_ID:
 *           type: integer
 *         Booking_Date:
 *           type: string
 *           format: date-time
 *         Total_Amount:
 *           type: number
 *         Status:
 *           type: string
 *         Payment_Method:
 *           type: string
 *           nullable: true
 *         Payment_Date:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         Cancellation_Date:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         User_ID:
 *           type: integer
 *           nullable: true
 *         PointsEarned:
 *           type: integer
 *           nullable: true
 *         Showtime:
 *           $ref: '#/components/schemas/ShowtimeInfoDTO'
 *
 *     BookingSearchResponseDTO:
 *       type: object
 *       properties:
 *         Booking_ID:
 *           type: integer
 *         CustomerName:
 *           type: string
 *           nullable: true
 *         CustomerEmail:
 *           type: string
 *           nullable: true
 *         CustomerPhone:
 *           type: string
 *           nullable: true
 *         MovieName:
 *           type: string
 *         ShowDate:
 *           type: string
 *           format: date-time
 *         StartTime:
 *           type: string
 *         RoomName:
 *           type: string
 *         Amount:
 *           type: number
 *         Status:
 *           type: string
 *         BookingDate:
 *           type: string
 *           format: date-time
 *         PaymentMethod:
 *           type: string
 *           nullable: true
 *         Seats:
 *           type: string
 *
 *     BookingDetailDto:
 *       type: object
 *       properties:
 *         Booking_ID:
 *           type: integer
 *         MovieName:
 *           type: string
 *         RoomName:
 *           type: string
 *         Show_Date:
 *           type: string
 *           format: date-time
 *         Start_Time:
 *           type: string
 *         Total_Amount:
 *           type: number
 *         Status:
 *           type: string
 *         Payment_Deadline:
 *           type: string
 *           format: date-time
 *         Seats:
 *           type: string
 *         Payment_Method:
 *           type: string
 *           nullable: true
 *         Transaction_Date:
 *           type: string
 *           format: date-time
 *         Booking_Date:
 *           type: string
 *           format: date-time
 *         Cancellation_Date:
 *           type: string
 *           format: date-time
 *         User_ID:
 *           type: integer
 *           nullable: true
 *         PointsEarned:
 *           type: integer
 *           nullable: true
 *         Showtime:
 *           $ref: '#/components/schemas/ShowtimeDetailDTO'
 *         Tickets:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/TicketDTO'
 *
 *     ShowtimeDetailDTO:
 *       type: object
 *       properties:
 *         Showtime_ID:
 *           type: integer
 *         Show_Date:
 *           type: string
 *           format: date-time
 *         Start_Time:
 *           type: string
 *         Room:
 *           $ref: '#/components/schemas/RoomDTO'
 *         Movie:
 *           $ref: '#/components/schemas/MovieInfoDTO'
 *
 *     PendingBookingCheckDTO:
 *       type: object
 *       properties:
 *         Booking_ID:
 *           type: integer
 *         Booking_Date:
 *           type: string
 *           format: date-time
 *         Payment_Deadline:
 *           type: string
 *           format: date-time
 *         IsExpired:
 *           type: boolean
 *         Seats:
 *           type: string
 *         Total_Amount:
 *           type: number
 *         MovieName:
 *           type: string
 *         RoomName:
 *           type: string
 *         Show_Date:
 *           type: string
 *           format: date-time
 *         Start_Time:
 *           type: string
 *         RemainingMinutes:
 *           type: integer
 */

/**
 * @swagger
 * /api/bookings:
 *   get:
 *     summary: Lấy danh sách tất cả các đơn đặt vé (Chỉ Admin/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin, Staff hoặc Manager xem danh sách tất cả đơn đặt vé trong hệ thống.
 *       Admin có thể xem toàn bộ đơn đặt vé, Manager chỉ có thể xem đơn đặt vé thuộc rạp họ quản lý,
 *       còn Staff chỉ có thể xem đơn đặt vé tại rạp họ làm việc.
 *       Kết quả bao gồm thông tin chi tiết về từng đơn đặt vé như phim, phòng chiếu, giờ chiếu, trạng thái thanh toán, v.v.
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trả về danh sách tất cả các đơn đặt vé theo quyền truy cập
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này (không phải Admin/Manager)
 *       500:
 *         description: Lỗi khi lấy danh sách đơn đặt vé

 */
router.get('/', authMiddleware, authorizeRoles('Admin', 'Manager'), GetAllBookings);

/**
 * @swagger
 * /api/bookings:
 *   post:
 *     summary: Tạo đơn đặt vé mới (Người dùng đã đăng nhập hoặc Staff/Manager)
 *     description: >
 *       API này cho phép người dùng đã đăng nhập tạo đơn đặt vé mới cho bản thân, hoặc cho phép Staff/Manager tạo đơn
 *       thay mặt cho khách tại quầy. Khi tạo đơn đặt vé, cần cung cấp ID của suất chiếu và danh sách ghế muốn đặt.
 *       Hệ thống sẽ kiểm tra tính khả dụng của ghế, tính toán giá vé và tạo đơn đặt hàng với trạng thái "Chờ thanh toán".
 *       Đơn đặt vé sẽ tự động hết hạn sau một khoảng thời gian nếu không được thanh toán.
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BookingRequestDTO'
 *     responses:
 *       200:
 *         description: Đơn đặt vé đã được tạo thành công
 *       400:
 *         description: Lỗi dữ liệu đầu vào hoặc đã có đơn đặt vé đang chờ thanh toán
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       409:
 *         description: Ghế đã được đặt bởi người khác
 *       500:
 *         description: Lỗi server khi xử lý đơn đặt vé
 */
router.post('/', authMiddleware, CreateBooking);

/**
 * @swagger
 * /api/bookings/{id}/payment:
 *   put:
 *     summary: Cập nhật trạng thái thanh toán của đơn đặt vé
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của đơn đặt vé
 *     responses:
 *       200:
 *         description: Trạng thái thanh toán được cập nhật thành công
 *       400:
 *         description: 'Lỗi logic (ví dụ: trạng thái không hợp lệ, quá hạn)'
 *       401:
 *         description: Không xác định được người dùng hoặc không có quyền
 *       404:
 *         description: Không tìm thấy đơn đặt vé
 *       500:
 *         description: Lỗi khi cập nhật trạng thái
 */
router.put('/:id/payment', authMiddleware, UpdateBookingPayment);

/**
 * @swagger
 * /api/bookings/{id}/cancel:
 *   put:
 *     summary: Hủy đơn đặt vé
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của đơn đặt vé
 *     responses:
 *       200:
 *         description: Hủy đơn đặt vé thành công
 *       400:
 *         description: Không thể hủy do trạng thái không hợp lệ
 *       401:
 *         description: Không xác định được người dùng
 *       404:
 *         description: Không tìm thấy đơn đặt vé
 *       500:
 *         description: Lỗi khi hủy đơn đặt vé
 */
router.put('/:id/cancel', authMiddleware, CancelBooking);

/**
 * @swagger
 * /api/bookings/my-bookings:
 *   get:
 *     summary: Lấy danh sách đơn đặt vé của người dùng hiện tại
 *     description: >
 *       API tối ưu hóa để lấy danh sách tất cả đơn đặt vé của người dùng hiện tại.
 *       Sử dụng bulk queries và parallel processing để cải thiện performance.
 *       Bao gồm thông tin ghế, phương thức thanh toán và metadata performance.
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách đơn đặt vé với metadata performance
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
 *                     $ref: '#/components/schemas/BookingResponseDTO'
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                       description: Số lượng đơn đặt vé
 *                       example: 5
 *                     responseTime:
 *                       type: string
 *                       description: Thời gian phản hồi
 *                       example: "150ms"
 *                     userId:
 *                       type: integer
 *                       description: ID người dùng
 *                       example: 123
 *         headers:
 *           Cache-Control:
 *             description: Cache directive for browser caching
 *             schema:
 *               type: string
 *               example: "private, max-age=60"
 *           ETag:
 *             description: Entity tag for conditional requests
 *             schema:
 *               type: string
 *               example: '"123-5-1699123456789"'
 *       400:
 *         description: ID người dùng không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "ID người dùng không hợp lệ"
 *                 userId:
 *                   type: string
 *                   example: "invalid_id"
 *       401:
 *         description: Không xác định được người dùng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Không thể xác định người dùng"
 *       500:
 *         description: Lỗi hệ thống
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
 *                   example: "Có lỗi xảy ra khi lấy danh sách đơn đặt vé"
 *                 error:
 *                   type: string
 *                   description: Chi tiết lỗi (chỉ hiển thị trong development mode)
 *                   example: "Database connection failed"
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     responseTime:
 *                       type: string
 *                       example: "2500ms"
 *                     userId:
 *                       type: string
 *                       example: "123"
 */
router.get('/my-bookings', authMiddleware, GetMyBookings);

/**
 * @swagger
 * /api/bookings/search:
 *   get:
 *     summary: Tìm kiếm đơn đặt vé theo nhiều tiêu chí (Admin/Manager)
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: customerName
 *         schema:
 *           type: string
 *         description: Tên khách hàng
 *       - in: query
 *         name: phoneEmail
 *         schema:
 *           type: string
 *         description: Số điện thoại hoặc email
 *       - in: query
 *         name: movieName
 *         schema:
 *           type: string
 *         description: Tên phim
 *       - in: query
 *         name: showDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày chiếu (YYYY-MM-DD)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Trạng thái đơn đặt vé
 *       - in: query
 *         name: paymentMethod
 *         schema:
 *           type: string
 *         description: Phương thức thanh toán
 *     responses:
 *       200:
 *         description: Danh sách đơn đặt vé khớp với tiêu chí
 *       403:
 *         description: Truy cập bị từ chối (chỉ Admin/Manager)
 *       500:
 *         description: Lỗi khi tìm kiếm
 */
router.get('/search', authMiddleware, authorizeRoles('Admin', 'Manager'), SearchBookings);

/**
 * @swagger
 * /api/bookings/export:
 *   get:
 *     summary: Xuất báo cáo đặt vé ra CSV (Admin/Manager)
 *     tags: [Booking]
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Trạng thái đơn đặt vé
 *     responses:
 *       200:
 *         description: File CSV chứa báo cáo đặt vé
 *       400:
 *         description: Ngày không hợp lệ
 *       403:
 *         description: Truy cập bị từ chối (chỉ Admin/Manager)
 *       500:
 *         description: Lỗi khi xuất báo cáo
 */
router.get('/export', authMiddleware, authorizeRoles('Admin', 'Manager'), ExportBookings);

/**
 * @swagger
 * /api/bookings/check-pending:
 *   get:
 *     summary: Kiểm tra đơn đặt vé đang Pending của người dùng
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Kết quả kiểm tra
 *       401:
 *         description: Không xác định được người dùng
 *       500:
 *         description: Lỗi khi kiểm tra
 */
router.get('/check-pending', authMiddleware, CheckPendingBooking);

/**
 * @swagger
 * /api/bookings/staff/check-pending:
 *   get:
 *     summary: Kiểm tra đơn đặt vé Pending của nhân viên
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Kết quả kiểm tra
 *       403:
 *         description: Truy cập bị từ chối (chỉ Staff/Admin)
 *       500:
 *         description: Lỗi khi kiểm tra
 */
router.get('/staff/check-pending', authMiddleware, authorizeRoles('Staff', 'Admin'), CheckPendingBookingForStaff);


module.exports = router;