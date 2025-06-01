const express = require('express');
const router = express.Router();
const cinemaRoomController = require('../controllers/cinemaRoomController');
const { authMiddleware, authorizeRoles, authorizeManager } = require('../middlewares/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: CinemaRooms
 *   description: API quản lý phòng chiếu phim (Cinema Room)
 */

/**
 * @swagger
 * /api/cinema-rooms/:
 *   get:
 *     summary: Lấy tất cả các phòng chiếu
 *     tags: [CinemaRooms]
 *     responses:
 *       200:
 *         description: Danh sách phòng chiếu
 */
router.get('/', cinemaRoomController.getAllCinemaRooms);

/**
 * @swagger
 * /api/cinema-rooms/{id}:
 *   get:
 *     summary: Lấy chi tiết 1 phòng chiếu theo ID
 *     tags: [CinemaRooms]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID phòng chiếu
 *     responses:
 *       200:
 *         description: Chi tiết phòng chiếu
 */
router.get('/:id', cinemaRoomController.getCinemaRoom);

module.exports = router;