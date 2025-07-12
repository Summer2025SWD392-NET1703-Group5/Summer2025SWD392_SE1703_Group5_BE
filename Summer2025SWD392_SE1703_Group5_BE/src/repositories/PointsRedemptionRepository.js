const { getConnection, sql } = require('../config/database');
const PointsRedemption = require('../models/PointsRedemption');

const fullPointsRedemptionTableName = 'ksf00691_team03.Points_Redemption';

/**
 * Lớp Repository để thao tác với dữ liệu Đổi điểm (PointsRedemption) trong cơ sở dữ liệu.
 */
class PointsRedemptionRepository {
    /**
     * Tạo một bản ghi đổi điểm mới.
     * @param {object} redemptionData - Đối tượng chứa thông tin chi tiết đổi điểm (ví dụ: User_ID, Points_Used, Item_Redeemed, Redemption_Date).
     * @returns {Promise<PointsRedemption|null>} Đối tượng PointsRedemption đã tạo hoặc null nếu tạo thất bại.
     */
    static async create(redemptionData) {
        try {
            const pool = await getConnection();
            const request = pool.request();

            request.input('User_ID', sql.Int, redemptionData.User_ID); // ID người dùng
            request.input('Points_Used', sql.Int, redemptionData.Points_Used); // Số điểm đã sử dụng
            request.input('Item_Redeemed', sql.NVarChar(255), redemptionData.Item_Redeemed); // Vật phẩm đã đổi
            // Redemption_Date: Ngày đổi điểm, mặc định là thời điểm hiện tại nếu không được cung cấp
            request.input('Redemption_Date', sql.DateTime, redemptionData.Redemption_Date ? new Date(redemptionData.Redemption_Date) : new Date());

            // Thêm các trường khác nếu cần, ví dụ: Status (Trạng thái đổi điểm)
            if (redemptionData.Status !== undefined) {
                request.input('Status', sql.NVarChar(50), redemptionData.Status);
            } else {
                request.input('Status', sql.NVarChar(50), 'Completed'); // Mặc định là 'Completed'
            }

            const query = `
                INSERT INTO ${fullPointsRedemptionTableName} (User_ID, Points_Used, Item_Redeemed, Redemption_Date, Status)
                OUTPUT INSERTED.*
                VALUES (@User_ID, @Points_Used, @Item_Redeemed, @Redemption_Date, @Status);
            `;

            const result = await request.query(query);
            return result.recordset[0] ? new PointsRedemption(result.recordset[0]) : null;
        } catch (error) {
            console.error(`[PointsRedemptionRepository.js] Lỗi trong hàm create: ${error.message}`);
            if (error.message.includes('FOREIGN KEY constraint') && error.message.includes('Users')) {
                console.error('[PointsRedemptionRepository.js] Lỗi khóa ngoại: User_ID không tồn tại trong bảng Users.');
            }
            throw error;
        }
    }

    /**
     * Tìm bản ghi đổi điểm theo ID.
     * @param {number} redemptionId - ID của bản ghi đổi điểm cần tìm.
     * @returns {Promise<PointsRedemption|null>} Đối tượng PointsRedemption nếu tìm thấy, ngược lại null.
     */
    static async findById(redemptionId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Redemption_ID', sql.Int, redemptionId)
                .query(`SELECT * FROM ${fullPointsRedemptionTableName} WHERE Redemption_ID = @Redemption_ID`);
            return result.recordset[0] ? new PointsRedemption(result.recordset[0]) : null;
        } catch (error) {
            console.error(`[PointsRedemptionRepository.js] Lỗi trong hàm findById cho ID ${redemptionId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy tất cả các bản ghi đổi điểm.
     * @returns {Promise<PointsRedemption[]>} Mảng các đối tượng PointsRedemption.
     * @description Cân nhắc thêm phân trang nếu số lượng bản ghi lớn.
     */
    static async getAll() {
        try {
            const pool = await getConnection();
            // Sắp xếp theo ngày đổi điểm giảm dần để hiển thị các lần đổi mới nhất trước
            const result = await pool.request().query(`SELECT * FROM ${fullPointsRedemptionTableName} ORDER BY Redemption_Date DESC`);
            return result.recordset.map(record => new PointsRedemption(record));
        } catch (error) {
            console.error(`[PointsRedemptionRepository.js] Lỗi trong hàm getAll: ${error.message}`);
            throw error;
        }
    }

    /**
     * Cập nhật thông tin bản ghi đổi điểm (thường là trạng thái).
     * @param {number} redemptionId - ID của bản ghi đổi điểm cần cập nhật.
     * @param {object} updateData - Đối tượng chứa các trường cần cập nhật (ví dụ: Status).
     * @returns {Promise<boolean>} True nếu cập nhật thành công, false nếu không.
     */
    static async update(redemptionId, updateData) {
        try {
            const pool = await getConnection();
            const request = pool.request().input('Redemption_ID', sql.Int, redemptionId);
            const setClauses = [];

            if (updateData.Points_Used !== undefined) { request.input('Points_Used', sql.Int, updateData.Points_Used); setClauses.push('Points_Used = @Points_Used'); }
            if (updateData.Item_Redeemed !== undefined) { request.input('Item_Redeemed', sql.NVarChar(255), updateData.Item_Redeemed); setClauses.push('Item_Redeemed = @Item_Redeemed'); }
            if (updateData.Status !== undefined) { request.input('Status', sql.NVarChar(50), updateData.Status); setClauses.push('Status = @Status'); }
            // User_ID và Redemption_Date thường không được thay đổi sau khi tạo.

            if (setClauses.length === 0) {
                console.warn('[PointsRedemptionRepository.js] Hàm update được gọi không có trường nào để cập nhật cho ID:', redemptionId);
                return false;
            }

            const queryText = `UPDATE ${fullPointsRedemptionTableName} SET ${setClauses.join(', ')} WHERE Redemption_ID = @Redemption_ID`;
            const result = await request.query(queryText);
            return result.rowsAffected[0] > 0;
        } catch (error) {
            console.error(`[PointsRedemptionRepository.js] Lỗi trong hàm update cho ID ${redemptionId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Xóa bản ghi đổi điểm theo ID.
     * @param {number} id - ID của bản ghi đổi điểm cần xóa.
     * @returns {Promise<boolean>} True nếu xóa thành công, false nếu không.
     */
    static async remove(id) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Redemption_ID', sql.Int, id)
                .query(`DELETE FROM ${fullPointsRedemptionTableName} WHERE Redemption_ID = @Redemption_ID`);
            return result.rowsAffected[0] > 0;
        } catch (error) {
            console.error(`[PointsRedemptionRepository.js] Lỗi trong hàm remove cho ID ${id}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Tìm các bản ghi đổi điểm theo User_ID.
     * @param {number} userId - ID của người dùng.
     * @returns {Promise<PointsRedemption[]>} Mảng các đối tượng PointsRedemption của người dùng đó, sắp xếp theo ngày đổi điểm giảm dần.
     */
    static async findByUserId(userId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('User_ID', sql.Int, userId)
                .query(`SELECT * FROM ${fullPointsRedemptionTableName} WHERE User_ID = @User_ID ORDER BY Redemption_Date DESC`);
            return result.recordset.map(record => new PointsRedemption(record));
        } catch (error) {
            console.error(`[PointsRedemptionRepository.js] Lỗi trong hàm findByUserId cho User ID ${userId}: ${error.message}`);
            throw error;
        }
    }
}

module.exports = PointsRedemptionRepository; 