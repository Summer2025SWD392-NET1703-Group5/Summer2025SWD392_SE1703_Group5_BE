'use strict';

const express = require('express');
const router = express.Router();
const cinemaController = require('../controllers/cinemaController');
const { authMiddleware, authorizeRoles, authorizeManager, authorizeCinemaManager } = require('../middlewares/authMiddleware');
const { cinemaValidation } = require('../middlewares/validation');

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
 *         Phone_Number:
 *           type: string
 *           description: Số điện thoại rạp phim (được thiết lập tự động khi phân công Manager cho rạp)
 *         Email:
 *           type: string
 *           description: Email liên hệ của rạp phim (được thiết lập tự động khi phân công Manager cho rạp)
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
 *         - Room_Type
 *       properties:
 *         Cinema_Room_ID:
 *           type: integer
 *           description: ID của phòng chiếu (tự động tạo bởi hệ thống)
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
 *           description: ID của rạp phim chứa phòng chiếu này (tự động xác định từ context - không cần cung cấp)
 *       example:
 *         Room_Name: "Phòng VIP 01"
 *         Seat_Quantity: 50
 *         Room_Type: "VIP"
 *         Status: "Active"
 *         Notes: "Phòng chiếu cao cấp với ghế rộng và hệ thống âm thanh Dolby Atmos"
 */

/**
 * @swagger
 * tags:
 *   name: Cinemas
 *   description: Quản lý rạp phim
 */

/**
 * @swagger
 * /api/cinemas/manager/my-cinema:
 *   get:
 *     summary: Lấy thông tin rạp phim mà Manager đang quản lý (Chỉ Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Manager xem thông tin của rạp phim mà họ được phân công quản lý.
 *       Manager chỉ có thể xem thông tin rạp phim mà họ được gán, không thể xem rạp khác.
 *     tags: [Cinemas]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin rạp phim
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền truy cập (không phải Manager hoặc chưa được phân công rạp)
 *       404:
 *         description: Không tìm thấy rạp phim
 */
router.get('/manager/my-cinema', authMiddleware, authorizeRoles('Manager'), cinemaController.getManagerCinema);

/**
 * @swagger
 * /api/cinemas/manager/my-rooms:
 *   get:
 *     summary: Lấy danh sách phòng chiếu của rạp phim mà Manager đang quản lý (Chỉ Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Manager xem danh sách tất cả các phòng chiếu thuộc rạp phim mà họ quản lý.
 *       Kết quả bao gồm thông tin chi tiết về từng phòng như tên, loại, sức chứa và trạng thái hiện tại.
 *     tags: [Cinemas]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách phòng chiếu
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Người dùng không phải là Manager hoặc chưa được phân công rạp phim
 *       404:
 *         description: Không tìm thấy phòng chiếu nào
 */
router.get('/manager/my-rooms', authMiddleware, authorizeRoles('Manager'), cinemaController.getManagerCinemaRooms);

/**
 * @swagger
 * /api/cinemas/manager/rooms:
 *   post:
 *     summary: Tạo phòng chiếu mới cho rạp phim mà Manager quản lý (Chỉ Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Manager tạo phòng chiếu mới cho rạp phim mà họ quản lý.
 *       API này tự động lấy Cinema_ID từ tài khoản Manager đang đăng nhập, nên Manager chỉ cần cung cấp thông tin phòng chiếu
 *       mà không cần chỉ định Cinema_ID. Đây là API ưu tiên cho Manager tạo phòng chiếu.
 *     tags: [Cinemas]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - Room_Name
 *               - Seat_Quantity
 *               - Room_Type
 *             properties:
 *               Room_Name:
 *                 type: string
 *                 description: Tên phòng chiếu
 *               Seat_Quantity:
 *                 type: integer
 *                 description: Sức chứa của phòng (số lượng ghế)
 *               Room_Type:
 *                 type: string
 *                 description: Loại phòng chiếu (2D, 3D, VIP, etc.)
 *               Status:
 *                 type: string
 *                 description: Trạng thái phòng chiếu
 *                 default: "Active"
 *               Notes:
 *                 type: string
 *                 description: Ghi chú về phòng chiếu
 *     responses:
 *       201:
 *         description: Phòng chiếu đã được tạo thành công
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Manager chưa được phân công rạp phim hoặc không có quyền
 *       404:
 *         description: Không tìm thấy rạp phim
 *       500:
 *         description: Lỗi server
 */
