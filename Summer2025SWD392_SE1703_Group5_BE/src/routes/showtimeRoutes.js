const express = require('express');
const router = express.Router();
const showtimeController = require('../controllers/showtimeController');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');


/**
 * @swagger
 * components:
 *   schemas:
 *     Showtime:
 *       type: object
 *       properties:
 *         Showtime_ID:
 *           type: integer
 *         Movie_ID:
 *           type: integer
 *         Cinema_Room_ID:
 *           type: integer
 *         Room_Name:
 *           type: string
 *         Show_Date:
 *           type: string
 *           format: date
 *         Start_Time:
 *           type: string
 *         End_Time:
 *           type: string
 *         Status:
 *           type: string
 *         Room:
 *           type: object
 *           properties:
 *             Cinema_Room_ID:
 *               type: integer
 *             Room_Name:
 *               type: string
 *             Room_Type:
 *               type: string
 *         AvailableSeats:
 *           type: integer
 *         TotalSeats:
 *           type: integer
 *     ShowtimeCreate:
 *       type: object
 *       properties:
 *         Movie_ID:
 *           type: integer
 *         Cinema_Room_ID:
 *           type: integer
 *         Show_Date:
 *           type: string
 *           format: date
 *         Start_Time:
 *           type: string
 *     ShowtimeUpdate:
 *       type: object
 *       properties:
 *         Movie_ID:
 *           type: integer
 *         Cinema_Room_ID:
 *           type: integer
 *         Show_Date:
 *           type: string
 *           format: date
 *         Start_Time:
 *           type: string
 *         Status:
 *           type: string
 *     ShowtimeRequest:
 *       type: object
 *       properties:
 *         MovieId:
 *           type: integer
 *         Date:
 *           type: string
 *           format: date
 *     AutoScheduleRequest:
 *       type: object
 *       properties:
 *         CinemaRoomId:
 *           type: integer
 *         ShowDate:
 *           type: string
 *           format: date
 *         Movies:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               MovieId:
 *                 type: integer
 *               ShowtimeCount:
 *                 type: integer
 *         OverwriteExisting:
 *           type: boolean
 */


/**
 * @swagger
 * /api/showtimes:
 *   get:
 *     summary: Lấy danh sách tất cả lịch chiếu
 *     tags: [Showtimes]
 *     responses:
 *       200:
 *         description: Danh sách lịch chiếu
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Showtime'
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/', showtimeController.getShowtimes);
/**
 * @swagger
 * /api/showtimes/{id}:
 *   get:
 *     summary: Lấy thông tin lịch chiếu theo ID
 *     tags: [Showtimes]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *     responses:
 *       200:
 *         description: Thông tin lịch chiếu
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Showtime'
 *       404:
 *         description: Không tìm thấy lịch chiếu
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/:id', showtimeController.getShowtime);


/**
 * @swagger
 * /api/showtimes:
 *   post:
 *     summary: Tạo lịch chiếu mới
 *     tags: [Showtimes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ShowtimeCreate'
 *     responses:
 *       201:
 *         description: ID của lịch chiếu mới
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       500:
 *         description: Lỗi hệ thống
 */
router.post('/', authMiddleware, authorizeRoles('Admin', 'Manager'), showtimeController.createShowtime);


        module.exports = router;

