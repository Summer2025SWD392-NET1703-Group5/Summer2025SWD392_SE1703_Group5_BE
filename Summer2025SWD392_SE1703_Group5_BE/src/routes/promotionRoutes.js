// src/services/promotionExpirationService.js
const logger = require('../utils/logger');
const { Promotion, PromotionUsage, TicketBooking, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * Background Service để tự động ẩn promotion hết hạn
 * Chuyển promotion từ 'Active' thành 'Expired' khi qua End_Date
 */
class PromotionExpirationService {
    constructor() {
        this.logger = logger;
        // 🔧 TEMP: Giảm thời gian chạy để test (5 phút một lần thay vì 6 giờ)
        this.checkInterval = 1 * 60 * 1000; // 5 phút = 300000ms (thay vì 6 giờ)

        // Biến để lưu trữ interval ID
        this.intervalId = null;

        // Biến để lưu trữ timeout ID cho lần chạy đầu tiên
        this.timeoutId = null;

        // Biến để kiểm soát việc dừng service
        this.isRunning = false;

        // Đếm số lần kiểm tra
        this.totalChecks = 0;
        this.totalExpiredPromotions = 0;

        // Tính toán thời gian đến 00:00 tiếp theo để chạy vào nửa đêm
        this.calculateTimeToNextMidnight = () => {
            const now = new Date();
            const nextMidnight = new Date();
            nextMidnight.setHours(24, 0, 0, 0); // Set to next midnight (00:00)
            return nextMidnight - now;
        };
    }

    /**
     * Bắt đầu background service
     */
    async start() {
        if (this.isRunning) {
            this.logger.warn('[PromotionExpirationService] Service đã đang chạy');
            return;
        }

        try {
            this.logger.info('[PromotionExpirationService] Đang khởi động service ẩn promotion hết hạn...');
            
            // 🔧 TEMP: Chạy lần đầu tiên ngay lập tức và thiết lập interval ngay
            await this.executeCheck();

            // 🔧 TEMP: Thiết lập interval để chạy định kỳ mỗi 5 phút (thay vì chờ đến nửa đêm)
            this.logger.info(`[PromotionExpirationService] Sẽ chạy lại sau mỗi ${this.checkInterval / (60 * 1000)} phút`);

            this.intervalId = setInterval(async () => {
                await this.executeCheck();
            }, this.checkInterval);

            this.isRunning = true;
            this.logger.info(`[PromotionExpirationService] ✅ Service đã khởi động thành công!`);
            
        } catch (error) {
            this.logger.error('[PromotionExpirationService] ❌ Lỗi khi khởi động service:', error);
            this.isRunning = false;
        }
    }

    /**
     * Dừng background service
     */
    stop() {
        if (!this.isRunning) {
            this.logger.warn('[PromotionExpirationService] Service không đang chạy');
            return;
        }

        try {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }

            if (this.timeoutId) {
                clearTimeout(this.timeoutId);
                this.timeoutId = null;
            }

            this.isRunning = false;
            this.logger.info('[PromotionExpirationService] ✅ Service đã dừng thành công');
            
        } catch (error) {
            this.logger.error('[PromotionExpirationService] ❌ Lỗi khi dừng service:', error);
        }
    }

    /**
     * Thực hiện kiểm tra và ẩn promotion hết hạn
     */
    async executeCheck() {
        const startTime = new Date();
        this.totalChecks++;

        try {
            // Lấy ngày hiện tại (chỉ ngày, không có giờ)
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            this.logger.info(`[PromotionExpirationService] 🔍 Bắt đầu kiểm tra promotion hết hạn lần thứ ${this.totalChecks} - ${today.toISOString().split('T')[0]}`);

            // Kiểm tra xem models có tồn tại không
            if (!Promotion) {
                this.logger.warn('[PromotionExpirationService] Model Promotion chưa được khởi tạo, bỏ qua lần kiểm tra này');
                return {
                    message: 'Model Promotion chưa sẵn sàng',
                    currentTime: startTime,
                    totalChecks: this.totalChecks
                };
            }

            // 🔧 DEBUG: Kiểm tra tất cả promotion Active trước
            const [allActivePromotions] = await sequelize.query(`
                SELECT
                    p.Promotion_ID,
                    p.Title,
                    p.Promotion_Code,
                    p.Status,
                    p.End_Date,
                    CAST(GETDATE() AS DATE) as CurrentDate,
                    CASE
                        WHEN CAST(p.End_Date AS DATE) < CAST(GETDATE() AS DATE) THEN 'SHOULD_EXPIRE'
                        ELSE 'VALID'
                    END as ShouldExpire
                FROM ksf00691_team03.Promotions p
                WHERE p.Status = 'Active'
                ORDER BY p.End_Date ASC
            `);

            this.logger.info(`[PromotionExpirationService] 📊 Tổng cộng ${allActivePromotions.length} promotion Active:`);
            allActivePromotions.forEach(promo => {
                this.logger.info(`   - ID: ${promo.Promotion_ID} | Code: ${promo.Promotion_Code} | End: ${promo.End_Date} | ${promo.ShouldExpire}`);
            });

            // Tìm các promotion cần expire bằng SQL trực tiếp
            const [expiredPromotionsFromSQL] = await sequelize.query(`
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

            this.logger.info(`[PromotionExpirationService] SQL tìm thấy ${expiredPromotionsFromSQL.length} promotion cần expire`);

            if (expiredPromotionsFromSQL.length === 0) {
                this.logger.info('[PromotionExpirationService] ✅ Không có promotion nào cần expire');
                return {
                    message: 'Không có promotion hết hạn',
                    currentTime: startTime,
                    totalChecks: this.totalChecks,
                    totalExpiredPromotions: this.totalExpiredPromotions
                };
            }

            // Xử lý từng promotion hết hạn
            let expiredCount = 0;
            const expiredPromotions = [];

            for (const sqlPromotion of expiredPromotionsFromSQL) {
                try {
                    this.logger.warn(`[PromotionExpirationService] Promotion "${sqlPromotion.Title}" (${sqlPromotion.Promotion_Code}) đã hết hạn ${sqlPromotion.DaysOverdue} ngày`);

                    const result = await this.expirePromotion(sqlPromotion);
                    if (result.success) {
                        expiredCount++;
                        expiredPromotions.push({
                            id: sqlPromotion.Promotion_ID,
                            title: sqlPromotion.Title,
                            code: sqlPromotion.Promotion_Code
                        });
                        this.totalExpiredPromotions++;
                    }

                } catch (error) {
                    this.logger.error(`[PromotionExpirationService] Lỗi khi expire promotion #${sqlPromotion.Promotion_ID}:`, error);
                }
            }

            const endTime = new Date();
            const duration = endTime - startTime;

            this.logger.info(`[PromotionExpirationService] ✅ Hoàn thành kiểm tra: ${expiredCount}/${expiredPromotionsFromSQL.length} promotion đã được expire trong ${duration}ms`);

            return {
                message: `Đã expire ${expiredCount} promotion hết hạn`,
                expiredPromotions,
                totalProcessed: expiredPromotionsFromSQL.length,
                totalExpired: expiredCount,
                duration: `${duration}ms`,
                totalChecks: this.totalChecks,
                totalExpiredPromotions: this.totalExpiredPromotions
            };

        } catch (error) {
            this.logger.error('[PromotionExpirationService] ❌ Lỗi trong quá trình kiểm tra:', error);
            throw error;
        }
    }

    /**
     * Expire một promotion hết hạn
     */
    async expirePromotion(promotionData) {
        const transaction = await sequelize.transaction();

        try {
            // Kiểm tra xem promotion có đang được sử dụng trong booking active không
            const activeUsage = await PromotionUsage.count({
                include: [{
                    model: TicketBooking,
                    as: 'TicketBooking',
                    where: {
                        Status: { [Op.in]: ['Pending', 'Confirmed'] }
                    },
                    required: true
                }],
                where: {
                    Promotion_ID: promotionData.Promotion_ID,
                    HasUsed: true
                },
                transaction
            });

            if (activeUsage > 0) {
                this.logger.warn(`[PromotionExpirationService] Promotion #${promotionData.Promotion_ID} đang được sử dụng trong ${activeUsage} booking active, chỉ đánh dấu expired`);
            }

            // Cập nhật trạng thái promotion thành 'Expired'
            const [updatedRows] = await Promotion.update(
                { 
                    Status: 'Expired',
                    Updated_At: new Date()
                },
                { 
                    where: { 
                        Promotion_ID: promotionData.Promotion_ID,
                        Status: 'Active'
                    },
                    transaction 
                }
            );

            if (updatedRows === 0) {
                await transaction.rollback();
                return {
                    success: false,
                    message: `Promotion #${promotionData.Promotion_ID} không thể expire (có thể đã được expire trước đó)`
                };
            }

            // Log chi tiết
            this.logger.info(`[PromotionExpirationService] ✅ Đã expire promotion #${promotionData.Promotion_ID} - "${promotionData.Title}" (${promotionData.Promotion_Code})`);

            await transaction.commit();

            return {
                success: true,
                message: `Đã expire promotion #${promotionData.Promotion_ID}`,
                promotionId: promotionData.Promotion_ID,
                title: promotionData.Title,
                code: promotionData.Promotion_Code,
                endDate: promotionData.End_Date,
                activeUsage: activeUsage
            };

        } catch (error) {
            await transaction.rollback();
            this.logger.error(`[PromotionExpirationService] Lỗi khi expire promotion #${promotionData.Promotion_ID}:`, error);
            throw error;
        }
    }

    /**
     * Lấy thống kê service
     */
    getStats() {
        return {
            isRunning: this.isRunning,
            totalChecks: this.totalChecks,
            totalExpiredPromotions: this.totalExpiredPromotions,
            checkInterval: this.checkInterval,
            nextMidnight: this.calculateTimeToNextMidnight(),
            nextCheckIn: this.intervalId ? 'Running' : 'Scheduled for midnight'
        };
    }

    /**
     * Force check một promotion cụ thể
     */
    async forceCheckPromotion(promotionId) {
        try {
            this.logger.info(`[PromotionExpirationService] Force check promotion #${promotionId}...`);

            // Kiểm tra promotion bằng SQL
            const [sqlCheck] = await sequelize.query(`
                SELECT 
                    p.Promotion_ID,
                    p.Title,
                    p.Promotion_Code,
                    p.Status,
                    p.End_Date,
                    CAST(GETDATE() AS DATE) as CurrentDate,
                    CASE WHEN CAST(p.End_Date AS DATE) < CAST(GETDATE() AS DATE)
                         THEN 1 ELSE 0 END as IsExpired
                FROM ksf00691_team03.Promotions p
                WHERE p.Promotion_ID = ${promotionId}
            `);

            if (!sqlCheck || sqlCheck.length === 0) {
                return {
                    success: false,
                    message: `Không tìm thấy promotion #${promotionId}`
                };
            }

            const promotionInfo = sqlCheck[0];

            if (promotionInfo.Status !== 'Active') {
                return {
                    success: false,
                    message: `Promotion #${promotionId} đã có trạng thái: ${promotionInfo.Status}`
                };
            }

            if (!promotionInfo.IsExpired) {
                return {
                    success: false,
                    message: `Promotion #${promotionId} chưa hết hạn. End_Date: ${promotionInfo.End_Date}`
                };
            }

            // Promotion đã hết hạn, tiến hành expire
            const result = await this.expirePromotion(promotionInfo);

            return {
                success: true,
                message: `Đã force expire promotion #${promotionId}`,
                result
            };

        } catch (error) {
            this.logger.error(`[PromotionExpirationService] Lỗi khi force check promotion #${promotionId}:`, error);
            throw error;
        }
    }

    /**
     * Lấy danh sách promotion sắp hết hạn (trong vòng N ngày)
     */
    async getPromotionsNearExpiration(daysAhead = 7) {
        try {
            const [results] = await sequelize.query(`
                SELECT 
                    p.Promotion_ID,
                    p.Title,
                    p.Promotion_Code,
                    p.End_Date,
                    DATEDIFF(day, CAST(GETDATE() AS DATE), CAST(p.End_Date AS DATE)) as DaysLeft
                FROM ksf00691_team03.Promotions p
                WHERE p.Status = 'Active'
                    AND CAST(p.End_Date AS DATE) >= CAST(GETDATE() AS DATE)
                    AND DATEDIFF(day, CAST(GETDATE() AS DATE), CAST(p.End_Date AS DATE)) <= ${daysAhead}
                ORDER BY p.End_Date ASC
            `);

            return results || [];

        } catch (error) {
            this.logger.error(`[PromotionExpirationService] Lỗi khi lấy promotion sắp hết hạn:`, error);
            throw error;
        }
    }
}

module.exports = new PromotionExpirationService();
