// src/controllers/pointsController.js
const pointsService = require('../services/pointsService');
const logger = require('../utils/logger');

class PointsController {
    /**
     * Lấy thông tin điểm hiện tại của người dùng đăng nhập
     */
    async getMyPoints(req, res) {
        try {
            // Lấy userId trực tiếp từ req.user
            const userId = req.user?.id || req.user?.userId || 0;

            if (userId === 0) {
                return res.status(401).json({
                    message: 'Không thể xác định người dùng'
                });
            }

            logger.info(`[getMyPoints] Đang lấy điểm cho user ID: ${userId}`);

            const userPoints = await pointsService.getUserPointsAsync(userId);

            logger.info(`[getMyPoints] Kết quả lấy điểm: ${JSON.stringify(userPoints)}`);

            return res.status(200).json(userPoints);

        } catch (error) {
            logger.error('Error getting user points:', error);
            return res.status(500).json({
                message: 'Có lỗi xảy ra khi lấy thông tin điểm'
            });
        }
    }

    /**
     * Lấy lịch sử tích điểm của người dùng đăng nhập
     */
    async getEarningHistory(req, res) {
        try {
            // Lấy userId trực tiếp từ req.user
            const userId = req.user?.id || req.user?.userId || 0;

            if (userId === 0) {
                return res.status(401).json({
                    message: 'Không thể xác định người dùng'
                });
            }

            const history = await pointsService.getPointsEarningHistory(userId);
            return res.status(200).json(history);

        } catch (error) {
            logger.error('Error getting points earning history:', error);
            return res.status(500).json({
                message: 'Có lỗi xảy ra khi lấy lịch sử tích điểm'
            });
        }
    }

    /**
     * Lấy lịch sử sử dụng điểm của người dùng đăng nhập
     */
    async getRedemptionHistory(req, res) {
        try {
            // Lấy userId trực tiếp từ req.user
            const userId = req.user?.id || req.user?.userId || 0;

            if (userId === 0) {
                return res.status(401).json({
                    message: 'Không thể xác định người dùng'
                });
            }

            const history = await pointsService.getPointsRedemptionHistory(userId);
            return res.status(200).json(history);

        } catch (error) {
            logger.error('Error getting points redemption history:', error);
            return res.status(500).json({
                message: 'Có lỗi xảy ra khi lấy lịch sử sử dụng điểm'
            });
        }
    }

    /**
     * API cho Admin: Lấy thông tin điểm của một người dùng cụ thể
     */
    async getUserPoints(req, res) {
        try {
            const { userId } = req.params;
            const userPoints = await pointsService.getUserPointsAsync(parseInt(userId));
            return res.status(200).json(userPoints);

        } catch (error) {
            logger.error(`Error getting user points for user ${userId}:`, error);
            return res.status(500).json({
                message: 'Có lỗi xảy ra khi lấy thông tin điểm'
            });
        }
    }

    /**
     * Áp dụng điểm giảm giá cho booking
     */
    async applyPointsDiscount(req, res) {
        try {
            const { bookingId } = req.params;
            const { pointsToUse } = req.body;

            // Lấy ID người dùng hiện tại từ token
            const currentUserId = parseInt(req.user.id || req.user.userId);

            // Xác định vai trò của người dùng
            const userRole = req.user.role;
            const isStaff = userRole === 'Staff' || userRole === 'Admin';

            logger.info(`Applying points discount to booking ${bookingId}, requested by user ${currentUserId}, role: ${userRole}`);

            // Gọi service với userId hiện tại
            const bookingResponse = await pointsService.applyPointsDiscount(
                parseInt(bookingId),
                currentUserId,
                parseInt(pointsToUse)
            );

            return res.status(200).json(bookingResponse);

        } catch (error) {
            if (error.message.includes('không tìm thấy')) {
                logger.warn('Booking not found:', error.message);
                return res.status(404).json({ message: error.message });
            }

            if (error.message.includes('đã bị hủy')) {
                logger.warn('Cannot apply points to cancelled booking:', error.message);
                return res.status(400).json({ message: error.message });
            }

            if (error.message.includes('đã thanh toán') || error.message.includes('hoàn thành')) {
                logger.warn('Cannot apply points to completed/confirmed booking:', error.message);
                return res.status(400).json({ message: error.message });
            }

            if (error.message.includes('đã sử dụng')) {
                logger.warn('Points already applied to this booking:', error.message);
                return res.status(400).json({ message: error.message });
            }

            if (error.message.includes('không đủ') || error.message.includes('không hợp lệ')) {
                logger.warn('Invalid operation when applying points:', error.message);
                return res.status(400).json({ message: error.message });
            }

            const bookingIdToLog = req.params.bookingId;
            logger.error(`Error applying points discount to booking ${bookingIdToLog}:`, error);
            return res.status(500).json({
                message: 'Lỗi khi áp dụng điểm giảm giá',
                error: error.message
            });
        }
    }

    /**
     * Helper để lấy userId từ token
     */
    getUserIdFromToken(req) {
        const userId = req.user?.id || req.user?.userId || req.user?.nameid || req.user?.UserId;

        if (!userId) {
            return 0;
        }

        if (typeof userId === 'string') {
            const parsed = parseInt(userId);
            return isNaN(parsed) ? 0 : parsed;
        }

        return userId;
    }

    /**
     * API cho Admin: Lấy danh sách điểm của tất cả người dùng
     */
    async getAllUserPoints(req, res) {
        try {
            logger.info(`[getAllUserPoints] Admin đang lấy danh sách điểm của tất cả người dùng`);

            const allUserPoints = await pointsService.getAllUserPointsAsync();
            logger.info(`[getAllUserPoints] Đã lấy được ${allUserPoints?.length || 0} bản ghi điểm`);

            return res.status(200).json(allUserPoints);

        } catch (error) {
            logger.error(`Error getting all user points:`, error);
            return res.status(500).json({
                message: 'Có lỗi xảy ra khi lấy danh sách điểm người dùng'
            });
        }
    }

    /**
     * API công khai: Lấy điểm của người dùng theo User ID
     */
    async getPointsByUserId(req, res) {
        try {
            const { userId } = req.params;
            
            if (!userId || isNaN(parseInt(userId))) {
                return res.status(400).json({
                    success: false,
                    message: 'ID người dùng không hợp lệ'
                });
            }

            logger.info(`[getPointsByUserId] Đang lấy điểm cho user ID: ${userId}`);
            
            const userPoints = await pointsService.getUserPointsAsync(parseInt(userId));
            
            return res.status(200).json({
                success: true,
                data: userPoints
            });

        } catch (error) {
            logger.error(`[getPointsByUserId] Lỗi khi lấy điểm của người dùng ${req.params.userId}:`, error);
            return res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi lấy thông tin điểm',
                error: error.message
            });
        }
    }
}

module.exports = new PointsController();
