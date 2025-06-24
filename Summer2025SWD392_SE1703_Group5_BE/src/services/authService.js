const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const crypto = require('crypto');
const { User } = require('../models');
const sendMail = require('../services/emailService');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const logger = require('../utils/logger');
const appConfig = require('../config/appConfig');
const EmailVerificationService = require('./emailVerificationService');
const UserRepository = require('../repositories/userRepository');

// THÊM IMPORT EMAIL VERIFICATION SERVICE
const AccountLockingService = require('../services/accountLockingService');
const cache = require('../config/cache').get();

/**
 * Tạo mật khẩu ngẫu nhiên
 * @param {number} length - Độ dài mật khẩu (mặc định là 10)
 * @returns {string} - Mật khẩu ngẫu nhiên
 */
function generateRandomPassword(length = 10) {
    const uppercaseChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercaseChars = 'abcdefghijklmnopqrstuvwxyz';
    const numberChars = '0123456789';
    const specialChars = '!@#$%^&*()_+{}|:<>?-=[]\\;\',./';

    const allChars = uppercaseChars + lowercaseChars + numberChars + specialChars;

    let password = '';

    // Đảm bảo mật khẩu có ít nhất 1 ký tự viết hoa, 1 viết thường, 1 số và 1 ký tự đặc biệt
    password += uppercaseChars.charAt(Math.floor(Math.random() * uppercaseChars.length));
    password += lowercaseChars.charAt(Math.floor(Math.random() * lowercaseChars.length));
    password += numberChars.charAt(Math.floor(Math.random() * numberChars.length));
    password += specialChars.charAt(Math.floor(Math.random() * specialChars.length));

    // Tạo các ký tự còn lại
    for (let i = 4; i < length; i++) {
        password += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }

    // Trộn mật khẩu (Fisher-Yates shuffle)
    password = password.split('').sort(() => 0.5 - Math.random()).join('');

    return password;
}

/**
 * Helper: Hash password using bcrypt
 */
async function hashPassword(password) {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
}

/**
 * Helper: Compare password
 */
async function verifyPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
}

/**
 * Helper: Generate JWT Token
 */
function generateJwtToken(user) {
    console.log(`[generateJwtToken] Input user object:`, {
        User_ID: user?.User_ID,
        Email: user?.Email,
        Role: user?.Role,
        Full_Name: user?.Full_Name
    });

    // FIX: Check user object
    if (!user || !user.User_ID || !user.Email) {
        console.error(`[generateJwtToken] Invalid user object:`, user);
        throw new Error('Invalid user data for JWT generation');
    }

    const payload = {
        // FIX: Thêm cả id và userId để tương thích với mọi trường hợp
        id: user.User_ID,           // Để middleware có thể dùng req.user.id
        userId: user.User_ID,       // Để middleware có thể dùng req.user.userId  
        email: user.Email,
        role: user.Role || 'Customer',
        fullName: user.Full_Name
    };

    console.log(`[generateJwtToken] JWT payload before signing:`, payload);

    try {
        const token = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: '1d',
            issuer: process.env.JWT_ISSUER || 'GALAXY-cinema'
        });

        console.log(`[generateJwtToken] Token created successfully!`);
        console.log(`[generateJwtToken] Token length: ${token.length}`);
        console.log(`[generateJwtToken] Token preview: ${token.substring(0, 50)}...`);

        // FIX: Verify token ngay sau khi tạo để đảm bảo
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            console.log(`[generateJwtToken] Token verification successful:`, {
                id: decoded.id,
                userId: decoded.userId,
                email: decoded.email,
                role: decoded.role
            });
        } catch (verifyError) {
            console.error(`[generateJwtToken] Token verification failed:`, verifyError.message);
            throw new Error('Failed to verify generated token');
        }

        return token;

    } catch (error) {
        console.error(`[generateJwtToken] Error creating token:`, error.message);
        console.error(`[generateJwtToken] JWT_SECRET defined:`, !!process.env.JWT_SECRET);
        throw error;
    }
}

function formatDateForSQLServer(dateString) {
    if (!dateString) return null;

    try {
        // Nếu đã đúng format YYYY-MM-DD
        if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            // Kiểm tra date có hợp lệ không
            const testDate = new Date(dateString + 'T00:00:00.000Z');
            if (isNaN(testDate.getTime())) {
                throw new Error('Invalid date');
            }
            return dateString;
        }

        // Nếu là Date object hoặc format khác
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            throw new Error('Invalid date');
        }

        // Convert sang YYYY-MM-DD
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    } catch (error) {
        throw new Error('Ngày sinh không hợp lệ. Vui lòng sử dụng định dạng YYYY-MM-DD (ví dụ: 1990-01-01)');
    }
}

