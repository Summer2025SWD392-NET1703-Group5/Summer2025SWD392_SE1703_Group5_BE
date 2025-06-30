'use strict';

const { getConnection, sql } = require('../config/database');
const logger = require('../utils/logger');

class TicketRepository {
    constructor() {
        this.logger = logger;
    }

    async create(ticketData) {
        try {
            const pool = await getConnection();
            const request = pool.request();

            // Thêm các tham số cho câu lệnh INSERT
            Object.keys(ticketData).forEach(key => {
                let paramType;
                switch (key) {
                    case 'Ticket_ID':
                    case 'Booking_ID':
                    case 'Showtime_ID':
                    case 'Seat_ID':
                    case 'Created_By':
                    case 'Updated_By':
                        paramType = sql.Int;
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

                request.input(key, paramType, ticketData[key]);
            });

            // Tạo câu lệnh INSERT động dựa trên các trường có trong ticketData
            const columns = Object.keys(ticketData).join(', ');
            const paramNames = Object.keys(ticketData).map(key => `@${key}`).join(', ');

            const result = await request.query(`
                INSERT INTO Tickets (${columns})
                OUTPUT INSERTED.*
                VALUES (${paramNames})
            `);

            return result.recordset[0];
        } catch (error) {
            this.logger.error('Error creating ticket:', error);
            throw error;
        }
    }

    async getById(ticketId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('ticketId', sql.Int, ticketId)
                .query(`
                    SELECT t.*, s.Seat_Number, s.Row_Number, s.Seat_Type,
                           st.Show_Date, st.Start_Time, st.End_Time,
                           m.Movie_Name as Movie_Title, m.Poster_URL,
                           cr.Room_Name, cr.Room_Type
                    FROM Tickets t
                    LEFT JOIN Seats s ON t.Seat_ID = s.Seat_ID
                    LEFT JOIN Showtimes st ON t.Showtime_ID = st.Showtime_ID
                    LEFT JOIN Movies m ON st.Movie_ID = m.Movie_ID
                    LEFT JOIN Cinema_Rooms cr ON st.Cinema_Room_ID = cr.Cinema_Room_ID
                    WHERE t.Ticket_ID = @ticketId
                `);

            if (result.recordset.length === 0) {
                return null;
            }

            return result.recordset[0];
        } catch (error) {
            this.logger.error('Error getting ticket by ID:', error);
            throw error;
        }
    }

    async getByBookingId(bookingId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('bookingId', sql.Int, bookingId)
                .query(`
                    SELECT t.*, s.Seat_Number, s.Row_Number, s.Seat_Type,
                           st.Show_Date, st.Start_Time, st.End_Time,
                           m.Movie_Name as Movie_Title, m.Poster_URL,
                           cr.Room_Name, cr.Room_Type
                    FROM Tickets t
                    LEFT JOIN Seats s ON t.Seat_ID = s.Seat_ID
                    LEFT JOIN Showtimes st ON t.Showtime_ID = st.Showtime_ID
                    LEFT JOIN Movies m ON st.Movie_ID = m.Movie_ID
                    LEFT JOIN Cinema_Rooms cr ON st.Cinema_Room_ID = cr.Cinema_Room_ID
                    WHERE t.Booking_ID = @bookingId
                `);

            return result.recordset;
        } catch (error) {
            this.logger.error('Error getting tickets by booking ID:', error);
            throw error;
        }
    }

    async update(ticketId, updateData) {
        try {
            const pool = await getConnection();
            const request = pool.request();

            // Thêm tham số ID vé
            request.input('ticketId', sql.Int, ticketId);

            // Tạo câu lệnh UPDATE động
            const setClauses = [];
            Object.keys(updateData).forEach(key => {
                let paramType;
                switch (key) {
                    case 'Booking_ID':
                    case 'Showtime_ID':
                    case 'Seat_ID':
                    case 'Updated_By':
                        paramType = sql.Int;
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
                UPDATE Tickets
                SET ${setClauses.join(', ')}
                OUTPUT INSERTED.*
                WHERE Ticket_ID = @ticketId
            `);

            if (result.rowsAffected[0] === 0) {
                return null;
            }

            return result.recordset[0];
        } catch (error) {
            this.logger.error('Error updating ticket:', error);
            throw error;
        }
    }

    async delete(ticketId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('ticketId', sql.Int, ticketId)
                .query('DELETE FROM Tickets WHERE Ticket_ID = @ticketId');

            return result.rowsAffected[0] > 0;
        } catch (error) {
            this.logger.error('Error deleting ticket:', error);
            throw error;
        }
    }

    async updateStatus(ticketId, status, updatedBy = null) {
        try {
            const pool = await getConnection();
            const request = pool.request()
                .input('ticketId', sql.Int, ticketId)
                .input('status', sql.NVarChar, status)
                .input('updatedAt', sql.DateTime, new Date());

            if (updatedBy) {
                request.input('updatedBy', sql.Int, updatedBy);

                await request.query(`
                    UPDATE Tickets
                    SET Status = @status, Updated_At = @updatedAt, Updated_By = @updatedBy
                    WHERE Ticket_ID = @ticketId
                `);
            } else {
                await request.query(`
                    UPDATE Tickets
                    SET Status = @status, Updated_At = @updatedAt
                    WHERE Ticket_ID = @ticketId
                `);
            }

            return true;
        } catch (error) {
            this.logger.error('Error updating ticket status:', error);
            throw error;
        }
    }

    async getActiveTicketsByShowtimeId(showtimeId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('showtimeId', sql.Int, showtimeId)
                .query(`
                    SELECT t.*, s.Seat_Number, s.Row_Number, s.Seat_Type
                    FROM Tickets t
                    LEFT JOIN Seats s ON t.Seat_ID = s.Seat_ID
                    WHERE t.Showtime_ID = @showtimeId
                    AND t.Status NOT IN ('Cancelled', 'Expired')
                `);

            return result.recordset;
        } catch (error) {
            this.logger.error('Error getting active tickets by showtime ID:', error);
            throw error;
        }
    }
}

module.exports = new TicketRepository();