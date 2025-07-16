// src/repositories/seatRepository.js
const { getConnection, sql } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Repository để thao tác với dữ liệu Seat trong cơ sở dữ liệu.
 * Cung cấp các phương thức CRUD cơ bản cho entity Seat.
 * Chuyển đổi từ C# SeatRepository
 */
class SeatRepository {
    /**
     * Khởi tạo một instance mới của SeatRepository.
     * Chuyển đổi từ C# constructor
     */
    constructor() {
        this.logger = logger;
    }

    /**
     * Lấy kết nối đến cơ sở dữ liệu
     */
    async getConnection() {
        try {
            return await getConnection();
        } catch (error) {
            this.logger.error('Error getting database connection:', error);
            throw error;
        }
    }

    /**
     * Lấy tất cả ghế cho một suất chiếu cụ thể
     * Chuyển đổi từ C# GenericRepository methods
     */
    async getSeatsForShowtime(showtimeId) {
        try {
            const pool = await getConnection();

            // Lấy danh sách ghế đã được đặt trong các vé hợp lệ
            const seatsResult = await pool.request()
                .input('showtimeId', sql.Int, showtimeId)
                .query(`
                    SELECT s.*, t.Status as Ticket_Status
                    FROM ksf00691_team03.Seats s
                    INNER JOIN ksf00691_team03.Tickets t ON s.Seat_ID = t.Seat_ID
                    WHERE t.Showtime_ID = @showtimeId
                    AND t.Status NOT IN ('Cancelled', 'Expired')
                    ORDER BY s.Seat_Number ASC
                `);

            if (seatsResult.recordset.length === 0) {
                return [];
            }

            // Lấy thông tin suất chiếu
            const showtimeResult = await pool.request()
                .input('showtimeId', sql.Int, showtimeId)
                .query(`
                    SELECT s.*, m.*, cr.*,
                           m.Movie_ID, m.Movie_Name as Movie_Title, m.Duration, m.Poster_URL,
                           cr.Cinema_Room_ID, cr.Room_Name, cr.Room_Type
                    FROM ksf00691_team03.Showtimes s
                    INNER JOIN ksf00691_team03.Movies m ON s.Movie_ID = m.Movie_ID
                    INNER JOIN ksf00691_team03.Cinema_Rooms cr ON s.Cinema_Room_ID = cr.Cinema_Room_ID
                    WHERE s.Showtime_ID = @showtimeId
                `);

            const showtime = showtimeResult.recordset[0];

            // Thêm thông tin suất chiếu vào mỗi ghế
            const seatsWithShowtime = seatsResult.recordset.map(seat => {
                return {
                    ...seat,
                    Showtime: showtime ? {
                        Showtime_ID: showtime.Showtime_ID,
                        Show_Date: showtime.Show_Date,
                        Start_Time: showtime.Start_Time,
                        End_Time: showtime.End_Time,
                        Status: showtime.Status,
                        Movie: {
                            Movie_ID: showtime.Movie_ID,
                            Movie_Name: showtime.Movie_Title,
                            Duration: showtime.Duration,
                            Poster_URL: showtime.Poster_URL
                        },
                        CinemaRoom: {
                            Cinema_Room_ID: showtime.Cinema_Room_ID,
                            Room_Name: showtime.Room_Name,
                            Room_Type: showtime.Room_Type
                        }
                    } : null
                };
            });

            return seatsWithShowtime;
        } catch (error) {
            this.logger.error('Error getting seats for showtime:', error);
            throw error;
        }
    }

