// src/routes/seatLayoutRoutes.js
const express = require('express');
const router = express.Router();
const seatLayoutController = require('../controllers/seatLayoutController');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');
const { seatLayoutValidation } = require('../middlewares/validation');

/**
 * @swagger
 * tags:
 *   name: SeatLayout
 *   description: API quản lý sơ đồ ghế ngồi và các loại ghế.
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     SeatLayout:
 *       type: object
 *       properties:
 *         Layout_ID:
 *           type: integer
 *           description: ID layout ghế
 *           example: 1
 *         Cinema_Room_ID:
 *           type: integer
 *           description: ID phòng chiếu
 *           example: 1
 *         Row_Label:
 *           type: string
 *           description: Nhãn hàng ghế (A, B, C...)
 *           example: "A"
 *         Column_Number:
 *           type: integer
 *           description: Số cột ghế
 *           example: 5
 *         Seat_Type:
 *           type: string
 *           enum: [Regular, VIP, Premium, Economy, Couple]
 *           description: Loại ghế
 *           example: "VIP"
 *         Is_Active:
 *           type: boolean
 *           description: Trạng thái hoạt động
 *           example: true
 *     
 *     SeatMapConfiguration:
 *       type: object
 *       required:
 *         - ColumnsPerRow
 *         - Rows
 *       properties:
 *         ColumnsPerRow:
 *           type: integer
 *           minimum: 5
 *           maximum: 20
 *           description: Số cột mỗi hàng
 *           example: 10
 *         Rows:
 *           type: array
 *           minItems: 1
 *           maxItems: 15
 *           description: Danh sách cấu hình hàng ghế
 *           items:
 *             type: object
 *             required:
 *               - RowLabel
 *               - SeatType
 *             properties:
 *               RowLabel:
 *                 type: string
 *                 pattern: '^[A-Z]+$'
 *                 maxLength: 5
 *                 description: Tên hàng (chỉ chữ cái in hoa)
 *                 example: "A"
 *               SeatType:
 *                 type: string
 *                 enum: [Regular, VIP, Premium, Economy, Couple]
 *                 description: Loại ghế
 *                 example: "VIP"
 *               EmptyColumns:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Danh sách cột trống
 *                 example: [5, 6]
 *     
 *     BulkSeatConfiguration:
 *       type: object
 *       required:
 *         - SeatType
 *         - RowsInput
 *         - ColumnsPerRow
 *       properties:
 *         SeatType:
 *           type: string
 *           enum: [Regular, VIP]
 *           description: Loại ghế
 *           example: "Regular"
 *         RowsInput:
 *           type: string
 *           description: Danh sách hàng ghế (A,B,C hoặc A-E)
 *           example: "A-E"
 *         ColumnsPerRow:
 *           type: integer
 *           minimum: 1
 *           description: Số cột mỗi hàng
 *           example: 10
 *         EmptyColumns:
 *           type: array
 *           items:
 *             type: integer
 *           description: Danh sách cột trống
 *           example: [5, 6]
 *         OverwriteExisting:
 *           type: boolean
 *           default: false
 *           description: Ghi đè cấu hình hiện có
 *           example: false
 *     
 *     UpdateSeatType:
 *       type: object
 *       required:
 *         - SeatType
 *       properties:
 *         SeatType:
 *           type: string
 *           enum: [Regular, VIP, Premium, Economy, Couple]
 *           description: Loại ghế mới
 *           example: "VIP"
 *         IsActive:
 *           type: boolean
 *           description: Trạng thái hoạt động của ghế
 *           example: true
 *     
 *     BulkUpdateSeatTypes:
 *       type: object
 *       required:
 *         - LayoutIds
 *         - SeatType
 *       properties:
 *         LayoutIds:
 *           type: array
 *           items:
 *             type: integer
 *           minItems: 1
 *           description: Danh sách ID layout ghế cần cập nhật
 *           example: [1, 2, 3, 4, 5]
 *         SeatType:
 *           type: string
 *           enum: [Regular, VIP, Premium, Economy, Couple]
 *           description: Loại ghế mới
 *           example: "VIP"
 *         IsActive:
 *           type: boolean
 *           description: Trạng thái hoạt động
 *           example: true
 *     
 *     BulkDeleteLayouts:
 *       type: object
 *       required:
 *         - LayoutIds
 *       properties:
 *         LayoutIds:
 *           type: array
 *           items:
 *             type: integer
 *           minItems: 1
 *           description: Danh sách ID layout ghế cần xóa
 *           example: [1, 2, 3, 4, 5]
 *
 *     BulkToggleLayouts:
 *       type: object
 *       required:
 *         - LayoutIds
 *       properties:
 *         LayoutIds:
 *           type: array
 *           items:
 *             type: integer
 *           minItems: 1
 *           description: Danh sách ID layout ghế cần ẩn/hiện
 *           example: [1, 2, 3, 4, 5]
 *         IsActive:
 *           type: boolean
 *           description: Trạng thái hiển thị (true = hiện, false = ẩn). Mặc định false nếu không cung cấp
 *           example: false
 *           default: false
 *
 *     ApiResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Trạng thái thành công
 *         message:
 *           type: string
 *           description: Thông báo kết quả
 *         data:
 *           type: object
 *           description: Dữ liệu trả về
 *         error:
 *           type: string
 *           description: Thông báo lỗi (nếu có)
 *         error_code:
 *           type: string
 *           description: Mã lỗi (nếu có)
 *         suggestion:
 *           type: string
 *           description: Gợi ý khắc phục (nếu có)
 */

