const { getConnection, sql } = require('../config/database');
const Score = require('../models/Score'); // Giả định model Score đã tồn tại

const fullScoreTableName = 'ksf00691_team03.Scores'; // Điều chỉnh nếu tên bảng của bạn khác

/**
 * Lớp Repository để thao tác với dữ liệu Điểm (Score) trong cơ sở dữ liệu.
 * Điểm có thể liên quan đến đánh giá phim, bình luận, hoặc các hoạt động khác của người dùng.
 */
class ScoreRepository {
    /**
     * Tạo một bản ghi điểm mới.
     * @param {object} scoreData - Đối tượng chứa thông tin chi tiết điểm (ví dụ: User_ID, Movie_ID, Rating, Comment, Score_Date).
     * @returns {Promise<Score|null>} Đối tượng Score đã tạo hoặc null nếu tạo thất bại.
     */
    static async create(scoreData) {
        try {
            const pool = await getConnection();
            const request = pool.request();

            request.input('User_ID', sql.Int, scoreData.User_ID);     // ID người dùng
            request.input('Movie_ID', sql.Int, scoreData.Movie_ID);   // ID phim
            request.input('Rating', sql.Decimal(2, 1), scoreData.Rating); // Điểm đánh giá (ví dụ: từ 0.0 đến 5.0)

            if (scoreData.Comment !== undefined) {
                request.input('Comment', sql.NVarChar(sql.MAX), scoreData.Comment); // Bình luận (tùy chọn)
            } else {
                request.input('Comment', sql.NVarChar(sql.MAX), null); // Mặc định là null nếu không cung cấp
            }

            // Score_Date: Ngày/giờ tạo điểm, mặc định là thời điểm hiện tại nếu không được cung cấp
            request.input('Score_Date', sql.DateTime, scoreData.Score_Date ? new Date(scoreData.Score_Date) : new Date());

            const query = `
                INSERT INTO ${fullScoreTableName} (User_ID, Movie_ID, Rating, Comment, Score_Date)
                OUTPUT INSERTED.*
                VALUES (@User_ID, @Movie_ID, @Rating, @Comment, @Score_Date);
            `;

            const result = await request.query(query);
            return result.recordset[0] ? new Score(result.recordset[0]) : null;
        } catch (error) {
            console.error(`[ScoreRepository.js] Lỗi trong hàm create: ${error.message}`);
            // Kiểm tra lỗi cụ thể, ví dụ: lỗi khóa ngoại không tồn tại User_ID hoặc Movie_ID
            if (error.message.includes('FOREIGN KEY constraint')) {
                console.error('[ScoreRepository.js] Lỗi khóa ngoại: User_ID hoặc Movie_ID có thể không tồn tại.');
            }
            throw error;
        }
    }