router.post('/manager/rooms', authMiddleware, authorizeRoles('Manager'), cinemaController.createCinemaRoom);

/**
 * @swagger
 * /api/cinemas/active:
 *   get:
 *     summary: Lấy danh sách các rạp phim đang hoạt động (Public)
 *     description: >
 *       API này cho phép tất cả người dùng (kể cả chưa đăng nhập) xem danh sách các rạp phim
 *       đang hoạt động trong hệ thống. Chỉ những rạp có trạng thái "Active" mới được hiển thị.
 *     tags: [Cinemas]
 *     responses:
 *       200:
 *         description: Danh sách rạp phim đang hoạt động
 *       500:
 *         description: Lỗi server
 */
router.get('/active', cinemaController.getActiveCinemas);

/**
 * @swagger
 * /api/cinemas/cities:
 *   get:
 *     summary: Lấy danh sách các thành phố có rạp phim (Public)
 *     description: >
 *       API này cho phép tất cả người dùng xem danh sách các thành phố có rạp phim.
 *       Kết quả là một danh sách các tên thành phố duy nhất có rạp phim đang hoạt động.
 *     tags: [Cinemas]
 *     responses:
 *       200:
 *         description: Danh sách thành phố
 *       500:
 *         description: Lỗi server
 */
router.get('/cities', cinemaController.getAllCities);

/**
 * @swagger
 * /api/cinemas/city/{city}:
 *   get:
 *     summary: Lấy danh sách rạp phim theo thành phố (Public)
 *     description: >
 *       API này cho phép tất cả người dùng xem danh sách các rạp phim trong một thành phố cụ thể.
 *       Kết quả bao gồm tất cả thông tin chi tiết về rạp phim như địa chỉ, liên hệ và trạng thái.
 *     tags: [Cinemas]
 *     parameters:
 *       - in: path
 *         name: city
 *         schema:
 *           type: string
 *         required: true
 *         description: Tên thành phố
 *     responses:
 *       200:
 *         description: Danh sách rạp phim trong thành phố
 *       400:
 *         description: Tên thành phố không hợp lệ
 *       500:
 *         description: Lỗi server
 */
router.get('/city/:city', cinemaValidation.getByCity, cinemaController.getCinemasByCity);

/**
 * @swagger
 * /api/cinemas:
 *   get:
 *     summary: Lấy danh sách tất cả các rạp phim (Public)
 *     description: >
 *       API này cho phép tất cả người dùng xem danh sách tất cả các rạp phim trong hệ thống,
 *       bao gồm cả những rạp đang hoạt động (Active) và không hoạt động (Inactive).
 *       Không bao gồm những rạp đã bị xóa mềm (Status = 'Deleted').
 *     tags: [Cinemas]
 *     responses:
 *       200:
 *         description: Danh sách rạp phim
 *       500:
 *         description: Lỗi server
 */
router.get('/', cinemaController.getAllCinemas);

/**
 * @swagger
 * /api/cinemas/{id}:
 *   get:
 *     summary: Lấy thông tin rạp phim theo ID (Public)
 *     description: >
 *       API này cho phép tất cả người dùng xem thông tin chi tiết của một rạp phim cụ thể dựa trên ID.
 *       Kết quả bao gồm tất cả thông tin về rạp phim như tên, địa chỉ, liên hệ và trạng thái.
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
 *       404:
 *         description: Không tìm thấy rạp phim
 *       500:
 *         description: Lỗi server
 */
router.get('/:id', cinemaController.getCinemaById);

/**
 * @swagger
 * /api/cinemas:
 *   post:
 *     summary: Tạo rạp phim mới (Chỉ Admin)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin tạo một rạp phim mới trong hệ thống.
 *       Cần cung cấp đầy đủ thông tin bắt buộc như tên rạp, địa chỉ, thành phố và tỉnh/thành phố.
 *       Lưu ý: Số điện thoại (Phone_Number) và Email không cần cung cấp khi tạo rạp,
 *       các thông tin này sẽ được tự động cập nhật khi phân công manager cho rạp.
 *     tags: [Cinemas]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - Cinema_Name
 *               - Address
 *               - City
 *             properties:
 *               Cinema_Name:
 *                 type: string
 *                 description: Tên rạp phim
 *               Address:
 *                 type: string
 *                 description: Địa chỉ rạp phim
 *               City:
 *                 type: string
 *                 description: Thành phố
 *               Description:
 *                 type: string
 *                 description: Mô tả về rạp phim
 *               Status:
 *                 type: string
 *                 description: Trạng thái rạp phim (Active, Maintenance, Closed,...)
 *                 default: "Active"
 *     responses:
 *       201:
 *         description: Rạp phim đã được tạo
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này (không phải Admin)
 *       500:
 *         description: Lỗi server
 */
