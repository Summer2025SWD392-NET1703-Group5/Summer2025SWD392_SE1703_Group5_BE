const pointsService = require('../services/pointsService');
const logger = require('../utils/logger');

/**
 * Score History Controller - Handles user points history and transactions
 * Converted from C# ScoreHistoryController
 */
class ScoreHistoryController {
    /**
     * Lấy lịch sử tích và sử dụng điểm của khách hàng
     * @route GET /api/score-history/user/:userId
     */
    async getUserScoreHistory(req, res) {
        try {
            const { userId } = req.params;
            const userIdNum = parseInt(userId);

            if (userIdNum <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Mã khách hàng không hợp lệ'
                });
            }

            const pointsInfo = await pointsService.getUserPointsAsync(userIdNum);
            const earningsHistory = await pointsService.getPointsEarningHistoryAsync(userIdNum);
            const redemptionsHistory = await pointsService.getPointsRedemptionHistoryAsync(userIdNum);

            const result = {
                CurrentPoints: pointsInfo,
                EarningsHistory: earningsHistory,
                RedemptionsHistory: redemptionsHistory
            };

            return res.status(200).json(result);

        } catch (error) {
            logger.error(`Lỗi khi lấy lịch sử điểm của khách hàng ${req.params.userId}`, error);
            return res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi lấy lịch sử điểm tích lũy.'
            });
        }
    }
}

// Export instance của class
module.exports = new ScoreHistoryController();
