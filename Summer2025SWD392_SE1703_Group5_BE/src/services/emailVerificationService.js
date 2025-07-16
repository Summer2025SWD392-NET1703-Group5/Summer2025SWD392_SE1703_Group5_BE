'use strict';

const EmailService = require('./emailService');
const logger = require('../utils/logger');
const UserRepository = require('../repositories/userRepository');
const NodeCache = require('node-cache');
const { emailConfig } = require('../config/appConfig');

class EmailVerificationService {
    constructor() {
        this.cache = new NodeCache({ stdTTL: 24 * 60 * 60, checkperiod: 600 });
        this.UserRepository = UserRepository;
        this.TOKEN_EXPIRY_SECONDS = parseInt(process.env.EMAIL_VERIFICATION_TOKEN_EXPIRES_SECONDS) || 86400; // 24 giờ mặc định
        this.emailServiceInstance = new EmailService(logger, emailConfig);

        logger.info(`[EmailVerificationService] Initialized with token expiry: ${this.TOKEN_EXPIRY_SECONDS} seconds`);
        logger.info(`[EmailVerificationService] UserRepository type: ${typeof UserRepository}`);
        logger.info(`[EmailVerificationService] UserRepository.findById type: ${typeof UserRepository.findById}`);
        logger.info(`[EmailVerificationService] UserRepository.findByEmail type: ${typeof UserRepository.findByEmail}`);
    }

    async sendVerificationEmail(email, fullName, userId) {
        try {
            logger.info(`[EmailVerificationService] Starting sendVerificationEmail for ${email}, userId: ${userId}`);

            const token = require('crypto').randomBytes(32).toString('hex');
            logger.info(`[EmailVerificationService] Generated token: ${token.substring(0, 10)}...`);

            const cacheKey = `email_verification_token_${token}`;
            const cacheData = { email, userId };

            logger.info(`[EmailVerificationService] Saving to cache with key: ${cacheKey}`);
            logger.info(`[EmailVerificationService] Cache data: ${JSON.stringify(cacheData)}`);
            logger.info(`[EmailVerificationService] Cache type: ${typeof this.cache}`);
            logger.info(`[EmailVerificationService] Cache.set type: ${typeof this.cache.set}`);

            this.cache.set(cacheKey, cacheData, this.TOKEN_EXPIRY_SECONDS);

            const savedData = this.cache.get(cacheKey);
            logger.info(`[EmailVerificationService] Verified cache save: ${JSON.stringify(savedData)}`);

            const emailSent = await this.emailServiceInstance.sendVerificationEmailAsync(
                email,
                fullName,
                token
            );

            if (emailSent) {
                logger.info(`[EmailVerificationService] Verification email sent successfully to: ${email} with token ${token.substring(0, 10)}...`);
                return true;
            } else {
                logger.error(`[EmailVerificationService] Failed to send verification email to: ${email}`);
                return false;
            }
        } catch (error) {
            logger.error(`[EmailVerificationService] Error sending verification email: ${error.message}`);
            return false;
        }
    }

    async sendWelcomeEmailAsync(email, fullName) {
        try {
            const emailSent = await this.emailServiceInstance.sendEmailAsync(
                email,
                'Chào mừng đến với GALAXY Cinema',
                `Xin chào ${fullName},\n\nChào mừng bạn đến với GALAXY Cinema! Tài khoản của bạn đã được kích hoạt thành công.\n\nHãy bắt đầu trải nghiệm ngay: http://localhost:3000`
            );
            return emailSent;
        } catch (error) {
            logger.error(`[EmailVerificationService] Error sending welcome email to ${email}: ${error.message}`);
            throw error;
        }
    }

