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
 * /api/bookings/my-bookings:
 *   get:
 *     summary: Lấy danh sách đơn đặt vé của người dùng hiện tại
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách đơn đặt vé
 *       401:
 *         description: Không xác định được người dùng
 *       500:
 *         description: Lỗi khi lấy danh sách đơn đặt vé
 */
router.get('/my-bookings', authMiddleware, GetMyBookings);


module.exports = router;

