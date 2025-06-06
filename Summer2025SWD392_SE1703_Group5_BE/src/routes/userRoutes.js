'use strict';


const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');


/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     BaseUpdateProfileDTO:
 *       type: object
 *       properties:
 *         Phone_Number:
 *           type: string
 *         Address:
 *           type: string
 *         Date_Of_Birth:
 *           type: string
 *           format: date
 *         Sex:
 *           type: string
 *         Role:
 *           type: string
 *         Account_Status:
 *           type: string
 *     CustomerProfileDTO:
 *       type: object
 *       properties:
 *         Full_Name:
 *           type: string
 *         Email:
 *           type: string
 *         Phone_Number:
 *           type: string
 *         Address:
 *           type: string
 *         Date_Of_Birth:
 *           type: string
 *           format: date
 *         Sex:
 *           type: string
 *     AdminProfileDTO:
 *       type: object
 *       properties:
 *         User_ID:
 *           type: integer
 *         Full_Name:
 *           type: string
 *         Email:
 *           type: string
 *         Phone_Number:
 *           type: string
 *         Address:
 *           type: string
 *         Date_Of_Birth:
 *           type: string
 *           format: date
 *         Sex:
 *           type: string
 *         Role:
 *           type: string
 *         Department:
 *           type: string
 *         Hire_Date:
 *           type: string
 *           format: date
 *         Created_At:
 *           type: string
 *           format: date-time
 *         Last_Login:
 *           type: string
 *           format: date-time
 *         Account_Status:
 *           type: string
 *     StaffProfileDTO:
 *       type: object
 *       properties:
 *         User_ID:
 *           type: integer
 *         Full_Name:
 *           type: string
 *         Email:
 *           type: string
 *         Phone_Number:
 *           type: string
 *         Address:
 *           type: string
 *         Date_Of_Birth:
 *           type: string
 *           format: date
 *         Sex:
 *           type: string
 *         Role:
 *           type: string
 *         Department:
 *           type: string
 *         Hire_Date:
 *           type: string
 *           format: date
 *         Created_At:
 *           type: string
 *           format: date-time
 *         Last_Login:
 *           type: string
 *           format: date-time
 *         Account_Status:
 *           type: string
 *     AdminRegisterUserDto:
 *       type: object
 *       properties:
 *         Full_Name:
 *           type: string
 *         Email:
 *           type: string
 *         Phone_Number:
 *           type: string
 *         Address:
 *           type: string
 *         Date_Of_Birth:
 *           type: string
 *           format: date
 *         Sex:
 *           type: string
 *         Role:
 *           type: string
 *     StaffRegisterUserDto:
 *       type: object
 *       properties:
 *         Full_Name:
 *           type: string
 *         Email:
 *           type: string
 *         Phone_Number:
 *           type: string
 *         Address:
 *           type: string
 *         Date_Of_Birth:
 *           type: string
 *           format: date
 *         Sex:
 *           type: string
 *     UserStatusDto:
 *       type: object
 *       properties:
 *         Status:
 *           type: string
 */


/**
 * @swagger
 * /api/user:
 *   get:
 *     summary: Lấy danh sách tất cả người dùng
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách người dùng
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   User_ID:
 *                     type: integer
 *                   Full_Name:
 *                     type: string
 *                   Email:
 *                     type: string
 *                   Phone_Number:
 *                     type: string
 *                   Address:
 *                     type: string
 *                   Date_Of_Birth:
 *                     type: string
 *                     format: date
 *                   Sex:
 *                     type: string
 *                   Role:
 *                     type: string
 *                   Account_Status:
 *                     type: string
 *                   Last_Login:
 *                     type: string
 *                     format: date-time
 *       400:
 *         description: Lỗi hệ thống
 */
router.get('/', authMiddleware, authorizeRoles(['Admin', 'Staff']), userController.getAllUsers);


/**
 * @swagger
 * /api/user/{userId}:
 *   get:
 *     summary: Lấy thông tin người dùng theo ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của người dùng
 *     responses:
 *       200:
 *         description: Thông tin hồ sơ người dùng
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/CustomerProfileDTO'
 *                 - $ref: '#/components/schemas/AdminProfileDTO'
 *                 - $ref: '#/components/schemas/StaffProfileDTO'
 *       400:
 *         description: ID không hợp lệ
 *       403:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy người dùng
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/:userId', authMiddleware, userController.getUserById);


/**
 * @swagger
 * /api/user/{id}/restore:
 *   put:
 *     summary: Khôi phục người dùng bị xóa mềm
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của người dùng
 *     responses:
 *       200:
 *         description: Khôi phục thành công
 *       400:
 *         description: ID không hợp lệ hoặc người dùng chưa bị xóa
 *       404:
 *         description: Không tìm thấy người dùng
 */
router.put('/:id/restore', authMiddleware, authorizeRoles(['Admin', 'Staff']), userController.restoreUser);


