'use strict';

const AuthService = require('../services/authService');
const EmailService = require('../services/emailService');
const AccountLockingService = require('../services/accountLockingService');
const EmailVerificationService = require('../services/emailVerificationService');
const UserRepository = require('../repositories/userRepository');
const logger = require('../utils/logger');

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

            const userId = req.user?.id || req.user?.userId;

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
            logger.info('=== CHANGE PASSWORD DEBUG ===');
            logger.info(`req.user: ${JSON.stringify(req.user)}`);
            logger.info(`Raw request body: ${JSON.stringify(req.body)}`);

            const userId = req.user?.id || req.user?.userId;

            if (!userId) {
                logger.error('[authController.changePassword] No userId found in req.user');
                return res.status(401).json({
                    message: 'Không tìm thấy thông tin người dùng trong token',
                });
            }

            const oldPassword = req.body.OldPassword || req.body.oldPassword;
            const newPassword = req.body.NewPassword || req.body.newPassword;
            const confirmNewPassword = req.body.ConfirmNewPassword || req.body.confirmNewPassword;

            logger.info(`[authController.changePassword] Field mapping:`);
            logger.info(`- OldPassword provided: ${!!oldPassword}`);
            logger.info(`- NewPassword provided: ${!!newPassword}`);
            logger.info(`- ConfirmNewPassword provided: ${!!confirmNewPassword}`);

            if (!oldPassword) {
                return res.status(400).json({
                    message: 'Vui lòng nhập mật khẩu cũ',
                });
            }

            if (!newPassword) {
                return res.status(400).json({
                    message: 'Vui lòng nhập mật khẩu mới',
                });
            }

            if (!confirmNewPassword) {
                return res.status(400).json({
                    message: 'Vui lòng xác nhận mật khẩu mới',
                });
            }

            if (newPassword !== confirmNewPassword) {
                return res.status(400).json({
                    message: 'Mật khẩu mới và xác nhận mật khẩu không khớp',
                });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({
                    message: 'Mật khẩu mới phải có ít nhất 6 ký tự',
                });
            }

            logger.info(`[authController.changePassword] Calling AuthService.changePassword for user: ${userId}`);

            const result = await AuthService.changePassword(userId, {
                oldPassword: oldPassword,
                newPassword: newPassword,
            });

            logger.info(`[authController.changePassword] AuthService result: ${JSON.stringify(result)}`);

            return res.json({
                success: true,
                message: 'Đổi mật khẩu thành công',
            });
        } catch (error) {
            logger.error(`[authController.changePassword] Error: ${error.message}`);
            if (error.message.includes('Mật khẩu cũ không chính xác')) {
                return res.status(400).json({
                    message: 'Mật khẩu cũ không chính xác',
                });
            }
            if (error.message.includes('Không tìm thấy người dùng')) {
                return res.status(404).json({
                    message: 'Không tìm thấy thông tin người dùng',
                });
            }
            return res.status(500).json({
                message: 'Đã xảy ra lỗi khi đổi mật khẩu. Vui lòng thử lại sau.',
            });
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

    async getUserProfile(req, res) {
        try {
            logger.info('=== GET USER PROFILE DEBUG ===');
            logger.info(`req.user: ${JSON.stringify(req.user)}`);
            logger.info(`req.user.id: ${req.user?.id}`);
            logger.info(`req.user.userId: ${req.user?.userId}`);

            const userId = req.user?.id || req.user?.userId;

            if (!userId) {
                logger.error('[authController.getUserProfile] No userId found in req.user');
                return res.status(401).json({
                    message: 'Không tìm thấy thông tin người dùng trong token',
                });
            }

            logger.info(`[authController.getUserProfile] Looking for user with ID: ${userId}`);

            const user = await UserRepository.findById(userId);
            logger.info(`[authController.getUserProfile] UserRepository result: ${user ? 'Found' : 'Not found'}`);

            if (!user) {
                logger.error(`[authController.getUserProfile] User not found with ID: ${userId}`);
                return res.status(404).json({
                    message: 'Không tìm thấy thông tin người dùng',
                });
            }

            const responseData = {
                id: user.User_ID,
                fullName: user.Full_Name,
                email: user.Email,
                phoneNumber: user.Phone_Number,
                address: user.Address,
                dateOfBirth: user.Date_Of_Birth,
                sex: user.Sex,
                role: user.Role,
                accountStatus: user.Account_Status,
            };

            logger.info(`[authController.getUserProfile] Success for user: ${user.Email}`);
            return res.json(responseData);
        } catch (error) {
            logger.error(`[authController.getUserProfile] Error: ${error.message}`);
            return res.status(500).json({
                message: 'Đã xảy ra lỗi khi lấy thông tin người dùng',
            });
        }
    }
}
function createHtmlResponse(title, message, description, isSuccess = true, redirectUrl = null, redirectDelay = 3000) {
    const successColor = '#28a745'; // Green for success
    const errorColor = '#dc3545';   // Red for error
    const noticeColor = '#17a2b8';  // Blue for general notice

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
            <title>${title} - GALAXY Cinema</title>
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