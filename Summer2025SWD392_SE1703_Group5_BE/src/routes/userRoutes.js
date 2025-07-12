'use strict';

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');
const authController = require('../controllers/authController');

/**
 * @swagger
 * components:
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
 * /api/user/staff-register:
 *   post:
 *     summary: Đăng ký người dùng mới bởi Staff
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StaffRegisterUserDto'
 *     responses:
 *       200:
 *         description: Đăng ký thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 */
router.post('/staff-register', authMiddleware, authorizeRoles('Staff'), userController.registerUserByStaff);

/**
 * @swagger
 * /api/user/managers:
 *   get:
 *     summary: Lấy danh sách tất cả Manager
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách Manager
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/managers', authMiddleware, authorizeRoles('Admin'), userController.getAllManagers);

/**
 * @swagger
 * /api/user/staff:
 *   get:
 *     summary: Lấy danh sách tất cả Staff
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách Staff
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       User_ID:
 *                         type: integer
 *                       Full_Name:
 *                         type: string
 *                       Email:
 *                         type: string
 *                       Phone_Number:
 *                         type: string
 *                       Cinema_ID:
 *                         type: integer
 *                       Cinema_Name:
 *                         type: string
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/staff', authMiddleware, authorizeRoles('Admin', 'Manager'), userController.getAllStaff);

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
router.post('/register-user', authMiddleware, authorizeRoles('Admin'), userController.registerUserWithAutoPassword);

/**
 * @swagger
 * /api/user:
 *   get:
 *     summary: Lấy danh sách tất cả người dùng (Chỉ Admin)
 *     description: |
 *       Route này chỉ dành cho Admin sử dụng.
 *       Cung cấp danh sách đầy đủ người dùng trong hệ thống kèm theo thông tin chi tiết.
 *       Admin có thể xem tất cả người dùng, Manager và Staff chỉ thấy người dùng thuộc phạm vi quản lý.
 *       Thông tin bao gồm tên, email, số điện thoại, ngày sinh, vai trò và trạng thái tài khoản.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [Customer, Staff, Manager, Admin]
 *         description: Lọc theo vai trò người dùng (không bắt buộc)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Active, Locked, Pending, Deleted]
 *         description: Lọc theo trạng thái tài khoản (không bắt buộc)
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
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập
 *       400:
 *         description: Lỗi hệ thống
 */
router.get('/', authMiddleware, authorizeRoles('Admin'), userController.getAllUsers);

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
router.put('/:id/restore', authMiddleware, authorizeRoles('Admin'), userController.restoreUser);

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
router.delete('/:id', authMiddleware, authorizeRoles('Admin'), userController.deleteUser);

/**
 * @swagger
 * /api/user/{id}/status:
 *   put:
 *     summary: Thay đổi trạng thái tài khoản người dùng (Chỉ Admin)
 *     description: |
 *       Route này chỉ dành cho Admin sử dụng.
 *       Cho phép thay đổi trạng thái tài khoản người dùng (Kích hoạt/Khóa/Tạm ngưng).
 *       Admin có thể thay đổi trạng thái của mọi người dùng, bao gồm cả Staff và Manager.
 *       Manager chỉ có thể thay đổi trạng thái của Staff và Customer thuộc rạp họ quản lý.
 *       Staff chỉ có thể thay đổi trạng thái của Customer.
 *       Không thể thay đổi trạng thái tài khoản của chính mình hoặc tài khoản có vai trò cao hơn.
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
 *           examples:
 *             activate:
 *               value:
 *                 Status: "Active"
 *               summary: Kích hoạt tài khoản 
 *             lock:
 *               value:
 *                 Status: "Locked" 
 *               summary: Khóa tài khoản
 *             suspend:
 *               value:
 *                 Status: "Suspended"
 *               summary: Tạm ngưng tài khoản
 *     responses:
 *       200:
 *         description: Thay đổi thành công
 *       400:
 *         description: ID không hợp lệ hoặc trạng thái không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền thay đổi trạng thái tài khoản này
 *       404:
 *         description: Không tìm thấy người dùng
 */
router.put('/:id/status', authMiddleware, authorizeRoles('Admin'), userController.changeUserStatus);

/**
 * @swagger
 * /api/user/{id}/reset-password:
 *   post:
*     summary: Đặt lại mật khẩu người dùng (Chỉ Admin)
 *     description: |
 *       Route này chỉ dành cho Admin sử dụng.
 *       Cho phép đặt lại mật khẩu của người dùng thành một mật khẩu ngẫu nhiên mới.
 *       Mật khẩu mới sẽ được gửi đến email của người dùng đó.
 *       Admin có thể đặt lại mật khẩu cho mọi người dùng.
 *       Manager chỉ có thể đặt lại mật khẩu cho Staff và Customer thuộc rạp họ quản lý.
 *       Staff chỉ có thể đặt lại mật khẩu cho Customer.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của người dùng cần đặt lại mật khẩu
 *     responses:
 *       200:
 *         description: Đặt lại mật khẩu thành công
 *       400:
 *         description: ID không hợp lệ hoặc không thể đặt lại mật khẩu
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền đặt lại mật khẩu cho người dùng này
 *       404:
 *         description: Không tìm thấy người dùng
 *       500:
 *         description: Lỗi khi gửi email
 */
