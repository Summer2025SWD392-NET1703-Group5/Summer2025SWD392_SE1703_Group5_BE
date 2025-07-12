// File: src/routes/ticketPricingRoutes.js
// Mô tả: Định nghĩa các API endpoint cho Quản lý Giá vé (TicketPricing).

const express = require('express');
const router = express.Router();
const ticketPricingController = require('../controllers/ticketPricingController');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');
// Thêm validation middleware nếu cần, ví dụ:
// const { ticketPricingValidation } = require('../middlewares/validation');

/**
 * @swagger
 * tags:
 *   name: TicketPricing
 *   description: API Quản lý Giá vé theo Loại ghế và Loại phòng.
 */

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     TicketPricingResponse:
 *       type: object
 *       properties:
 *         Price_ID:
 *           type: integer
 *         Room_Type:
 *           type: string
 *         Seat_Type:
 *           type: string
 *         Base_Price:
 *           type: number
 *           format: decimal
 *         Status:
 *           type: string
 *         Created_Date:
 *           type: string
 *           format: date-time
 *         Last_Updated:
 *           type: string
 *           format: date-time
 * 
 *     TicketPricingDetailResponse:
 *       allOf:
 *         - $ref: '#/components/schemas/TicketPricingResponse'
 *         - type: object
 *           properties:
 *             total_seats_of_type:
 *               type: integer
 *             used_in_rooms:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   room_name:
 *                     type: string
 *                   seat_count:
 *                     type: integer
 *
 *     TicketPricingCreate:
 *       type: object
 *       required:
 *         - Room_Type
 *         - Seat_Type
 *         - Base_Price
 *       properties:
 *         Room_Type:
 *           type: string
 *           description: "Loại phòng (VD: 2D, 3D, VIP)."
 *         Seat_Type:
 *           type: string
 *           description: "Loại ghế (VD: Standard, VIP, Sweetbox)."
 *         Base_Price:
 *           type: number
 *           format: decimal
 * 
 *     TicketPricingUpdate:
 *       type: object
 *       properties:
 *         Room_Type:
 *           type: string
 *         Seat_Type:
 *           type: string
 *         Base_Price:
 *           type: number
 *           format: decimal
 *         Status:
 *           type: string
 *           enum: [Active, Inactive, Deleted]
 * 
 *     BulkPriceUpdatePayload:
 *       type: object
 *       required:
 *         - PriceUpdates
 *       properties:
 *         PriceUpdates:
 *           type: array
 *           items:
 *             type: object
 *             required:
 *               - Price_ID
 *               - Base_Price
 *             properties:
 *               Price_ID:
 *                 type: integer
 *               Base_Price:
 *                 type: number
 *                 format: decimal
 */

// GET all ticket pricings
/**
 * @swagger
 * /api/ticket-pricing:
 *   get:
 *     summary: Lấy tất cả các cấu hình giá vé (Chỉ Admin/Staff/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin, Staff hoặc Manager xem danh sách tất cả các cấu hình giá vé hiện tại.
 *       Kết quả có thể được lọc và sắp xếp theo các tiêu chí khác nhau. API này thường được sử dụng trong trang quản lý giá vé.
 *     tags: [TicketPricing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách các cấu hình giá vé.
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server.
 */
router.get('/',
    authMiddleware,
    authorizeRoles('Admin', 'Staff', 'Manager'),
    ticketPricingController.getAllTicketPricings
);

// POST to create a new ticket pricing
/**
 * @swagger
 * /api/ticket-pricing:
 *   post:
 *     summary: Tạo một cấu hình giá vé mới (Chỉ Admin)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin tạo một cấu hình giá vé mới.
 *       Yêu cầu phải cung cấp loại phòng, loại ghế và giá cơ bản. API này thường được sử dụng trong trang quản lý giá vé.
 *     tags: [TicketPricing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TicketPricingCreate'
 *     responses:
 *       201:
 *         description: Tạo mới thành công.
 *       400:
 *         description: Dữ liệu không hợp lệ.
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server.
 */
router.post('/',
    authMiddleware,
    authorizeRoles('Admin'),
    // Nên có validation middleware: ticketPricingValidation.validateCreate
    ticketPricingController.createTicketPricing
);


// GET pricing structure
/**
 * @swagger
 * /api/ticket-pricing/pricing-structure:
 *   get:
 *     summary: Lấy cấu trúc giá vé (Chỉ Admin/Staff/Manager/Customer)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin, Staff, Manager hoặc Customer xem cấu trúc giá vé hiện tại.
 *       Kết quả bao gồm giá cơ bản cho từng loại phòng và ghế, cũng như các hệ số tính giá theo loại ngày và khung giờ.
 *       API này thường được sử dụng trong trang đặt vé và trang quản lý giá vé.
 *     tags: [TicketPricing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cấu trúc giá vé.
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server.
 */
router.get('/pricing-structure',
    authMiddleware,
    authorizeRoles('Admin', 'Staff', 'Manager', 'Customer'),
    ticketPricingController.getPricingStructure
);

// GET calculate ticket price for specific parameters (new API)
/**
 * @swagger
 * /api/ticket-pricing/calculate:
 *   get:
 *     summary: Tính giá vé cho các tham số cụ thể (Chỉ Admin/Staff/Manager/Customer)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin, Staff, Manager hoặc Customer tính giá vé cho các tham số cụ thể.
 *       API này thường được sử dụng trong trang đặt vé và cấu hình hệ thống.
 *     tags: [TicketPricing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Giá vé tính được.
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server.
 */