/**
 * @swagger
 * /api/seat-layouts/room/{roomId}:
 *   get:
 *     summary: Lấy sơ đồ ghế của phòng chiếu (Public)
 *     description: >
 *       API này cho phép tất cả người dùng (kể cả chưa đăng nhập) xem sơ đồ ghế của một phòng chiếu cụ thể.
 *       Kết quả trả về là danh sách và vị trí các ghế trong phòng chiếu, bao gồm thông tin về hàng, cột và loại ghế.
 *       API này thường được sử dụng khi hiển thị thông tin về phòng chiếu trong trang chi tiết rạp phim.
 *     tags: [SeatLayout]
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của phòng chiếu
 *     responses:
 *       200:
 *         description: Sơ đồ ghế đã được lấy thành công
 *       404:
 *         description: Không tìm thấy phòng chiếu
 *       500:
 *         description: Lỗi server
 */
router.get('/room/:roomId', seatLayoutController.getSeatLayout);

/**
 * @swagger
 * /api/seat-layouts/layout-history/{roomId}:
 *   get:
 *     summary: Lấy lịch sử thay đổi sơ đồ ghế của phòng (Chỉ Admin/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin hoặc Manager xem lịch sử thay đổi sơ đồ ghế của một phòng chiếu.
 *       Kết quả trả về bao gồm tất cả các lần thay đổi cấu hình ghế, thời gian thay đổi, và người thực hiện thay đổi.
 *       Đây là công cụ quan trọng để theo dõi và kiểm toán các thay đổi về cấu trúc phòng chiếu.
 *     tags: [SeatLayout]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của phòng chiếu
 *     responses:
 *       200:
 *         description: Lịch sử thay đổi sơ đồ ghế
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       404:
 *         description: Không tìm thấy phòng chiếu
 *       500:
 *         description: Lỗi server
 */
router.get('/layout-history/:roomId', authMiddleware, authorizeRoles('Admin', 'Manager'), seatLayoutController.getSeatLayoutHistory);

/**
 * @swagger
 * /api/seat-layouts/latest/{roomId}:
 *   get:
 *     summary: Lấy sơ đồ ghế mới nhất của phòng chiếu (Public)
 *     description: >
 *       API này cho phép tất cả người dùng xem sơ đồ ghế mới nhất của một phòng chiếu cụ thể.
 *       Khác với API lấy toàn bộ sơ đồ ghế, API này chỉ trả về cấu hình mới nhất đang được áp dụng.
 *       Kết quả bao gồm vị trí và loại ghế của cấu hình hiện tại.
 *     tags: [SeatLayout]
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của phòng chiếu
 *     responses:
 *       200:
 *         description: Sơ đồ ghế mới nhất
 *       404:
 *         description: Không tìm thấy sơ đồ ghế
 *       500:
 *         description: Lỗi server
 */
// Temporarily commenting out this route as the controller method doesn't exist
// router.get('/latest/:roomId', seatLayoutController.getLatestLayoutForRoom);

/**
 * @swagger
 * /api/seat-layouts/{layoutId}/seat-type:
 *   put:
 *     summary: Cập nhật loại ghế cho một ghế cụ thể (Chỉ Admin/Manager)
 *     description: >
 *       API này cho phép người dùng có quyền Admin hoặc Manager cập nhật loại ghế và trạng thái hoạt động 
 *       cho một vị trí ghế cụ thể trong sơ đồ phòng chiếu. Đây là công cụ để quản lý và điều chỉnh các loại 
 *       ghế trong rạp phim (ví dụ: nâng cấp từ ghế thường lên ghế VIP).
 *     tags: [SeatLayout]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: layoutId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của layout ghế cần cập nhật
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateSeatType'
 *           example:
 *             SeatType: "VIP"
 *             IsActive: true
 *     responses:
 *       200:
 *         description: Cập nhật loại ghế thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Cập nhật loại ghế thành công"
 *                 data:
 *                   type: object
 *                   properties:
 *                     layout_id:
 *                       type: integer
 *                       example: 123
 *                     row_label:
 *                       type: string
 *                       example: "A"
 *                     column_number:
 *                       type: integer
 *                       example: 5
 *                     seat_type:
 *                       type: string
 *                       example: "VIP"
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *       401:
 *         description: Không có quyền truy cập
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       404:
 *         description: Không tìm thấy layout ghế
 *       500:
 *         description: Lỗi server
 */
