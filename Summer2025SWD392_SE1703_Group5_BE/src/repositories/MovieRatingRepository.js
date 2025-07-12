const { getConnection, sql } = require('../config/database');
const MovieRating = require('../models/MovieRating');

const fullMovieRatingTableName = 'ksf00691_team03.Movie_Ratings';

/**
 * Lớp Repository để thao tác với dữ liệu Đánh giá Phim (MovieRating) trong cơ sở dữ liệu.
 * Khác với ScoreRepository, đây có thể là một bảng riêng biệt nếu có các thuộc tính khác biệt
 * hoặc nếu muốn tách bạch giữa "điểm" chung và "đánh giá" cụ thể cho phim.
 * Nếu MovieRating và Score có cùng cấu trúc và mục đích, có thể gộp làm một.
 */
class MovieRatingRepository {
    /**
     * Tạo một bản ghi đánh giá phim mới.
     * @param {object} ratingData - Đối tượng chứa thông tin đánh giá (ví dụ: User_ID, Movie_ID, Rating_Value, Rating_Date, Comment).
     * @returns {Promise<MovieRating|null>} Đối tượng MovieRating đã tạo hoặc null nếu tạo thất bại.
     */
    static async create(ratingData) {
        try {
            const pool = await getConnection();
            const request = pool.request();

            request.input('User_ID', sql.Int, ratingData.User_ID);       // ID người dùng đánh giá
            request.input('Movie_ID', sql.Int, ratingData.Movie_ID);     // ID phim được đánh giá
            request.input('Rating_Value', sql.Decimal(2, 1), ratingData.Rating_Value); // Giá trị đánh giá (ví dụ: từ 1.0 đến 5.0)
            // Rating_Date: Ngày đánh giá, mặc định là thời điểm hiện tại nếu không được cung cấp
            request.input('Rating_Date', sql.DateTime, ratingData.Rating_Date ? new Date(ratingData.Rating_Date) : new Date());

            // Comment: Bình luận kèm theo đánh giá (tùy chọn)
            if (ratingData.Comment !== undefined) {
                request.input('Comment', sql.NVarChar(sql.MAX), ratingData.Comment);
            } else {
                request.input('Comment', sql.NVarChar(sql.MAX), null);
            }

            const query = `
                INSERT INTO ${fullMovieRatingTableName} (User_ID, Movie_ID, Rating_Value, Rating_Date, Comment)
                OUTPUT INSERTED.*
                VALUES (@User_ID, @Movie_ID, @Rating_Value, @Rating_Date, @Comment);
            `;

            const result = await request.query(query);
            return result.recordset[0] ? new MovieRating(result.recordset[0]) : null;
        } catch (error) {
            console.error(`[MovieRatingRepository.js] Lỗi trong hàm create: ${error.message}`);
            if (error.message.includes('FOREIGN KEY constraint')) {
                console.error('[MovieRatingRepository.js] Lỗi khóa ngoại: User_ID hoặc Movie_ID có thể không tồn tại.');
            }
            throw error;
        }
    }

