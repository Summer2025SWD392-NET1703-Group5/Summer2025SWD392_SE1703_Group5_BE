// File: src/controllers/notificationController.js
const { testConnection } = require('../config/database');
const NotificationService = require('../services/notificationService');

class NotificationController {
    constructor() {
        this.notificationService = new NotificationService();
    }

    /**
     * Lấy danh sách thông báo của người dùng
     * GET /api/notifications
     */
    async getNotifications(req, res) {
        try {
            // Lấy userId từ JWT token hoặc session
            const userId = req.user?.id || req.userId;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Không tìm thấy thông tin người dùng'
                });
            }

            console.log(`[NotificationController] Getting notifications for user: ${userId}`);

            const result = await this.notificationService.getUserNotificationsAsync(userId);

            return res.status(200).json(result);

        } catch (error) {
            console.error(`[NotificationController] Error getting notifications: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi lấy danh sách thông báo'
            });
        }
    }
}

module.exports = NotificationController;
