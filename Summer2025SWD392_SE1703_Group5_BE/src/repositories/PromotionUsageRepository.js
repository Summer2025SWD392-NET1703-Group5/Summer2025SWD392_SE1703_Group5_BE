const { getConnection, sql } = require('../config/database');
const PromotionUsage = require('../models/PromotionUsage');

const fullPromotionUsageTableName = 'ksf00691_team03.Promotion_Usage';

/**
 * Lớp Repository để thao tác với dữ liệu Sử dụng Khuyến mãi (PromotionUsage) trong cơ sở dữ liệu.
 * Ghi lại mỗi lần một khuyến mãi được áp dụng cho một đơn đặt vé hoặc giao dịch.
 */
class PromotionUsageRepository {
    /**
     * Ghi lại việc sử dụng một khuyến mãi.
     * @param {object} usageData - Đối tượng chứa thông tin chi tiết sử dụng (ví dụ: Promotion_ID, User_ID, Booking_ID, Usage_Date).
     * @returns {Promise<PromotionUsage|null>} Đối tượng PromotionUsage đã tạo hoặc null nếu tạo thất bại.
     */
    static async create(usageData) {
        try {
            const pool = await getConnection();
            const request = pool.request();

            request.input('Promotion_ID', sql.Int, usageData.Promotion_ID); // ID của khuyến mãi được sử dụng
            request.input('User_ID', sql.Int, usageData.User_ID);         // ID của người dùng đã sử dụng khuyến mãi

            // Booking_ID có thể là tùy chọn, nếu khuyến mãi không nhất thiết phải gắn với một đơn đặt vé cụ thể
            if (usageData.Booking_ID !== undefined) {
                request.input('Booking_ID', sql.Int, usageData.Booking_ID);
            } else {
                request.input('Booking_ID', sql.Int, null); // Mặc định là null nếu không có Booking_ID
            }

            // Usage_Date: Ngày/giờ sử dụng khuyến mãi, mặc định là thời điểm hiện tại nếu không được cung cấp
            request.input('Usage_Date', sql.DateTime, usageData.Usage_Date ? new Date(usageData.Usage_Date) : new Date());

            // Thêm các trường khác nếu cần, ví dụ: Discount_Amount (số tiền được giảm)
            if (usageData.Discount_Amount !== undefined) {
                request.input('Discount_Amount', sql.Decimal(18, 2), usageData.Discount_Amount);
            } else {
                // Nếu không có Discount_Amount, bạn có thể muốn để là null hoặc 0 tùy theo logic nghiệp vụ
                request.input('Discount_Amount', sql.Decimal(18, 2), null);
            }

            const query = `
                INSERT INTO ${fullPromotionUsageTableName} (Promotion_ID, User_ID, Booking_ID, Usage_Date, Discount_Amount)
                OUTPUT INSERTED.*
                VALUES (@Promotion_ID, @User_ID, @Booking_ID, @Usage_Date, @Discount_Amount);
            `;

            const result = await request.query(query);
            return result.recordset[0] ? new PromotionUsage(result.recordset[0]) : null;
        } catch (error) {
            console.error(`[PromotionUsageRepository.js] Lỗi trong hàm create: ${error.message}`);
            // Kiểm tra lỗi cụ thể, ví dụ: lỗi khóa ngoại
            if (error.message.includes('FOREIGN KEY constraint')) {
                console.error('[PromotionUsageRepository.js] Lỗi khóa ngoại: Promotion_ID, User_ID hoặc Booking_ID có thể không tồn tại.');
            }
            throw error;
        }
    }

