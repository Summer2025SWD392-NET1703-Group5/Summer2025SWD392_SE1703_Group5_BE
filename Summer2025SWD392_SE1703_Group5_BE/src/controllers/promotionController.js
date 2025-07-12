const PromotionService = require('../services/promotionService');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middlewares/authMiddleware');

/**
 * Promotion Controller - Handles HTTP requests for promotion operations
 * Converted from C# PromotionController
 */
class PromotionController {
    constructor() {
        this.promotionService = PromotionService;

        // Bind all methods to this instance to preserve context when used as callbacks
        this.getAllPromotions = this.getAllPromotions.bind(this);
        this.getPromotion = this.getPromotion.bind(this);
        this.createPromotion = this.createPromotion.bind(this);
        this.updatePromotion = this.updatePromotion.bind(this);
        this.deletePromotion = this.deletePromotion.bind(this);
        this.validatePromotionCode = this.validatePromotionCode.bind(this);
        this.applyPromotion = this.applyPromotion.bind(this);
        this.removePromotion = this.removePromotion.bind(this);
        this.getAvailablePromotions = this.getAvailablePromotions.bind(this);
        this.getUserPromotions = this.getUserPromotions.bind(this);
        this.getAvailablePromotionsForBooking = this.getAvailablePromotionsForBooking.bind(this);
    }

    /**
     * Lấy toàn bộ danh sách các khuyến mãi (active, inactive, expired...)
     * @route GET /api/promotions
     * @access Private (Admin/Staff only)
     */
    async getAllPromotions(req, res, next) {
        try {
            logger.info('Controller: GET /api/promotions - getAllPromotions');
            const promotions = await this.promotionService.getAllPromotionsAsync();
            res.status(200).json(promotions);
        } catch (error) {
            logger.error('Controller: Error in getAllPromotions', error);
            next(error);
        }
    }

    /**
     * Lấy thông tin chi tiết một khuyến mãi
     * @route GET /api/promotions/:id
     * @access Private (Admin/Staff only)
     */
    async getPromotion(req, res, next) {
        try {
            const { id } = req.params;
            const promotionId = parseInt(id, 10);
            if (isNaN(promotionId)) {
                return res.status(400).json({ message: 'ID khuyến mãi không hợp lệ' });
            }

            logger.info(`Controller: GET /api/promotions/${promotionId} - getPromotion`);
            const promotion = await this.promotionService.getPromotionAsync(promotionId);
            res.status(200).json(promotion);
        } catch (error) {
            logger.error(`Controller: Error in getPromotion for ID ${req.params.id}`, error);
            if (error.message.includes('Không tìm thấy')) {
                return res.status(404).json({ message: error.message });
            }
            next(error);
        }
    }

    /**
     * Tạo khuyến mãi mới
     * @route POST /api/promotions
     * @access Private (Admin/Staff only)
     */
    async createPromotion(req, res, next) {
        try {
            const userId = req.user?.userId || req.user?.id;
            if (!userId) {
                return res.status(401).json({ message: 'Không thể xác định người dùng để tạo khuyến mãi' });
            }

            const model = req.body;
            if (!model || Object.keys(model).length === 0) {
                return res.status(400).json({ message: 'Dữ liệu không hợp lệ để tạo khuyến mãi' });
            }

            logger.info(`Controller: POST /api/promotions - createPromotion by User ID ${userId}`);
            const newPromotion = await this.promotionService.createPromotionAsync(model, userId);
            res.status(201).json(newPromotion);
        } catch (error) {
            logger.error('Controller: Error in createPromotion', error);
            if (error.message.includes('đã tồn tại') || error.message.includes('phải trước')) {
                return res.status(400).json({ message: error.message });
            }
            next(error);
        }
    }