router.put('/:layoutId/seat-type', authMiddleware, seatLayoutController.updateSeatType);

/**
 * @swagger
 * /api/seat-layouts/bulk-update-types:
 *   put:
 *     summary: Cập nhật hàng loạt loại ghế (Chỉ Admin/Manager)
 *     description: >
 *       API này cho phép người dùng có quyền Admin hoặc Manager cập nhật đồng thời loại ghế và trạng thái hoạt động 
 *       cho nhiều ghế khác nhau. Đây là công cụ hữu ích khi cần thay đổi cấu hình của một dãy ghế hoặc một khu vực 
 *       trong phòng chiếu (ví dụ: thiết lập một khu vực ghế VIP mới).
 *     tags: [SeatLayout]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BulkUpdateSeatTypes'
 *           example:
 *             LayoutIds: [1, 2, 3, 4, 5]
 *             SeatType: "VIP"
 *             IsActive: true
 *     responses:
 *       200:
 *         description: Cập nhật hàng loạt loại ghế thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Đã cập nhật 5 ghế thành công" 
 *                 data:
 *                   type: object
 *                   properties:
 *                     UpdatedCount:
 *                       type: integer
 *                       example: 5
 *                     SeatType:
 *                       type: string
 *                       example: "VIP"
 *                     IsActive:
 *                       type: boolean
 *                       example: true
 *       401:
 *         description: Không có quyền truy cập
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       404:
 *         description: Không tìm thấy ghế nào cần cập nhật
 *       500:
 *         description: Lỗi server
 */
router.put('/bulk-update-types', authMiddleware, seatLayoutController.bulkUpdateSeatTypes);

/**
 * @swagger
 * /api/seat-layouts/seat-types:
 *   get:
 *     summary: Lấy danh sách loại ghế và giá cơ bản (Admin/Manager/Staff)
 *     description: >
 *       API này trả về danh sách các loại ghế hiện có trong hệ thống cùng với giá cơ bản của từng loại ghế 
 *       theo loại phòng chiếu. Thông tin này rất hữu ích cho việc quản lý giá vé và cấu hình phòng chiếu.
 *     tags: [SeatLayout]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách loại ghế
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Lấy danh sách loại ghế thành công"
 *                 data:
 *                   type: object
 *                   properties:
 *                     seat_types:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           room_type:
 *                             type: string
 *                             example: "2D"
 *                           seat_type:
 *                             type: string
 *                             example: "VIP"
 *                           base_price:
 *                             type: number
 *                             example: 120000
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/seat-types', authMiddleware, seatLayoutController.getSeatTypes);

/**
 * @swagger
 * /api/seat-layouts/bulk/{roomId}:
 *   post:
 *     summary: Cấu hình hàng loạt sơ đồ ghế cho phòng chiếu (Chỉ Admin/Manager)
 *     description: >
 *       API này cho phép người dùng có quyền Admin hoặc Manager cấu hình nhanh sơ đồ ghế cho một phòng chiếu 
 *       bằng cách chỉ định danh sách hàng, số cột mỗi hàng và loại ghế. Đây là cách nhanh chóng để thiết lập 
 *       cấu trúc ghế ban đầu cho một phòng chiếu mới hoặc cập nhật hàng loạt cho phòng hiện có.
 *     tags: [SeatLayout]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của phòng chiếu
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BulkSeatConfiguration'
 *           example:
 *             SeatType: "Regular"
 *             RowsInput: "A-E"
 *             ColumnsPerRow: 10
 *             EmptyColumns: [5, 6]
 *             OverwriteExisting: false
 *     responses:
 *       200:
 *         description: Cấu hình sơ đồ ghế thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Đã cấu hình thành công sơ đồ ghế cho phòng 1"
 *                 result:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "550e8400-e29b-41d4-a716-446655440000"
 *                     cinema_room_id:
 *                       type: integer
 *                       example: 1
 *                     total_rows:
 *                       type: integer
 *                       example: 5
 *                     total_seats:
 *                       type: integer
 *                       example: 40
 *                     seat_types:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                             example: "Regular"
 *                           count:
 *                             type: integer
 *                             example: 40
 *       400:
 *         description: Dữ liệu đầu vào không hợp lệ
 *       401:
 *         description: Không có quyền truy cập
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       404:
 *         description: Không tìm thấy phòng chiếu
 *       500:
 *         description: Lỗi server
 */
