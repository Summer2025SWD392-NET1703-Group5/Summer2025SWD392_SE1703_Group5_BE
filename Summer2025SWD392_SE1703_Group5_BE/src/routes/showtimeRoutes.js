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
 * tags:
 *  name: Showtimes
 *  description: API quản lý lịch chiếu phim
 */

/**
 * @swagger
 * /api/showtimes:
 *   get:
 *     summary: Lấy danh sách tất cả lịch chiếu (Public)
 *     description: >
 *       API này cho phép tất cả người dùng (kể cả chưa đăng nhập) xem danh sách lịch chiếu phim hiện có trong hệ thống.
 *       Kết quả bao gồm thông tin về phim, phòng chiếu, ngày và giờ chiếu.
 *     tags: [Showtimes]
 *     responses:
 *       200:
 *         description: Danh sách lịch chiếu
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/', showtimeController.getShowtimes);

/**
 * @swagger
 * /api/showtimes/rooms:
 *   get:
 *     summary: Lấy danh sách tất cả các phòng chiếu (Public)
 *     description: >
 *       API này cho phép tất cả người dùng xem danh sách các phòng chiếu hiện có trong hệ thống.
 *       Thông tin được sử dụng để phục vụ cho việc chọn phòng khi tạo hoặc sửa lịch chiếu.
 *     tags: [Showtimes]
 *     responses:
 *       200:
 *         description: Danh sách phòng chiếu
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/rooms', showtimeController.getRooms);

/**
 * @swagger
 * /api/showtimes/hide-all-showtimes:
 *   put:
 *     summary: Ẩn tất cả lịch chiếu trong ngày của phòng (Chỉ Admin/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin hoặc Manager ẩn tất cả các lịch chiếu trong một ngày cụ thể của một phòng chiếu.
 *       Hành động này thường được sử dụng khi phòng chiếu cần bảo trì hoặc có vấn đề kỹ thuật.
 *       Lưu ý rằng không thể ẩn các lịch chiếu đã có đơn đặt vé đang chờ.
 *     tags: [Showtimes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: roomId
 *         schema:
 *           type: integer
 *         required: true
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *     responses:
 *       200:
 *         description: Số lượng lịch chiếu đã ẩn
 *       400:
 *         description: Có đơn đặt vé đang chờ
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       500:
 *         description: Lỗi hệ thống
 */
router.put('/hide-all-showtimes', authMiddleware, authorizeRoles('Admin', 'Manager'), showtimeController.hideAllShowtimesForDate);

/**
 * @swagger
 * /api/showtimes/{id}:
 *   get:
 *     summary: Lấy thông tin lịch chiếu theo ID (Public)
 *     description: >
 *       API này cho phép tất cả người dùng xem thông tin chi tiết về một lịch chiếu cụ thể dựa trên ID.
 *       Kết quả bao gồm thông tin về phim, phòng chiếu, ngày giờ chiếu và số lượng ghế còn trống.
 *     tags: [Showtimes]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của lịch chiếu cần xem thông tin
 *     responses:
 *       200:
 *         description: Thông tin lịch chiếu
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
 *     summary: Tạo lịch chiếu mới (Chỉ Admin/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin hoặc Manager tạo một lịch chiếu mới trong hệ thống.
 *       Cần cung cấp thông tin về phim, phòng chiếu, ngày và giờ bắt đầu.
 *       Hệ thống sẽ tự động tính toán giờ kết thúc dựa trên thời lượng phim.
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
 *         description: Lịch chiếu đã được tạo
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc xung đột lịch chiếu
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       500:
 *         description: Lỗi hệ thống
 */
router.post('/', authMiddleware, authorizeRoles('Admin', 'Manager'), showtimeController.createShowtime);

/**
 * @swagger
 * /api/showtimes/{id}:
 *   put:
 *     summary: Cập nhật thông tin lịch chiếu (Chỉ Admin/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin hoặc Manager cập nhật thông tin của một lịch chiếu.
 *       Có thể cập nhật phim, phòng chiếu, ngày chiếu, giờ bắt đầu và trạng thái.
 *       Lưu ý rằng không thể sửa lịch chiếu đã có người đặt vé hoặc đã diễn ra.
 *     tags: [Showtimes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của lịch chiếu cần cập nhật
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ShowtimeUpdate'
 *     responses:
 *       200:
 *         description: Lịch chiếu đã được cập nhật
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc xung đột lịch chiếu
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       404:
 *         description: Không tìm thấy lịch chiếu
 *       500:
 *         description: Lỗi hệ thống
 */
router.put('/:id', authMiddleware, authorizeRoles('Admin', 'Manager'), showtimeController.updateShowtime);

