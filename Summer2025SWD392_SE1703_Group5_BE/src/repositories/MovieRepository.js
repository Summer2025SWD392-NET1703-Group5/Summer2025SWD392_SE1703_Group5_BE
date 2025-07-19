const { getConnection, sql } = require('../config/database');
const Movie = require('../models/Movie'); // Giả định model Movie đã tồn tại

const fullMovieTableName = 'ksf00691_team03.Movies'; // Điều chỉnh nếu tên bảng của bạn khác

/**
 * Lớp Repository để thao tác với dữ liệu Phim (Movie) trong cơ sở dữ liệu.
 */
class MovieRepository {
    /**
     * Tạo một bản ghi phim mới.
     * @param {object} movieData - Đối tượng chứa thông tin chi tiết phim.
     * @returns {Promise<Movie|null>} Đối tượng Movie đã tạo hoặc null nếu tạo thất bại.
     */
    static async create(movieData) {
        try {
            const pool = await getConnection();
            const request = pool.request();

            // Các trường bắt buộc
            request.input('Movie_Name', sql.NVarChar(255), movieData.Movie_Name);
            request.input('Director', sql.NVarChar(255), movieData.Director);
            request.input('Release_Date', sql.Date, new Date(movieData.Release_Date));
            request.input('Duration_Minutes', sql.Int, movieData.Duration_Minutes);
            request.input('Language', sql.NVarChar(50), movieData.Language);
            request.input('Country', sql.NVarChar(100), movieData.Country);
            request.input('Genre', sql.NVarChar(255), movieData.Genre); // Có thể là một chuỗi các thể loại, ví dụ: "Action, Thriller"

            // Các trường tùy chọn
            if (movieData.Description !== undefined) request.input('Description', sql.NVarChar(sql.MAX), movieData.Description);
            else request.input('Description', sql.NVarChar(sql.MAX), null);

            if (movieData.Poster_URL !== undefined) request.input('Poster_URL', sql.NVarChar(sql.MAX), movieData.Poster_URL);
            else request.input('Poster_URL', sql.NVarChar(sql.MAX), null);

            if (movieData.Trailer_URL !== undefined) request.input('Trailer_URL', sql.NVarChar(sql.MAX), movieData.Trailer_URL);
            else request.input('Trailer_URL', sql.NVarChar(sql.MAX), null);

            request.input('Rating_Average', sql.Decimal(3, 1), movieData.Rating_Average !== undefined ? movieData.Rating_Average : null); // Điểm đánh giá trung bình, có thể là null ban đầu
            request.input('Status', sql.NVarChar(50), movieData.Status || 'Showing'); // Trạng thái phim, ví dụ: 'Showing', 'Upcoming', 'Ended'
            if (movieData.Age_Rating !== undefined) request.input('Age_Rating', sql.NVarChar(20), movieData.Age_Rating); // Ví dụ: 'P', 'C13', 'C16', 'C18'
            else request.input('Age_Rating', sql.NVarChar(20), null);

            // Ngày tạo và cập nhật sẽ được xử lý tự động bởi GETDATE() trong SQL

            const query = `
                INSERT INTO ${fullMovieTableName} (
                    Movie_Name, Director, Release_Date, Duration_Minutes, Language, Country, Genre, Description, 
                    Poster_URL, Trailer_URL, Rating_Average, Status, Age_Rating, Created_At, Updated_At
                )
                OUTPUT INSERTED.*
                VALUES (
                    @Movie_Name, @Director, @Release_Date, @Duration_Minutes, @Language, @Country, @Genre, @Description, 
                    @Poster_URL, @Trailer_URL, @Rating_Average, @Status, @Age_Rating, GETDATE(), GETDATE()
                );
            `;

            const result = await request.query(query);
            return result.recordset[0] ? new Movie(result.recordset[0]) : null;
        } catch (error) {
            console.error(`[MovieRepository.js] Lỗi trong hàm create: ${error.message}`);
            if (error.message.includes('UNIQUE KEY constraint') && error.message.includes('Movie_Name')) {
                // Giả định có một ràng buộc UNIQUE cho Movie_Name và Release_Date để tránh trùng lặp phim
                console.error(`[MovieRepository.js] Lỗi: Phim với tên '${movieData.Movie_Name}' và ngày phát hành có thể đã tồn tại.`);
            }
            throw error;
        }
    }

