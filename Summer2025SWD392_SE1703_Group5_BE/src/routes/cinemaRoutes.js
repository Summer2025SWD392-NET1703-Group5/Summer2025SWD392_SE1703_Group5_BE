'use strict';

const express = require('express');
const router = express.Router();
const cinemaController = require('../controllers/cinemaController');
const { authMiddleware, authorizeRoles, authorizeManager } = require('../middlewares/authMiddleware');

/**
 * @swagger
 * components:
 *   schemas:
 *     Cinema:
 *       type: object
 *       required:
 *         - Cinema_Name
 *         - Address
 *         - City
 *         - Province
 *       properties:
 *         Cinema_Name:
 *           type: string
 *           description: Tên rạp phim
 *         Address:
 *           type: string
 *           description: Địa chỉ rạp phim
 *         City:
 *           type: string
 *           description: Thành phố
 *         Province:
 *           type: string
 *           description: Tỉnh/Thành phố
 *         Phone_Number:
 *           type: string
 *           description: Số điện thoại rạp phim
 *         Email:
 *           type: string
 *           description: Email liên hệ của rạp phim
 *         Description:
 *           type: string
 *           description: Mô tả về rạp phim
 *         Status:
 *           type: string
 *           description: Trạng thái rạp phim (Active, Maintenance, Closed,...)
 *     CinemaRoom:
 *       type: object
 *       required:
 *         - Room_Name
 *         - Seat_Quantity
 *       properties:
 *         Cinema_Room_ID:
 *           type: integer
 *           description: ID của phòng chiếu
 *         Room_Name:
 *           type: string
 *           description: Tên phòng chiếu
 *         Seat_Quantity:
 *           type: integer
 *           description: Số lượng ghế trong phòng
 *         Room_Type:
 *           type: string
 *           description: Loại phòng chiếu (2D, 3D, IMAX,...)
 *         Status:
 *           type: string
 *           description: Trạng thái phòng chiếu
 *         Notes:
 *           type: string
 *           description: Ghi chú về phòng chiếu
 *         Cinema_ID:
 *           type: integer
 *           description: ID của rạp phim chứa phòng chiếu này
 */

/**
 * @swagger
 * tags:
 *   name: Cinemas
 *   description: Quản lý rạp phim
 */

/**
 * @swagger
 * /api/cinemas:
 *   get:
 *     summary: Lấy danh sách tất cả các rạp phim
 *     tags: [Cinemas]
 *     responses:
 *       200:
 *         description: Danh sách rạp phim
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Cinema'
 */
router.get('/', cinemaController.getAllCinemas);


/**
 * @swagger
 * /api/cinemas/{id}:
 *   get:
 *     summary: Lấy thông tin rạp phim theo ID
 *     tags: [Cinemas]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của rạp phim
 *     responses:
 *       200:
 *         description: Thông tin rạp phim
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Cinema'
 *       404:
 *         description: Không tìm thấy rạp phim
 */
router.get('/:id', cinemaController.getCinemaById);

/**
 * @swagger
 * /api/cinemas:
 *   post:
 *     summary: Tạo rạp phim mới
 *     tags: [Cinemas]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Cinema'
 *     responses:
 *       201:
 *         description: Rạp phim đã được tạo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Cinema'
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Không có quyền truy cập
 */
router.post('/', authMiddleware, authorizeRoles('Admin', 'Manager'), cinemaController.createCinema);
/**
 * @swagger
 * /api/cinemas/{id}:
 *   put:
 *     summary: Cập nhật thông tin rạp phim
 *     tags: [Cinemas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của rạp phim
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Cinema'
 *     responses:
 *       200:
 *         description: Rạp phim đã được cập nhật
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Cinema'
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       404:
 *         description: Không tìm thấy rạp phim
 */
router.put('/:id', authMiddleware, authorizeCinemaManager(), cinemaValidation.update, cinemaController.updateCinema);

module.exports = router; 