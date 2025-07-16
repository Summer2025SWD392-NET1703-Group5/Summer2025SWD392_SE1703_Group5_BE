
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
                                            
            const userId = req.user?.id || req.userId;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Không tìm thấy thông tin người dùng'
                });
            }

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

    /**
     * Đánh dấu tất cả thông báo là đã đọc
     * PUT /api/notifications/mark-all-read
     */
    async markAllNotificationsAsRead(req, res) {
        try {
            const userId = req.user?.id || req.userId;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Không tìm thấy thông tin người dùng'
                });
            }

            console.log(`[NotificationController] Marking all notifications as read for user: ${userId}`);

            const updatedCount = await this.notificationService.markAllNotificationsAsReadAsync(userId);

            return res.status(200).json({
                success: true,
                message: `Đã đánh dấu ${updatedCount} thông báo là đã đọc`,
                updatedCount: updatedCount
            });

        } catch (error) {
            console.error(`[NotificationController] Error marking notifications as read: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi cập nhật thông báo'
            });
        }
    }

    /**
     * Đánh dấu một thông báo cụ thể là đã đọc
     * PUT /api/notifications/:id/read
     */
    async markNotificationAsRead(req, res) {
        try {
            const userId = req.user?.id || req.userId;
            const notificationId = parseInt(req.params.id);

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Không tìm thấy thông tin người dùng'
                });
            }

            if (!notificationId || isNaN(notificationId)) {
                return res.status(400).json({
                    success: false,
                    message: 'ID thông báo không hợp lệ'
                });
            }

            console.log(`[NotificationController] Marking notification ${notificationId} as read for user: ${userId}`);

            const success = await this.notificationService.markNotificationAsReadAsync(notificationId, userId);

            if (success) {
                return res.status(200).json({
                    success: true,
                    message: 'Đã đánh dấu thông báo là đã đọc'
                });
            } else {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy thông báo hoặc bạn không có quyền truy cập'
                });
            }

        } catch (error) {
            console.error(`[NotificationController] Error marking notification as read: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi cập nhật thông báo'
            });
        }
    }

    /**
     * Lấy số lượng thông báo chưa đọc
     * GET /api/notifications/unread-count
     */
    async getUnreadCount(req, res) {
        try {
            const userId = req.user?.id || req.userId;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Không tìm thấy thông tin người dùng'
                });
            }

            console.log(`[NotificationController] Getting unread count for user: ${userId}`);

            const unreadCount = await this.notificationService.getUnreadCountAsync(userId);

            return res.status(200).json({
                success: true,
                unreadCount: unreadCount
            });

        } catch (error) {
            console.error(`[NotificationController] Error getting unread count: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi lấy số lượng thông báo chưa đọc'
            });
        }
    }
}

module.exports = NotificationController;