    /**
     * Cập nhật khuyến mãi
     * @route PUT /api/promotions/:id
     * @access Private (Admin/Staff only)
     */
    async updatePromotion(req, res, next) {
        try {
            const { id } = req.params;
            const promotionId = parseInt(id, 10);
            if (isNaN(promotionId)) {
                return res.status(400).json({ message: 'ID khuyến mãi không hợp lệ' });
            }

            const model = req.body;
            if (!model || Object.keys(model).length === 0) {
                return res.status(400).json({ message: 'Không có dữ liệu để cập nhật' });
            }

            logger.info(`Controller: PUT /api/promotions/${promotionId} - updatePromotion`);
            const result = await this.promotionService.updatePromotionAsync(promotionId, model);
            res.status(200).json(result);
        } catch (error) {
            logger.error(`Controller: Error in updatePromotion for ID ${req.params.id}`, error);
            if (error.message.includes('Không tìm thấy')) {
                return res.status(404).json({ message: error.message });
            }
            if (error.message.includes('đã tồn tại')) {
                return res.status(400).json({ message: error.message });
            }
            next(error);
        }
    }

    /**
     * Xóa khuyến mãi
     * @route DELETE /api/promotions/:id
     * @access Private (Admin only)
     */
    async deletePromotion(req, res, next) {
        try {
            const { id } = req.params;
            const promotionId = parseInt(id, 10);
            if (isNaN(promotionId)) {
                return res.status(400).json({ message: 'ID khuyến mãi không hợp lệ' });
            }

            logger.info(`Controller: DELETE /api/promotions/${promotionId} - deletePromotion`);
            const result = await this.promotionService.deletePromotionAsync(promotionId);
            res.status(200).json(result);
        } catch (error) {
            logger.error(`Controller: Error in deletePromotion for ID ${req.params.id}`, error);
            if (error.message.includes('Không tìm thấy')) {
                return res.status(404).json({ message: error.message });
            }
            next(error);
        }
    }

    /**
     * Kiểm tra và validate mã khuyến mãi
     * @route GET /api/promotions/validate/:code
     * @access Public
     */
    async validatePromotionCode(req, res, next) {
        try {
            const userId = req.user?.userId || req.user?.id || 0; // Cho phép userId = 0 khi chưa đăng nhập

            let { code } = req.params;

            // Nếu người dùng truy cập URL với chính ":code", sử dụng mã TEST
            if (code === ':code') {
                console.log('Phát hiện URL với :code');
            }

            if (!code || !code.trim()) {
                return res.status(400).json({
                    valid: false,
                    message: 'Mã khuyến mãi không được để trống'
                });
            }

            logger.info(`Controller: GET /api/promotions/validate/${code} - validatePromotionCode`);
    
            const result = await this.promotionService.validatePromotionAsync(code.trim(), userId);

            res.status(200).json({
                valid: result.IsValid,
                message: result.Message,
                promotion_id: result.PromotionId,
                title: result.Title,
                discount_type: result.DiscountType,
                discount_value: result.DiscountValue,
                discount_amount: result.DiscountAmount,
                final_amount: result.FinalAmount,
                expires_on: result.ExpiresOn
            });
        } catch (error) {
            logger.error(`Controller: Error in validatePromotionCode for code ${req.params.code}`, error);
            res.status(500).json({
                valid: false,
                message: 'Có lỗi xảy ra khi kiểm tra mã khuyến mãi'
            });
        }
    }

