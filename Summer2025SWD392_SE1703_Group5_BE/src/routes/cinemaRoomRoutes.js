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
/**
 * @swagger
 * /api/cinema-rooms/:
 *   post:
 *     summary: Tạo mới phòng chiếu (Admin/Staff/Manager)
 *     tags: [CinemaRooms]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - RoomName
 *               - Capacity
 *               - RoomType
 *             properties:
 *               RoomName:
 *                 type: string
 *                 description: Name of the cinema room
 *               Capacity:
 *                 type: integer
 *                 description: Seating capacity of the room
 *               RoomType:
 *                 type: string
 *                 description: Type of room (2D, 3D, VIP, etc.)
 *                 default: "2D"
 *               Description:
 *                 type: string
 *                 description: Additional notes about the room
 *               Status:
 *                 type: string
 *                 description: Room status
 *                 default: "Active"
 *     responses:
 *       201:
 *         description: Đã tạo phòng chiếu mới
 */

router.post(
    '/',
    authMiddleware,
    authorizeRoles('Admin', 'Staff', 'Manager'),
    cinemaRoomController.createCinemaRoom
);
/**
 * @swagger
 * /api/cinema-rooms/{id}:
 *   delete:
 *     summary: Xoá phòng chiếu (Chỉ Admin/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin, Manager xóa một phòng chiếu khỏi hệ thống.
 *       Admin và Staff có thể xóa bất kỳ phòng nào, còn Manager chỉ có thể xóa phòng trong rạp họ quản lý.
 *       Hành động này có thể là xóa cứng hoặc đánh dấu là đã xóa (soft delete), tùy thuộc vào cài đặt hệ thống.
 *       Lưu ý: Không thể xóa phòng đang có lịch chiếu đã đặt.
 *     tags: [CinemaRooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID phòng chiếu cần xóa
 *     responses:
 *       200:
 *         description: Đã xoá phòng chiếu
 */
router.delete(
    '/:id',
    authMiddleware,
    authorizeRoles('Admin', 'Manager'),
    cinemaRoomController.deleteCinemaRoom
);


module.exports = router;