    /**
     * Tìm đánh giá phim theo ID.
     * @param {number} ratingId - ID của đánh giá phim cần tìm.
     * @returns {Promise<MovieRating|null>} Đối tượng MovieRating nếu tìm thấy, ngược lại null.
     */
    static async findById(ratingId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Rating_ID', sql.Int, ratingId) // Giả định tên cột ID là Rating_ID
                .query(`SELECT * FROM ${fullMovieRatingTableName} WHERE Rating_ID = @Rating_ID`);
            return result.recordset[0] ? new MovieRating(result.recordset[0]) : null;
        } catch (error) {
            console.error(`[MovieRatingRepository.js] Lỗi trong hàm findById cho ID ${ratingId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy tất cả các đánh giá phim.
     * @returns {Promise<MovieRating[]>} Mảng các đối tượng MovieRating.
     * @description Cân nhắc thêm phân trang nếu số lượng đánh giá lớn.
     */
    static async getAll() {
        try {
            const pool = await getConnection();
            // Sắp xếp theo ngày đánh giá giảm dần
            const result = await pool.request().query(`SELECT * FROM ${fullMovieRatingTableName} ORDER BY Rating_Date DESC`);
            return result.recordset.map(record => new MovieRating(record));
        } catch (error) {
            console.error(`[MovieRatingRepository.js] Lỗi trong hàm getAll: ${error.message}`);
            throw error;
        }
    }

    /**
     * Cập nhật thông tin đánh giá phim (thường là Rating_Value hoặc Comment).
     * @param {number} ratingId - ID của đánh giá phim cần cập nhật.
     * @param {object} updateData - Đối tượng chứa các trường cần cập nhật.
     * @returns {Promise<boolean>} True nếu cập nhật thành công, false nếu không.
     */
    static async update(ratingId, updateData) {
        try {
            const pool = await getConnection();
            const request = pool.request().input('Rating_ID', sql.Int, ratingId);
            const setClauses = [];

            if (updateData.Rating_Value !== undefined) { request.input('Rating_Value', sql.Decimal(2, 1), updateData.Rating_Value); setClauses.push('Rating_Value = @Rating_Value'); }
            if (updateData.Comment !== undefined) { request.input('Comment', sql.NVarChar(sql.MAX), updateData.Comment); setClauses.push('Comment = @Comment'); }
            // User_ID, Movie_ID, Rating_Date thường không được thay đổi sau khi tạo.

            if (setClauses.length === 0) {
                console.warn('[MovieRatingRepository.js] Hàm update được gọi không có trường nào để cập nhật cho ID:', ratingId);
                return false;
            }

            const queryText = `UPDATE ${fullMovieRatingTableName} SET ${setClauses.join(', ')} WHERE Rating_ID = @Rating_ID`;
            const result = await request.query(queryText);
            return result.rowsAffected[0] > 0;
        } catch (error) {
            console.error(`[MovieRatingRepository.js] Lỗi trong hàm update cho ID ${ratingId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Xóa đánh giá phim theo ID.
     * @param {number} ratingId - ID của đánh giá phim cần xóa.
     * @returns {Promise<boolean>} True nếu xóa thành công, false nếu không.
     */
    static async remove(ratingId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Rating_ID', sql.Int, ratingId)
                .query(`DELETE FROM ${fullMovieRatingTableName} WHERE Rating_ID = @Rating_ID`);
            return result.rowsAffected[0] > 0;
        } catch (error) {
            console.error(`[MovieRatingRepository.js] Lỗi trong hàm remove cho ID ${ratingId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Tìm các đánh giá phim theo User_ID.
     * @param {number} userId - ID của người dùng.
     * @returns {Promise<MovieRating[]>} Mảng các đối tượng MovieRating của người dùng đó, sắp xếp theo ngày đánh giá giảm dần.
     */
    static async findByUserId(userId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('User_ID', sql.Int, userId)
                .query(`SELECT * FROM ${fullMovieRatingTableName} WHERE User_ID = @User_ID ORDER BY Rating_Date DESC`);
            return result.recordset.map(record => new MovieRating(record));
        } catch (error) {
            console.error(`[MovieRatingRepository.js] Lỗi trong hàm findByUserId cho User ID ${userId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Tìm các đánh giá phim theo Movie_ID.
     * @param {number} movieId - ID của phim.
     * @returns {Promise<MovieRating[]>} Mảng các đối tượng MovieRating cho phim đó, sắp xếp theo ngày đánh giá giảm dần.
     */
    static async findByMovieId(movieId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Movie_ID', sql.Int, movieId)
                .query(`SELECT * FROM ${fullMovieRatingTableName} WHERE Movie_ID = @Movie_ID ORDER BY Rating_Date DESC`);
            return result.recordset.map(record => new MovieRating(record));
        } catch (error) {
            console.error(`[MovieRatingRepository.js] Lỗi trong hàm findByMovieId cho Movie ID ${movieId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy điểm đánh giá trung bình cho một phim cụ thể.
     * @param {number} movieId - ID của phim.
     * @returns {Promise<number|null>} Điểm trung bình (ví dụ: 4.5) hoặc null nếu không có đánh giá nào.
     */
    static async getAverageRatingForMovie(movieId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Movie_ID', sql.Int, movieId)
                .query(`SELECT AVG(CAST(Rating_Value AS DECIMAL(3,1))) as AverageRating FROM ${fullMovieRatingTableName} WHERE Movie_ID = @Movie_ID`);

            if (result.recordset[0] && result.recordset[0].AverageRating !== null) {
                return parseFloat(result.recordset[0].AverageRating.toFixed(1)); // Làm tròn đến 1 chữ số thập phân
            }
            return null; // Trả về null nếu không có đánh giá hoặc AverageRating là null
        } catch (error) {
            console.error(`[MovieRatingRepository.js] Lỗi trong hàm getAverageRatingForMovie cho Movie ID ${movieId}: ${error.message}`);
            throw error;
        }
    }
}

module.exports = MovieRatingRepository; 