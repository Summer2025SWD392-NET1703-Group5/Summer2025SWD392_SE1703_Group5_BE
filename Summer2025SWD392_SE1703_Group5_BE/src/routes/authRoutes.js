// File: src/routes/authRoutes.js

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Các API xác thực và quản lý tài khoản người dùng
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Đăng ký tài khoản người dùng mới
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - FullName
 *               - Email
 *               - Password
 *               - ConfirmPassword
 *               - PhoneNumber
 *               - DateOfBirth
 *               - Sex
 *             properties:
 *               FullName:
 *                 type: string
 *                 example: Nguyễn Văn A
 *               Email:
 *                 type: string
 *                 format: email
 *                 example: nguyenvana@example.com
 *               Password:
 *                 type: string
 *                 example: P@sswOrd123!
 *               ConfirmPassword:
 *                 type: string
 *                 example: P@sswOrd123!
 *               PhoneNumber:
 *                 type: string
 *                 example: "0901234567"
 *               DateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: 1990-01-01
 *               Sex:
 *                 type: string
 *                 example: Male
 *               Address:
 *                 type: string
 *                 example: 123 Đường ABC, Quận XYZ, TP.HCM
 *     responses:
 *       201:
 *         description: Đăng ký thành công.
 *       400:
 *         description: Dữ liệu không hợp lệ.
 */
router.post('/register', authController.register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Đăng nhập hệ thống
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - Email
 *               - Password
 *             properties:
 *               Email:
 *                 type: string
 *                 format: email
 *                 example: nguyenvana@example.com
 *               Password:
 *                 type: string
 *                 example: P@sswOrd123!
 *     responses:
 *       200:
 *         description: Đăng nhập thành công.
 *       400:
 *         description: Email hoặc mật khẩu không đúng.
 */
router.post('/login', authController.login);

/**
 * @swagger
 * /api/auth/verify-email:
 *   get:
 *     summary: Xác thực địa chỉ email sau khi đăng ký
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Token xác thực được gửi qua email.
 *     responses:
 *       200:
 *         description: Xác thực email thành công.
 *       400:
 *         description: Token không hợp lệ hoặc đã hết hạn.
 */
router.get('/verify-email', authController.verifyEmail);
/**
 * @swagger
 * /api/auth/resend-verification-email:
 *   post:
 *     summary: Gửi lại email xác thực tài khoản
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Email xác thực đã được gửi lại.
 *       400:
 *         description: Email không tồn tại, tài khoản đã xác thực hoặc lỗi khác.
 */
router.post('/resend-verification-email', authController.resendVerificationEmail);
/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Đăng xuất khỏi hệ thống
 *     tags: [Auth]
 *     security:
 *       - ApiKeyAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Đăng xuất thành công.
 *       401:
 *         description: Chưa đăng nhập.
 */
router.post('/logout', authMiddleware, authController.logout);

/**
 * @swagger
 * /api/auth/password:
 *   put:
 *     summary: Thay đổi mật khẩu người dùng hiện tại
 *     tags: [Auth]
 *     security:
 *       - ApiKeyAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - OldPassword
 *               - NewPassword
 *               - ConfirmNewPassword
 *             properties:
 *               OldPassword:
 *                 type: string
 *                 example: oldPassword123
 *               NewPassword:
 *                 type: string
 *                 example: newPassword456
 *               ConfirmNewPassword:
 *                 type: string
 *                 example: newPassword456
 *     responses:
 *       200:
 *         description: Đổi mật khẩu thành công.
 *       400:
 *         description: Mật khẩu cũ không đúng hoặc mật khẩu mới không hợp lệ.
 *       401:
 *         description: Chưa đăng nhập.
 */
router.put('/password', authMiddleware, authController.changePassword);
/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     summary: Lấy thông tin cá nhân của người dùng hiện tại
 *     tags: [Auth]
 *     security:
 *       - ApiKeyAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin cá nhân của người dùng.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: number
 *                   example: 1
 *                 fullName:
 *                   type: string
 *                   example: Nguyễn Văn A
 *                 email:
 *                   type: string
 *                   example: nguyenvana@example.com
 *                 phoneNumber:
 *                   type: string
 *                   example: "0901234567"
 *                 role:
 *                   type: string
 *                   example: Customer
 *       401:
 *         description: Chưa đăng nhập.
 *       404:
 *         description: Không tìm thấy thông tin người dùng.
 *   put:
 *     summary: Cập nhật thông tin cá nhân của người dùng hiện tại
 *     tags: [Auth]
 *     security:
 *       - ApiKeyAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               FullName:
 *                 type: string
 *                 example: Nguyễn Văn B
 *               DateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: 1990-01-01
 *               Sex:
 *                 type: string
 *                 example: Male
 *               PhoneNumber:
 *                 type: string
 *                 example: "0901234568"
 *               Address:
 *                 type: string
 *                 example: 456 Đường DEF, Quận XYZ, TP.HCM
 *     responses:
 *       200:
 *         description: Cập nhật thông tin thành công.
 *       400:
 *         description: Dữ liệu không hợp lệ.
 *       401:
 *         description: Chưa đăng nhập.
 */

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Yêu cầu reset mật khẩu (gửi token qua email)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - Email
 *             properties:
 *               Email:
 *                 type: string
 *                 format: email
 *                 example: nguyenvana@example.com
 *     responses:
 *       200:
 *         description: Yêu cầu reset mật khẩu đã được gửi.
 *       400:
 *         description: Email không tồn tại hoặc lỗi khác.
 */
router.post('/reset-password', authController.resetPassword);
router.get('/profile', authMiddleware, authController.getUserProfile);
router.put('/profile', authMiddleware, authController.updateProfile);

module.exports = router;