    /**
     * Tìm điểm theo ID.
     * @param {number} scoreId - ID của điểm cần tìm.
     * @returns {Promise<Score|null>} Đối tượng Score nếu tìm thấy, ngược lại null.
     */
    static async findById(scoreId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Score_ID', sql.Int, scoreId)
                .query(`SELECT * FROM ${fullScoreTableName} WHERE Score_ID = @Score_ID`);
            return result.recordset[0] ? new Score(result.recordset[0]) : null;
        } catch (error) {
            console.error(`[ScoreRepository.js] Lỗi trong hàm findById cho ID ${scoreId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy tất cả các bản ghi điểm.
     * @returns {Promise<Score[]>} Mảng các đối tượng Score.
     * @description Cân nhắc thêm phân trang nếu số lượng điểm lớn.
     */
    static async getAll() {
        try {
            const pool = await getConnection();
            // Sắp xếp theo ngày tạo điểm giảm dần để hiển thị điểm mới nhất trước
            const result = await pool.request().query(`SELECT * FROM ${fullScoreTableName} ORDER BY Score_Date DESC`);
            return result.recordset.map(record => new Score(record));
        } catch (error) {
            console.error(`[ScoreRepository.js] Lỗi trong hàm getAll: ${error.message}`);
            throw error;
        }
    }

    /**
     * Cập nhật thông tin điểm hiện có.
     * @param {number} scoreId - ID của điểm cần cập nhật.
     * @param {object} updateData - Đối tượng chứa các trường cần cập nhật (ví dụ: Rating, Comment).
     * @returns {Promise<boolean>} True nếu cập nhật thành công, false nếu không.
     */
    static async update(scoreId, updateData) {
        try {
            const pool = await getConnection();
            const request = pool.request().input('Score_ID', sql.Int, scoreId);
            const setClauses = [];

            // Người dùng thường chỉ cập nhật Rating hoặc Comment
            if (updateData.Rating !== undefined) { request.input('Rating', sql.Decimal(2, 1), updateData.Rating); setClauses.push('Rating = @Rating'); }
            if (updateData.Comment !== undefined) { request.input('Comment', sql.NVarChar(sql.MAX), updateData.Comment); setClauses.push('Comment = @Comment'); }
            // Các trường như User_ID, Movie_ID, Score_Date thường không được phép cập nhật sau khi tạo

            if (setClauses.length === 0) {
                console.warn('[ScoreRepository.js] Hàm update được gọi không có trường nào để cập nhật cho ID:', scoreId);
                return false;
            }

            const queryText = `UPDATE ${fullScoreTableName} SET ${setClauses.join(', ')} WHERE Score_ID = @Score_ID`;
            const result = await request.query(queryText);
            return result.rowsAffected[0] > 0;
        } catch (error) {
            console.error(`[ScoreRepository.js] Lỗi trong hàm update cho ID ${scoreId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Xóa điểm theo ID.
     * @param {number} scoreId - ID của điểm cần xóa.
     * @returns {Promise<boolean>} True nếu xóa thành công, false nếu không.
     */
    static async remove(scoreId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Score_ID', sql.Int, scoreId)
                .query(`DELETE FROM ${fullScoreTableName} WHERE Score_ID = @Score_ID`);
            return result.rowsAffected[0] > 0;
        } catch (error) {
            console.error(`[ScoreRepository.js] Lỗi trong hàm remove cho ID ${scoreId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Tìm các điểm theo User_ID.
     * @param {number} userId - ID của người dùng.
     * @returns {Promise<Score[]>} Mảng các đối tượng Score của người dùng đó, sắp xếp theo ngày tạo điểm giảm dần.
     */
    static async findByUserId(userId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('User_ID', sql.Int, userId)
                .query(`SELECT * FROM ${fullScoreTableName} WHERE User_ID = @User_ID ORDER BY Score_Date DESC`);
            return result.recordset.map(record => new Score(record));
        } catch (error) {
            console.error(`[ScoreRepository.js] Lỗi trong hàm findByUserId cho User ID ${userId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Tìm các điểm theo Movie_ID.
     * @param {number} movieId - ID của phim.
     * @returns {Promise<Score[]>} Mảng các đối tượng Score cho phim đó, sắp xếp theo ngày tạo điểm giảm dần.
     */
    static async findByMovieId(movieId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Movie_ID', sql.Int, movieId)
                .query(`SELECT * FROM ${fullScoreTableName} WHERE Movie_ID = @Movie_ID ORDER BY Score_Date DESC`);
            return result.recordset.map(record => new Score(record));
        } catch (error) {
            console.error(`[ScoreRepository.js] Lỗi trong hàm findByMovieId cho Movie ID ${movieId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy điểm trung bình cho một phim cụ thể.
     * @param {number} movieId - ID của phim.
     * @returns {Promise<number|null>} Điểm trung bình (ví dụ: 4.5) hoặc null nếu không có đánh giá nào.
     */
    static async getAverageRatingForMovie(movieId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Movie_ID', sql.Int, movieId)
                .query(`SELECT AVG(CAST(Rating AS DECIMAL(3,1))) as AverageRating FROM ${fullScoreTableName} WHERE Movie_ID = @Movie_ID`);

            if (result.recordset[0] && result.recordset[0].AverageRating !== null) {
                // Làm tròn đến một chữ số thập phân
                return parseFloat(result.recordset[0].AverageRating.toFixed(1));
            }
            return null; // Trả về null nếu không có đánh giá nào hoặc AverageRating là null
        } catch (error) {
            console.error(`[ScoreRepository.js] Lỗi trong hàm getAverageRatingForMovie cho Movie ID ${movieId}: ${error.message}`);
            throw error;
        }
    }
}

module.exports = ScoreRepository; 