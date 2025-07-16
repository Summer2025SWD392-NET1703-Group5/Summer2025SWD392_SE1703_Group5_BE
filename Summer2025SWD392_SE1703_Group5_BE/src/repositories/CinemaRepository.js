const { getConnection, sql } = require('../config/database');
const { Cinema, CinemaRoom } = require('../models');
const { Op } = require('sequelize');

const fullCinemaTableName = 'ksf00691_team03.Cinemas';

/**
 * Lớp Repository để thao tác với dữ liệu Rạp phim (Cinema) trong cơ sở dữ liệu.
 */
class CinemaRepository {
    /**
     * Tạo một rạp phim mới.
     * @param {object} cinemaData - Đối tượng chứa thông tin chi tiết rạp phim.
     * @returns {Promise<Cinema|null>} Đối tượng Cinema đã tạo hoặc null nếu tạo thất bại.
     */
    static async create(cinemaData) {
        try {
            const pool = await getConnection();
            const request = pool.request();

            // Loại bỏ Cinema_ID nếu được cung cấp, vì đây là auto-increment
            const { Cinema_ID, ...validCinemaData } = cinemaData;

            request.input('Cinema_Name', sql.NVarChar(100), validCinemaData.Cinema_Name);
            request.input('Address', sql.NVarChar(255), validCinemaData.Address);
            request.input('City', sql.NVarChar(50), validCinemaData.City);
            request.input('Status', sql.NVarChar(20), validCinemaData.Status || 'Active');

            if (validCinemaData.Description) {
                request.input('Description', sql.NVarChar(sql.MAX), validCinemaData.Description);
            } else {
                request.input('Description', sql.NVarChar(sql.MAX), null);
            }

            const currentTime = new Date();
            request.input('Created_At', sql.DateTime, currentTime);
            request.input('Updated_At', sql.DateTime, null);

            const query = `
                INSERT INTO ${fullCinemaTableName} (
                    Cinema_Name, 
                    Address, 
                    City, 
                    Description, 
                    Status,
                    Created_At,
                    Updated_At
                )
                OUTPUT INSERTED.*
                VALUES (
                    @Cinema_Name, 
                    @Address, 
                    @City, 
                    @Description, 
                    @Status,
                    @Created_At,
                    @Updated_At
                );
            `;

            const result = await request.query(query);
            return result.recordset[0] || null;
        } catch (error) {
            console.error(`[CinemaRepository.js] Lỗi trong hàm create: ${error.message}`);
            if (error.message.includes('UNIQUE KEY constraint') && error.message.includes('Cinema_Name')) {
                console.error(`[CinemaRepository.js] Lỗi: Tên rạp phim '${cinemaData.Cinema_Name}' đã tồn tại.`);
            }
            throw error;
        }
    }

    /**
     * Tìm rạp phim theo ID.
     * @param {number} cinemaId - ID của rạp phim cần tìm.
     * @returns {Promise<Cinema|null>} Đối tượng Cinema nếu tìm thấy, ngược lại null.
     */
    static async findById(cinemaId) {
        return await Cinema.findByPk(cinemaId, {
            include: [{
                model: CinemaRoom,
                as: 'CinemaRooms'
            }]
        });
    }

    /**
     * Lấy tất cả các rạp phim (Active, Inactive - không bao gồm rạp đã xóa mềm).
     * @returns {Promise<Cinema[]>} Mảng các đối tượng Cinema.
     */
    static async getAll() {
        try {
            const pool = await getConnection();
            const result = await pool.request().query(`
                SELECT * FROM Cinemas
                WHERE Status != 'Deleted'
                ORDER BY Cinema_Name
            `);

            console.log(`[CinemaRepository.js] getAll: Lấy được ${result.recordset.length} rạp phim (bao gồm Active, Inactive - không bao gồm rạp đã xóa)`);
            return result.recordset;
        } catch (error) {
            console.error('Error in getAll:', error);
            throw error;
        }
    }

    /**
     * Cập nhật thông tin rạp phim hiện có.
     * @param {number} cinemaId - ID của rạp phim cần cập nhật.
     * @param {object} updateData - Đối tượng chứa các trường cần cập nhật.
     * @returns {Promise<boolean>} True nếu cập nhật thành công, false nếu không.
     */
    static async update(cinemaId, updateData) {
        return await Cinema.update(updateData, {
            where: { Cinema_ID: cinemaId }
        });
    }