router.post('/', authMiddleware, authorizeRoles('Admin'), cinemaValidation.create, cinemaController.createCinema);

/**
 * @swagger
 * /api/cinemas/{id}:
 *   put:
 *     summary: Cập nhật thông tin rạp phim (Chỉ Admin và Manager của rạp)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin hoặc Manager của rạp cập nhật thông tin rạp phim.
 *       Admin có thể cập nhật bất kỳ rạp nào, trong khi Manager chỉ có thể cập nhật rạp mà họ được phân công quản lý.
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
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       404:
 *         description: Không tìm thấy rạp phim
 *       500:
 *         description: Lỗi server
 */
router.put('/:id', authMiddleware, authorizeCinemaManager(), cinemaValidation.update, cinemaController.updateCinema);

/**
 * @swagger
 * /api/cinemas/{id}:
 *   delete:
 *     summary: Xóa mềm rạp phim (Chỉ Admin)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin xóa mềm một rạp phim khỏi hệ thống.
 *       Thực hiện xóa mềm bằng cách cập nhật Status thành 'Deleted' thay vì xóa cứng khỏi database.
 *       Hệ thống sẽ kiểm tra các ràng buộc trước khi cho phép xóa:
 *       - Không thể xóa rạp còn có manager hoặc staff được phân công
 *       - Không thể xóa rạp đã có phòng chiếu hoặc booking đang hoạt động
 *       Rạp đã xóa mềm sẽ không hiển thị trong danh sách rạp công khai.
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
 *     responses:
 *       200:
 *         description: Rạp phim đã được xóa mềm thành công
 *       400:
 *         description: Không thể xóa rạp phim do có manager/staff được phân công hoặc có ràng buộc khác
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này (không phải Admin)
 *       404:
 *         description: Không tìm thấy rạp phim hoặc rạp đã được xóa
 *       500:
 *         description: Lỗi server
 */
router.delete('/:id', authMiddleware, authorizeRoles('Admin'), cinemaValidation.delete, cinemaController.deleteCinema);

/**
 * @swagger
 * /api/cinemas/{cinemaId}/rooms:
 *   get:
 *     summary: Lấy danh sách phòng chiếu của rạp phim (Public)
 *     description: >
 *       API này cho phép tất cả người dùng xem danh sách các phòng chiếu của một rạp phim cụ thể.
 *       Kết quả bao gồm thông tin chi tiết về từng phòng như tên, loại, sức chứa và trạng thái hiện tại.
 *     tags: [Cinemas]
 *     parameters:
 *       - in: path
 *         name: cinemaId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của rạp phim
 *     responses:
 *       200:
 *         description: Danh sách phòng chiếu
 *       404:
 *         description: Không tìm thấy rạp phim
 *       500:
 *         description: Lỗi server
 */
router.get('/:cinemaId/rooms', cinemaController.getCinemaRooms);

/**
 * @swagger
 * /api/cinemas/{cinemaId}/rooms:
 *   post:
 *     summary: Tạo phòng chiếu mới cho rạp phim (Admin/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin hoặc Manager tạo một phòng chiếu mới cho một rạp phim cụ thể.
 *       Admin có thể tạo phòng cho bất kỳ rạp nào bằng cách chỉ định cinemaId trong URL.
 *       Manager chỉ có thể tạo phòng cho rạp mà họ quản lý, hệ thống sẽ tự động kiểm tra quyền.
 *     tags: [Cinemas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cinemaId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của rạp phim
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - Room_Name
 *               - Seat_Quantity
 *               - Room_Type
 *             properties:
 *               Room_Name:
 *                 type: string
 *                 description: Tên phòng chiếu
 *               Seat_Quantity:
 *                 type: integer
 *                 description: Sức chứa của phòng (số lượng ghế)
 *               Room_Type:
 *                 type: string
 *                 description: Loại phòng chiếu (2D, 3D, VIP, etc.)
 *               Status:
 *                 type: string
 *                 description: Trạng thái phòng chiếu
 *                 default: "Active"
 *               Notes:
 *                 type: string
 *                 description: Ghi chú về phòng chiếu
 *     responses:
 *       201:
 *         description: Phòng chiếu đã được tạo
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này (không phải Admin/Manager hoặc Manager không quản lý rạp này)
 *       404:
 *         description: Không tìm thấy rạp phim
 *       500:
 *         description: Lỗi server
 */
