/**
 * Filesrc/routes/authRoutes.js
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');
const { authValidation, memberValidation } = require('../middlewares/validation');

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
 *     summary: Đăng ký tài khoản người dùng mới (Public)
 *     description: >
 *       API này cho phép bất kỳ ai truy cập trang web đều có thể đăng ký một tài khoản người dùng mới.
 *       Sau khi đăng ký, người dùng sẽ nhận được email xác thực để kích hoạt tài khoản.
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
router.post('/register', authValidation.register, authController.register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Đăng nhập hệ thống (Public)
 *     description: >
 *       API này cho phép người dùng đăng nhập vào hệ thống bằng email và mật khẩu.
 *       Có thể sử dụng cho mọi loại tài khoản (Khách hàng, Nhân viên, Quản trị viên).
 *       Trả về token JWT để xác thực các yêu cầu tiếp theo.
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
 *       401:
 *         description: Tài khoản bị khóa hoặc chưa xác thực.
 *       429:
 *         description: Quá nhiều lần đăng nhập thất bại, tài khoản đã bị tạm khóa.
 */
router.post('/login', authValidation.login, authController.login);

/**
 * @swagger
 * /api/auth/verify-email:
 *   get:
 *     summary: Xác thực địa chỉ email sau khi đăng ký (Public)
 *     description: >
 *       API này được sử dụng để xác thực địa chỉ email của người dùng sau khi đăng ký.
 *       Người dùng sẽ nhận được email chứa liên kết với token xác thực và sẽ truy cập API này thông qua liên kết đó.
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
 * /api/auth/reset-password:
 *   post:
 *     summary: Yêu cầu reset mật khẩu (Public)
 *     description: >
 *       API này cho phép người dùng yêu cầu đặt lại mật khẩu khi quên mật khẩu.
 *       Hệ thống sẽ gửi email chứa liên kết đặt lại mật khẩu đến địa chỉ email được cung cấp.
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

/**
 * @swagger
 * /api/auth/resend-verification-email:
 *   post:
 *     summary: Gửi lại email xác thực tài khoản (Public)
 *     description: >
 *       API này cho phép người dùng yêu cầu gửi lại email xác thực khi chưa nhận được email xác thực ban đầu
 *       hoặc email xác thực đã hết hạn.
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
 *     summary: Đăng xuất khỏi hệ thống (Yêu cầu đăng nhập)
 *     description: >
 *       API này cho phép người dùng đã đăng nhập đăng xuất khỏi hệ thống.
 *       Khi gọi API này, token JWT hiện tại của người dùng sẽ bị vô hiệu hóa.
 *     tags: [Auth]
 *     security:
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
 *     summary: Thay đổi mật khẩu người dùng hiện tại (Yêu cầu đăng nhập)
 *     description: >
 *       API này cho phép người dùng đã đăng nhập thay đổi mật khẩu của họ.
 *       Người dùng cần cung cấp mật khẩu hiện tại để xác thực cũng như mật khẩu mới.
 *     tags: [Auth]
 *     security:
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
router.put('/password', authMiddleware, authValidation.changePassword, authController.changePassword);

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     summary: Lấy thông tin cá nhân của người dùng hiện tại (Yêu cầu đăng nhập)
 *     description: >
 *       API này cho phép người dùng đã đăng nhập xem thông tin cá nhân của họ.
 *       Thông tin bao gồm ID, họ tên, email, số điện thoại, vai trò và các thông tin khác.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin cá nhân của người dùng.
 *       401:
 *         description: Chưa đăng nhập.
 *       404:
 *         description: Không tìm thấy thông tin người dùng.
 *   put:
 *     summary: Cập nhật thông tin cá nhân của người dùng hiện tại (Yêu cầu đăng nhập)
 *     description: >
 *       API này cho phép người dùng đã đăng nhập cập nhật thông tin cá nhân của họ.
 *       Các thông tin có thể cập nhật bao gồm họ tên, ngày sinh, giới tính, số điện thoại và địa chỉ.
 *     tags: [Auth]
 *     security:
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
router.get('/profile', authMiddleware, authController.getUserProfile);
router.put('/profile', authMiddleware, memberValidation.updateProfile, authController.updateProfile);

// Routes for showing and handling the password reset form
router.get('/reset-password-form', authController.showResetPasswordForm);       // Page to enter new password
router.post('/perform-password-reset', express.json(), authValidation.resetPassword, authController.performPasswordReset); // Endpoint to submit new password

module.exports = router;