    /**
     * Lấy thông tin suất chiếu với các thông tin liên quan
     */
    async getShowtimeWithDetails(showtimeId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('showtimeId', sql.Int, showtimeId)
                .query(`
                    SELECT DISTINCT 
                           s.Showtime_ID, s.Movie_ID, s.Cinema_Room_ID, s.Show_Date, s.Start_Time, 
                           s.End_Time, s.Status, s.Created_At, s.Updated_At,
                           m.Movie_ID, m.Movie_Name as Movie_Title, m.Duration, m.Poster_URL,
                           cr.Cinema_Room_ID, cr.Room_Name, cr.Room_Type
                    FROM ksf00691_team03.Showtimes s
                    INNER JOIN ksf00691_team03.Movies m ON s.Movie_ID = m.Movie_ID
                    INNER JOIN ksf00691_team03.Cinema_Rooms cr ON s.Cinema_Room_ID = cr.Cinema_Room_ID
                    WHERE s.Showtime_ID = @showtimeId
                `);

            if (result.recordset.length === 0) {
                return null;
            }

            const showtime = result.recordset[0];

            // Cấu trúc lại dữ liệu để phù hợp với cấu trúc Sequelize trước đây
            return {
                Showtime_ID: showtime.Showtime_ID,
                Movie_ID: showtime.Movie_ID,
                Cinema_Room_ID: showtime.Cinema_Room_ID,
                Show_Date: showtime.Show_Date,
                Start_Time: showtime.Start_Time,
                End_Time: showtime.End_Time,
                Status: showtime.Status,
                Created_At: showtime.Created_At,
                Updated_At: showtime.Updated_At,
                Movie: {
                    Movie_ID: showtime.Movie_ID,
                    Movie_Title: showtime.Movie_Title,
                    Duration: showtime.Duration,
                    Poster_URL: showtime.Poster_URL
                },
                CinemaRoom: {
                    Cinema_Room_ID: showtime.Cinema_Room_ID,
                    Room_Name: showtime.Room_Name,
                    Room_Type: showtime.Room_Type
                }
            };
        } catch (error) {
            this.logger.error('Error getting showtime with details:', error);
            throw error;
        }
    }

    /**
     * Lấy thông tin giá vé đang hoạt động
     */
    async getActiveTicketPricings() {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .query(`
                    SELECT * FROM ksf00691_team03.Ticket_Pricing
                    WHERE Status = 'Active'
                `);

            return result.recordset;
        } catch (error) {
            this.logger.error('Error getting active ticket pricings:', error);
            throw error;
        }
    }

    /**
     * Tạo ghế mới
     */
    async createSeat(seatData) {
        try {
            const pool = await getConnection();
            const request = pool.request();

            // Thêm các tham số cho câu lệnh INSERT
            Object.keys(seatData).forEach(key => {
                let paramType;
                switch (key) {
                    case 'Seat_ID':
                    case 'Showtime_ID':
                    case 'Row_Number':
                    case 'Seat_Number':
                        paramType = sql.Int;
                        break;
                    case 'Status':
                    case 'Seat_Type':
                        paramType = sql.NVarChar;
                        break;
                    case 'Price':
                        paramType = sql.Decimal(10, 2);
                        break;
                    case 'Created_At':
                    case 'Updated_At':
                        paramType = sql.DateTime;
                        break;
                    default:
                        paramType = sql.NVarChar;
                }

                request.input(key, paramType, seatData[key]);
            });

            // Tạo câu lệnh INSERT động dựa trên các trường có trong seatData
            const columns = Object.keys(seatData).join(', ');
            const paramNames = Object.keys(seatData).map(key => `@${key}`).join(', ');

            const result = await request.query(`
                INSERT INTO ksf00691_team03.Seats (${columns})
                OUTPUT INSERTED.*
                VALUES (${paramNames})
            `);

            return result.recordset[0];
        } catch (error) {
            this.logger.error('Error creating seat:', error);
            throw error;
        }
    }

    /**
     * Cập nhật thông tin ghế
     */
    async updateSeat(seatId, updateData) {
        try {
            const pool = await getConnection();
            const request = pool.request();

            // Thêm tham số ID ghế
            request.input('seatId', sql.Int, seatId);

            // Tạo câu lệnh UPDATE động
            const setClauses = [];
            Object.keys(updateData).forEach(key => {
                let paramType;
                switch (key) {
                    case 'Showtime_ID':
                    case 'Row_Number':
                    case 'Seat_Number':
                        paramType = sql.Int;
                        break;
                    case 'Status':
                    case 'Seat_Type':
                        paramType = sql.NVarChar;
                        break;
                    case 'Price':
                        paramType = sql.Decimal(10, 2);
                        break;
                    case 'Updated_At':
                        paramType = sql.DateTime;
                        break;
                    default:
                        paramType = sql.NVarChar;
                }

                request.input(key, paramType, updateData[key]);
                setClauses.push(`${key} = @${key}`);
            });

            // Thêm Updated_At nếu chưa có
            if (!updateData.Updated_At) {
                request.input('Updated_At', sql.DateTime, new Date());
                setClauses.push('Updated_At = @Updated_At');
            }

            const result = await request.query(`
                UPDATE ksf00691_team03.Seats
                SET ${setClauses.join(', ')}
                OUTPUT INSERTED.*
                WHERE Seat_ID = @seatId
            `);

            if (result.rowsAffected[0] === 0) {
                return null;
            }

            return result.recordset[0];
        } catch (error) {
            this.logger.error('Error updating seat:', error);
            throw error;
        }
    }

    /**
     * Xóa ghế
     */
    async deleteSeat(seatId) {
        try {
            const pool = await getConnection();

            // Kiểm tra xem ghế có đang được sử dụng trong vé không
            const checkResult = await pool.request()
                .input('seatId', sql.Int, seatId)
                .query(`
                    SELECT COUNT(*) AS TicketCount
                    FROM ksf00691_team03.Tickets
                    WHERE Seat_ID = @seatId
                `);

            if (checkResult.recordset[0].TicketCount > 0) {
                this.logger.error(`Không thể xóa ghế ${seatId} vì ghế này đang được sử dụng trong các vé hiện tại`);
                throw new Error(`Không thể xóa ghế ${seatId} vì ghế này đang được sử dụng trong các vé hiện tại`);
            }

            const result = await pool.request()
                .input('seatId', sql.Int, seatId)
                .query(`
                    DELETE FROM ksf00691_team03.Seats
                    WHERE Seat_ID = @seatId
                `);

            return result.rowsAffected[0] > 0;
        } catch (error) {
            this.logger.error(`Lỗi khi xóa ghế ${seatId}:`, error);
            throw error;
        }
    }

    /**
     * Lấy ghế theo ID
     */
    async getSeatById(seatId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('seatId', sql.Int, seatId)
                .query(`
                    SELECT * FROM ksf00691_team03.Seats
                    WHERE Seat_ID = @seatId
                `);

            if (result.recordset.length === 0) {
                return null;
            }

            return result.recordset[0];
        } catch (error) {
            this.logger.error('Error getting seat by ID:', error);
            throw error;
        }
    }
}

module.exports = new SeatRepository();