    /**
     * Tìm bản ghi sử dụng khuyến mãi theo ID.
     * @param {number} usageId - ID của bản ghi sử dụng khuyến mãi.
     * @returns {Promise<PromotionUsage|null>} Đối tượng PromotionUsage nếu tìm thấy, ngược lại null.
     */
    static async findById(usageId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Usage_ID', sql.Int, usageId)
                .query(`SELECT * FROM ${fullPromotionUsageTableName} WHERE Usage_ID = @Usage_ID`);
            return result.recordset[0] ? new PromotionUsage(result.recordset[0]) : null;
        } catch (error) {
            console.error(`[PromotionUsageRepository.js] Lỗi trong hàm findById cho ID ${usageId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy tất cả các bản ghi sử dụng khuyến mãi.
     * @returns {Promise<PromotionUsage[]>} Mảng các đối tượng PromotionUsage.
     * @description Cân nhắc thêm phân trang nếu số lượng bản ghi lớn.
     */
    static async getAll() {
        try {
            const pool = await getConnection();
            // Sắp xếp theo ngày sử dụng giảm dần để hiển thị các lần sử dụng mới nhất trước
            const result = await pool.request().query(`SELECT * FROM ${fullPromotionUsageTableName} ORDER BY Usage_Date DESC`);
            return result.recordset.map(record => new PromotionUsage(record));
        } catch (error) {
            console.error(`[PromotionUsageRepository.js] Lỗi trong hàm getAll: ${error.message}`);
            throw error;
        }
    }

    /**
     * Cập nhật thông tin sử dụng khuyến mãi (thường ít khi cần thiết, nhưng có thể dùng để sửa lỗi).
     * @param {number} usageId - ID của bản ghi sử dụng khuyến mãi cần cập nhật.
     * @param {object} updateData - Đối tượng chứa các trường cần cập nhật.
     * @returns {Promise<boolean>} True nếu cập nhật thành công, false nếu không.
     */
    static async update(usageId, updateData) {
        try {
            const pool = await getConnection();
            const request = pool.request().input('Usage_ID', sql.Int, usageId);
            const setClauses = [];

            // Các trường có thể cập nhật (ví dụ: Discount_Amount nếu có sai sót ban đầu)
            // Promotion_ID, User_ID, Booking_ID, Usage_Date thường không nên thay đổi sau khi đã ghi nhận.
            if (updateData.Discount_Amount !== undefined) { request.input('Discount_Amount', sql.Decimal(18, 2), updateData.Discount_Amount); setClauses.push('Discount_Amount = @Discount_Amount'); }
            // Thêm các trường khác nếu cần thiết và hợp lý

            if (setClauses.length === 0) {
                console.warn('[PromotionUsageRepository.js] Hàm update được gọi không có trường nào để cập nhật cho ID:', usageId);
                return false;
            }

            const queryText = `UPDATE ${fullPromotionUsageTableName} SET ${setClauses.join(', ')} WHERE Usage_ID = @Usage_ID`;
            const result = await request.query(queryText);
            return result.rowsAffected[0] > 0;
        } catch (error) {
            console.error(`[PromotionUsageRepository.js] Lỗi trong hàm update cho ID ${usageId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Xóa bản ghi sử dụng khuyến mãi theo ID (thường ít khi cần, trừ khi để dọn dẹp dữ liệu sai).
     * @param {number} usageId - ID của bản ghi sử dụng khuyến mãi cần xóa.
     * @returns {Promise<boolean>} True nếu xóa thành công, false nếu không.
     */
    static async remove(usageId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Usage_ID', sql.Int, usageId)
                .query(`DELETE FROM ${fullPromotionUsageTableName} WHERE Usage_ID = @Usage_ID`);
            return result.rowsAffected[0] > 0;
        } catch (error) {
            console.error(`[PromotionUsageRepository.js] Lỗi trong hàm remove cho ID ${usageId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Tìm các bản ghi sử dụng khuyến mãi theo Promotion_ID.
     * @param {number} promotionId - ID của khuyến mãi.
     * @returns {Promise<PromotionUsage[]>} Mảng các đối tượng PromotionUsage liên quan đến khuyến mãi này.
     */
    static async findByPromotionId(promotionId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Promotion_ID', sql.Int, promotionId)
                .query(`SELECT * FROM ${fullPromotionUsageTableName} WHERE Promotion_ID = @Promotion_ID ORDER BY Usage_Date DESC`);
            return result.recordset.map(record => new PromotionUsage(record));
        } catch (error) {
            console.error(`[PromotionUsageRepository.js] Lỗi trong hàm findByPromotionId cho Promotion ID ${promotionId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Tìm các bản ghi sử dụng khuyến mãi theo User_ID.
     * @param {number} userId - ID của người dùng.
     * @returns {Promise<PromotionUsage[]>} Mảng các đối tượng PromotionUsage của người dùng này.
     */
    static async findByUserId(userId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('User_ID', sql.Int, userId)
                .query(`SELECT * FROM ${fullPromotionUsageTableName} WHERE User_ID = @User_ID ORDER BY Usage_Date DESC`);
            return result.recordset.map(record => new PromotionUsage(record));
        } catch (error) {
            console.error(`[PromotionUsageRepository.js] Lỗi trong hàm findByUserId cho User ID ${userId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Tìm các bản ghi sử dụng khuyến mãi theo Booking_ID.
     * @param {number} bookingId - ID của đơn đặt vé.
     * @returns {Promise<PromotionUsage[]>} Mảng các đối tượng PromotionUsage liên quan đến đơn đặt vé này.
     * @description Một đơn đặt vé có thể áp dụng nhiều khuyến mãi (tùy logic), hoặc một khuyến mãi được ghi nhận cho một đơn.
     */
    static async findByBookingId(bookingId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Booking_ID', sql.Int, bookingId)
                .query(`SELECT * FROM ${fullPromotionUsageTableName} WHERE Booking_ID = @Booking_ID ORDER BY Usage_Date DESC`);
            return result.recordset.map(record => new PromotionUsage(record));
        } catch (error) {
            console.error(`[PromotionUsageRepository.js] Lỗi trong hàm findByBookingId cho Booking ID ${bookingId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Đếm số lần một khuyến mãi cụ thể đã được sử dụng.
     * @param {number} promotionId - ID của khuyến mãi.
     * @returns {Promise<number>} Tổng số lần khuyến mãi đã được sử dụng.
     */
    static async countUsageByPromotionId(promotionId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Promotion_ID', sql.Int, promotionId)
                .query(`SELECT COUNT(*) as UsageCount FROM ${fullPromotionUsageTableName} WHERE Promotion_ID = @Promotion_ID`);
            return result.recordset[0] ? result.recordset[0].UsageCount : 0;
        } catch (error) {
            console.error(`[PromotionUsageRepository.js] Lỗi trong hàm countUsageByPromotionId cho Promotion ID ${promotionId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Đếm số lần một người dùng cụ thể đã sử dụng một khuyến mãi cụ thể.
     * @param {number} promotionId - ID của khuyến mãi.
     * @param {number} userId - ID của người dùng.
     * @returns {Promise<number>} Số lần người dùng đã sử dụng khuyến mãi này.
     */
    static async countUsageByUserForPromotion(promotionId, userId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Promotion_ID', sql.Int, promotionId)
                .input('User_ID', sql.Int, userId)
                .query(`SELECT COUNT(*) as UsageCount FROM ${fullPromotionUsageTableName} WHERE Promotion_ID = @Promotion_ID AND User_ID = @User_ID`);
            return result.recordset[0] ? result.recordset[0].UsageCount : 0;
        } catch (error) {
            console.error(`[PromotionUsageRepository.js] Lỗi trong hàm countUsageByUserForPromotion cho Promotion ID ${promotionId} và User ID ${userId}: ${error.message}`);
            throw error;
        }
    }
}

module.exports = PromotionUsageRepository; 