/**
 * @swagger
 * /api/showtimes/{id}:
 *   delete:
 *     summary: Xóa lịch chiếu (Chỉ Admin/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin hoặc Manager xóa một lịch chiếu khỏi hệ thống.
 *       Chỉ có thể xóa các lịch chiếu chưa có người đặt vé và chưa diễn ra.
 *       Đối với lịch chiếu đã có người đặt vé, cần sử dụng API cập nhật trạng thái thay vì xóa.
 *     tags: [Showtimes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của lịch chiếu cần xóa
 *     responses:
 *       200:
 *         description: Lịch chiếu đã được xóa
 *       400:
 *         description: Không thể xóa do đã có người đặt vé hoặc đã diễn ra
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       404:
 *         description: Không tìm thấy lịch chiếu
 *       500:
 *         description: Lỗi hệ thống
 */
router.delete('/:id', authMiddleware, authorizeRoles('Admin', 'Manager'), showtimeController.hideShowtime);

/**
 * @swagger
 * /api/showtimes/expired:
 *   put:
 *     summary: Ẩn tất cả lịch chiếu đã hết hạn (Chỉ Admin/Manager)
 *     description: >
 *       API này tự động ẩn tất cả các lịch chiếu đã diễn ra trong quá khứ.
 *       Hành động này giúp dọn dẹp hệ thống và chỉ hiển thị các lịch chiếu còn hiệu lực.
 *     tags: [Showtimes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Số lượng lịch chiếu đã hết hạn đã được ẩn
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       500:
 *         description: Lỗi hệ thống
 */
router.put('/expired', authMiddleware, authorizeRoles('Admin', 'Manager'), showtimeController.hideExpiredShowtimes);

/**
 * @swagger
 * /api/showtimes/movie/{movieId}:
 *   get:
 *     summary: Lấy danh sách lịch chiếu theo phim (Public)
 *     description: >
 *       API này cho phép tất cả người dùng xem danh sách lịch chiếu của một phim cụ thể.
 *       Kết quả bao gồm thông tin về phòng chiếu, ngày và giờ chiếu của phim.
 *     tags: [Showtimes]
 *     parameters:
 *       - in: path
 *         name: movieId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của phim cần xem lịch chiếu
 *     responses:
 *       200:
 *         description: Danh sách lịch chiếu của phim
 *       404:
 *         description: Không tìm thấy phim
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/movie/:movieId', showtimeController.getShowtimesByMovie);

/**
 * @swagger
 * /api/showtimes/room/{roomId}:
 *   get:
 *     summary: Lấy danh sách lịch chiếu theo phòng chiếu (Public)
 *     description: >
 *       API này cho phép tất cả người dùng xem danh sách lịch chiếu của một phòng chiếu cụ thể.
 *       Có thể lọc theo ngày bằng tham số truy vấn date.
 *     tags: [Showtimes]
 *     parameters:
 *       - in: path
 *         name: roomId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của phòng chiếu
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày cần lọc (định dạng YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Danh sách lịch chiếu của phòng
 *       400:
 *         description: Định dạng ngày không hợp lệ
 *       404:
 *         description: Không tìm thấy phòng chiếu
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/room/:roomId', showtimeController.getShowtimesByRoom);

/**
 * @swagger
 * /api/showtimes/dates/{movieId}:
 *   get:
 *     summary: Lấy danh sách ngày chiếu của một phim (Public)
 *     description: >
 *       API này cho phép tất cả người dùng xem danh sách các ngày có lịch chiếu của một phim cụ thể.
 *       Kết quả hữu ích cho việc chọn ngày khi đặt vé xem phim.
 *     tags: [Showtimes]
 *     parameters:
 *       - in: path
 *         name: movieId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của phim cần xem ngày chiếu
 *     responses:
 *       200:
 *         description: Danh sách ngày có lịch chiếu của phim
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/dates/:movieId', showtimeController.getShowtimeDates);

/**
 * @swagger
 * /api/showtimes/room/{roomId}/dates:
 *   get:
 *     summary: Lấy danh sách ngày có lịch chiếu của một phòng chiếu (Public)
 *     description: >
 *       API này cho phép tất cả người dùng xem danh sách các ngày có lịch chiếu của một phòng chiếu cụ thể.
 *       Kết quả bao gồm thông tin về phòng chiếu và danh sách các ngày có lịch chiếu.
 *     tags: [Showtimes]
 *     parameters:
 *       - in: path
 *         name: roomId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của phòng chiếu cần xem ngày chiếu
 *     responses:
 *       200:
 *         description: Danh sách ngày có lịch chiếu của phòng
 *       400:
 *         description: ID phòng chiếu không hợp lệ
 *       404:
 *         description: Không tìm thấy phòng chiếu
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/room/:roomId/dates', showtimeController.getShowtimeDatesByRoom);

/**
 * @swagger
 * /api/showtimes/movie/{movieId}/date/{date}:
 *   get:
 *     summary: Lấy danh sách lịch chiếu theo phim và ngày (Public)
 *     description: >
 *       API này cho phép tất cả người dùng xem danh sách lịch chiếu của một phim cụ thể trong một ngày nhất định.
 *       Kết quả bao gồm thông tin về phòng chiếu và giờ chiếu.
 *     tags: [Showtimes]
 *     parameters:
 *       - in: path
 *         name: movieId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của phim
 *       - in: path
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *         description: Ngày cần xem (định dạng YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Danh sách lịch chiếu của phim trong ngày
 *       400:
 *         description: Định dạng ngày không hợp lệ
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/movie/:movieId/date/:date', showtimeController.getShowtimesByDate);

/**
 * @swagger
 * /api/showtimes/search:
 *   post:
 *     summary: Tìm kiếm lịch chiếu theo yêu cầu (Public)
 *     description: >
 *       API này cho phép tất cả người dùng tìm kiếm lịch chiếu với các điều kiện cụ thể.
 *       Có thể lọc theo phim và ngày.
 *     tags: [Showtimes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ShowtimeRequest'
 *     responses:
 *       200:
 *         description: Danh sách lịch chiếu thỏa mãn điều kiện
 *       400:
 *         description: Yêu cầu tìm kiếm không hợp lệ
 *       500:
 *         description: Lỗi hệ thống
 */