router.post('/bulk/:roomId', authMiddleware, seatLayoutController.bulkConfigureSeatLayout);

/**
 * @swagger
 * /api/seat-layouts/bulk-delete:
 *   delete:
 *     summary: Ẩn/Hiện hàng loạt layout ghế (Chỉ Admin/Manager)
 *     description: >
 *       API này cho phép người dùng có quyền Admin hoặc Manager ẩn hoặc hiện nhiều vị trí ghế cùng một lúc
 *       bằng cách thay đổi trạng thái Is_Active. Các ghế bị ẩn (Is_Active = false) sẽ vẫn tồn tại trong cơ sở dữ liệu
 *       nhưng không còn hiển thị trong sơ đồ ghế hoặc có thể được đặt vé. Có thể hiện lại bằng cách set Is_Active = true.
 *     tags: [SeatLayout]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BulkToggleLayouts'
 *           examples:
 *             hide_seats:
 *               summary: Ẩn ghế
 *               value:
 *                 LayoutIds: [1, 2, 3, 4, 5]
 *                 IsActive: false
 *             show_seats:
 *               summary: Hiện ghế
 *               value:
 *                 LayoutIds: [1, 2, 3, 4, 5]
 *                 IsActive: true
 *             default_hide:
 *               summary: Mặc định ẩn ghế (backward compatibility)
 *               value:
 *                 LayoutIds: [1, 2, 3, 4, 5]
 *     responses:
 *       200:
 *         description: Ẩn/hiện layout ghế thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Đã ẩn/hiện 5 layout ghế thành công"
 *                 toggled_count:
 *                   type: integer
 *                   example: 5
 *                 deleted_layouts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       layout_id:
 *                         type: integer
 *                         example: 1
 *                       row_label:
 *                         type: string
 *                         example: "A"
 *                       column_number:
 *                         type: integer
 *                         example: 1
 *       400:
 *         description: Dữ liệu đầu vào không hợp lệ
 *       401:
 *         description: Không có quyền truy cập
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       404:
 *         description: Không tìm thấy layout ghế
 *       500:
 *         description: Lỗi server
 */
router.delete('/bulk-delete', authMiddleware, seatLayoutController.softDeleteSeatLayouts);

/**
 * @swagger
 * /api/seat-layouts/room/{roomId}/usage-stats:
 *   get:
 *     summary: Lấy thống kê sử dụng ghế theo phòng (Chỉ Admin/Manager/Staff)
 *     description: >
 *       API này cung cấp dữ liệu thống kê về tần suất sử dụng của từng ghế trong phòng chiếu trong một 
 *       khoảng thời gian nhất định. Kết quả bao gồm các ghế được đặt nhiều nhất và ít nhất, giúp quản lý 
 *       có cái nhìn tổng quan về mô hình sử dụng ghế để tối ưu hóa bố trí và giá vé.
 *     tags: [SeatLayout]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của phòng chiếu
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Số ngày cần lấy thống kê (mặc định 30 ngày)
 *     responses:
 *       200:
 *         description: Thống kê sử dụng ghế
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Lấy thống kê ghế thành công"
 *                 data:
 *                   type: object
 *                   properties:
 *                     room_id:
 *                       type: integer
 *                       example: 1
 *                     room_name:
 *                       type: string
 *                       example: "Screen 1"
 *                     period_days:
 *                       type: integer
 *                       example: 30
 *                     total_bookings:
 *                       type: integer
 *                       example: 254
 *                     seat_usage:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           seat:
 *                             type: string
 *                             example: "A1"
 *                           count:
 *                             type: integer
 *                             example: 15
 *                           row:
 *                             type: string
 *                             example: "A"
 *                           number:
 *                             type: integer
 *                             example: 1
 *                     most_booked_seats:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           seat:
 *                             type: string
 *                             example: "E5"
 *                           count:
 *                             type: integer
 *                             example: 25
 *                     least_booked_seats:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           seat:
 *                             type: string
 *                             example: "A10"
 *                           count:
 *                             type: integer
 *                             example: 2
 *       401:
 *         description: Không có quyền truy cập
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       404:
 *         description: Không tìm thấy phòng chiếu
 *       500:
 *         description: Lỗi server
 */
router.get('/room/:roomId/usage-stats', authMiddleware, seatLayoutController.getSeatUsageStats);

module.exports = router;
