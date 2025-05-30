const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const crypto = require('crypto');
const { User } = require('../models');
const sendMail = require('../services/emailService');
const { v4: uuidv4 } = require('uuid');

// THÊM IMPORT EMAIL VERIFICATION SERVICE
const EmailVerificationService = require('../services/emailVerificationService');
const AccountLockingService = require('../services/accountLockingService');
const cache = require('../config/cache').get();
const logger = require('../utils/logger');

/**
 * Helper: Hash password using bcrypt
 */
async function hashPassword(password) {
    return await bcrypt.hash(password, 10);
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

                if (user.Account_Status === 'Pending_Verification') {
                    console.log(`[AuthService.login] Account pending verification: ${Email}`);
                    throw new Error('Tài khoản của bạn chưa được xác thực. Vui lòng kiểm tra email và làm theo hướng dẫn.');
                }

                if (user.Account_Status === 'Disabled' || user.Account_Status === 'Suspended') {
                    console.log(`[AuthService.login] Account disabled/suspended: ${Email}, Status: ${user.Account_Status}`);
                    throw new Error(`Tài khoản của bạn đang ở trạng thái ${user.Account_Status} và không thể đăng nhập.`);
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
    }
};

module.exports = AuthService;