router.post('/search', showtimeController.getShowtimesByRequest);

/**
 * @swagger
 * /api/showtimes/room/{roomId}/date/{date}:
 *   get:
 *     summary: Lấy danh sách lịch chiếu theo phòng và ngày (Public)
 *     description: >
 *       API này cho phép tất cả người dùng xem danh sách lịch chiếu của một phòng cụ thể trong một ngày nhất định.
 *       Kết quả bao gồm thông tin về phim và giờ chiếu.
 *     tags: [Showtimes]
 *     parameters:
 *       - in: path
 *         name: roomId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của phòng chiếu
 *       - in: path
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *         description: Ngày cần xem (định dạng YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Danh sách lịch chiếu của phòng trong ngày
 *       400:
 *         description: Định dạng ngày không hợp lệ
 *       404:
 *         description: Không tìm thấy phòng chiếu
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/room/:roomId/date/:date', showtimeController.getShowtimesByRoomAndDate);

/**
 * @swagger
 * /api/showtimes/admin/movie/{movieId}:
 *   get:
 *     summary: Lấy danh sách lịch chiếu theo phim cho Admin (Chỉ Admin/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin hoặc Manager xem danh sách chi tiết của tất cả lịch chiếu 
 *       của một phim cụ thể, bao gồm cả các lịch chiếu đã ẩn và thông tin bổ sung.
 *     tags: [Showtimes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: movieId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của phim cần xem lịch chiếu
 *     responses:
 *       200:
 *         description: Danh sách chi tiết lịch chiếu của phim
 *       400:
 *         description: ID phim không hợp lệ
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       404:
 *         description: Không tìm thấy phim
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/admin/movie/:movieId', authMiddleware, authorizeRoles('Admin', 'Manager'), showtimeController.getShowtimesByMovieForAdmin);

/**
 * @swagger
 * /api/showtimes/{id}/seats-info:
 *   get:
 *     summary: Lấy thông tin lịch chiếu kèm trạng thái ghế (Public)
 *     description: >
 *       API này cho phép tất cả người dùng xem thông tin chi tiết về một lịch chiếu cụ thể 
 *       kèm theo thông tin trạng thái ghế (ví dụ: 2/50 hoặc "Hết ghế").
 *     tags: [Showtimes]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của lịch chiếu cần xem thông tin
 *     responses:
 *       200:
 *         description: Thông tin lịch chiếu kèm trạng thái ghế
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     Showtime_ID:
 *                       type: integer
 *                     BookedSeats:
 *                       type: integer
 *                       description: Số ghế đã đặt
 *                     TotalSeats:
 *                       type: integer
 *                       description: Tổng số ghế
 *                     AvailableSeats:
 *                       type: integer
 *                       description: Số ghế còn trống
 *                     SeatStatus:
 *                       type: string
 *                       description: Trạng thái ghế (ví dụ "2/50" hoặc "Hết ghế")
 *                     IsSoldOut:
 *                       type: boolean
 *                       description: Có hết ghế hay không
 *       404:
 *         description: Không tìm thấy lịch chiếu
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/:id/seats-info', showtimeController.getShowtimeWithSeatsInfo);

/**
 * @swagger
 * /api/showtimes/manager/cinema:
 *   get:
 *     summary: Lấy tất cả xuất chiếu của rạp mà manager quản lý (Chỉ Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Manager xem tất cả xuất chiếu của rạp phim mà họ đang quản lý,
 *       bao gồm tất cả trạng thái (Scheduled, Completed, Cancelled, Hidden, v.v.).
 *       Kết quả bao gồm thông tin về phim, phòng chiếu, ngày và giờ chiếu.
 *     tags: [Showtimes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách tất cả xuất chiếu của rạp (bao gồm tất cả trạng thái)
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/manager/cinema', authMiddleware, authorizeRoles('Manager'), showtimeController.getShowtimesByManager);

module.exports = router;