    async verifyTokenAndActivateUser(token) {
        try {
            logger.info(`[EmailVerificationService] Starting token verification for: ${token ? token.substring(0, 10) + '...' : 'null/undefined'}`);

            if (!token || typeof token !== 'string' || token.trim() === '') {
                logger.info('[EmailVerificationService] Invalid or empty token provided.');
                return { success: false, message: 'Token xác thực không hợp lệ hoặc bị trống.' };
            }

            const cacheKey = `email_verification_token_${token}`;
            const cachedData = this.cache.get(cacheKey);

            logger.info(`[EmailVerificationService] Cache lookup for key: ${cacheKey}`);
            logger.info(`[EmailVerificationService] Cache result: ${JSON.stringify(cachedData)}`);

            if (!cachedData || !cachedData.email) {
                logger.info(`[EmailVerificationService] Token not found in cache or expired: ${token.substring(0, 10)}...`);
                return { success: false, message: 'Token xác thực không tồn tại, không hợp lệ hoặc đã hết hạn.' };
            }

            const { email, userId } = cachedData;
            logger.info(`[EmailVerificationService] Found cached data - Email: ${email}, UserId: ${userId}`);

            this.cache.del(cacheKey);
            logger.info(`[EmailVerificationService] Token removed from cache: ${cacheKey}`);

            logger.info(`[EmailVerificationService] Looking up user - userId: ${userId}, email: ${email}`);

            let user;
            if (userId) {
                logger.info(`[EmailVerificationService] Finding user by ID: ${userId}`);
                user = await this.UserRepository.findById(userId);
            } else {
                logger.info(`[EmailVerificationService] Finding user by email: ${email}`);
                user = await this.UserRepository.findByEmail(email);
            }

            if (!user) {
                logger.info(`[EmailVerificationService] User not found with email: ${email} or ID: ${userId} for token: ${token.substring(0, 10)}...`);
                return { success: false, message: 'Không tìm thấy người dùng tương ứng với token này.' };
            }

            logger.info(`[EmailVerificationService] Found user: ID=${user.User_ID}, Email=${user.Email}, Status=${user.Account_Status}`);

            if (userId && user.Email !== email) {
                logger.warn(`[EmailVerificationService] Token email mismatch for user ID ${userId}. Token email: ${email}, User email: ${user.Email}`);
                return { success: false, message: 'Thông tin token không khớp với người dùng.' };
            }

            if (user.Account_Status === 'Pending_Verification' || user.Account_Status === 'Pending') {
                logger.info(`[EmailVerificationService] Updating user ${user.User_ID} status from ${user.Account_Status} to Active`);

                const updateResult = await this.UserRepository.update(user.User_ID, {
                    Account_Status: 'Active',
                });
                logger.info(`[EmailVerificationService] Update result: ${updateResult}`);

                if (updateResult) {
                    logger.info(`[EmailVerificationService] Account activated for user: ${email} (ID: ${user.User_ID})`);

                    try {
                        await this.sendWelcomeEmailAsync(email, user.Full_Name);
                        logger.info(`[EmailVerificationService] Welcome email sent to: ${email}`);
                    } catch (welcomeEmailError) {
                        logger.warn(`[EmailVerificationService] Failed to send welcome email to ${email}: ${welcomeEmailError.message}`);
                    }

                    return { success: true, message: 'Xác thực email thành công! Tài khoản của bạn đã được kích hoạt.', userId: user.User_ID };
                } else {
                    logger.error(`[EmailVerificationService] Failed to update user status for user ID: ${user.User_ID}`);
                    return { success: false, message: 'Đã xảy ra lỗi khi kích hoạt tài khoản. Vui lòng thử lại.' };
                }
            } else if (user.Account_Status === 'Active') {
                logger.info(`[EmailVerificationService] Account already active for user: ${email}`);
                return { success: true, message: 'Tài khoản này đã được kích hoạt trước đó.', userId: user.User_ID };
            } else {
                logger.info(`[EmailVerificationService] Account for user ${email} is in status '${user.Account_Status}', not 'Pending_Verification'.`);
                return { success: false, message: `Tài khoản đang ở trạng thái '${user.Account_Status}' và không thể kích hoạt theo cách này.` };
            }
        } catch (error) {
            logger.error(`[EmailVerificationService] Error verifying email token: ${error.message}`);
            return { success: false, message: 'Đã xảy ra lỗi trong quá trình xác thực email. Vui lòng thử lại sau.' };
        }
    }
}

module.exports = new EmailVerificationService();