const { getConnection, sql } = require('../config/database');
const logger = require('../utils/logger');

class TicketBookingRepository {
    constructor() {
        this.logger = logger;
    }

    async create(bookingData, transaction = null) {
        try {
            let pool;
            let request;

            // Sử dụng transaction nếu có
            if (transaction) {
                request = transaction.request();
            } else {
                pool = await getConnection();
                request = pool.request();
            }

            // Thêm các tham số cho câu lệnh INSERT
            Object.keys(bookingData).forEach(key => {
                let paramType;
                switch (key) {
                    case 'Booking_ID':
                    case 'User_ID':
                    case 'Showtime_ID':
                    case 'Promotion_ID':
                    case 'Created_By':
                    case 'Updated_By':
                        paramType = sql.Int;
                        break;
                    case 'Total_Price':
                    case 'Discount_Amount':
                        paramType = sql.Decimal(10, 2);
                        break;
                    case 'Booking_Date':
                    case 'Created_At':
                    case 'Updated_At':
                        paramType = sql.DateTime;
                        break;
                    default:
                        paramType = sql.NVarChar;
                }

                request.input(key, paramType, bookingData[key]);
            });

            // Tạo câu lệnh INSERT động dựa trên các trường có trong bookingData
            const columns = Object.keys(bookingData).join(', ');
            const paramNames = Object.keys(bookingData).map(key => `@${key}`).join(', ');

            const result = await request.query(`
                INSERT INTO Ticket_Bookings (${columns})
                OUTPUT INSERTED.*
                VALUES (${paramNames})
            `);

            return result.recordset[0];
        } catch (error) {
            this.logger.error('Error creating ticket booking:', error);
            throw error;
        }
    }

    async findById(bookingId, transaction = null) {
        try {
            let pool;
            let request;

            // Sử dụng transaction nếu có
            if (transaction) {
                request = transaction.request();
            } else {
                pool = await getConnection();
                request = pool.request();
            }

            const result = await request
                .input('bookingId', sql.Int, bookingId)
                .query('SELECT * FROM Ticket_Bookings WHERE Booking_ID = @bookingId');

            return result.recordset[0] || null;
        } catch (error) {
            this.logger.error('Error finding booking by ID:', error);
            throw error;
        }
    }

    async findByIdWithAssociations(bookingId, transaction = null) {
        try {
            let pool;
            let request;

            // Sử dụng transaction nếu có
            if (transaction) {
                request = transaction.request();
            } else {
                pool = await getConnection();
                request = pool.request();
            }

            // Lấy thông tin đặt vé
            const bookingResult = await request
                .input('bookingId', sql.Int, bookingId)
                .query(`
                    SELECT tb.*, u.Full_Name, u.Email, 
                           s.Show_Date, s.Start_Time, s.End_Time,
                           m.Movie_ID, m.Movie_Name as Movie_Title, m.Poster_URL,
                           cr.Cinema_Room_ID, cr.Room_Name, cr.Room_Type,
                           p.Promotion_ID, p.Promotion_Code, p.Discount_Type, p.Discount_Value
                    FROM Ticket_Bookings tb
                    LEFT JOIN Users u ON tb.User_ID = u.User_ID
                    LEFT JOIN Showtimes s ON tb.Showtime_ID = s.Showtime_ID
                    LEFT JOIN Movies m ON s.Movie_ID = m.Movie_ID
                    LEFT JOIN Cinema_Rooms cr ON s.Cinema_Room_ID = cr.Cinema_Room_ID
                    LEFT JOIN Promotions p ON tb.Promotion_ID = p.Promotion_ID
                    WHERE tb.Booking_ID = @bookingId
                `);

            if (bookingResult.recordset.length === 0) {
                return null;
            }

            const booking = bookingResult.recordset[0];

            // Lấy thông tin vé và ghế
            const ticketsResult = await request
                .input('bookingId', sql.Int, bookingId)
                .query(`
                    SELECT t.*, s.Row_Number, s.Seat_Number, s.Seat_Type
                    FROM Tickets t
                    LEFT JOIN Seats s ON t.Seat_ID = s.Seat_ID
                    WHERE t.Booking_ID = @bookingId
                `);

            // Cấu trúc lại dữ liệu để phù hợp với cấu trúc Sequelize trước đây
            const result = {
                ...booking,
                User: booking.Full_Name ? {
                    User_ID: booking.User_ID,
                    Full_Name: booking.Full_Name,
                    Email: booking.Email
                } : null,
                Showtime: {
                    Showtime_ID: booking.Showtime_ID,
                    Show_Date: booking.Show_Date,
                    Start_Time: booking.Start_Time,
                    End_Time: booking.End_Time,
                    Movie: booking.Movie_ID ? {
                        Movie_ID: booking.Movie_ID,
                        Movie_Name: booking.Movie_Title,
                        Poster_URL: booking.Poster_URL
                    } : null,
                    CinemaRoom: booking.Cinema_Room_ID ? {
                        Cinema_Room_ID: booking.Cinema_Room_ID,
                        Room_Name: booking.Room_Name,
                        Room_Type: booking.Room_Type
                    } : null
                },
                Promotion: booking.Promotion_ID ? {
                    Promotion_ID: booking.Promotion_ID,
                    Promotion_Code: booking.Promotion_Code,
                    Discount_Type: booking.Discount_Type,
                    Discount_Value: booking.Discount_Value
                } : null,
                Tickets: ticketsResult.recordset.map(ticket => ({
                    ...ticket,
                    Seat: {
                        Seat_ID: ticket.Seat_ID,
                        Row_Number: ticket.Row_Number,
                        Seat_Number: ticket.Seat_Number,
                        Seat_Type: ticket.Seat_Type
                    }
                }))
            };

            return result;
        } catch (error) {
            this.logger.error('Error finding booking with associations:', error);
            throw error;
        }
    }

