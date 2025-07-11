// File: src/services/tokenBlacklistService.js
// Mô tả: Service quản lý danh sách token đã bị vô hiệu hóa (logout)

const jwt = require('jsonwebtoken');

// Lấy cache instance
const cache = require('../config/cache').get();

/**
 * Service quản lý blacklist token để implement logout chức năng
 */
class TokenBlacklistService {
    constructor() {
        this.BLACKLIST_PREFIX = 'blacklisted_token_';
        console.log('[TokenBlacklistService] Initialized');
    }

    /**
     * Thêm token vào blacklist (khi user logout)
     * @param {string} token - JWT token cần blacklist
     * @returns {Promise<boolean>} True nếu thành công
     */
    async blacklistToken(token) {
        try {
            console.log(`[TokenBlacklistService] Blacklisting token: ${token.substring(0, 20)}...`);

            // Decode token để lấy expiration time
            const decoded = jwt.decode(token);
            if (!decoded || !decoded.exp) {
                console.warn('[TokenBlacklistService] Token không có expiration time');
                return false;
            }

            // Tính thời gian còn lại của token (seconds)
            const currentTime = Math.floor(Date.now() / 1000);
            const remainingTime = decoded.exp - currentTime;

            if (remainingTime <= 0) {
                console.log('[TokenBlacklistService] Token đã hết hạn, không cần blacklist');
                return true; // Token đã hết hạn rồi
            }

            // Lưu token vào cache với TTL = thời gian còn lại của token
            const cacheKey = this.BLACKLIST_PREFIX + token;
            cache.set(cacheKey, {
                blacklistedAt: new Date().toISOString(),
                userId: decoded.userId || decoded.id,
                email: decoded.email,
                expiresAt: new Date(decoded.exp * 1000).toISOString()
            }, remainingTime);

            console.log(`[TokenBlacklistService] Token blacklisted successfully, TTL: ${remainingTime}s`);
            return true;

        } catch (error) {
            console.error('[TokenBlacklistService] Error blacklisting token:', error.message);
            return false;
        }
    }

    /**
     * Kiểm tra token có trong blacklist không
     * @param {string} token - JWT token cần kiểm tra
     * @returns {Promise<boolean>} True nếu token đã bị blacklist
     */
    async isTokenBlacklisted(token) {
        try {
            const cacheKey = this.BLACKLIST_PREFIX + token;
            const blacklistData = cache.get(cacheKey);

            const isBlacklisted = !!blacklistData;

            if (isBlacklisted) {
                console.log(`[TokenBlacklistService] Token is blacklisted: ${token.substring(0, 20)}...`);
                console.log(`[TokenBlacklistService] Blacklisted at: ${blacklistData.blacklistedAt}`);
            }

            return isBlacklisted;

        } catch (error) {
            console.error('[TokenBlacklistService] Error checking blacklist:', error.message);
            return false; // Nếu có lỗi, cho phép token đi qua (fail-open)
        }
    }

    /**
     * Xóa token khỏi blacklist (thường không cần dùng)
     * @param {string} token - JWT token
     * @returns {Promise<boolean>} True nếu thành công
     */
    async removeFromBlacklist(token) {
        try {
            const cacheKey = this.BLACKLIST_PREFIX + token;
            cache.del(cacheKey);
            console.log(`[TokenBlacklistService] Token removed from blacklist: ${token.substring(0, 20)}...`);
            return true;
        } catch (error) {
            console.error('[TokenBlacklistService] Error removing from blacklist:', error.message);
            return false;
        }
    }

    /**
     * Lấy thống kê blacklist (debug)
     * @returns {Promise<object>} Thông tin thống kê
     */
    async getBlacklistStats() {
        try {
            const allKeys = cache.keys();
            const blacklistKeys = allKeys.filter(key => key.startsWith(this.BLACKLIST_PREFIX));

            const stats = {
                totalBlacklistedTokens: blacklistKeys.length,
                blacklistKeys: blacklistKeys.map(key => ({
                    key: key.replace(this.BLACKLIST_PREFIX, '').substring(0, 20) + '...',
                    data: cache.get(key)
                }))
            };

            console.log('[TokenBlacklistService] Blacklist stats:', stats);
            return stats;

        } catch (error) {
            console.error('[TokenBlacklistService] Error getting stats:', error.message);
            return { totalBlacklistedTokens: 0, error: error.message };
        }
    }

    /**
     * Clear tất cả blacklisted tokens (admin function)
     * @returns {Promise<boolean>} True nếu thành công
     */
    async clearAllBlacklistedTokens() {
        try {
            const allKeys = cache.keys();
            const blacklistKeys = allKeys.filter(key => key.startsWith(this.BLACKLIST_PREFIX));

            blacklistKeys.forEach(key => cache.del(key));

            console.log(`[TokenBlacklistService] Cleared ${blacklistKeys.length} blacklisted tokens`);
            return true;

        } catch (error) {
            console.error('[TokenBlacklistService] Error clearing blacklist:', error.message);
            return false;
        }
    }
}

// Export singleton instance
module.exports = new TokenBlacklistService();