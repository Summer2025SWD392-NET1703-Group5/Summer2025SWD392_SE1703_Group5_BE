'use strict';

const express = require('express');
const router = express.Router();
const staffPerformanceController = require('../controllers/staffPerformanceController');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');

/**
 * @swagger
 * components:
 *   schemas:
 *     StaffPerformance:
 *       type: object
 *       properties:
 *         StaffId:
 *           type: integer
 *         StaffName:
 *           type: string
 *         Department:
 *           type: string
 *         TotalBookingsHandled:
 *           type: integer
 *         TotalRevenue:
 *           type: number
 *         CounterBookings:
 *           type: integer
 *         OnlineBookings:
 *           type: integer
 *         AverageRevenuePerBooking:
 *           type: number
 *         BookingsData:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/BookingPerformance'
 *     BookingPerformance:
 *       type: object
 *       properties:
 *         BookingId:
 *           type: integer
 *         BookingDate:
 *           type: string
 *           format: date-time
 *         TicketCount:
 *           type: integer
 *         TotalAmount:
 *           type: number
 *         Status:
 *           type: string
 *         CustomerName:
 *           type: string
 */

/**
 * @swagger
 * /api/staffPerformance:
 *   get:
 *     summary: Lấy tất cả báo cáo hiệu suất nhân viên
 *     tags: [StaffPerformance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày bắt đầu (tùy chọn, lọc ở frontend)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày kết thúc (tùy chọn, lọc ở frontend)
 *     responses:
 *       200:
 *         description: Danh sách báo cáo hiệu suất nhân viên
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StaffPerformance'
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/', authMiddleware, authorizeRoles(['Admin', 'Manager']), staffPerformanceController.getStaffPerformanceReport);

/**
 * @swagger
 * /api/staffPerformance/{staffId}:
 *   get:
 *     summary: Lấy chi tiết hiệu suất của một nhân viên
 *     tags: [StaffPerformance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: staffId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của nhân viên
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày bắt đầu (tùy chọn, lọc ở frontend)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày kết thúc (tùy chọn, lọc ở frontend)
 *     responses:
 *       200:
 *         description: Chi tiết hiệu suất nhân viên
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StaffPerformance'
 *       400:
 *         description: Mã nhân viên không hợp lệ
 *       404:
 *         description: Không tìm thấy nhân viên
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/:staffId', authMiddleware, authorizeRoles(['Admin', 'Manager']), staffPerformanceController.getStaffPerformanceDetails);

/**
 * @swagger
 * /api/staffPerformance/export:
 *   get:
 *     summary: Xuất báo cáo hiệu suất nhân viên
 *     tags: [StaffPerformance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày bắt đầu (tùy chọn, lọc ở frontend)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày kết thúc (tùy chọn, lọc ở frontend)
 *       - in: query
 *         name: staffId
 *         schema:
 *           type: integer
 *         description: ID của nhân viên (tùy chọn)
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [excel, pdf]
 *           default: excel
 *         description: Định dạng file xuất
 *     responses:
 *       200:
 *         description: Thông báo xuất file thành công và dữ liệu báo cáo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 reportData:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/StaffPerformance'
 *       400:
 *         description: Tham số không hợp lệ
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/export', authMiddleware, authorizeRoles(['Admin', 'Manager']), staffPerformanceController.exportStaffPerformanceReport);

module.exports = router;