    /**
     * Tìm phim theo ID.
     * @param {number} movieId - ID của phim cần tìm.
     * @returns {Promise<Movie|null>} Đối tượng Movie nếu tìm thấy, ngược lại null.
     */
    static async findById(movieId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Movie_ID', sql.Int, movieId)
                .query(`SELECT * FROM ${fullMovieTableName} WHERE Movie_ID = @Movie_ID`);
            return result.recordset[0] ? new Movie(result.recordset[0]) : null;
        } catch (error) {
            console.error(`[MovieRepository.js] Lỗi trong hàm findById cho ID ${movieId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy tất cả các phim.
     * @returns {Promise<Movie[]>} Mảng các đối tượng Movie.
     * @description Cân nhắc thêm phân trang nếu số lượng phim lớn.
     */
    static async getAll() {
        try {
            const pool = await getConnection();
            // Sắp xếp theo ngày phát hành giảm dần (phim mới nhất lên đầu)
            const result = await pool.request().query(`SELECT * FROM ${fullMovieTableName} ORDER BY Release_Date DESC, Movie_Name ASC`);
            return result.recordset.map(record => new Movie(record));
        } catch (error) {
            console.error(`[MovieRepository.js] Lỗi trong hàm getAll: ${error.message}`);
            throw error;
        }
    }

    /**
     * Cập nhật thông tin phim hiện có.
     * @param {number} movieId - ID của phim cần cập nhật.
     * @param {object} updateData - Đối tượng chứa các trường cần cập nhật.
     * @returns {Promise<boolean>} True nếu cập nhật thành công, false nếu không.
     */
    static async update(movieId, updateData) {
        try {
            const pool = await getConnection();
            const request = pool.request().input('Movie_ID', sql.Int, movieId);
            const setClauses = [];

            if (updateData.Movie_Name !== undefined) { request.input('Movie_Name', sql.NVarChar(255), updateData.Movie_Name); setClauses.push('Movie_Name = @Movie_Name'); }
            if (updateData.Director !== undefined) { request.input('Director', sql.NVarChar(255), updateData.Director); setClauses.push('Director = @Director'); }
            if (updateData.Release_Date !== undefined) { request.input('Release_Date', sql.Date, new Date(updateData.Release_Date)); setClauses.push('Release_Date = @Release_Date'); }
            if (updateData.Duration_Minutes !== undefined) { request.input('Duration_Minutes', sql.Int, updateData.Duration_Minutes); setClauses.push('Duration_Minutes = @Duration_Minutes'); }
            if (updateData.Language !== undefined) { request.input('Language', sql.NVarChar(50), updateData.Language); setClauses.push('Language = @Language'); }
            if (updateData.Country !== undefined) { request.input('Country', sql.NVarChar(100), updateData.Country); setClauses.push('Country = @Country'); }
            if (updateData.Genre !== undefined) { request.input('Genre', sql.NVarChar(255), updateData.Genre); setClauses.push('Genre = @Genre'); }
            if (updateData.Description !== undefined) { request.input('Description', sql.NVarChar(sql.MAX), updateData.Description); setClauses.push('Description = @Description'); }
            else if (updateData.hasOwnProperty('Description') && updateData.Description === null) { setClauses.push('Description = NULL'); } // Cho phép đặt thành null

            if (updateData.Poster_URL !== undefined) { request.input('Poster_URL', sql.NVarChar(sql.MAX), updateData.Poster_URL); setClauses.push('Poster_URL = @Poster_URL'); }
            else if (updateData.hasOwnProperty('Poster_URL') && updateData.Poster_URL === null) { setClauses.push('Poster_URL = NULL'); }

            if (updateData.Trailer_URL !== undefined) { request.input('Trailer_URL', sql.NVarChar(sql.MAX), updateData.Trailer_URL); setClauses.push('Trailer_URL = @Trailer_URL'); }
            else if (updateData.hasOwnProperty('Trailer_URL') && updateData.Trailer_URL === null) { setClauses.push('Trailer_URL = NULL'); }

            if (updateData.Rating_Average !== undefined) { request.input('Rating_Average', sql.Decimal(3, 1), updateData.Rating_Average); setClauses.push('Rating_Average = @Rating_Average'); }
            else if (updateData.hasOwnProperty('Rating_Average') && updateData.Rating_Average === null) { setClauses.push('Rating_Average = NULL'); }

            if (updateData.Status !== undefined) { request.input('Status', sql.NVarChar(50), updateData.Status); setClauses.push('Status = @Status'); }
            if (updateData.Age_Rating !== undefined) { request.input('Age_Rating', sql.NVarChar(20), updateData.Age_Rating); setClauses.push('Age_Rating = @Age_Rating'); }
            else if (updateData.hasOwnProperty('Age_Rating') && updateData.Age_Rating === null) { setClauses.push('Age_Rating = NULL'); }

            if (setClauses.length === 0) {
                console.warn('[MovieRepository.js] Hàm update được gọi không có trường nào để cập nhật cho ID:', movieId);
                return false;
            }
            setClauses.push('Updated_At = GETDATE()'); // Luôn cập nhật thời gian sửa đổi

            const queryText = `UPDATE ${fullMovieTableName} SET ${setClauses.join(', ')} WHERE Movie_ID = @Movie_ID`;
            const result = await request.query(queryText);
            return result.rowsAffected[0] > 0;
        } catch (error) {
            console.error(`[MovieRepository.js] Lỗi trong hàm update cho ID ${movieId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Xóa phim theo ID.
     * @param {number} movieId - ID của phim cần xóa.
     * @returns {Promise<boolean>} True nếu xóa thành công, false nếu không.
     * @description Cân nhắc xóa mềm (ví dụ: thay đổi Status thành 'Deleted') thay vì xóa cứng, đặc biệt nếu có dữ liệu liên quan (lịch chiếu, đánh giá).
     */
    static async remove(movieId) {
        try {
            const pool = await getConnection();
            // Trước khi xóa, cần kiểm tra các ràng buộc khóa ngoại, ví dụ: phim có lịch chiếu đang hoạt động không?
            // Ví dụ: SELECT COUNT(*) FROM Showtimes WHERE Movie_ID = @movieId AND Status = 'Active'
            // Nếu có, có thể không cho xóa hoặc yêu cầu xóa các lịch chiếu đó trước.
            const result = await pool.request()
                .input('Movie_ID', sql.Int, movieId)
                .query(`DELETE FROM ${fullMovieTableName} WHERE Movie_ID = @Movie_ID`);
            // Nếu xóa thành công và có các đánh giá liên quan (Scores/MovieRatings), có thể cần xóa chúng hoặc xử lý.
            return result.rowsAffected[0] > 0;
        } catch (error) {
            console.error(`[MovieRepository.js] Lỗi trong hàm remove cho ID ${movieId}: ${error.message}`);
            // Bắt lỗi ràng buộc khóa ngoại nếu phim không thể xóa do có lịch chiếu liên quan
            if (error.message.includes('The DELETE statement conflicted with the REFERENCE constraint')) {
                console.error(`[MovieRepository.js] Không thể xóa phim ID ${movieId} do có dữ liệu liên quan (ví dụ: lịch chiếu, đánh giá).`);
                // Có thể throw một lỗi tùy chỉnh hoặc trả về false với thông báo cụ thể hơn.
            }
            throw error;
        }
    }

    /**
     * Tìm kiếm phim theo tên (Movie_Name).
     * @param {string} nameQuery - Chuỗi truy vấn tên phim (tìm kiếm một phần, không phân biệt chữ hoa chữ thường).
     * @returns {Promise<Movie[]>} Mảng các đối tượng Movie phù hợp.
     */
    static async searchByName(nameQuery) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('NameQuery', sql.NVarChar, `%${nameQuery}%`) // Sử dụng % để tìm kiếm một phần
                .query(`SELECT * FROM ${fullMovieTableName} WHERE Movie_Name LIKE @NameQuery ORDER BY Release_Date DESC, Movie_Name ASC`);
            return result.recordset.map(record => new Movie(record));
        } catch (error) {
            console.error(`[MovieRepository.js] Lỗi trong hàm searchByName với truy vấn '${nameQuery}': ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy các phim theo trạng thái (ví dụ: 'Showing', 'Upcoming').
     * @param {string} status - Trạng thái phim cần lọc.
     * @returns {Promise<Movie[]>} Mảng các đối tượng Movie có trạng thái đó.
     */
    static async findByStatus(status) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Status', sql.NVarChar(50), status)
                .query(`SELECT * FROM ${fullMovieTableName} WHERE Status = @Status ORDER BY Release_Date DESC, Movie_Name ASC`);
            return result.recordset.map(record => new Movie(record));
        } catch (error) {
            console.error(`[MovieRepository.js] Lỗi trong hàm findByStatus với trạng thái '${status}': ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy các phim theo thể loại.
     * @param {string} genre - Thể loại phim cần lọc (tìm kiếm chính xác hoặc một phần tùy theo thiết kế).
     * @returns {Promise<Movie[]>} Mảng các đối tượng Movie thuộc thể loại đó.
     */
    static async findByGenre(genre) {
        try {
            const pool = await getConnection();
            // Truy vấn này tìm các phim có thể loại CHỨA chuỗi genre được cung cấp.
            // Nếu cột Genre lưu nhiều thể loại dạng "Action, Comedy", thì tìm "Action" sẽ khớp.
            const result = await pool.request()
                .input('GenreQuery', sql.NVarChar, `%${genre}%`)
                .query(`SELECT * FROM ${fullMovieTableName} WHERE Genre LIKE @GenreQuery ORDER BY Release_Date DESC, Movie_Name ASC`);
            return result.recordset.map(record => new Movie(record));
        } catch (error) {
            console.error(`[MovieRepository.js] Lỗi trong hàm findByGenre với thể loại '${genre}': ${error.message}`);
            throw error;
        }
    }
}

module.exports = MovieRepository;