router.post('/:id/reset-password', authMiddleware, authorizeRoles('Admin'), userController.resetPassword);

/**
 * @swagger
 * /api/user/assign-to-cinema:
 *   post:
 *     summary: Phân công người dùng (Staff/Manager) vào rạp phim
 *     description: |
 *       Route này dành cho Admin sử dụng.
 *       Cho phép phân công một Staff hoặc Manager vào làm việc tại một rạp phim cụ thể.
 *       Nếu là Manager, mỗi rạp chỉ được phép có 1 manager và thông tin liên hệ của rạp (email, phone) sẽ được cập nhật theo thông tin của manager.
 *       Nếu là Staff, chỉ đơn giản gán staff vào rạp.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - role
 *               - cinemaId
 *             properties:
 *               userId:
 *                 type: integer
 *                 description: ID của người dùng cần phân công
 *               role:
 *                 type: string
 *                 enum: [Manager, Staff]
 *                 description: Vai trò của người dùng (Manager hoặc Staff)
 *               cinemaId:
 *                 type: integer
 *                 description: ID của rạp phim
 *           examples:
 *             assignManager:
 *               value:
 *                 userId: 5
 *                 role: "Manager"
 *                 cinemaId: 1
 *               summary: Phân công Manager cho rạp
 *             assignStaff:
 *               value:
 *                 userId: 8
 *                 role: "Staff"
 *                 cinemaId: 1
 *               summary: Phân công Staff cho rạp
 *     responses:
 *       200:
 *         description: Phân công thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     User_ID:
 *                       type: integer
 *                     Full_Name:
 *                       type: string
 *                     Email:
 *                       type: string
 *                     Phone_Number:
 *                       type: string
 *                     Role:
 *                       type: string
 *                     Cinema_ID:
 *                       type: integer
 *                     Cinema_Name:
 *                       type: string
 *                     Cinema_Contact_Updated:
 *                       type: boolean
 *                       description: Chỉ có khi role là Manager
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc rạp đã có manager
 *       404:
 *         description: Không tìm thấy người dùng hoặc rạp phim
 */
router.post('/assign-to-cinema', authMiddleware, authorizeRoles('Admin'), userController.assignUserToCinema);

/**
 * @swagger
 * /api/user/staff/{id}:
 *   get:
 *     summary: Lấy thông tin chi tiết của Staff theo ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của Staff
 *     responses:
 *       200:
 *         description: Thông tin chi tiết của Staff
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
 *                     User_ID:
 *                       type: integer
 *                     Full_Name:
 *                       type: string
 *                     Email:
 *                       type: string
 *                     Role:
 *                       type: string
 *                     Phone_Number:
 *                       type: string
 *                     Date_Of_Birth:
 *                       type: string
 *                     Sex:
 *                       type: string
 *                     Address:
 *                       type: string
 *                     Department:
 *                       type: string
 *                     ManagedCinema:
 *                       type: object
 *                       properties:
 *                         Cinema_ID:
 *                           type: integer
 *                         Cinema_Name:
 *                           type: string
 *                         Address:
 *                           type: string
 *                         City:
 *                           type: string
 *       400:
 *         description: ID không hợp lệ
 *       404:
 *         description: Không tìm thấy nhân viên
 */
router.get('/staff/:id', authMiddleware, authorizeRoles('Admin', 'Manager'), userController.getStaffDetailById);

/**
 * @swagger
 * /api/user/manager/{id}:
 *   get:
 *     summary: Lấy thông tin chi tiết của Manager theo ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của Manager
 *     responses:
 *       200:
 *         description: Thông tin chi tiết của Manager
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
 *                     User_ID:
 *                       type: integer
 *                     Full_Name:
 *                       type: string
 *                     Email:
 *                       type: string
 *                     Role:
 *                       type: string
 *                     Phone_Number:
 *                       type: string
 *                     Date_Of_Birth:
 *                       type: string
 *                     Sex:
 *                       type: string
 *                     Address:
 *                       type: string
 *                     Department:
 *                       type: string
 *                     ManagedCinema:
 *                       type: object
 *                       properties:
 *                         Cinema_ID:
 *                           type: integer
 *                         Cinema_Name:
 *                           type: string
 *                         Address:
 *                           type: string
 *                         City:
 *                           type: string
 *       400:
 *         description: ID không hợp lệ
 *       404:
 *         description: Không tìm thấy quản lý
 */
router.get('/manager/:id', authMiddleware, authorizeRoles('Admin'), userController.getManagerDetailById);

module.exports = router;