    /**
     * Áp dụng khuyến mãi cho booking
     * @route POST /api/promotions/apply
     * @access Private
     */
    async applyPromotion(req, res, next) {
        try {
            const userId = req.user?.userId || req.user?.id;
            if (!userId) {
                return res.status(401).json({ message: 'Không thể xác định người dùng để áp dụng khuyến mãi' });
            }

            const { bookingId, promotionCode } = req.body;
            if (!promotionCode || !bookingId) {
                return res.status(400).json({
                    success: false,
                    message: 'Dữ liệu không hợp lệ: BookingId và PromotionCode là bắt buộc'
                });
            }

            logger.info(`Controller: POST /api/promotions/apply - applyPromotion for Booking ID ${bookingId}`);
            const result = await this.promotionService.applyPromotionAsync(bookingId, promotionCode.trim(), userId);

            res.status(200).json({
                success: result.Success,
                message: result.Message,
                booking_id: result.BookingId,
                promotion_id: result.PromotionId,
                promotion_code: result.PromotionCode,
                discount_amount: result.DiscountAmount,
                original_total: result.OriginalTotal,
                new_total: result.NewTotal
            });
        } catch (error) {
            logger.error('Controller: Error in applyPromotion', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi áp dụng mã khuyến mãi'
            });
        }
    }

    /**
     * Hủy áp dụng khuyến mãi cho booking
     * @route DELETE /api/promotions/remove/:bookingId
     * @access Private
     */
    async removePromotion(req, res, next) {
        try {
            const userId = req.user?.userId || req.user?.id;
            if (!userId) {
                return res.status(401).json({ message: 'Không thể xác định người dùng để hủy khuyến mãi' });
            }

            const { bookingId } = req.params;
            const bookingIdInt = parseInt(bookingId, 10);
            if (isNaN(bookingIdInt) || bookingIdInt <= 0) {
                return res.status(400).json({ message: 'Booking ID không hợp lệ' });
            }

            logger.info(`Controller: DELETE /api/promotions/remove/${bookingIdInt} - removePromotion`);
            const result = await this.promotionService.removePromotionAsync(bookingIdInt, userId);

            res.status(200).json({
                success: result.Success,
                message: result.Message,
                booking_id: result.BookingId,
                new_total: result.NewTotal
            });
        } catch (error) {
            logger.error(`Controller: Error in removePromotion for Booking ID ${req.params.bookingId}`, error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi hủy khuyến mãi'
            });
        }
    }

    /**
     * Lấy danh sách tất cả khuyến mãi (không lọc theo trạng thái)
     * @route GET /api/promotions/available
     * @access Public
     */
    async getAvailablePromotions(req, res, next) {
        try {
            logger.info(`Controller: GET /api/promotions/available - getAvailablePromotions`);
            logger.info('Lấy tất cả khuyến mãi không lọc theo trạng thái');
            const promotions = await this.promotionService.getAvailablePromotionsAsync();
            res.status(200).json(promotions);
        } catch (error) {
            logger.error('Controller: Error in getAvailablePromotions', error);
            next(error);
        }
    }

    /**
     * Lấy danh sách mã khuyến mãi đã sử dụng của người dùng
     * @route GET /api/promotions/used
     * @access Private (Authenticated users only)
     */
    async getUserPromotions(req, res, next) {
        try {
            console.log('Controller: Lấy danh sách khuyến mãi đã sử dụng của người dùng');
            
            // Lấy userId từ user đã xác thực qua middleware
            const userId = req.user?.User_ID || req.user?.userId || req.user?.id;
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Không thể xác định người dùng, vui lòng đăng nhập lại'
                });
            }
            
            // Gọi service để lấy danh sách khuyến mãi đã sử dụng
            const usedPromotions = await this.promotionService.getUserPromotions(userId);
            
            res.status(200).json({
                success: true,
                data: usedPromotions,
                message: 'Lấy danh sách khuyến mãi đã sử dụng thành công'
            });
        } catch (error) {
            console.error('Controller: Lỗi khi lấy danh sách khuyến mãi đã sử dụng:', error);
            next(error);
        }
    }

    /**
     * Lấy danh sách mã khuyến mãi phù hợp với booking và chưa được sử dụng
     * @route GET /api/promotions/available/:bookingId
     * @access Private
     */
    async getAvailablePromotionsForBooking(req, res, next) {
        try {
            const userId = req.user?.userId || req.user?.id;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Không thể xác định người dùng'
                });
            }

            const { bookingId } = req.params;
            const bookingIdInt = parseInt(bookingId, 10);
            if (isNaN(bookingIdInt) || bookingIdInt <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Booking ID không hợp lệ'
                });
            }

            logger.info(`Controller: GET /api/promotions/available/${bookingIdInt} - getAvailablePromotionsForBooking`);

            const result = await this.promotionService.getAvailablePromotionsForBooking(bookingIdInt, userId);

            res.status(200).json(result);
        } catch (error) {
            logger.error(`Controller: Error in getAvailablePromotionsForBooking for Booking ID ${req.params.bookingId}`, error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi lấy danh sách mã khuyến mãi phù hợp'
            });
        }
    }

    /**
     * Xóa điểm khỏi booking
     * @route DELETE /api/promotions/points/:bookingId
     * @access Private
     */
    async removePointsFromBooking(req, res, next) {
        try {
            const userId = req.user?.userId || req.user?.id;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Không thể xác định người dùng'
                });
            }

            const { bookingId } = req.params;
            const bookingIdInt = parseInt(bookingId, 10);
            if (isNaN(bookingIdInt) || bookingIdInt <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Booking ID không hợp lệ'
                });
            }

            logger.info(`Controller: DELETE /api/promotions/points/${bookingIdInt} - removePointsFromBooking`);

            const result = await this.promotionService.removePointsFromBooking(bookingIdInt, userId);

            res.status(200).json(result);
        } catch (error) {
            logger.error(`Controller: Error in removePointsFromBooking for Booking ID ${req.params.bookingId}`, error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi xóa điểm khỏi booking'
            });
        }
    }

    // 🔧 TEST: Method để test promotion expiration service
    async testPromotionExpiration(req, res) {
        try {
            logger.info('Controller: Testing promotion expiration service');

            // Import service
            const promotionExpirationService = require('../services/promotionExpirationService');

            // Chạy kiểm tra ngay lập tức
            const result = await promotionExpirationService.executeCheck();

            res.status(200).json({
                success: true,
                message: 'Đã chạy kiểm tra promotion expiration',
                result: result
            });

        } catch (error) {
            logger.error('Controller: Error in testPromotionExpiration', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi test promotion expiration',
                error: error.message
            });
        }
    }

    // 🔧 FORCE: Method để force expire promotion hết hạn
    async forceExpirePromotions(req, res) {
        try {
            logger.info('Controller: Force expiring promotions');

            const { sequelize } = require('../models');

            // Tìm tất cả promotion Active đã hết hạn
            const [expiredPromotions] = await sequelize.query(`
                SELECT
                    p.Promotion_ID,
                    p.Title,
                    p.Promotion_Code,
                    p.Status,
                    p.End_Date,
                    CAST(GETDATE() AS DATE) as CurrentDate,
                    DATEDIFF(day, p.End_Date, CAST(GETDATE() AS DATE)) as DaysOverdue
                FROM ksf00691_team03.Promotions p
                WHERE p.Status = 'Active'
                    AND CAST(p.End_Date AS DATE) < CAST(GETDATE() AS DATE)
            `);

            if (expiredPromotions.length === 0) {
                return res.status(200).json({
                    success: true,
                    message: 'Không có promotion nào cần expire',
                    expired_count: 0,
                    promotions: []
                });
            }

            // Force update tất cả promotion hết hạn
            const [updateResult] = await sequelize.query(`
                UPDATE ksf00691_team03.Promotions
                SET Status = 'Expired', Updated_At = GETDATE()
                WHERE Status = 'Active'
                    AND CAST(End_Date AS DATE) < CAST(GETDATE() AS DATE);
                SELECT @@ROWCOUNT as UpdatedRows;
            `);

            const updatedCount = updateResult[0]?.UpdatedRows || 0;

            res.status(200).json({
                success: true,
                message: `Đã force expire ${updatedCount} promotion`,
                expired_count: updatedCount,
                promotions: expiredPromotions.map(p => ({
                    id: p.Promotion_ID,
                    code: p.Promotion_Code,
                    title: p.Title,
                    end_date: p.End_Date,
                    days_overdue: p.DaysOverdue
                }))
            });

        } catch (error) {
            logger.error('Controller: Error in forceExpirePromotions', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi force expire promotions',
                error: error.message
            });
        }
    }
}

module.exports = new PromotionController();