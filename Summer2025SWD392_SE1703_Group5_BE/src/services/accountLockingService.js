// File: src/services/accountLockingService.js
// Mô tả: Lớp AccountLockingService quản lý logic khóa tài khoản tạm thời sau nhiều lần đăng nhập thất bại.

// FIX: Sử dụng CacheService thống nhất
const { CacheService } = require('../config/cache');
const logger = require('../utils/logger'); // Sửa đường dẫn đến logger

/**
 * Lớp AccountLockingService chịu trách nhiệm theo dõi các lần đăng nhập thất bại
 * và tạm thời khóa tài khoản nếu vượt quá ngưỡng cho phép.
 */
class AccountLockingService {
    constructor() {
        // Số lần đăng nhập sai tối đa cho phép trước khi khóa tài khoản
        this.MAX_FAILED_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
        // Thời gian khóa tài khoản (tính bằng phút)
        this.LOCK_TIME = parseInt(process.env.ACCOUNT_LOCK_TIME_MINUTES) || 30; // Sửa tên biến môi trường cho rõ ràng

        console.log(`[AccountLockingService] Initialized with MAX_FAILED_ATTEMPTS: ${this.MAX_FAILED_ATTEMPTS}, LOCK_TIME: ${this.LOCK_TIME} minutes`);
        console.log(`[AccountLockingService] Cache type:`, typeof cache);
    }

    /**
     * Kiểm tra xem một tài khoản có đang bị khóa hay không.
     * @param {string} email - Email của tài khoản cần kiểm tra.
     * @returns {Promise<boolean>} - True nếu tài khoản đang bị khóa, ngược lại False.
     */
    async isAccountLocked(email) {
        const lockKey = `lock_${email}`; // Key trong cache để lưu trạng thái khóa
        const isLocked = await CacheService.get(lockKey);
        logger.info(`[AccountLockingService.isAccountLocked] Kiểm tra khóa cho ${email}. Key: ${lockKey}, Trạng thái khóa từ cache: ${isLocked}`);

        if (isLocked) {
            // Nếu tài khoản bị khóa, kiểm tra xem thời gian khóa đã hết chưa
            const expiryKey = `lock_expiry_timestamp_${email}`; // Key lưu thời điểm hết hạn khóa (timestamp)
            const expiryTimestamp = await CacheService.get(expiryKey);
            logger.info(`[AccountLockingService.isAccountLocked] Lấy thời điểm hết hạn khóa cho ${email}. Key: ${expiryKey}, Timestamp: ${expiryTimestamp}`);

            if (expiryTimestamp && Date.now() < expiryTimestamp) {
                // Thời gian khóa vẫn còn hiệu lực
                const remainingTimeMs = expiryTimestamp - Date.now();
                console.log(`[AccountLockingService] Account ${email} is locked. Remaining time: ${Math.ceil(remainingTimeMs / 60000)} minutes`);
                return true;
            } else {
                // Thời gian khóa đã hết, xóa các key liên quan đến việc khóa
                console.log(`[AccountLockingService] Lock time expired for ${email}. Unlocking.`);
                await this.unlockAccount(email); // Gọi hàm mở khóa để dọn dẹp cache
                return false;
            }
        }
        return false;
    }

    /**
     * Lấy số lần đăng nhập thất bại hiện tại của một tài khoản.
     * @param {string} email - Email của tài khoản.
     * @returns {Promise<number>} - Số lần đăng nhập thất bại.
     */
    async getFailedAttempts(email) {
        const attemptsKey = `failed_login_attempts_${email}`; // Key lưu số lần thử sai
        const attempts = (await CacheService.get(attemptsKey)) || 0;
        logger.info(`[AccountLockingService.getFailedAttempts] Lấy số lần thử sai cho ${email}. Key: ${attemptsKey}, Số lần thử từ cache: ${attempts}`);
        return attempts;
    }

    /**
     * Lấy thời gian còn lại (phút) cho đến khi tài khoản được mở khóa.
     * @param {string} email - Email của tài khoản.
     * @returns {Promise<number>} - Số phút còn lại cho đến khi mở khóa. Trả về 0 nếu không bị khóa.
     */
    async getRemainingLockTime(email) {
        const lockKey = `lock_${email}`;
        const isLockedStatus = await CacheService.get(lockKey);
        logger.info(`[AccountLockingService.getRemainingLockTime] Kiểm tra trạng thái khóa (chỉ cờ) cho ${email}. Key: ${lockKey}, Trạng thái: ${isLockedStatus}`);

        if (!isLockedStatus) {
            return 0;
        }

        const expiryKey = `lock_expiry_timestamp_${email}`;
        const expiryTimestamp = await CacheService.get(expiryKey);
        logger.info(`[AccountLockingService.getRemainingLockTime] Lấy thời điểm hết hạn khóa cho ${email}. Key: ${expiryKey}, Timestamp: ${expiryTimestamp}`);

        if (!expiryTimestamp || Date.now() >= expiryTimestamp) {
            return 0; // Đã hết hạn hoặc không có thông tin hết hạn
        }

        const remainingMilliseconds = expiryTimestamp - Date.now();
        const remainingMinutes = Math.ceil(remainingMilliseconds / 60000);

        return remainingMinutes > 0 ? remainingMinutes : 0;
    }