router.post('/:cinemaId/rooms', authMiddleware, authorizeRoles('Admin', 'Manager'), cinemaController.createCinemaRoom);

/**
 * @swagger
 * /api/cinemas/{cinemaId}/movies:
 *   get:
 *     summary: Lấy danh sách phim đang chiếu tại rạp phim (Public)
 *     description: >
 *       API này cho phép tất cả người dùng xem danh sách các phim đang chiếu tại một rạp phim cụ thể.
 *       Kết quả bao gồm thông tin về các phim hiện đang có lịch chiếu tại rạp đó.
 *     tags: [Cinemas]
 *     parameters:
 *       - in: path
 *         name: cinemaId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của rạp phim
 *     responses:
 *       200:
 *         description: Danh sách phim đang chiếu tại rạp phim
 *       400:
 *         description: ID rạp phim không hợp lệ
 *       404:
 *         description: Không tìm thấy rạp phim
 *       500:
 *         description: Lỗi server
 */
router.get('/:cinemaId/movies', cinemaController.getMoviesByCinema);

/**
 * @swagger
 * /api/cinemas/{id}/showtimes:
 *   get:
 *     summary: Lấy danh sách suất chiếu của rạp phim theo ngày (Public)
 *     description: >
 *       API này cho phép tất cả người dùng xem danh sách suất chiếu của một rạp phim trong một ngày cụ thể.
 *       Kết quả được nhóm theo phim và bao gồm thông tin chi tiết về thời gian chiếu, phòng chiếu và số ghế còn trống.
 *       Nếu không cung cấp ngày, hệ thống sẽ sử dụng ngày hiện tại làm mặc định.
 *     tags: [Cinemas]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của rạp phim
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày cần lấy suất chiếu (định dạng YYYY-MM-DD). Mặc định là ngày hiện tại.
 *     responses:
 *       200:
 *         description: Danh sách suất chiếu của rạp phim
 *       400:
 *         description: ID rạp phim hoặc định dạng ngày không hợp lệ
 *       404:
 *         description: Không tìm thấy rạp phim
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/:id/showtimes', cinemaValidation.getShowtimes, cinemaController.getCinemaShowtimes);

/**
 * @swagger
 * /api/cinemas/{id}/details:
 *   get:
 *     summary: Lấy thông tin chi tiết của rạp phim kèm thống kê (Public)
 *     description: >
 *       API này cho phép tất cả người dùng xem thông tin chi tiết của một rạp phim cùng với các thống kê về phòng chiếu.
 *       Kết quả bao gồm thông tin cơ bản về rạp phim và thống kê như tổng số phòng, số phòng đang hoạt động,
 *       tổng số ghế và số lượng suất chiếu trong ngày.
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
 *         description: Thông tin chi tiết của rạp phim
 *       404:
 *         description: Không tìm thấy rạp phim
 *       500:
 *         description: Lỗi server
 */
router.get('/:id/details', cinemaController.getCinemaDetails);

/**
 * @swagger
 * /api/cinemas/{cinemaId}/rooms/active:
 *   get:
 *     summary: Lấy danh sách phòng chiếu hoạt động của rạp phim (Public)
 *     description: >
 *       API này cho phép lấy danh sách các phòng chiếu đang hoạt động (Status = 'Active') của một rạp phim cụ thể.
 *       Chỉ trả về những phòng có thể sử dụng để tạo lịch chiếu.
 *     tags: [Cinemas]
 *     parameters:
 *       - in: path
 *         name: cinemaId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của rạp phim
 *     responses:
 *       200:
 *         description: Danh sách phòng chiếu hoạt động
 *       404:
 *         description: Không tìm thấy rạp phim hoặc không có phòng hoạt động
 *       500:
 *         description: Lỗi server
 */
router.get('/:cinemaId/rooms/active', cinemaController.getActiveCinemaRooms);

module.exports = router; 