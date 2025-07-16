'use strict';

const AuthService = require('../services/authService');
const EmailService = require('../services/emailService');
const AccountLockingService = require('../services/accountLockingService');
const EmailVerificationService = require('../services/emailVerificationService');
const UserRepository = require('../repositories/userRepository');
const logger = require('../utils/logger');
const bcrypt = require('bcrypt');
const cache = require('../config/cache').get();
const jwt = require('jsonwebtoken');
const { checkPasswordStrength, createDetailedValidationResponse } = require('../middlewares/validation');

class AuthController {
    async login(req, res) {
        try {
            const { Email, Password } = req.body;
            if (!Email || !Password) {
                return res.status(400).json({ message: 'Email và mật khẩu là bắt buộc.' });
            }
            const result = await AuthService.login(Email, Password);
            return res.status(200).json(result);
        } catch (err) {
            logger.error(`[authController.login] Error: ${err.message}`);
            return res.status(400).json({ message: err.message });
        }
    }

    async logout(req, res) {
        return res.json({ message: 'Đăng xuất thành công' });
    }

    async register(req, res) {
        try {
            logger.info('=== REGISTER CONTROLLER DEBUG ===');
            logger.info(`Raw request body: ${JSON.stringify(req.body)}`);
            logger.info(`Content-Type: ${req.headers['content-type']}`);

            const {
                FullName,
                Email,
                Password,
                ConfirmPassword,
                PhoneNumber,
                DateOfBirth,
                Sex,
                Address,
            } = req.body;

            if (Password !== ConfirmPassword) {
                logger.warn('[authController.register] Password and ConfirmPassword do not match');
                return res.status(400).json({ message: 'Mật khẩu và xác nhận mật khẩu không khớp' });
            }

            
            req.body.Full_Name = FullName;
            req.body.Phone_Number = PhoneNumber;
            req.body.Date_Of_Birth = DateOfBirth;

            const mappedData = {
                Full_Name: FullName,
                Email,
                Password,
                Phone_Number: PhoneNumber,
                Date_Of_Birth: DateOfBirth,
                Sex,
                Address,
            };

            logger.info(`Mapped data for AuthService: ${JSON.stringify(mappedData)}`);
            logger.info('Field mapping:');
            logger.info(`- FullName -> Full_Name: ${FullName} -> ${mappedData.Full_Name}`);
            logger.info(`- PhoneNumber -> Phone_Number: ${PhoneNumber} -> ${mappedData.Phone_Number}`);
            logger.info(`- DateOfBirth -> Date_Of_Birth: ${DateOfBirth} -> ${mappedData.Date_Of_Birth}`);

            const result = await AuthService.register(mappedData);
            return res.status(201).json(result);
        } catch (err) {
            logger.error(`[authController.register] Error: ${err.message}`);
            return res.status(400).json({
                success: false,
                message: err.message,
            });
        }
    }