/**
 * @swagger
 * /api/user/register-user:
 *   post:
 *     summary: Đăng ký người dùng mới bởi Admin
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdminRegisterUserDto'
 *     responses:
 *       200:
 *         description: Đăng ký thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 */
router.post('/register-user', authMiddleware, authorizeRoles(['Admin', 'Staff']), userController.registerUserWithAutoPassword);


/**
 * @swagger
 * /api/user/{id}:
 *   delete:
 *     summary: Xóa mềm người dùng
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của người dùng
 *     responses:
 *       200:
 *         description: Xóa thành công
 *       400:
 *         description: ID không hợp lệ hoặc không thể xóa chính mình
 *       404:
 *         description: Không tìm thấy người dùng
 */
router.delete('/:id', authMiddleware, authorizeRoles(['Admin', 'Staff']), userController.deleteUser);


/**
 * @swagger
 * /api/user/{id}/status:
 *   put:
 *     summary: Thay đổi trạng thái tài khoản
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của người dùng
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserStatusDto'
 *     responses:
 *       200:
 *         description: Thay đổi thành công
 *       400:
 *         description: ID không hợp lệ
 *       404:
 *         description: Không tìm thấy người dùng
 */
router.put('/:id/status', authMiddleware, authorizeRoles(['Admin', 'Staff']), userController.changeUserStatus);


/**
 * @swagger
 * /api/user/{id}/reset-password:
 *   post:
 *     summary: Đặt lại mật khẩu người dùng
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của người dùng
 *     responses:
 *       200:
 *         description: Đặt lại mật khẩu thành công
 *       400:
 *         description: ID không hợp lệ
 *       404:
 *         description: Không tìm thấy người dùng
 */
router.post('/:id/reset-password', authMiddleware, authorizeRoles(['Admin', 'Staff']), userController.resetPassword);


/**
 * @swagger
 * /api/user/profile:
 *   get:
 *     summary: Lấy thông tin cá nhân người dùng hiện tại
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin hồ sơ
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/CustomerProfileDTO'
 *                 - $ref: '#/components/schemas/AdminProfileDTO'
 *                 - $ref: '#/components/schemas/StaffProfileDTO'
 *       401:
 *         description: Chưa xác thực
 *       404:
 *         description: Không tìm thấy người dùng
 */
router.get('/profile', authMiddleware, userController.getUserProfile);


/**
 * @swagger
 * /api/user/profile:
 *   put:
 *     summary: Cập nhật thông tin cá nhân người dùng hiện tại
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BaseUpdateProfileDTO'
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       401:
 *         description: Chưa xác thực
 *       500:
 *         description: Lỗi hệ thống
 */
router.put('/profile', authMiddleware, userController.updateProfile);

/**
 * @swagger
 * /api/user/staff/assign:
 *   post:
 *     summary: Gán Staff cho một rạp phim
 *     description: |
 *       Route này dành cho Admin và Manager sử dụng.
 *       Cho phép gán một Staff vào làm việc tại một rạp phim cụ thể.
 *       Admin có thể gán bất kỳ Staff nào cho bất kỳ rạp nào.
 *       Manager chỉ có thể gán Staff cho rạp mà họ quản lý.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               staffId:
 *                 type: integer
 *                 description: ID của Staff
 *               cinemaId:
 *                 type: integer
 *                 description: ID của rạp phim
 *     responses:
 *       200:
 *         description: Staff đã được phân công cho rạp phim
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền phân công Staff cho rạp này
 *       404:
 *         description: Không tìm thấy Staff hoặc rạp phim
 */
router.post('/staff/assign', authMiddleware, authorizeRoles('Admin', 'Manager'), userController.assignStaffToCinema);

/**
 * @swagger
 * /api/user/managers/assign:
 *   post:
 *     summary: Gán Manager cho một rạp phim (Chỉ Admin)
 *     description: |
 *       Route này chỉ dành cho Admin sử dụng.
 *       Cho phép gán một Manager vào quản lý một rạp phim cụ thể.
 *       Một Manager chỉ có thể quản lý một rạp tại một thời điểm.
 *       Nếu Manager đã được gán vào rạp khác, sẽ được chuyển sang rạp mới.
 *       Admin có thể gán bất kỳ Manager nào cho bất kỳ rạp nào.
 *       Manager cấp cao chỉ có thể gán Manager cấp dưới cho rạp thuộc phạm vi quản lý của mình.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               managerId:
 *                 type: integer
 *                 description: ID của Manager
 *               cinemaId:
 *                 type: integer
 *                 description: ID của rạp phim
 *     responses:
 *       200:
 *         description: Manager đã được gán cho rạp phim
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc Manager đã được gán cho rạp khác
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền gán Manager cho rạp này
 *       404:
 *         description: Không tìm thấy Manager hoặc rạp phim
 */
router.post('/managers/assign', authMiddleware, authorizeRoles('Admin'), userController.assignManagerToCinema);






module.exports = router;