    static async updateInTransaction(cinemaId, data, transaction) {
        return await Cinema.update(data, {
            where: { Cinema_ID: cinemaId },
            transaction
        });
    }

    /**
     * Xóa mềm rạp phim theo ID (cập nhật Status thành 'Deleted').
     * @param {number} cinemaId - ID của rạp phim cần xóa mềm.
     * @returns {Promise<boolean>} True nếu xóa mềm thành công, false nếu không.
     */
    static async remove(cinemaId) {
        try {
            const pool = await getConnection();
            // Thực hiện xóa mềm bằng cách cập nhật Status thành 'Deleted'
            const result = await pool.request()
                .input('Cinema_ID', sql.Int, cinemaId)
                .query(`
                    UPDATE ${fullCinemaTableName}
                    SET Status = 'Deleted', Updated_At = GETDATE()
                    WHERE Cinema_ID = @Cinema_ID AND Status != 'Deleted'
                `);

            console.log(`[CinemaRepository.js] Xóa mềm rạp ID ${cinemaId}: ${result.rowsAffected[0]} rows affected`);
            return result.rowsAffected[0] > 0;
        } catch (error) {
            console.error(`[CinemaRepository.js] Lỗi trong hàm remove (xóa mềm) cho ID ${cinemaId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy các rạp phim đang hoạt động (có Status là 'Active').
     * @returns {Promise<Cinema[]>} Mảng các đối tượng Cinema đang hoạt động.
     */
    static async getActiveCinemas() {
        try {
            const activeCinemas = await Cinema.findAll({
                where: {
                    Status: 'Active'
                },
                order: [['Cinema_ID', 'ASC']]
            });
            return activeCinemas;
        } catch (error) {
            console.error(`[CinemaRepository.js] Lỗi trong hàm getActiveCinemas: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy danh sách rạp phim theo thành phố.
     * @param {string} city - Tên thành phố.
     * @returns {Promise<Cinema[]>} Mảng các đối tượng Cinema thuộc thành phố.
     */
    static async getCinemasByCity(city) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('City', sql.NVarChar(50), city)
                .query(`SELECT * FROM ${fullCinemaTableName} WHERE City = @City AND Status != 'Deleted' ORDER BY Cinema_Name`);
            return result.recordset;
        } catch (error) {
            console.error(`[CinemaRepository.js] Lỗi trong hàm getCinemasByCity cho thành phố ${city}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy danh sách các thành phố có rạp phim.
     * @returns {Promise<string[]>} Mảng tên thành phố.
     */
    static async getAllCities() {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .query(`SELECT DISTINCT City FROM ${fullCinemaTableName} WHERE Status = 'Active' ORDER BY City`);
            return result.recordset.map(record => record.City);
        } catch (error) {
            console.error(`[CinemaRepository.js] Lỗi trong hàm getAllCities: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy danh sách phòng chiếu của một rạp phim.
     * @param {number} cinemaId - ID của rạp phim.
     * @returns {Promise<object[]>} Mảng các phòng chiếu.
     */
    static async getRoomsByCinemaId(cinemaId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Cinema_ID', sql.Int, cinemaId)
                .query(`
                    SELECT * FROM ksf00691_team03.Cinema_Rooms 
                    WHERE Cinema_ID = @Cinema_ID 
                    ORDER BY Room_Name
                `);
            return result.recordset;
        } catch (error) {
            console.error(`[CinemaRepository.js] Lỗi trong hàm getRoomsByCinemaId cho cinema ID ${cinemaId}: ${error.message}`);
            throw error;
        }
    }
    /**
 * Lấy danh sách suất chiếu của một rạp phim theo ngày
 * @param {number} cinemaId - ID của rạp phim
 * @param {string} date - Ngày theo định dạng YYYY-MM-DD
 * @returns {Promise<Array>} - Danh sách suất chiếu
 */
    static async getCinemaShowtimesByDate(cinemaId, date) {
        try {
            const pool = await getConnection();
            const request = pool.request();

            request.input('Cinema_ID', sql.Int, cinemaId);
            request.input('Show_Date', sql.Date, date);

            const query = `
            SELECT 
                s.Showtime_ID,
                s.Movie_ID,
                m.Movie_Name,
                s.Cinema_Room_ID,
                cr.Room_Name,
                s.Show_Date,
                s.Start_Time,
                s.End_Time,
                s.Status,
                s.Capacity_Available,
                s.Capacity_Total,
                m.Poster_URL,
                m.Duration
            FROM ksf00691_team03.Showtimes s
            INNER JOIN ksf00691_team03.Movies m ON s.Movie_ID = m.Movie_ID
            INNER JOIN ksf00691_team03.Cinema_Rooms cr ON s.Cinema_Room_ID = cr.Cinema_Room_ID
            WHERE cr.Cinema_ID = @Cinema_ID 
            AND s.Show_Date = @Show_Date
            AND s.Status = 'Active'
            ORDER BY s.Start_Time
        `;

            const result = await request.query(query);
            return result.recordset;
        } catch (error) {
            console.error(`[CinemaRepository.js] Lỗi trong hàm getCinemaShowtimesByDate cho cinemaId ${cinemaId} và date ${date}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Xóa một rạp phim
     * @param {number} cinemaId - ID của rạp phim
     * @returns {Promise<number>}
     */
    static async delete(cinemaId) {
        return await Cinema.destroy({
            where: { Cinema_ID: cinemaId }
        });
    }

    async getAllWithRooms() {
        try {
            const pool = await getConnection();

            // Lấy tất cả rạp phim (Active, Inactive - không bao gồm rạp đã xóa mềm)
            const cinemasResult = await pool.request().query(`
                SELECT * FROM Cinemas
                WHERE Status != 'Deleted'
                ORDER BY Cinema_Name
            `);

            const cinemas = cinemasResult.recordset;

            // Lấy tất cả phòng chiếu cho các rạp phim
            for (const cinema of cinemas) {
                const roomsResult = await pool.request()
                    .input('cinemaId', sql.Int, cinema.Cinema_ID)
                    .query(`
                        SELECT * FROM Cinema_Rooms
                        WHERE Cinema_ID = @cinemaId AND Status = 'Active'
                        ORDER BY Room_Name
                    `);

                cinema.Rooms = roomsResult.recordset;
            }

            return cinemas;
        } catch (error) {
            console.error('Error in getAllWithRooms:', error);
            throw error;
        }
    }

    async getById(id) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('id', sql.Int, id)
                .query(`
                    SELECT * FROM Cinemas
                    WHERE Cinema_ID = @id
                `);

            if (result.recordset.length === 0) {
                return null;
            }

            return result.recordset[0];
        } catch (error) {
            console.error('Error in getById:', error);
            throw error;
        }
    }

    async getByIdWithRooms(id) {
        try {
            const pool = await getConnection();

            // Lấy thông tin rạp phim
            const cinemaResult = await pool.request()
                .input('id', sql.Int, id)
                .query(`
                    SELECT * FROM Cinemas
                    WHERE Cinema_ID = @id
                `);

            if (cinemaResult.recordset.length === 0) {
                return null;
            }

            const cinema = cinemaResult.recordset[0];

            // Lấy tất cả phòng chiếu của rạp phim
            const roomsResult = await pool.request()
                .input('cinemaId', sql.Int, id)
                .query(`
                    SELECT * FROM Cinema_Rooms
                    WHERE Cinema_ID = @cinemaId AND Status = 'Active'
                    ORDER BY Room_Name
                `);

            cinema.Rooms = roomsResult.recordset;

            return cinema;
        } catch (error) {
            console.error('Error in getByIdWithRooms:', error);
            throw error;
        }
    }

    async update(id, cinemaData) {
        try {
            const pool = await getConnection();

            // Xây dựng câu truy vấn UPDATE động
            let query = 'UPDATE Cinemas SET ';
            const request = pool.request();

            // Thêm các trường cần cập nhật vào câu truy vấn
            const updateFields = Object.keys(cinemaData);
            updateFields.forEach((field, index) => {
                query += `${field} = @${field}`;
                if (index < updateFields.length - 1) {
                    query += ', ';
                }

                // Xác định kiểu dữ liệu SQL phù hợp
                let sqlType;
                if (field === 'Created_At' || field === 'Updated_At') {
                    sqlType = sql.DateTime;
                } else if (field === 'Created_By' || field === 'Updated_By') {
                    sqlType = sql.Int;
                } else {
                    sqlType = sql.NVarChar;
                }

                request.input(field, sqlType, cinemaData[field]);
            });

            query += ' WHERE Cinema_ID = @id';
            request.input('id', sql.Int, id);

            const result = await request.query(query);
            return result.rowsAffected[0];
        } catch (error) {
            console.error('Error in update:', error);
            throw error;
        }
    }

    async delete(id) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('id', sql.Int, id)
                .query(`
                    DELETE FROM Cinemas
                    WHERE Cinema_ID = @id
                `);

            return result.rowsAffected[0] > 0;
        } catch (error) {
            console.error('Error in delete:', error);
            throw error;
        }
    }

    async softDelete(id, updatedBy) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('id', sql.Int, id)
                .input('updatedAt', sql.DateTime, new Date())
                .input('updatedBy', sql.Int, updatedBy)
                .query(`
                    UPDATE Cinemas
                    SET Status = 'Inactive', Updated_At = @updatedAt, Updated_By = @updatedBy
                    WHERE Cinema_ID = @id
                `);

            return result.rowsAffected[0] > 0;
        } catch (error) {
            console.error('Error in softDelete:', error);
            throw error;
        }
    }

    async search(term) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('term', sql.NVarChar, `%${term}%`)
                .query(`
                    SELECT * FROM Cinemas
                    WHERE (Cinema_Name LIKE @term OR Address LIKE @term)
                    AND Status = 'Active'
                    ORDER BY Cinema_Name
                `);

            return result.recordset;
        } catch (error) {
            console.error('Error in search:', error);
            throw error;
        }
    }

    async getCinemasByMovieId(movieId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('movieId', sql.Int, movieId)
                .query(`
                    SELECT DISTINCT c.*
                    FROM Cinemas c
                    JOIN Cinema_Rooms cr ON c.Cinema_ID = cr.Cinema_ID
                    JOIN Showtimes s ON cr.Cinema_Room_ID = s.Cinema_Room_ID
                    WHERE s.Movie_ID = @movieId
                    AND s.Status = 'Active'
                    AND c.Status = 'Active'
                    AND s.Show_Date >= CAST(GETDATE() AS DATE)
                    ORDER BY c.Cinema_Name
                `);

            return result.recordset;
        } catch (error) {
            console.error('Error in getCinemasByMovieId:', error);
            throw error;
        }
    }

    async getCinemasWithActiveMovies() {
        try {
            const pool = await getConnection();

            // Lấy tất cả rạp phim có phim đang chiếu
            const cinemasResult = await pool.request().query(`
                SELECT DISTINCT c.*
                FROM Cinemas c
                JOIN Cinema_Rooms cr ON c.Cinema_ID = cr.Cinema_ID
                JOIN Showtimes s ON cr.Cinema_Room_ID = s.Cinema_Room_ID
                JOIN Movies m ON s.Movie_ID = m.Movie_ID
                WHERE s.Status = 'Active'
                AND c.Status != 'Deleted'
                AND m.Status = 'Active'
                AND s.Show_Date >= CAST(GETDATE() AS DATE)
                ORDER BY c.Cinema_Name
            `);

            const cinemas = cinemasResult.recordset;

            // Lấy phim đang chiếu cho mỗi rạp
            for (const cinema of cinemas) {
                const moviesResult = await pool.request()
                    .input('cinemaId', sql.Int, cinema.Cinema_ID)
                    .query(`
                        SELECT DISTINCT m.*
                        FROM Movies m
                        JOIN Showtimes s ON m.Movie_ID = s.Movie_ID
                        JOIN Cinema_Rooms cr ON s.Cinema_Room_ID = cr.Cinema_Room_ID
                        WHERE cr.Cinema_ID = @cinemaId
                        AND s.Status = 'Active'
                        AND m.Status = 'Active'
                        AND s.Show_Date >= CAST(GETDATE() AS DATE)
                        ORDER BY m.Title
                    `);

                cinema.Movies = moviesResult.recordset;
            }

            return cinemas;
        } catch (error) {
            console.error('Error in getCinemasWithActiveMovies:', error);
            throw error;
        }
    }
}

module.exports = CinemaRepository; 