const AuthService = {

    // Đăng ký tài khoản mới
    async register(userData) {
        try {
            console.log('=== AuthService.register START ===');
            console.log('Input userData:', JSON.stringify(userData, null, 2));

            const {
                Full_Name,
                Email,
                Password,
                Phone_Number,
                Date_Of_Birth,
                Sex,
                Address
            } = userData;

            // Validation
            if (!Full_Name || !Email || !Password) {
                throw new Error('Thiếu thông tin bắt buộc: Họ tên, Email, Mật khẩu');
            }

            // Kiểm tra email tồn tại
            console.log('Checking existing email:', Email);
            const existingUser = await User.findOne({
                where: { Email: Email }
            });

            if (existingUser) {
                throw new Error('Email đã được sử dụng');
            }

            // Kiểm tra số điện thoại (nếu có)
            if (Phone_Number) {
                console.log('Checking existing phone:', Phone_Number);
                const phoneUser = await User.findOne({
                    where: { Phone_Number: Phone_Number }
                });
                if (phoneUser) {
                    throw new Error('Số điện thoại đã được sử dụng');
                }
            }

            // Hash password
            console.log('Hashing password...');
            const passwordHash = await hashPassword(Password);

            // Format date
            let formattedDateOfBirth = null;
            if (Date_Of_Birth) {
                console.log('Formatting Date_Of_Birth:', Date_Of_Birth);
                formattedDateOfBirth = Date_Of_Birth;
                console.log('Formatted Date_Of_Birth (DATEONLY):', formattedDateOfBirth);
            }

            const currentTime = new Date();
            console.log('Current time for Created_At:', currentTime);

            // Tạo object để insert
            const createData = {
                Full_Name: Full_Name,
                Email: Email,
                Password: passwordHash,
                Role: 'Customer',
                Account_Status: 'Pending_Verification', // ĐỔI THÀNH Pending_Verification
            };

            // Thêm các field optional
            if (Phone_Number) createData.Phone_Number = Phone_Number;
            if (formattedDateOfBirth) createData.Date_Of_Birth = formattedDateOfBirth;
            if (Sex) createData.Sex = Sex;
            if (Address) createData.Address = Address;

            console.log('Final createData:', JSON.stringify(createData, null, 2));

            // Tạo user
            console.log('Creating user in database...');
            const user = await User.create(createData);

            console.log('User created successfully with ID:', user.User_ID);

            // ===== THÊM PHẦN GỬI EMAIL XÁC THỰC =====
            try {
                console.log('Sending verification email...');
                const emailSent = await EmailVerificationService.sendVerificationEmail(
                    Email,
                    Full_Name,
                    user.User_ID
                );

                if (emailSent) {
                    console.log('Verification email sent successfully');
                } else {
                    console.warn('Failed to send verification email, but user was created');
                }
            } catch (emailError) {
                console.error('Error sending verification email:', emailError);
                // Không throw error ở đây để không làm fail toàn bộ registration
                // User vẫn được tạo thành công, chỉ email không gửi được
            }
            // ===== KẾT THÚC PHẦN GỬI EMAIL =====

            console.log('=== AuthService.register END ===');

            return {
                success: true,
                message: 'Đăng ký thành công! Vui lòng kiểm tra email để xác thực tài khoản.',
                userId: user.User_ID
            };

        } catch (error) {
            console.error('=== AuthService.register ERROR ===');
            console.error('Error details:', error);
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
            throw error;
        }
    },

    // Xác thực email - CẬP NHẬT ĐỂ SỬ DỤNG EmailVerificationService
    async verifyEmail(token) {
        try {
            const result = await EmailVerificationService.verifyTokenAndActivateUser(token);
            return result;
        } catch (error) {
            console.error('Error in verifyEmail:', error);
            throw error;
        }
    },

    // Đăng nhập
    async login(Email, Password) {
        console.log(`[AuthService.login] Attempting login for email: ${Email}`);
        try {
            const user = await User.findOne({ where: { Email } });

            if (!user) {
                console.log(`[AuthService.login] User not found: ${Email}`);
                // Generic message for non-existent user, don't record attempt as it's not a password failure for an existing user
                throw new Error('Tài khoản hoặc mật khẩu không đúng.');
            }

            console.log(`[AuthService.login] User found: ID=${user.User_ID}, Email=${user.Email}, Status=${user.Account_Status}`);

            // Check if account is locked BEFORE attempting password verification
            if (await AccountLockingService.isAccountLocked(Email)) {
                const remainingTime = await AccountLockingService.getRemainingLockTime(Email);
                const message = `Tài khoản của bạn đã bị tạm khóa. Vui lòng thử lại sau ${remainingTime} phút.`;
                console.log(`[AuthService.login] Account locked: ${Email}. ${message}`);
                throw new Error(message);
            }

            if (await verifyPassword(Password, user.Password)) {
                console.log(`[AuthService.login] Password verified for: ${Email}`);

                if (user.Account_Status === 'Inactive') {
                    console.log(`[AuthService.login] Account inactive: ${Email}`);
                    throw new Error('Tài khoản của bạn chưa được kích hoạt. Vui lòng kiểm tra email và làm theo hướng dẫn.');
                }

                if (user.Account_Status === 'Deleted') {
                    console.log(`[AuthService.login] Account deleted: ${Email}`);
                    throw new Error(`Tài khoản của bạn đã bị xóa và không thể đăng nhập.`);
                }

                // Reset failed attempts on successful login
                await AccountLockingService.resetFailedAttempts(Email);

                console.log(`[AuthService.login] Generating token for user: ${user.User_ID}`);
                const token = generateJwtToken(user);
                console.log(`[AuthService.login] Login successful for: ${Email}, Token generated.`);
                return {
                    success: true,
                    message: 'Đăng nhập thành công!',
                    token,
                    user: {
                        userId: user.User_ID,
                        email: user.Email,
                        fullName: user.Full_Name,
                        role: user.Role
                    }
                };
            } else {
                console.log(`[AuthService.login] Invalid password for: ${Email}`);
                await AccountLockingService.recordFailedAttempt(Email);

                if (await AccountLockingService.isAccountLocked(Email)) {
                    const remainingTime = await AccountLockingService.getRemainingLockTime(Email);
                    const lockMessage = `Tài khoản của bạn đã bị tạm khóa do nhập sai mật khẩu nhiều lần. Vui lòng thử lại sau ${remainingTime} phút.`;
                    console.log(`[AuthService.login] Account locked after this attempt: ${Email}. ${lockMessage}`);
                    throw new Error(lockMessage);
                } else {
                    const currentFailedAttempts = await AccountLockingService.getFailedAttempts(Email);
                    const remainingAttempts = AccountLockingService.MAX_FAILED_ATTEMPTS - currentFailedAttempts;
                    let attemptMessage = 'Tài khoản hoặc mật khẩu không đúng.';
                    if (remainingAttempts > 0) {
                        attemptMessage += ` Bạn còn ${remainingAttempts} lần thử.`;
                    } else {
                        // This case should ideally be caught by the isAccountLocked check above after recordFailedAttempt
                        // but as a fallback:
                        attemptMessage += ` Tài khoản sẽ bị khóa sau lần thử này nếu không thành công.`;
                    }
                    console.log(`[AuthService.login] Failed attempt ${currentFailedAttempts}/${AccountLockingService.MAX_FAILED_ATTEMPTS} for ${Email}. Remaining: ${remainingAttempts}`);
                    throw new Error(attemptMessage);
                }
            }
        } catch (error) {
            console.error(`[AuthService.login] Login failed for ${Email}: ${error.message}`);
            throw error;
        }
    },

    async initiatePasswordReset(Email) {
        logger.info(`[AuthService.initiatePasswordReset] Initiating password reset for email: ${Email}`);
        if (!Email) {
            throw new Error('Địa chỉ email không được để trống.');
        }

        const user = await User.findOne({ where: { Email } });
        if (!user) {
            // For security, typically you might not want to reveal if an email exists.
            // However, for user experience during reset, sometimes it's better to be clear.
            // Or, the controller can handle the generic message.
            logger.warn(`[AuthService.initiatePasswordReset] User not found with email: ${Email}`);
            throw new Error('Email không tồn tại trong hệ thống.');
        }

        const token = crypto.randomBytes(32).toString('hex');
        const tokenCacheKey = `password_reset_token_${token}`;
        // Store token with user ID and email, expires in 1 hour (3600 seconds)
        const tokenExpirySeconds = parseInt(process.env.PASSWORD_RESET_TOKEN_EXPIRES_MINUTES || '60', 10) * 60;

        cache.set(tokenCacheKey, { userId: user.User_ID, email: user.Email }, tokenExpirySeconds);
        logger.info(`[AuthService.initiatePasswordReset] Password reset token generated and cached for user ${user.User_ID}. Key: ${tokenCacheKey}, Expiry: ${tokenExpirySeconds}s`);

        // Construct reset URL to point to the backend-served form
        const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        const resetUrl = `${apiBaseUrl}/api/auth/reset-password-form?token=${token}`;

        // We need an EmailService instance to send the email.
        // EmailVerificationService has one: EmailVerificationService.emailServiceInstance
        // Ensure EmailService has a sendPasswordResetEmailAsync method.
        try {
            // Assuming EmailService will have a method like this:
            // It will be created in the next step.
            const emailSent = await EmailVerificationService.emailServiceInstance.sendPasswordResetEmailAsync(
                user.Email,
                user.Full_Name,
                resetUrl
            );

            if (emailSent) {
                logger.info(`[AuthService.initiatePasswordReset] Password reset email sent successfully to: ${user.Email}`);
            } else {
                logger.error(`[AuthService.initiatePasswordReset] Failed to send password reset email to: ${user.Email}. EmailService returned false.`);
                // Even if email fails, don't necessarily throw an error that reveals too much to the client here.
                // The controller will give a generic success.
                // Consider internal alerting for failed email sends.
            }
        } catch (error) {
            logger.error(`[AuthService.initiatePasswordReset] Error sending password reset email: ${error.message}`, error);
            // As above, avoid throwing an error that stops the generic success message in controller
        }

        return true; // Indicates process initiated. Controller gives generic message.
    },

    async verifyPasswordResetToken(token) {
        logger.info(`[AuthService.verifyPasswordResetToken] Verifying token: ${token ? token.substring(0, 10) + '...' : 'null'}`);
        if (!token) {
            throw new Error('Token không hợp lệ hoặc đã hết hạn.');
        }
        const tokenCacheKey = `password_reset_token_${token}`;
        const storedData = cache.get(tokenCacheKey);

        if (!storedData) {
            logger.warn(`[AuthService.verifyPasswordResetToken] Token not found in cache or expired. Key: ${tokenCacheKey}`);
            throw new Error('Token không hợp lệ hoặc đã hết hạn.');
        }
        logger.info(`[AuthService.verifyPasswordResetToken] Token valid for user ID: ${storedData.userId}`);
        return { userId: storedData.userId, email: storedData.email }; // Return user info
    },

    async completePasswordReset(token, newPassword) {
        logger.info(`[AuthService.completePasswordReset] Attempting to complete password reset with token: ${token ? token.substring(0, 10) + '...' : 'null'}`);
        const tokenData = await this.verifyPasswordResetToken(token); //This will throw if token is invalid

        const user = await User.findByPk(tokenData.userId);
        if (!user) {
            logger.error(`[AuthService.completePasswordReset] User not found with ID from token: ${tokenData.userId}`);
            throw new Error('Người dùng không tồn tại.'); // Should not happen if token was valid
        }

        user.Password = await hashPassword(newPassword);
        await user.save();
        logger.info(`[AuthService.completePasswordReset] Password updated successfully for user ID: ${user.User_ID}`);

        // Invalidate the token
        const tokenCacheKey = `password_reset_token_${token}`;
        cache.del(tokenCacheKey);
        logger.info(`[AuthService.completePasswordReset] Password reset token invalidated. Key: ${tokenCacheKey}`);

        // Optionally, send a confirmation email that password was changed
        try {
            // Assuming EmailService will have a method like this:
            await EmailVerificationService.emailServiceInstance.sendPasswordChangedConfirmationEmailAsync(
                user.Email,
                user.Full_Name
            );
            logger.info(`[AuthService.completePasswordReset] Password change confirmation email sent to: ${user.Email}`);
        } catch (emailError) {
            logger.error(`[AuthService.completePasswordReset] Failed to send password change confirmation email: ${emailError.message}`);
        }

        return { success: true, message: 'Đặt lại mật khẩu thành công.' };
    },

    // Đổi mật khẩu
    async changePassword(userId, { oldPassword, newPassword }) {
        try {
            console.log(`[AuthService.changePassword] === CHANGE PASSWORD START ===`);
            console.log(`[AuthService.changePassword] User ID: ${userId}`);
            console.log(`[AuthService.changePassword] Old password provided: ${!!oldPassword}`);
            console.log(`[AuthService.changePassword] New password provided: ${!!newPassword}`);

            // Validation input
            if (!userId) {
                throw new Error('User ID không được cung cấp');
            }
            if (!oldPassword) {
                throw new Error('Mật khẩu cũ không được cung cấp');
            }
            if (!newPassword) {
                throw new Error('Mật khẩu mới không được cung cấp');
            }

            // Tìm user trong database
            console.log(`[AuthService.changePassword] Finding user with ID: ${userId}`);
            const user = await User.findByPk(userId);

            if (!user) {
                console.log(`[AuthService.changePassword] User not found: ${userId}`);
                throw new Error('Không tìm thấy người dùng');
            }

            console.log(`[AuthService.changePassword] User found: ${user.Email}`);

            // Kiểm tra mật khẩu cũ
            console.log(`[AuthService.changePassword] Verifying old password...`);
            const isOldPasswordValid = await verifyPassword(oldPassword, user.Password);

            if (!isOldPasswordValid) {
                console.log(`[AuthService.changePassword] Old password is invalid`);
                throw new Error('Mật khẩu cũ không chính xác');
            }

            console.log(`[AuthService.changePassword] Old password verified successfully`);

            // Hash mật khẩu mới
            console.log(`[AuthService.changePassword] Hashing new password...`);
            const hashedNewPassword = await hashPassword(newPassword);
            console.log(`[AuthService.changePassword] New password hashed successfully`);

            // Cập nhật mật khẩu trong database
            console.log(`[AuthService.changePassword] Updating password in database...`);

            const updateResult = await User.update(
                { Password: hashedNewPassword },
                { where: { User_ID: userId } }
            );

            console.log(`[AuthService.changePassword] Update result:`, updateResult);

            // Kiểm tra kết quả update
            const rowsAffected = updateResult[0];
            if (rowsAffected === 0) {
                console.log(`[AuthService.changePassword] No rows were updated`);
                throw new Error('Không thể cập nhật mật khẩu. Vui lòng thử lại sau.');
            }

            console.log(`[AuthService.changePassword] Password updated successfully for user: ${user.Email}`);
            console.log(`[AuthService.changePassword] === CHANGE PASSWORD END ===`);

            return {
                success: true,
                message: 'Đổi mật khẩu thành công.'
            };

        } catch (error) {
            console.error(`[AuthService.changePassword] === CHANGE PASSWORD ERROR ===`);
            console.error(`[AuthService.changePassword] Error for user ${userId}:`, error.message);
            console.error(`[AuthService.changePassword] Error details:`, error);
            throw error; // Re-throw để controller có thể handle
        }
    },

    // Cập nhật profile
    async updateProfile(userId, profileData) {
        const user = await User.findByPk(userId);
        if (!user) throw new Error('Không tìm thấy người dùng');

        Object.assign(user, profileData);
        await user.save();
        return { success: true, message: 'Cập nhật thông tin thành công.' };
    },

    // Lấy profile
    async getUserProfile(userId) {
        const user = await User.findByPk(userId, {
            attributes: ['id', 'fullName', 'email', 'phoneNumber', 'address', 'dateOfBirth', 'sex', 'role']
        });
        if (!user) throw new Error('Không tìm thấy người dùng');
        return user;
    },

    /**
     * Đăng ký người dùng bởi Admin
     * @param {Object} userData - Thông tin người dùng cần đăng ký
     * @param {number} adminId - ID của Admin thực hiện đăng ký
     * @returns {Promise<Object>} - Thông tin người dùng đã đăng ký
     */
    async registerUserByAdmin(userData, adminId) {
        try {
            logger.info('registerUserByAdmin called with userData:', userData);

            // Xác thực Admin
            const admin = await User.findByPk(adminId);
            if (!admin || admin.Role !== 'Admin') {
                throw new Error('Không có quyền thực hiện chức năng này');
            }

            // Validate các trường bắt buộc
            if (!userData.Full_Name || !userData.Email) {
                throw new Error('Họ tên và Email là bắt buộc');
            }

            // Validate email
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(userData.Email)) {
                throw new Error('Email không hợp lệ');
            }

            // Validate số điện thoại (nếu có)
            if (userData.Phone_Number) {
                const phoneRegex = /^(0\d{9})$/;
                if (!phoneRegex.test(userData.Phone_Number)) {
                    throw new Error('Số điện thoại không hợp lệ. Phải có 10 số và bắt đầu bằng 0');
                }

                // Kiểm tra số điện thoại đã tồn tại trong database hay chưa
                const phoneExist = await UserRepository.isPhoneNumberExist(userData.Phone_Number);
                if (phoneExist) {
                    throw new Error('Số điện thoại đã được sử dụng bởi tài khoản khác');
                }
            }

            // Validate giới tính (nếu có)
            if (userData.Sex && !['Male', 'Female', 'Other'].includes(userData.Sex)) {
                throw new Error('Giới tính không hợp lệ. Phải là Male, Female hoặc Other');
            }

            // Validate Role (nếu có)
            if (userData.Role && !['Admin', 'Staff', 'Customer', 'Manager'].includes(userData.Role)) {
                throw new Error('Vai trò không hợp lệ. Phải là Admin, Staff, Customer hoặc Manager');
            }

            // Kiểm tra nếu email đã tồn tại
            const existingUser = await User.findOne({ where: { Email: userData.Email } });
            if (existingUser) {
                throw new Error('Email đã được sử dụng');
            }

            // Kiểm tra nếu có Cinema_ID được cung cấp, xác nhận rạp phim tồn tại
            if (userData.Cinema_ID) {
                const { Cinema } = require('../models');
                const cinema = await Cinema.findByPk(userData.Cinema_ID);
                if (!cinema) {
                    throw new Error('Không tìm thấy rạp phim');
                }
            }

            // Validate ngày sinh (nếu có)
            if (userData.Date_Of_Birth) {
                const birthDate = new Date(userData.Date_Of_Birth);
                if (isNaN(birthDate.getTime())) {
                    throw new Error('Định dạng ngày sinh không hợp lệ');
                }

                // Kiểm tra tuổi hợp lệ (ít nhất 16 tuổi)
                const currentDate = new Date();
                const minBirthDate = new Date();
                minBirthDate.setFullYear(currentDate.getFullYear() - 16);

                if (birthDate > currentDate) {
                    throw new Error('Ngày sinh không thể là ngày trong tương lai');
                }

                if (birthDate > minBirthDate) {
                    throw new Error('Người dùng phải ít nhất 16 tuổi');
                }
            }

            // Thay vì tạo mật khẩu ngẫu nhiên, chúng ta sẽ tạo một chuỗi hash làm giữ chỗ
            // cho mật khẩu tạm thời để người dùng có thể đặt lại sau
            const tempPasswordHash = await bcrypt.hash(uuidv4(), 10);

            // Tạo dữ liệu người dùng mới với các trường cơ bản (không bao gồm ngày tháng)
            const newUserData = {
                Full_Name: userData.Full_Name,
                Email: userData.Email,
                Password: tempPasswordHash, // Mật khẩu tạm thời mà người dùng không biết
                Role: userData.Role || 'Staff', // Mặc định là Staff nếu không chỉ định
                Department: userData.Department,
                Account_Status: 'Inactive', // Trạng thái chờ người dùng thiết lập mật khẩu
                Cinema_ID: userData.Cinema_ID || null // Cho phép null
            };

            // Xử lý các trường tùy chọn
            if (userData.Phone_Number) {
                newUserData.Phone_Number = userData.Phone_Number;
            }

            if (userData.Sex) {
                newUserData.Sex = userData.Sex;
            }

            if (userData.Address) {
                newUserData.Address = userData.Address;
            }

            // Tạo người dùng mới
            const newUser = await User.create(newUserData);
            logger.info(`Đã tạo người dùng mới với ID: ${newUser.User_ID}`);

            // Sau khi tạo thành công, cập nhật các trường ngày tháng riêng biệt 
            // để tránh lỗi chuyển đổi ngày tháng
            if (userData.Date_Of_Birth) {
                try {
                    await User.update(
                        { Date_Of_Birth: null }, // Đặt về null trước
                        { where: { User_ID: newUser.User_ID } }
                    );

                    // Cập nhật bằng SQL thuần nếu cần
                    const pool = await require('../config/database').getConnection();
                    const request = pool.request();
                    request.input('userId', require('mssql').Int, newUser.User_ID);
                    request.input('dateOfBirth', require('mssql').Date, new Date(userData.Date_Of_Birth));
                    await request.query(`
                        UPDATE ksf00691_team03.Users 
                        SET Date_Of_Birth = @dateOfBirth 
                        WHERE User_ID = @userId
                    `);
                    logger.info(`Đã cập nhật Date_Of_Birth thành công cho user ID: ${newUser.User_ID}`);
                } catch (e) {
                    logger.warn(`Lỗi khi cập nhật Date_Of_Birth: ${e.message}`);
                }
            }

            // Cập nhật Hire_Date
            try {
                await User.update(
                    { Hire_Date: null }, // Đặt về null trước
                    { where: { User_ID: newUser.User_ID } }
                );

                // Cập nhật bằng SQL thuần
                const hireDate = userData.Hire_Date ? new Date(userData.Hire_Date) : new Date();
                const pool = await require('../config/database').getConnection();
                const request = pool.request();
                request.input('userId', require('mssql').Int, newUser.User_ID);
                request.input('hireDate', require('mssql').Date, hireDate);
                await request.query(`
                    UPDATE ksf00691_team03.Users 
                    SET Hire_Date = @hireDate 
                    WHERE User_ID = @userId
                `);
                logger.info(`Đã cập nhật Hire_Date thành công cho user ID: ${newUser.User_ID}`);
            } catch (e) {
                logger.warn(`Lỗi khi cập nhật Hire_Date: ${e.message}`);
            }

            // Tạo token đặt mật khẩu
            const token = crypto.randomBytes(32).toString('hex');
            const tokenCacheKey = `password_setup_token_${token}`;
            // Thời gian hết hạn dài hơn so với reset token thông thường (7 ngày)
            const tokenExpirySeconds = 7 * 24 * 60 * 60; // 7 ngày

            // Lưu token vào cache
            cache.set(tokenCacheKey, { userId: newUser.User_ID, email: newUser.Email }, tokenExpirySeconds);
            logger.info(`Password setup token generated for new user ${newUser.User_ID}. Key: ${tokenCacheKey}, Expiry: ${tokenExpirySeconds}s`);

            // Tạo URL để thiết lập mật khẩu
            const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
            const setupUrl = `${apiBaseUrl}/api/auth/reset-password-form?token=${token}&newUser=true`;

            // Gửi email cho người dùng mới
            try {
                await EmailVerificationService.emailServiceInstance.sendNewUserPasswordSetupEmailAsync(
                    newUser.Email,
                    newUser.Full_Name,
                    setupUrl,
                    newUser.Role
                );
                logger.info(`Password setup email sent to new user ${newUser.Email}`);
            } catch (emailError) {
                logger.error(`Failed to send password setup email: ${emailError.message}`, emailError);
                // Không throw error ở đây để vẫn trả về thông tin người dùng đã tạo
            }

            // Trả về thông tin người dùng đã tạo
            return {
                user: {
                    User_ID: newUser.User_ID,
                    Full_Name: newUser.Full_Name,
                    Email: newUser.Email,
                    Role: newUser.Role,
                    Department: newUser.Department,
                    Cinema_ID: newUser.Cinema_ID
                },
                message: `Đã tạo tài khoản ${newUser.Role} cho ${newUser.Full_Name}. Email đặt mật khẩu đã được gửi đến ${newUser.Email}.`
            };
        } catch (error) {
            logger.error('Error in registerUserByAdmin:', error);
            throw error;
        }
    },

    /**
     * Đăng ký người dùng bởi Staff/Manager
     * @param {Object} userData - Thông tin người dùng cần đăng ký
     * @param {number} staffId - ID của Staff thực hiện đăng ký
     * @returns {Promise<Object>} - Thông tin người dùng đã đăng ký
     */
    async registerUserByStaff(userData, staffId) {
        try {
            logger.info('registerUserByStaff called with userData:', userData);

            // Xác thực Staff/Manager
            const staff = await User.findByPk(staffId);
            if (!staff || !['Staff', 'Manager'].includes(staff.Role)) {
                throw new Error('Không có quyền thực hiện chức năng này');
            }

            // Validate các trường bắt buộc
            if (!userData.Full_Name || !userData.Email) {
                throw new Error('Họ tên và Email là bắt buộc');
            }

            // Validate email
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(userData.Email)) {
                throw new Error('Email không hợp lệ');
            }

            // Validate số điện thoại (nếu có)
            if (userData.Phone_Number) {
                const phoneRegex = /^(0\d{9}|84\d{9})$/;
                if (!phoneRegex.test(userData.Phone_Number)) {
                    throw new Error('Số điện thoại không hợp lệ. Phải có 10 số và bắt đầu bằng 0 hoặc 84');
                }

                // Kiểm tra số điện thoại đã tồn tại trong database hay chưa
                const phoneUser = await User.findOne({
                    where: { Phone_Number: userData.Phone_Number }
                });
                if (phoneUser) {
                    throw new Error('Số điện thoại đã được sử dụng bởi tài khoản khác');
                }
            }

            // Validate giới tính (nếu có)
            if (userData.Sex && !['Male', 'Female', 'Other'].includes(userData.Sex)) {
                throw new Error('Giới tính không hợp lệ. Phải là Male, Female hoặc Other');
            }

            // Kiểm tra nếu email đã tồn tại
            const existingUser = await User.findOne({ where: { Email: userData.Email } });
            if (existingUser) {
                throw new Error('Email đã được sử dụng');
            }

            // Validate ngày sinh (nếu có)
            if (userData.Date_Of_Birth) {
                const birthDate = new Date(userData.Date_Of_Birth);
                if (isNaN(birthDate.getTime())) {
                    throw new Error('Định dạng ngày sinh không hợp lệ');
                }

                // Kiểm tra tuổi hợp lệ (ít nhất 16 tuổi)
                const currentDate = new Date();
                const minBirthDate = new Date();
                minBirthDate.setFullYear(currentDate.getFullYear() - 16);

                if (birthDate > currentDate) {
                    throw new Error('Ngày sinh không thể là ngày trong tương lai');
                }

                if (birthDate > minBirthDate) {
                    throw new Error('Người dùng phải ít nhất 16 tuổi');
                }
            }

            // Staff chỉ có thể đăng ký khách hàng
            userData.Role = 'Customer';

            // Thay vì tạo mật khẩu ngẫu nhiên, tạo một chuỗi hash làm giữ chỗ
            // cho mật khẩu tạm thời để người dùng có thể đặt lại sau
            const tempPasswordHash = await bcrypt.hash(uuidv4(), 10);

            // Tạo dữ liệu người dùng mới
            const newUserData = {
                Full_Name: userData.Full_Name,
                Email: userData.Email,
                Password: tempPasswordHash,
                Role: userData.Role,
                Account_Status: 'Active'  // Staff tạo customer với trạng thái Active luôn
            };

            // Xử lý các trường tùy chọn
            if (userData.Phone_Number) {
                newUserData.Phone_Number = userData.Phone_Number;
            }

            if (userData.Sex) {
                newUserData.Sex = userData.Sex;
            }

            if (userData.Address) {
                newUserData.Address = userData.Address;
            }

            // Tạo người dùng mới
            const newUser = await User.create(newUserData);
            logger.info(`Đã tạo người dùng mới với ID: ${newUser.User_ID}`);

            // Sau khi tạo thành công, cập nhật các trường ngày tháng riêng biệt 
            // để tránh lỗi chuyển đổi ngày tháng
            if (userData.Date_Of_Birth) {
                try {
                    await User.update(
                        { Date_Of_Birth: null }, // Đặt về null trước
                        { where: { User_ID: newUser.User_ID } }
                    );

                    // Cập nhật bằng SQL thuần nếu cần
                    const pool = await require('../config/database').getConnection();
                    const request = pool.request();
                    request.input('userId', require('mssql').Int, newUser.User_ID);
                    request.input('dateOfBirth', require('mssql').Date, new Date(userData.Date_Of_Birth));
                    await request.query(`
                        UPDATE ksf00691_team03.Users 
                        SET Date_Of_Birth = @dateOfBirth 
                        WHERE User_ID = @userId
                    `);
                    logger.info(`Đã cập nhật Date_Of_Birth thành công cho user ID: ${newUser.User_ID}`);
                } catch (e) {
                    logger.warn(`Lỗi khi cập nhật Date_Of_Birth: ${e.message}`);
                }
            }

            // Tạo token đặt mật khẩu
            const token = crypto.randomBytes(32).toString('hex');
            const tokenCacheKey = `password_setup_token_${token}`;
            // Thời gian hết hạn dài hơn so với reset token thông thường (7 ngày)
            const tokenExpirySeconds = 7 * 24 * 60 * 60; // 7 ngày

            // Lưu token vào cache
            cache.set(tokenCacheKey, { userId: newUser.User_ID, email: newUser.Email }, tokenExpirySeconds);
            logger.info(`Password setup token generated for new user ${newUser.User_ID}. Key: ${tokenCacheKey}, Expiry: ${tokenExpirySeconds}s`);

            // Tạo URL để thiết lập mật khẩu
            const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
            const setupUrl = `${apiBaseUrl}/api/auth/reset-password-form?token=${token}&newUser=true`;

            // Gửi email cho người dùng mới
            try {
                await EmailVerificationService.emailServiceInstance.sendNewUserPasswordSetupEmailAsync(
                    newUser.Email,
                    newUser.Full_Name,
                    setupUrl,
                    newUser.Role
                );
                logger.info(`Password setup email sent to new user ${newUser.Email}`);
            } catch (emailError) {
                logger.error(`Failed to send password setup email: ${emailError.message}`, emailError);
                // Không throw error ở đây để vẫn trả về thông tin người dùng đã tạo
            }

            // Trả về thông tin người dùng đã tạo
            return {
                user: {
                    User_ID: newUser.User_ID,
                    Full_Name: newUser.Full_Name,
                    Email: newUser.Email,
                    Role: newUser.Role
                },
                message: `Đã tạo tài khoản khách hàng cho ${newUser.Full_Name} với trạng thái Active. Email đặt mật khẩu đã được gửi đến ${newUser.Email}.`
            };
        } catch (error) {
            logger.error('Error in registerUserByStaff:', error);
            throw error;
        }
    }
};

module.exports = AuthService;