    async getAll(filters = {}, transaction = null) {
        try {
            let pool;
            let request;

            // Sử dụng transaction nếu có
            if (transaction) {
                request = transaction.request();
            } else {
                pool = await getConnection();
                request = pool.request();
            }

            // Xây dựng câu truy vấn với các điều kiện lọc
            let query = `
                SELECT tb.*, u.Full_Name, u.Email, 
                       s.Show_Date, s.Start_Time
                FROM Ticket_Bookings tb
                LEFT JOIN Users u ON tb.User_ID = u.User_ID
                LEFT JOIN Showtimes s ON tb.Showtime_ID = s.Showtime_ID
                WHERE 1=1
            `;

            // Thêm các điều kiện lọc
            Object.keys(filters).forEach((key, index) => {
                const paramName = `p${index}`;
                query += ` AND tb.${key} = @${paramName}`;

                // Xác định kiểu dữ liệu SQL phù hợp
                let paramType;
                switch (key) {
                    case 'Booking_ID':
                    case 'User_ID':
                    case 'Showtime_ID':
                    case 'Promotion_ID':
                        paramType = sql.Int;
                        break;
                    case 'Booking_Date':
                        paramType = sql.DateTime;
                        break;
                    default:
                        paramType = sql.NVarChar;
                }

                request.input(paramName, paramType, filters[key]);
            });

            query += ' ORDER BY tb.Booking_Date DESC';

            const result = await request.query(query);

            // Cấu trúc lại dữ liệu để phù hợp với cấu trúc Sequelize trước đây
            return result.recordset.map(booking => ({
                ...booking,
                User: booking.Full_Name ? {
                    User_ID: booking.User_ID,
                    Full_Name: booking.Full_Name,
                    Email: booking.Email
                } : null,
                Showtime: {
                    Showtime_ID: booking.Showtime_ID,
                    Show_Date: booking.Show_Date,
                    Start_Time: booking.Start_Time
                }
            }));
        } catch (error) {
            this.logger.error('Error getting all bookings:', error);
            throw error;
        }
    }

    async update(bookingId, updateData, transaction = null) {
        try {
            let pool;
            let request;

            // Sử dụng transaction nếu có
            if (transaction) {
                request = transaction.request();
            } else {
                pool = await getConnection();
                request = pool.request();
            }

            // Kiểm tra xem booking có tồn tại không
            const checkResult = await request
                .input('bookingId', sql.Int, bookingId)
                .query('SELECT COUNT(*) AS count FROM Ticket_Bookings WHERE Booking_ID = @bookingId');

            if (checkResult.recordset[0].count === 0) {
                return null;
            }

            // Tạo câu lệnh UPDATE động
            const setClauses = [];
            Object.keys(updateData).forEach((key, index) => {
                const paramName = key;

                // Xác định kiểu dữ liệu SQL phù hợp
                let paramType;
                switch (key) {
                    case 'User_ID':
                    case 'Showtime_ID':
                    case 'Promotion_ID':
                    case 'Updated_By':
                        paramType = sql.Int;
                        break;
                    case 'Total_Price':
                    case 'Discount_Amount':
                        paramType = sql.Decimal(10, 2);
                        break;
                    case 'Updated_At':
                        paramType = sql.DateTime;
                        break;
                    default:
                        paramType = sql.NVarChar;
                }

                request.input(paramName, paramType, updateData[key]);
                setClauses.push(`${key} = @${paramName}`);
            });

            // Thêm Updated_At nếu chưa có
            if (!updateData.Updated_At) {
                request.input('Updated_At', sql.DateTime, new Date());
                setClauses.push('Updated_At = @Updated_At');
            }

            request.input('bookingId', sql.Int, bookingId);

            const result = await request.query(`
                UPDATE Ticket_Bookings
                SET ${setClauses.join(', ')}
                OUTPUT INSERTED.*
                WHERE Booking_ID = @bookingId
            `);

            return result.recordset[0];
        } catch (error) {
            this.logger.error('Error updating booking:', error);
            throw error;
        }
    }

