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
 *     summary: Xóa mềm hàng loạt layout ghế (Chỉ Admin/Manager)
 *     description: >
 *       API này cho phép người dùng có quyền Admin hoặc Manager vô hiệu hóa nhiều vị trí ghế cùng một lúc
 *       bằng cách thực hiện xóa mềm (soft delete). Các ghế bị xóa mềm sẽ vẫn tồn tại trong cơ sở dữ liệu
 *       nhưng không còn hiển thị trong sơ đồ ghế hoặc có thể được đặt vé.
 *     tags: [SeatLayout]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BulkDeleteLayouts'
 *           example:
 *             LayoutIds: [1, 2, 3, 4, 5]
 *     responses:
 *       200:
 *         description: Xóa mềm layout ghế thành công
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
 *                   example: "Đã xóa mềm 5 layout ghế thành công"
 *                 deleted_count:
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



module.exports = router;
