// routes/memberRoutes.js (cập nhật với validation mới)
const express = require('express');
const router = express.Router();
const memberController = require('../controllers/memberController');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');
const { memberValidation } = require('../middlewares/validation');

/**
 * @swagger
 * tags:
 *   name: Member Management
 *   description: API quản lý thông tin thành viên
 */

/**
 * @swagger
 * /api/member/lookup/phone/{phoneNumber}:
 *   get:
 *     summary: Tìm kiếm thành viên theo số điện thoại (Chỉ Admin/Staff/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin, Staff hoặc Manager tìm kiếm thông tin thành viên bằng số điện thoại.
 *       Kết quả trả về bao gồm thông tin chi tiết về thành viên như họ tên, email, điểm tích lũy và lịch sử giao dịch.
 *       API này thường được sử dụng tại quầy vé để phục vụ khách hàng thành viên khi họ không đăng nhập.
 *     tags: [Member Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: phoneNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Số điện thoại cần tìm (10-11 số)
 *         example: "0901234567"
 *     responses:
 *       200:
 *         description: Tìm thấy thành viên thành công
 *       400:
 *         description: Số điện thoại không hợp lệ
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       404:
 *         description: Không tìm thấy thành viên
 *       500:
 *         description: Lỗi server
 */
router.get('/lookup/phone/:phoneNumber',
    authMiddleware,
    authorizeRoles('Admin', 'Staff', 'Manager'),
    memberValidation.lookupByPhone,
    memberController.lookupByPhone
);

/**
 * @swagger
 * /api/member/lookup/email/{email}:
 *   get:
 *     summary: Tìm kiếm thành viên theo email (Chỉ Admin/Staff/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin, Staff hoặc Manager tìm kiếm thông tin thành viên bằng email.
 *       Tương tự như tìm kiếm bằng số điện thoại, API này trả về thông tin chi tiết về thành viên và được sử dụng
 *       tại quầy vé để phục vụ khách hàng khi họ không đăng nhập nhưng cung cấp email.
 *     tags: [Member Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *         description: Email cần tìm
 *         example: "user@example.com"
 *     responses:
 *       200:
 *         description: Tìm thấy thành viên thành công
 *       400:
 *         description: Email không hợp lệ
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *       404:
 *         description: Không tìm thấy thành viên
 *       500:
 *         description: Lỗi server
 */
router.get('/lookup/email/:email',
    authMiddleware,
    authorizeRoles('Admin', 'Staff', 'Manager'),
    memberValidation.lookupByEmail,
    memberController.lookupByEmail
);

/**
 * @swagger
 * /api/member/link-member:
 *   post:
 *     summary: Liên kết booking với thành viên (Chỉ Admin/Staff/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin, Staff hoặc Manager liên kết một đơn đặt vé không đăng nhập
 *       với tài khoản thành viên đã có trong hệ thống. Điều này cho phép khách hàng được tích điểm khi đặt vé
 *       mà không đăng nhập vào tài khoản của họ. Nhân viên có thể sử dụng số điện thoại hoặc email của khách hàng
 *       để thực hiện liên kết. Đơn đặt vé đã liên kết với thành viên khác không thể được liên kết lại.
 *     tags: [Member Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bookingId:
 *                 type: integer
 *                 description: ID của đơn đặt vé cần liên kết
 *                 example: 123
 *               memberIdentifier:
 *                 type: string
 *                 description: Số điện thoại hoặc email của thành viên
 *                 example: "0901234567 hoặc user@example.com"
 *             required:
 *               - bookingId
 *               - memberIdentifier
 *     responses:
 *       200:
 *         description: Liên kết thành công
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc đơn đã liên kết
 *       401:
 *         description: Không có quyền truy cập (chưa đăng nhập)
 *       403:
 *         description: Không có quyền liên kết
 *       404:
 *         description: Không tìm thấy đơn hoặc thành viên
 *       500:
 *         description: Lỗi server
 */
router.post('/link-member',
    authMiddleware,
    authorizeRoles('Admin', 'Staff', 'Manager'),
    memberController.linkMember
);

module.exports = router;