    async updateProfile(req, res) {
        try {
            logger.info('=== UPDATE PROFILE DEBUG ===');
            logger.info(`req.user: ${JSON.stringify(req.user)}`);
            logger.info(`Raw request body: ${JSON.stringify(req.body)}`);

            
            let userId = null;
            if (req.user) {
                if (req.user.id) userId = req.user.id;
                else if (req.user.userId) userId = req.user.userId;
                else if (req.user.User_ID) userId = req.user.User_ID;
            }

            if (!userId) {
                logger.error('[authController.updateProfile] No userId found in req.user');
                return res.status(401).json({
                    message: 'Không tìm thấy thông tin người dùng trong token',
                });
            }

            logger.info(`[authController.updateProfile] Updating profile for user ID: ${userId}`);

            const updateData = {};

            if (req.body.FullName !== undefined) {
                updateData.Full_Name = req.body.FullName;
            }
            if (req.body.Email !== undefined) {
                updateData.Email = req.body.Email;
            }
            if (req.body.PhoneNumber !== undefined) {
                updateData.Phone_Number = req.body.PhoneNumber;
            }
            if (req.body.DateOfBirth !== undefined) {
                updateData.Date_Of_Birth = req.body.DateOfBirth;
            }
            
            if (req.body.Sex !== undefined) {
                updateData.Sex = req.body.Sex;
            } else if (req.body.Gender !== undefined) {
                updateData.Sex = req.body.Gender;
            }
            if (req.body.Address !== undefined) {
                updateData.Address = req.body.Address;
            }

            logger.info(`[authController.updateProfile] Mapped update data: ${JSON.stringify(updateData)}`);

            if (Object.keys(updateData).length === 0) {
                logger.warn('[authController.updateProfile] No data to update');
                return res.status(400).json({
                    success: false,
                    message: 'Không có dữ liệu để cập nhật',
                });
            }

            logger.info(`[authController.updateProfile] Calling UserRepository.update...`);
            const updateResult = await UserRepository.update(userId, updateData);

            logger.info(`[authController.updateProfile] Update result: ${updateResult}`);

            if (updateResult) {
                logger.info(`[authController.updateProfile] Profile updated successfully for user: ${userId}`);

                const updatedUser = await UserRepository.findById(userId);
                logger.info(`[authController.updateProfile] Retrieved updated user data`);

                const responseData = {
                    success: true,
                    message: 'Cập nhật thông tin thành công',
                    user: {
                        id: updatedUser.User_ID,
                        fullName: updatedUser.Full_Name,
                        email: updatedUser.Email,
                        phoneNumber: updatedUser.Phone_Number,
                        address: updatedUser.Address,
                        dateOfBirth: updatedUser.Date_Of_Birth,
                        sex: updatedUser.Sex,
                        role: updatedUser.Role,
                        accountStatus: updatedUser.Account_Status,
                    },
                };

                return res.json(responseData);
            } else {
                logger.error(`[authController.updateProfile] Update failed for user: ${userId}`);
                return res.status(500).json({
                    success: false,
                    message: 'Không thể cập nhật thông tin. Vui lòng thử lại.',
                });
            }
        } catch (error) {
            logger.error(`[authController.updateProfile] Error: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi cập nhật thông tin người dùng',
            });
        }
    }

    async changePassword(req, res) {
        try {
            logger.info('[authController.changePassword] === BẮT ĐẦU CHANGE PASSWORD ===');
            logger.info(`[authController.changePassword] req.user: ${JSON.stringify(req.user)}`);
            logger.info(`[authController.changePassword] Raw request body keys: ${Object.keys(req.body)}`);

            const userId = req.user?.id || req.user?.userId;

            if (!userId) {
                logger.error('[authController.changePassword] ❌ KHÔNG TÌM THẤY USER ID trong req.user');
                return res.status(401).json({
                    success: false,
                    message: 'Không tìm thấy thông tin người dùng trong token',
                    error: 'USER_ID_NOT_FOUND'
                });
            }

            logger.info(`[authController.changePassword] ✅ User ID: ${userId}`);

            
            const currentPassword = req.body.currentPassword || req.body.OldPassword || req.body.oldPassword;
            const newPassword = req.body.newPassword || req.body.NewPassword;
            const confirmPassword = req.body.confirmPassword || req.body.ConfirmNewPassword || req.body.confirmNewPassword;

            logger.info(`[authController.changePassword] Field mapping:`);
            logger.info(`[authController.changePassword]   - currentPassword provided: ${!!currentPassword}`);
            logger.info(`[authController.changePassword]   - newPassword provided: ${!!newPassword}`);
            logger.info(`[authController.changePassword]   - confirmPassword provided: ${!!confirmPassword}`);

           
            if (!currentPassword) {
                logger.warn(`[authController.changePassword] ❌ VALIDATION FAILED - Missing current password`);
                const detailedResponse = createDetailedValidationResponse([
                    { path: 'currentPassword', msg: 'Mật khẩu hiện tại không được để trống' }
                ]);
                return res.status(400).json(detailedResponse);
            }

            
            if (!newPassword) {
                logger.warn(`[authController.changePassword] ❌ VALIDATION FAILED - Missing new password`);
                const detailedResponse = createDetailedValidationResponse([
                    { path: 'newPassword', msg: 'Mật khẩu mới không được để trống' }
                ]);
                return res.status(400).json(detailedResponse);
            }

            
            if (!confirmPassword) {
                logger.warn(`[authController.changePassword] ❌ VALIDATION FAILED - Missing confirm password`);
                const detailedResponse = createDetailedValidationResponse([
                    { path: 'confirmPassword', msg: 'Xác nhận mật khẩu không được để trống' }
                ]);
                return res.status(400).json(detailedResponse);
            }

            
            if (newPassword !== confirmPassword) {
                logger.warn(`[authController.changePassword] ❌ VALIDATION FAILED - Passwords do not match`);
                logger.warn(`[authController.changePassword]   - New password length: ${newPassword.length}`);
                logger.warn(`[authController.changePassword]   - Confirm password length: ${confirmPassword.length}`);
                const detailedResponse = createDetailedValidationResponse([
                    { path: 'confirmPassword', msg: 'Mật khẩu mới và xác nhận mật khẩu không khớp' }
                ]);
                return res.status(400).json(detailedResponse);
            }

            
            logger.info(`[authController.changePassword] Kiểm tra độ mạnh mật khẩu mới...`);
            const passwordValidation = checkPasswordStrength(newPassword);
            logger.info(`[authController.changePassword] Password validation result:`);
            logger.info(`[authController.changePassword]   - Valid: ${passwordValidation.isValid}`);
            logger.info(`[authController.changePassword]   - Score: ${passwordValidation.score}/5`);
            logger.info(`[authController.changePassword]   - Checks: ${JSON.stringify(passwordValidation.checks)}`);

            if (!passwordValidation.isValid) {
                logger.warn(`[authController.changePassword] ❌ PASSWORD VALIDATION FAILED:`);
                passwordValidation.errors.forEach((error, index) => {
                    logger.warn(`[authController.changePassword]   ${index + 1}. ${error}`);
                });

                const detailedResponse = createDetailedValidationResponse([
                    { path: 'newPassword', msg: passwordValidation.errors[0] }
                ]);
                return res.status(400).json(detailedResponse);
            }

            logger.info(`[authController.changePassword] ✅ Password validation passed`);

            
            if (currentPassword === newPassword) {
                logger.warn(`[authController.changePassword] ❌ VALIDATION FAILED - New password same as current`);
                const detailedResponse = createDetailedValidationResponse([
                    { path: 'newPassword', msg: 'Mật khẩu mới phải khác mật khẩu hiện tại' }
                ]);
                return res.status(400).json(detailedResponse);
            }

            logger.info(`[authController.changePassword] Gọi AuthService.changePassword...`);

            const result = await AuthService.changePassword(userId, {
                oldPassword: currentPassword,
                newPassword: newPassword,
            });

            logger.info(`[authController.changePassword] ✅ AuthService result: ${JSON.stringify(result)}`);

            logger.info(`[authController.changePassword] === ✅ CHANGE PASSWORD THÀNH CÔNG ===`);
            logger.info(`[authController.changePassword] User ID: ${userId}`);

            return res.json({
                success: true,
                message: 'Đổi mật khẩu thành công',
                description: 'Mật khẩu của bạn đã được cập nhật thành công'
            });

        } catch (error) {
            logger.error(`[authController.changePassword] === ❌ LỖI TRONG QUÁ TRÌNH CHANGE PASSWORD ===`);
            logger.error(`[authController.changePassword] Error message: ${error.message}`);
            logger.error(`[authController.changePassword] Error stack: ${error.stack}`);
            
            
            if (error.validationData) {
                logger.info(`[authController.changePassword] Trả về validation error response từ service`);
                return res.status(400).json(error.validationData);
            }
            
            
            if (error.message.includes('Mật khẩu cũ không chính xác') || error.message.includes('Mật khẩu hiện tại không đúng')) {
                logger.warn(`[authController.changePassword] ❌ Wrong current password`);
                const detailedResponse = createDetailedValidationResponse([
                    { path: 'currentPassword', msg: 'Mật khẩu hiện tại không chính xác' }
                ]);
                return res.status(400).json(detailedResponse);
            }
            
            if (error.message.includes('Không tìm thấy người dùng')) {
                logger.error(`[authController.changePassword] ❌ User not found`);
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy thông tin người dùng',
                    error: 'USER_NOT_FOUND'
                });
            }
            
            if (error.message.includes('Mật khẩu mới phải khác mật khẩu hiện tại')) {
                logger.warn(`[authController.changePassword] ❌ New password same as current`);
                const detailedResponse = createDetailedValidationResponse([
                    { path: 'newPassword', msg: 'Mật khẩu mới phải khác mật khẩu hiện tại' }
                ]);
                return res.status(400).json(detailedResponse);
            }
            
            logger.error(`[authController.changePassword] ❌ Unhandled error occurred`);
            return res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi hệ thống khi đổi mật khẩu',
                error: error.message,
                details: 'Vui lòng thử lại sau hoặc liên hệ hỗ trợ nếu vấn đề tiếp tục xảy ra'
            });
        }
    }

    async resetPassword(req, res) {
        try {
            const email = req.body.Email || req.body.email;
            if (!email) {
                return res.status(400).json({ message: 'Vui lòng cung cấp địa chỉ email.', success: false });
            }
            await AuthService.initiatePasswordReset(email);
            return res.json({ message: 'Nếu email của bạn tồn tại trong hệ thống, một liên kết đặt lại mật khẩu đã được gửi.', success: true });
        } catch (err) {
            logger.error(`[authController.resetPassword] Error: ${err.message}`);
            if (err.message === 'Email không tồn tại trong hệ thống.') {
                return res.status(404).json({ message: err.message, success: false });
            }
            return res.status(400).json({ message: err.message, success: false });
        }
    }

    async getUserProfile(req, res) {
        try {
            
            if (!req.user) {
                logger.error('[authController.getUserProfile] req.user is undefined or null');
                return res.status(401).json({
                    message: 'Không thể xác thực người dùng, vui lòng đăng nhập lại'
                });
            }

            
            let userId = null;
            if (req.user.id) {
                userId = req.user.id;
            } else if (req.user.userId) {
                userId = req.user.userId;
            } else if (req.user.User_ID) {
                userId = req.user.User_ID;
            }

            if (!userId) {
                logger.error('[authController.getUserProfile] No userId found in req.user');
                return res.status(401).json({
                    message: 'Không tìm thấy thông tin người dùng trong token',
                });
            }

            logger.info(`[authController.getUserProfile] Looking for user with ID: ${userId}`);

            const user = await UserRepository.findById(userId);

            if (!user) {
                logger.warn(`[authController.getUserProfile] User not found: ${userId}`);
                return res.status(404).json({
                    message: 'Không tìm thấy thông tin người dùng'
                });
            }

            logger.info(`[authController.getUserProfile] UserRepository result: Found`);

            
            const userProfile = {
                User_ID: user.User_ID,
                Full_Name: user.Full_Name,
                Email: user.Email,
                Phone_Number: user.Phone_Number, 
                Date_Of_Birth: user.Date_Of_Birth,
                Sex: user.Sex, 
                Address: user.Address, 
                Role: user.Role,
                Cinema_ID: user.Cinema_ID,
                Account_Status: user.Account_Status, 
                Created_At: user.Created_At
            };

            logger.info(`[authController.getUserProfile] Success for user: ${user.Email}`);

            return res.status(200).json({
                success: true,
                user: userProfile
            });

        } catch (error) {
            logger.error(`[authController.getUserProfile] Database error: ${error.message}`);
            return res.status(500).json({
                message: 'Đã xảy ra lỗi khi lấy thông tin người dùng'
            });
        }
    }

    async checkAccountStatus(req, res) {
        try {
            const email = req.query.email;
            const isLocked = await AccountLockingService.isAccountLocked(email);
            if (isLocked) {
                const remainingMinutes = await AccountLockingService.getRemainingLockTime(email);
                return res.json({
                    isLocked: true,
                    remainingMinutes,
                    message: `Tài khoản đang bị khóa. Còn ${remainingMinutes} phút để mở khóa.`,
                });
            } else {
                return res.json({
                    isLocked: false,
                    message: 'Tài khoản đang hoạt động bình thường.',
                });
            }
        } catch (err) {
            logger.error(`[authController.checkAccountStatus] Error: ${err.message}`);
            return res.status(400).json({ message: err.message });
        }
    }

    async unlockAccount(req, res) {
        try {
            const { email } = req.body;
            const result = await AuthService.unlockAccount(email);
            if (result) {
                return res.json({ message: 'Tài khoản đã được mở khóa thành công' });
            } else {
                return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
            }
        } catch (err) {
            logger.error(`[authController.unlockAccount] Error: ${err.message}`);
            return res.status(400).json({ message: err.message });
        }
    }

    async verifyEmail(req, res) {
        try {
            logger.info('=== VERIFY EMAIL CONTROLLER DEBUG ===');
            logger.info(`Request query: ${JSON.stringify(req.query)}`);
            logger.info(`Request method: ${req.method}`);
            logger.info(`Request URL: ${req.url}`);

            const { token } = req.query;

            if (!token) {
                logger.info('[authController.verifyEmail] No token provided in query');
                return res.status(400).send(createHtmlResponse(
                    false,
                    'Lỗi xác thực',
                    'Token xác thực không được cung cấp.',
                    'Vui lòng kiểm tra lại đường dẫn trong email.'
                ));
            }

            logger.info(`[authController.verifyEmail] Processing token: ${token.substring(0, 10)}...`);

            const result = await EmailVerificationService.verifyTokenAndActivateUser(token);

            logger.info(`[authController.verifyEmail] EmailVerificationService result: ${JSON.stringify(result)}`);

            if (result.success) {
                logger.info(`[authController.verifyEmail] Email verification successful for user ${result.userId}`);

                return res.status(200).send(createHtmlResponse(
                    true,
                    'Xác thực thành công!',
                    result.message,
                    'Bạn có thể đóng trang này và đăng nhập vào tài khoản của mình.',
                    process.env.CLIENT_URL || 'http://localhost:5173'
                ));
            } else {
                logger.info(`[authController.verifyEmail] Email verification failed: ${result.message}`);

                return res.status(400).send(createHtmlResponse(
                    false,
                    'Xác thực thất bại',
                    result.message,
                    'Vui lòng thử lại hoặc liên hệ hỗ trợ nếu vấn đề vẫn tiếp diễn.'
                ));
            }
        } catch (error) {
            logger.error(`[authController.verifyEmail] Error: ${error.message}`);
            return res.status(500).send(createHtmlResponse(
                false,
                'Lỗi hệ thống',
                'Đã xảy ra lỗi khi xác thực email. Vui lòng thử lại sau.',
                'Nếu vấn đề vẫn tiếp diễn, vui lòng liên hệ bộ phận hỗ trợ.'
            ));
        }
    }

    async resendVerificationEmail(req, res) {
        try {
            const { email } = req.body;
            if (!email) return res.status(400).json({ success: false, message: 'Email không được để trống' });

            const user = await UserRepository.findByEmail(email);
            if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản với email này' });

            if (user.Account_Status !== 'Pending_Verification' && user.Account_Status !== 'Pending') {
                return res.status(400).json({ success: false, message: 'Tài khoản đã được xác thực hoặc không ở trạng thái chờ xác thực' });
            }

            const emailSent = await EmailVerificationService.sendVerificationEmail(user.Email, user.Full_Name, user.User_ID);
            if (emailSent) {
                return res.json({ success: true, message: 'Email xác thực đã được gửi lại. Vui lòng kiểm tra hộp thư của bạn.' });
            } else {
                return res.status(500).json({ success: false, message: 'Không thể gửi lại email xác thực. Vui lòng thử lại sau.' });
            }
        } catch (err) {
            logger.error(`[authController.resendVerificationEmail] Error: ${err.message}`);
            return res.status(500).json({ success: false, message: 'Đã xảy ra lỗi khi gửi lại email xác thực' });
        }
    }

    async checkEmailVerification(req, res) {
        try {
            const { email } = req.query;
            if (!email) return res.status(400).json({ success: false, message: 'Email không được để trống' });

            const user = await UserRepository.findByEmail(email);
            if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản với email này' });

            const isVerified = user.Account_Status === 'Active';
            return res.json({
                success: true,
                isVerified,
                status: user.Account_Status,
                message: isVerified ? 'Email đã được xác thực' : 'Email chưa được xác thực',
            });
        } catch (err) {
            logger.error(`[authController.checkEmailVerification] Error: ${err.message}`);
            return res.status(500).json({ success: false, message: 'Đã xảy ra lỗi khi kiểm tra trạng thái xác thực email' });
        }
    }

    
    async showResetPasswordForm(req, res) {
        const { token, newUser } = req.query;
        const isNewUser = newUser === 'true';

        try {
            if (!token) {
                logger.warn('[authController.showResetPasswordForm] No token provided');
                return res.status(400).send(createHtmlResponse('Lỗi', 'Không có token', 'Vui lòng sử dụng đường dẫn được cung cấp trong email.'));
            }

            const title = isNewUser ? 'Thiết lập mật khẩu mới' : 'Đặt lại mật khẩu';
            const formDesc = isNewUser ? 'Vui lòng tạo mật khẩu cho tài khoản của bạn' : 'Vui lòng nhập mật khẩu mới cho tài khoản của bạn';
            const buttonText = isNewUser ? 'Thiết lập mật khẩu' : 'Đặt lại mật khẩu';

            const htmlForm = `
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${title} - Galaxy Cinema</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; color: #333; }
                    .container { background: white; border-radius: 10px; box-shadow: 0px 0px 20px rgba(0, 0, 0, 0.1); width: 400px; padding: 30px; }
                    .logo-container { text-align: center; margin-bottom: 20px; }
                    h2 { color: #d9534f; text-align: center; margin-bottom: 20px; }
                    p { margin-bottom: 20px; }
                    label { display: block; margin-bottom: 5px; font-weight: 600; }
                    .form-group { margin-bottom: 20px; }
                    input[type="password"] { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-size: 16px; box-sizing: border-box; }
                    button { background-color: #d9534f; color: white; border: none; padding: 12px 20px; width: 100%; border-radius: 5px; cursor: pointer; font-size: 16px; }
                    button:hover { background-color: #c9302c; }
                    .error-message { color: #d9534f; margin-top: 5px; font-size: 14px; display: none; }
                    .logo { max-width: 120px; }
                    .password-requirements { font-size: 13px; color: #666; margin-top: 5px; background-color: #f8f9fa; padding: 10px; border-radius: 4px; }
                    .alert { padding: 10px; border-radius: 4px; margin-bottom: 15px; color: white; font-weight: 500; display: none; }
                    .alert-danger { background-color: #f2dede; color: #a94442; border: 1px solid #ebccd1; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="logo-container">
                        <img src="https://stp-cinema.vercel.app/imgs/logos/STPcinema.png" alt="Galaxy Cinema Logo" class="logo">
                    </div>
                    <h2>${title}</h2>
                    <p style="text-align: center; margin-bottom: 20px;">${formDesc}</p>
                    
                    <!-- Thông báo lỗi -->
                    <div id="errorAlert" class="alert alert-danger"></div>
                    
                    <form id="passwordResetForm">
                        <input type="hidden" name="token" value="${token}">
                        <input type="hidden" name="newUser" value="${isNewUser}">
                        <div class="form-group">
                            <label for="newPassword">Mật khẩu mới:</label>
                            <input type="password" id="newPassword" name="newPassword" required>
                            <div class="error-message" id="newPasswordError"></div>
                            <div class="password-requirements">
                                Mật khẩu phải có:
                                <ul>
                                    <li>Ít nhất 8 ký tự</li>
                                    <li>Tối đa 50 ký tự</li>
                                    <li>Ít nhất 1 chữ cái in hoa</li>
                                    <li>Ít nhất 1 ký tự đặc biệt (!@#$%^&*(),.?":{}|<>)</li>
                                    <li>Ít nhất 1 chữ số</li>
                                </ul>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="confirmPassword">Xác nhận mật khẩu mới:</label>
                            <input type="password" id="confirmPassword" name="confirmPassword" required>
                            <div class="error-message" id="confirmPasswordError"></div>
                        </div>
                        <button type="submit">${buttonText}</button>
                    </form>
                </div>

                <script>
                    document.getElementById('passwordResetForm').addEventListener('submit', function(event) {
                        event.preventDefault();
                        
                        // Ẩn các thông báo lỗi cũ
                        document.getElementById('errorAlert').style.display = 'none';
                        document.getElementById('newPasswordError').style.display = 'none';
                        document.getElementById('confirmPasswordError').style.display = 'none';
                        
                        const token = document.querySelector('input[name="token"]').value;
                        const newUser = document.querySelector('input[name="newUser"]').value;
                        const newPassword = document.getElementById('newPassword').value;
                        const confirmPassword = document.getElementById('confirmPassword').value;
                        
                        // Validate dữ liệu form trước khi gửi
                        let hasError = false;
                        
                        if (!newPassword) {
                            document.getElementById('newPasswordError').textContent = 'Vui lòng nhập mật khẩu mới';
                            document.getElementById('newPasswordError').style.display = 'block';
                            hasError = true;
                        }
                        
                        if (!confirmPassword) {
                            document.getElementById('confirmPasswordError').textContent = 'Vui lòng xác nhận mật khẩu';
                            document.getElementById('confirmPasswordError').style.display = 'block';
                            hasError = true;
                        }
                        
                        if (newPassword !== confirmPassword) {
                            document.getElementById('confirmPasswordError').textContent = 'Mật khẩu xác nhận không khớp';
                            document.getElementById('confirmPasswordError').style.display = 'block';
                            hasError = true;
                        }
                        
                        if (hasError) return;
                        
                        // Gửi request API bằng fetch
                        fetch('/api/auth/perform-password-reset', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ token, newUser, newPassword, confirmPassword })
                        })
                        .then(response => {
                            if (!response.ok) {
                                return response.json().then(data => {
                                    throw new Error(data.message || 'Có lỗi xảy ra khi đặt lại mật khẩu');
                                });
                            }
                            return response.json();
                        })
                        .then(data => {
                            // Chuyển hướng sau khi thành công
                            window.location.href = data.redirectUrl || '/login';
                        })
                        .catch(error => {
                            // Hiển thị lỗi
                            const errorAlert = document.getElementById('errorAlert');
                            errorAlert.textContent = error.message || 'Có lỗi xảy ra khi đặt lại mật khẩu';
                            errorAlert.style.display = 'block';
                            
                            // Nếu có các lỗi cụ thể cho từng trường
                            if (error.errors) {
                                error.errors.forEach(err => {
                                    if (err.path === 'newPassword') {
                                        document.getElementById('newPasswordError').textContent = err.msg;
                                        document.getElementById('newPasswordError').style.display = 'block';
                                    }
                                });
                            }
                        });
                    });
                </script>
            </body>
            </html>
            `;
            res.send(htmlForm);
        } catch (error) {
            logger.error(`[authController.showResetPasswordForm] Error: ${error.message}`);
            res.status(400).send(createHtmlResponse('Lỗi xác thực Token', error.message, 'Token của bạn có thể không hợp lệ hoặc đã hết hạn. Vui lòng thử yêu cầu đặt lại mật khẩu một lần nữa.'));
        }
    }

    
    async performPasswordReset(req, res) {
        const { token, newPassword, confirmPassword, newUser } = req.body;
        const isNewUser = newUser === 'true';

        try {
            logger.info(`[authController.performPasswordReset] === BẮT ĐẦU RESET PASSWORD ===`);
            logger.info(`[authController.performPasswordReset] Token prefix: ${token ? token.substring(0, 10) + '...' : 'null'}`);
            logger.info(`[authController.performPasswordReset] isNewUser: ${isNewUser}`);
            logger.info(`[authController.performPasswordReset] Password provided: ${!!newPassword}`);
            logger.info(`[authController.performPasswordReset] Confirm password provided: ${!!confirmPassword}`);

           
            if (!token || !newPassword || !confirmPassword) {
                logger.warn(`[authController.performPasswordReset] ❌ VALIDATION FAILED - Missing required fields:`);
                logger.warn(`[authController.performPasswordReset]   - Token: ${!!token}`);
                logger.warn(`[authController.performPasswordReset]   - NewPassword: ${!!newPassword}`);
                logger.warn(`[authController.performPasswordReset]   - ConfirmPassword: ${!!confirmPassword}`);
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin bắt buộc: token, mật khẩu mới và xác nhận mật khẩu',
                    errors: [
                        !token && 'Token không được cung cấp',
                        !newPassword && 'Mật khẩu mới không được để trống',
                        !confirmPassword && 'Xác nhận mật khẩu không được để trống'
                    ].filter(Boolean)
                });
            }

            
            if (newPassword !== confirmPassword) {
                logger.warn(`[authController.performPasswordReset] ❌ VALIDATION FAILED - Passwords do not match`);
                logger.warn(`[authController.performPasswordReset]   - New password length: ${newPassword.length}`);
                logger.warn(`[authController.performPasswordReset]   - Confirm password length: ${confirmPassword.length}`);
                const detailedResponse = createDetailedValidationResponse([
                    { path: 'confirmPassword', msg: 'Mật khẩu xác nhận không khớp với mật khẩu mới' }
                ]);
                return res.status(400).json(detailedResponse);
            }

            
            logger.info(`[authController.performPasswordReset] Kiểm tra độ mạnh mật khẩu...`);
            const passwordValidation = checkPasswordStrength(newPassword);
            logger.info(`[authController.performPasswordReset] Password validation result:`);
            logger.info(`[authController.performPasswordReset]   - Valid: ${passwordValidation.isValid}`);
            logger.info(`[authController.performPasswordReset]   - Score: ${passwordValidation.score}/5`);
            logger.info(`[authController.performPasswordReset]   - Checks: ${JSON.stringify(passwordValidation.checks)}`);
            
            if (!passwordValidation.isValid) {
                logger.warn(`[authController.performPasswordReset] ❌ PASSWORD VALIDATION FAILED:`);
                passwordValidation.errors.forEach((error, index) => {
                    logger.warn(`[authController.performPasswordReset]   ${index + 1}. ${error}`);
                });
                
                const detailedResponse = createDetailedValidationResponse([
                    { path: 'newPassword', msg: passwordValidation.errors[0] }
                ]);
                
                return res.status(400).json(detailedResponse);
            }
            logger.info(`[authController.performPasswordReset] ✅ Password validation passed`);

           
            const tokenCacheKey = isNewUser
                ? `password_setup_token_${token}`
                : `password_reset_token_${token}`;

            logger.info(`[authController.performPasswordReset] Tìm token trong cache với key: ${tokenCacheKey}`);

            let storedData = cache.get(tokenCacheKey);
            logger.info(`[authController.performPasswordReset] Token found in primary cache: ${!!storedData}`);

            if (!storedData) {
                
                const alternateTokenCacheKey = isNewUser
                    ? `password_reset_token_${token}`
                    : `password_setup_token_${token}`;

                logger.info(`[authController.performPasswordReset] Thử với alternate key: ${alternateTokenCacheKey}`);
                const alternateData = cache.get(alternateTokenCacheKey);
                logger.info(`[authController.performPasswordReset] Token found in alternate cache: ${!!alternateData}`);

                if (alternateData) {
                    storedData = alternateData;
                } else {
                    logger.error(`[authController.performPasswordReset] ❌ TOKEN NOT FOUND hoặc ĐÃ HẾT HẠN:`);
                    logger.error(`[authController.performPasswordReset]   - Primary key: ${tokenCacheKey}`);
                    logger.error(`[authController.performPasswordReset]   - Alternate key: ${alternateTokenCacheKey}`);
                    return res.status(400).json({
                        success: false,
                        message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
                        error: 'TOKEN_EXPIRED_OR_INVALID'
                    });
                }
            }

            const userId = storedData.userId;
            logger.info(`[authController.performPasswordReset] ✅ Token hợp lệ - User ID: ${userId}`);

            
            logger.info(`[authController.performPasswordReset] Tìm user với ID: ${userId}`);
            const user = await UserRepository.findById(userId);
            if (!user) {
                logger.error(`[authController.performPasswordReset] ❌ KHÔNG TÌM THẤY USER với ID: ${userId}`);
                return res.status(400).json({
                    success: false,
                    message: 'Không tìm thấy người dùng tương ứng với token này',
                    error: 'USER_NOT_FOUND'
                });
            }

            logger.info(`[authController.performPasswordReset] ✅ Tìm thấy user:`);
            logger.info(`[authController.performPasswordReset]   - Email: ${user.Email}`);
            logger.info(`[authController.performPasswordReset]   - Current Status: ${user.Account_Status}`);
            logger.info(`[authController.performPasswordReset]   - Role: ${user.Role}`);

            
            logger.info(`[authController.performPasswordReset] Băm mật khẩu mới...`);
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            logger.info(`[authController.performPasswordReset] ✅ Mật khẩu đã được băm thành công`);

            
            logger.info(`[authController.performPasswordReset] Cập nhật thông tin user...`);
            const updateData = {
                Password: hashedPassword
            };

            if (isNewUser) {
                updateData.Account_Status = 'Active';
                logger.info(`[authController.performPasswordReset] Đây là user mới - cập nhật status thành Active`);
            }

            logger.info(`[authController.performPasswordReset] Update data: ${JSON.stringify({
                ...updateData,
                Password: '[HIDDEN]'
            })}`);

            
            const updateResult = await UserRepository.update(userId, updateData);
            logger.info(`[authController.performPasswordReset] ✅ Update result: ${JSON.stringify(updateResult)}`);

            
            logger.info(`[authController.performPasswordReset] Xóa tokens khỏi cache...`);
            cache.del(tokenCacheKey);
            const alternateTokenCacheKey = isNewUser
                ? `password_reset_token_${token}`
                : `password_setup_token_${token}`;
            cache.del(alternateTokenCacheKey);
            logger.info(`[authController.performPasswordReset] ✅ Đã xóa tokens:`);
            logger.info(`[authController.performPasswordReset]   - Primary: ${tokenCacheKey}`);
            logger.info(`[authController.performPasswordReset]   - Alternate: ${alternateTokenCacheKey}`);

            
            const successTitle = isNewUser ? 'Thiết lập mật khẩu thành công!' : 'Đặt lại mật khẩu thành công!';
            const successMessage = isNewUser
                ? 'Mật khẩu đã được thiết lập và tài khoản đã được kích hoạt'
                : 'Mật khẩu đã được đặt lại thành công';
            const successDesc = isNewUser
                ? 'Bây giờ bạn có thể đăng nhập với tài khoản và mật khẩu mới'
                : 'Bây giờ bạn có thể đăng nhập bằng mật khẩu mới';

            logger.info(`[authController.performPasswordReset] === ✅ RESET PASSWORD THÀNH CÔNG ===`);
            logger.info(`[authController.performPasswordReset] User: ${user.Email}`);
            logger.info(`[authController.performPasswordReset] Type: ${isNewUser ? 'New User Setup' : 'Password Reset'}`);

            return res.status(200).json({
                success: true,
                title: successTitle,
                message: successMessage,
                description: successDesc,
                redirectUrl: process.env.CLIENT_LOGIN_URL || 'http://localhost:5173/login'
            });

        } catch (error) {
            logger.error(`[authController.performPasswordReset] === ❌ LỖI TRONG QUÁ TRÌNH RESET PASSWORD ===`);
            logger.error(`[authController.performPasswordReset] Error message: ${error.message}`);
            logger.error(`[authController.performPasswordReset] Error stack: ${error.stack}`);
            
            return res.status(500).json({
                success: false,
                message: 'Đã có lỗi hệ thống trong quá trình đặt lại mật khẩu',
                error: error.message,
                details: 'Vui lòng thử lại sau hoặc liên hệ hỗ trợ nếu vấn đề tiếp tục xảy ra'
            });
        }
    }
}

function createHtmlResponse(title, message, description, isSuccess = true, redirectUrl = null, redirectDelay = 3000) {
    const successColor = '#28a745'; 
    const errorColor = '#dc3545';   
    const noticeColor = '#17a2b8';  

    let headerColor = isSuccess === true ? successColor : (isSuccess === false ? errorColor : noticeColor);
    let statusMessage = isSuccess === true ? 'Thành công!' : (isSuccess === false ? 'Thất bại!' : 'Thông báo');

    let redirectMeta = '';
    let redirectMessage = '';
    if (redirectUrl) {
        redirectMeta = `<meta http-equiv="refresh" content="${redirectDelay / 1000};url=${redirectUrl}">`;
        redirectMessage = `<p class="redirect-message">Bạn sẽ được chuyển hướng sau ${redirectDelay / 1000} giây...</p>`;
    }

    return `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${redirectMeta}
        <title>${title} - STP Cinema</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0f2f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; text-align: center; padding: 20px; box-sizing: border-box; }
            .container { background-color: #ffffff; padding: 35px 45px; border-radius: 10px; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1); max-width: 550px; width: 100%; }
            .header { padding-bottom: 15px; margin-bottom: 25px; border-bottom: 1px solid #e9ecef; }
            .header h1 { font-size: 28px; color: ${headerColor}; margin: 0; }
            .status-icon { font-size: 48px; margin-bottom: 20px; }
            .message h2 { font-size: 22px; color: #343a40; margin-top: 0; margin-bottom: 10px; }
            .message p { font-size: 16px; color: #495057; line-height: 1.6; margin-bottom: 25px; }
            .description { font-size: 14px; color: #6c757d; margin-bottom: 30px; }
            .redirect-message { font-size: 13px; color: #6c757d; font-style: italic; }
            a.button { display: inline-block; padding: 12px 25px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; font-size: 16px; transition: background-color 0.2s ease-in-out; }
            a.button:hover { background-color: #0056b3; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>${statusMessage}</h1>
            </div>
            <div class="message">
                <h2>${title}</h2>
                <p>${message}</p>
            </div>
            ${description ? `<div class="description"><p>${description}</p></div>` : ''}
            ${redirectUrl && isSuccess ? `<a href="${redirectUrl}" class="button">Tiếp tục</a>` : ''}
            ${redirectMessage}
        </div>
    </body>
    </html>
    `;
}

module.exports = new AuthController();