router.get('/calculate',
    authMiddleware,
    authorizeRoles('Admin', 'Staff', 'Manager', 'Customer'),
    ticketPricingController.calculateTicketPrice
);

// GET available seat types (for UI selection, etc.)
/**
 * @swagger
 * /api/ticket-pricing/available-seat-types:
 *   get:
 *     summary: Lấy danh sách các loại ghế (Yêu cầu đăng nhập)
 *     description: >
 *       API này cho phép người dùng đã đăng nhập xem danh sách các loại ghế hiện có trong hệ thống.
 *       Kết quả bao gồm loại ghế, giá trung bình, và mô tả. API này thường được sử dụng trong trang đặt vé và trang quản lý phòng.
 *     tags: [TicketPricing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách các loại ghế.
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server.
 */
router.get('/available-seat-types',
    authMiddleware,
    authorizeRoles('Admin', 'Staff', 'Manager', 'Customer'),
    ticketPricingController.getAvailableSeatTypes
);

// POST for bulk updating prices in one operation
/**
 * @swagger
 * /api/ticket-pricing/bulk-update:
 *   post:
 *     summary: Cập nhật giá vé hàng loạt (Chỉ Admin)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin cập nhật nhiều giá vé cùng lúc.
 *       Yêu cầu phải cung cấp danh sách các cập nhật, mỗi cập nhật bao gồm ID giá và giá cơ bản mới.
 *       API này thường được sử dụng trong trang quản lý hàng loạt giá vé.
 *     tags: [TicketPricing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BulkPriceUpdatePayload'
 *     responses:
 *       200:
 *         description: Cập nhật thành công, kèm theo chi tiết các cập nhật.
 *       400:
 *         description: Dữ liệu không hợp lệ.
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server.
 */
router.post('/bulk-update',
    authMiddleware,
    authorizeRoles('Admin'),
    ticketPricingController.bulkUpdateTicketPrices
);

// GET a single ticket pricing by ID
/**
 * @swagger
 * /api/ticket-pricing/{id}:
 *   get:
 *     summary: Lấy chi tiết một cấu hình giá vé theo ID (Chỉ Admin/Staff/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin, Staff hoặc Manager xem thông tin chi tiết của một cấu hình giá vé cụ thể.
 *       Kết quả bao gồm thông tin về loại phòng, loại ghế, giá cơ bản, số lượng ghế thuộc loại này, và danh sách các phòng
 *       đang sử dụng cấu hình giá này. API này thường được sử dụng trong trang quản lý chi tiết giá vé.
 *     tags: [TicketPricing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của cấu hình giá vé theo định dạng Room_Type_Seat_Type (ví dụ 2D_Regular).
 *     responses:
 *       200:
 *         description: Chi tiết cấu hình giá vé.
 *       403:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy.
 *       500:
 *         description: Lỗi server.
 */
router.get('/:id',
    authMiddleware,
    authorizeRoles('Admin', 'Staff', 'Manager'),
    ticketPricingController.getTicketPricingById
);

// PUT to update a ticket pricing by ID
/**
 * @swagger
 * /api/ticket-pricing/{id}:
 *   put:
 *     summary: Cập nhật một cấu hình giá vé (Chỉ Admin)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin cập nhật thông tin của một cấu hình giá vé cụ thể.
 *       Có thể cập nhật loại phòng, loại ghế, giá cơ bản hoặc trạng thái. Việc cập nhật có thể bị giới hạn nếu 
 *       cấu hình giá này đang được sử dụng trong các đặt vé đang chờ xử lý. API này thường được sử dụng trong trang quản lý giá vé.
 *     tags: [TicketPricing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của cấu hình giá vé theo định dạng Room_Type_Seat_Type (ví dụ 2D_Regular).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TicketPricingUpdate'
 *     responses:
 *       200:
 *         description: Cập nhật thành công. Có thể kèm thông báo nếu chỉ cập nhật một phần.
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc không thể cập nhật do booking pending.
 *       403:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy.
 *       500:
 *         description: Lỗi server.
 */
router.put('/:id',
    authMiddleware,
    authorizeRoles('Admin'),
    ticketPricingController.updateTicketPricing
);

// DELETE to remove a ticket pricing
/**
 * @swagger
 * /api/ticket-pricing/{id}:
 *   delete:
 *     summary: Xóa một cấu hình giá vé (Chỉ Admin)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin xóa một cấu hình giá vé khỏi hệ thống.
 *       Thực tế, cấu hình sẽ bị xóa khỏi file cấu hình JSON. API này thường được sử dụng trong trang quản lý giá vé.
 *     tags: [TicketPricing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của cấu hình giá vé theo định dạng Room_Type_Seat_Type (ví dụ 2D_Regular).
 *     responses:
 *       200:
 *         description: Xóa thành công.
 *       400:
 *         description: Không thể xóa do booking pending.
 *       403:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy.
 *       500:
 *         description: Lỗi server.
 */
router.delete('/:id',
    authMiddleware,
    authorizeRoles('Admin'),
    ticketPricingController.deleteTicketPricing
);

module.exports = router; 