    /**
     * Ghi nhận một lần đăng nhập thất bại cho tài khoản.
     * Nếu số lần thất bại đạt đến ngưỡng, tài khoản sẽ bị khóa.
     * @param {string} email - Email của tài khoản vừa đăng nhập thất bại.
     * @returns {Promise<boolean>} - True nếu tài khoản bị khóa sau lần thử này, ngược lại False.
     */
    async recordFailedAttempt(email) {
        const attemptsKey = `failed_login_attempts_${email}`;
        const lockKey = `lock_${email}`;
        const expiryKey = `lock_expiry_timestamp_${email}`;

        let currentAttemptsBeforeIncrement = await this.getFailedAttempts(email); // Gọi getFailedAttempts để có log chi tiết
        let attempts = currentAttemptsBeforeIncrement + 1;

        const attemptTTLSeconds = 24 * 60 * 60; // 24 giờ
        await CacheService.set(attemptsKey, attempts, attemptTTLSeconds);
        logger.info(`[AccountLockingService.recordFailedAttempt] Đã ghi nhận lần thử ${attempts} cho ${email}. Key: ${attemptsKey}, TTL: ${attemptTTLSeconds}s`);

        console.log(`[AccountLockingService] Failed login attempt ${attempts} for account ${email}`);

        // Kiểm tra xem có cần khóa tài khoản không
        if (attempts >= this.MAX_FAILED_ATTEMPTS) {
            const lockDurationMs = this.LOCK_TIME * 60 * 1000; // Thời gian khóa bằng mili giây
            const expiryTimestamp = Date.now() + lockDurationMs; // Thời điểm hết hạn khóa

            // Đặt cờ khóa và thời điểm hết hạn vào cache
            // Thời gian sống của các key này bằng thời gian khóa
            await CacheService.set(lockKey, true, this.LOCK_TIME * 60); // lock_time tính bằng giây cho cache
            await CacheService.set(expiryKey, expiryTimestamp, this.LOCK_TIME * 60);
            logger.info(`[AccountLockingService.recordFailedAttempt] Đã khóa tài khoản ${email}. Key khóa: ${lockKey}, Key hết hạn: ${expiryKey}, Thời gian khóa: ${this.LOCK_TIME} phút`);

            console.log(`[AccountLockingService] Account ${email} has been locked for ${this.LOCK_TIME} minutes.`);
            return true; // Tài khoản đã bị khóa
        }

        return false; // Tài khoản chưa bị khóa
    }

    /**
     * Xóa bỏ lịch sử đăng nhập thất bại của một tài khoản (ví dụ: sau khi đăng nhập thành công).
     * @param {string} email - Email của tài khoản.
     * @returns {Promise<void>}
     */
    async resetFailedAttempts(email) {
        const attemptsKey = `failed_login_attempts_${email}`;
        await CacheService.del(attemptsKey);
        logger.info(`[AccountLockingService.resetFailedAttempts] Đã xóa số lần thử sai cho ${email}. Key: ${attemptsKey}`);
        console.log(`[AccountLockingService] Reset failed login attempts for account ${email}`);
    }

    /**
     * Mở khóa một tài khoản theo cách thủ công (ví dụ: bởi admin) hoặc khi thời gian khóa hết hạn.
     * Xóa tất cả các key liên quan đến việc khóa và đếm số lần thử sai.
     * @param {string} email - Email của tài khoản cần mở khóa.
     * @returns {Promise<void>}
     */
    async unlockAccount(email) {
        const attemptsKey = `failed_login_attempts_${email}`;
        const lockKey = `lock_${email}`;
        const expiryKey = `lock_expiry_timestamp_${email}`;

        await CacheService.del(attemptsKey);
        await CacheService.del(lockKey);
        await CacheService.del(expiryKey);
        logger.info(`[AccountLockingService.unlockAccount] Đã mở khóa tài khoản ${email}. Đã xóa keys: ${attemptsKey}, ${lockKey}, ${expiryKey}`);

        console.log(`[AccountLockingService] Account ${email} has been unlocked.`);
    }
}

// Xuất ra một instance của AccountLockingService để sử dụng như một singleton
module.exports = new AccountLockingService();