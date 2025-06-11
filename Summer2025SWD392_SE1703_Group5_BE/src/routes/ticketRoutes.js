'use strict';


const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');


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



module.exports = router;



