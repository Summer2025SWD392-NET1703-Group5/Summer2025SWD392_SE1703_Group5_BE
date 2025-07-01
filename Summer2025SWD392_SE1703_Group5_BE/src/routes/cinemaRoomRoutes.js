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
 *     summary: Lấy tất cả các phòng chiếu (Public)
 *     description: >
 *       API này cho phép tất cả người dùng (kể cả chưa đăng nhập) xem danh sách tất cả các phòng chiếu trong hệ thống.
 *       Thông tin bao gồm tên phòng, sức chứa, loại phòng và trạng thái hiện tại.
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
 *     summary: Lấy chi tiết 1 phòng chiếu theo ID (Public)
 *     description: >
 *       API này cho phép tất cả người dùng (kể cả chưa đăng nhập) xem thông tin chi tiết của một phòng chiếu cụ thể.
 *       Thông tin bao gồm tên phòng, sức chứa, loại phòng, trạng thái, và các mô tả thêm.
 *     tags: [CinemaRooms]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID phòng chiếu cần xem thông tin
 *     responses:
 *       200:
 *         description: Chi tiết phòng chiếu
 */
router.get('/:id', cinemaRoomController.getCinemaRoom);

/**
 * @swagger
 * /api/cinema-rooms/{id}/movies:
 *   get:
 *     summary: Lấy danh sách phim đang chiếu trong 1 phòng (Public)
 *     description: >
 *       API này cho phép tất cả người dùng (kể cả chưa đăng nhập) xem danh sách các phim đang được chiếu
 *       trong một phòng chiếu cụ thể. Kết quả trả về thông tin về các phim và lịch chiếu tương ứng.
 *     tags: [CinemaRooms]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID phòng chiếu cần xem danh sách phim
 *     responses:
 *       200:
 *         description: Danh sách phim trong phòng chiếu
 */
router.get('/:id/movies', cinemaRoomController.getMoviesByRoom);

/**
 * @swagger
 * /api/cinema-rooms/check-status/{id}:
 *   get:
 *     summary: Kiểm tra trạng thái phòng chiếu (Public)
 *     description: >
 *       API này cho phép tất cả người dùng (kể cả chưa đăng nhập) kiểm tra trạng thái hiện tại của một phòng chiếu.
 *       Trạng thái có thể là Active (hoạt động), Inactive (không hoạt động), Under Maintenance (đang bảo trì), hoặc Deleted (đã xóa).
 *     tags: [CinemaRooms]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID phòng chiếu cần kiểm tra trạng thái
 *     responses:
 *       200:
 *         description: Trạng thái phòng chiếu
 */
router.get('/check-status/:id', cinemaRoomController.checkCinemaRoomStatus);

/**
 * @swagger
 * /api/cinema-rooms/:
 *   post:
 *     summary: Tạo mới phòng chiếu (Chỉ Admin/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin, Manager tạo một phòng chiếu mới trong hệ thống.
 *       Admin và Staff có thể tạo phòng cho bất kỳ rạp nào, còn Manager chỉ có thể tạo phòng cho rạp họ quản lý.
 *       Cần phải cung cấp tên phòng, sức chứa và loại phòng. Các thông tin khác như mô tả và trạng thái là tùy chọn.
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
 *                 description: Tên của phòng chiếu
 *               Capacity:
 *                 type: integer
 *                 description: Sức chứa của phòng (số lượng ghế)
 *               RoomType:
 *                 type: string
 *                 description: Loại phòng (2D, 3D, VIP, IMAX, v.v.)
 *                 default: "2D"
 *               Description:
 *                 type: string
 *                 description: Mô tả thêm về phòng chiếu
 *               Status:
 *                 type: string
 *                 description: Trạng thái phòng chiếu
 *                 default: "Active"
 *               Cinema_ID:
 *                 type: integer
 *                 description: ID của rạp chứa phòng chiếu (bắt buộc đối với Admin/Staff, tự động đối với Manager)
 *     responses:
 *       201:
 *         description: Đã tạo phòng chiếu mới
 */

router.post(
    '/',
    authMiddleware,
    authorizeRoles('Admin', 'Manager'),
    cinemaRoomController.createCinemaRoom
);

/**
 * @swagger
 * /api/cinema-rooms/{id}:
 *   put:
 *     summary: Cập nhật thông tin phòng chiếu (Chỉ Admin/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin, Manager cập nhật thông tin của một phòng chiếu.
 *       Admin và Manager có thể cập nhật bất kỳ phòng nào, còn Manager chỉ có thể cập nhật phòng trong rạp họ quản lý.
 *       Có thể cập nhật một hoặc nhiều thông tin như tên phòng, sức chứa, loại phòng, mô tả và trạng thái.
 *     tags: [CinemaRooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID phòng chiếu cần cập nhật
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               RoomName:
 *                 type: string
 *                 description: Tên mới của phòng chiếu
 *               Capacity:
 *                 type: integer
 *                 description: Sức chứa mới của phòng
 *               RoomType:
 *                 type: string
 *                 description: Loại phòng mới (2D, 3D, VIP, IMAX, v.v.)
 *               Description:
 *                 type: string
 *                 description: Mô tả mới về phòng chiếu
 *               Status:
 *                 type: string
 *                 description: Trạng thái mới của phòng
 *                 enum: [Active, Inactive, Under Maintenance, Deleted]
 *     responses:
 *       200:
 *         description: Đã cập nhật phòng chiếu
 */
router.put(
    '/:id',
    authMiddleware,
    authorizeRoles('Admin', 'Manager'),
    cinemaRoomController.updateCinemaRoom
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

/**
 * @swagger
 * /api/cinema-rooms/{id}/deactivate:
 *   post:
 *     summary: Vô hiệu hoá phòng chiếu (Admin/Manager)
 *     tags: [CinemaRooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID phòng chiếu
 *     responses:
 *       200:
 *         description: Đã vô hiệu hoá phòng chiếu
 */
router.post(
    '/:id/deactivate',
    authMiddleware,
    authorizeRoles('Admin', 'Manager'),
    cinemaRoomController.deactivateCinemaRoom
);

module.exports = router;