    async remove(bookingId, transaction = null) {
        try {
            let pool;
            let request;

            // Sử dụng transaction nếu có
            if (transaction) {
                request = transaction.request();
            } else {
                pool = await getConnection();

                // Bắt đầu transaction mới nếu không có transaction được truyền vào
                const localTransaction = await pool.transaction();
                request = localTransaction.request();

                try {
                    // Kiểm tra xem booking có tồn tại không
                    const checkResult = await request
                        .input('bookingId', sql.Int, bookingId)
                        .query('SELECT COUNT(*) AS count FROM Ticket_Bookings WHERE Booking_ID = @bookingId');

                    if (checkResult.recordset[0].count === 0) {
                        await localTransaction.commit();
                        return 0;
                    }

                    // Xóa các vé liên quan trước
                    await request
                        .input('bookingId', sql.Int, bookingId)
                        .query('DELETE FROM Tickets WHERE Booking_ID = @bookingId');

                    // Sau đó xóa booking
                    const result = await request
                        .input('bookingId', sql.Int, bookingId)
                        .query('DELETE FROM Ticket_Bookings WHERE Booking_ID = @bookingId');

                    await localTransaction.commit();
                    return result.rowsAffected[0];
                } catch (error) {
                    await localTransaction.rollback();
                    throw error;
                }
            }

            // Nếu có transaction được truyền vào, sử dụng nó
            // Kiểm tra xem booking có tồn tại không
            const checkResult = await request
                .input('bookingId', sql.Int, bookingId)
                .query('SELECT COUNT(*) AS count FROM Ticket_Bookings WHERE Booking_ID = @bookingId');

            if (checkResult.recordset[0].count === 0) {
                return 0;
            }

            // Xóa các vé liên quan trước
            await request
                .input('bookingId', sql.Int, bookingId)
                .query('DELETE FROM Tickets WHERE Booking_ID = @bookingId');

            // Sau đó xóa booking
            const result = await request
                .input('bookingId', sql.Int, bookingId)
                .query('DELETE FROM Ticket_Bookings WHERE Booking_ID = @bookingId');

            return result.rowsAffected[0];
        } catch (error) {
            this.logger.error('Error removing booking:', error);
            throw error;
        }
    }

    async findByUserId(userId, transaction = null) {
        try {
            let pool;
            let request;

            // Sử dụng transaction nếu có
            if (transaction) {
                request = transaction.request();
            } else {
                pool = await getConnection();
                request = pool.request();
            }

            const result = await request
                .input('userId', sql.Int, userId)
                .query(`
                    SELECT tb.*, 
                           s.Show_Date, s.Start_Time, s.End_Time,
                           m.Movie_ID, m.Movie_Name as Movie_Title, m.Poster_URL,
                           cr.Cinema_Room_ID, cr.Room_Name, cr.Room_Type,
                           p.Promotion_ID, p.Promotion_Code, p.Discount_Type, p.Discount_Value
                    FROM Ticket_Bookings tb
                    LEFT JOIN Showtimes s ON tb.Showtime_ID = s.Showtime_ID
                    LEFT JOIN Movies m ON s.Movie_ID = m.Movie_ID
                    LEFT JOIN Cinema_Rooms cr ON s.Cinema_Room_ID = cr.Cinema_Room_ID
                    LEFT JOIN Promotions p ON tb.Promotion_ID = p.Promotion_ID
                    WHERE tb.User_ID = @userId
                    ORDER BY tb.Booking_Date DESC
                `);

            // Cấu trúc lại dữ liệu để phù hợp với cấu trúc Sequelize trước đây
            return result.recordset.map(booking => ({
                ...booking,
                Showtime: {
                    Showtime_ID: booking.Showtime_ID,
                    Show_Date: booking.Show_Date,
                    Start_Time: booking.Start_Time,
                    End_Time: booking.End_Time,
                    Movie: booking.Movie_ID ? {
                        Movie_ID: booking.Movie_ID,
                        Movie_Name: booking.Movie_Title,
                        Poster_URL: booking.Poster_URL
                    } : null,
                    CinemaRoom: booking.Cinema_Room_ID ? {
                        Cinema_Room_ID: booking.Cinema_Room_ID,
                        Room_Name: booking.Room_Name,
                        Room_Type: booking.Room_Type
                    } : null
                },
                Promotion: booking.Promotion_ID ? {
                    Promotion_ID: booking.Promotion_ID,
                    Promotion_Code: booking.Promotion_Code,
                    Discount_Type: booking.Discount_Type,
                    Discount_Value: booking.Discount_Value
                } : null
            }));
        } catch (error) {
            this.logger.error('Error finding bookings by user ID:', error);
            throw error;
        }
    }

    async findByShowtimeId(showtimeId, transaction = null) {
        try {
            let pool;
            let request;

            // Sử dụng transaction nếu có
            if (transaction) {
                request = transaction.request();
            } else {
                pool = await getConnection();
                request = pool.request();
            }

            const result = await request
                .input('showtimeId', sql.Int, showtimeId)
                .query(`
                    SELECT * FROM Ticket_Bookings
                    WHERE Showtime_ID = @showtimeId
                    ORDER BY Booking_Date DESC
                `);

            return result.recordset;
        } catch (error) {
            this.logger.error('Error finding bookings by showtime ID:', error);
            throw error;
        }
    }

    async findByUserIdAndStatus(userId, status, transaction = null) {
        try {
            let pool;
            let request;

            // Sử dụng transaction nếu có
            if (transaction) {
                request = transaction.request();
            } else {
                pool = await getConnection();
                request = pool.request();
            }

            const result = await request
                .input('userId', sql.Int, userId)
                .input('status', sql.NVarChar, status)
                .query(`
                    SELECT tb.*, 
                           s.Show_Date, s.Start_Time, s.End_Time,
                           m.Movie_ID, m.Movie_Name as Movie_Title, m.Poster_URL,
                           cr.Cinema_Room_ID, cr.Room_Name, cr.Room_Type,
                           p.Promotion_ID, p.Promotion_Code, p.Discount_Type, p.Discount_Value
                    FROM Ticket_Bookings tb
                    LEFT JOIN Showtimes s ON tb.Showtime_ID = s.Showtime_ID
                    LEFT JOIN Movies m ON s.Movie_ID = m.Movie_ID
                    LEFT JOIN Cinema_Rooms cr ON s.Cinema_Room_ID = cr.Cinema_Room_ID
                    LEFT JOIN Promotions p ON tb.Promotion_ID = p.Promotion_ID
                    WHERE tb.User_ID = @userId AND tb.Status = @status
                    ORDER BY tb.Booking_Date DESC
                `);

            // Cấu trúc lại dữ liệu để phù hợp với cấu trúc Sequelize trước đây
            return result.recordset.map(booking => ({
                ...booking,
                Showtime: {
                    Showtime_ID: booking.Showtime_ID,
                    Show_Date: booking.Show_Date,
                    Start_Time: booking.Start_Time,
                    End_Time: booking.End_Time,
                    Movie: booking.Movie_ID ? {
                        Movie_ID: booking.Movie_ID,
                        Movie_Name: booking.Movie_Title,
                        Poster_URL: booking.Poster_URL
                    } : null,
                    CinemaRoom: booking.Cinema_Room_ID ? {
                        Cinema_Room_ID: booking.Cinema_Room_ID,
                        Room_Name: booking.Room_Name,
                        Room_Type: booking.Room_Type
                    } : null
                },
                Promotion: booking.Promotion_ID ? {
                    Promotion_ID: booking.Promotion_ID,
                    Promotion_Code: booking.Promotion_Code,
                    Discount_Type: booking.Discount_Type,
                    Discount_Value: booking.Discount_Value
                } : null
            }));
        } catch (error) {
            this.logger.error('Error finding bookings by user ID and status:', error);
            throw error;
        }
    }
}

module.exports = new TicketBookingRepository(); 