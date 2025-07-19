const { getConnection, sql } = require('../config/database');

class ShowtimeRepository {
    async getAll() {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .query(`
                    SELECT s.*, cr.Room_Name, cr.Room_Type 
                    FROM Showtimes s
                    LEFT JOIN Cinema_Rooms cr ON s.Cinema_Room_ID = cr.Cinema_Room_ID
                `);

            return result.recordset.map(row => {
                return {
                    ...row,
                    CinemaRoom: row.Room_Name ? {
                        Cinema_Room_ID: row.Cinema_Room_ID,
                        Room_Name: row.Room_Name,
                        Room_Type: row.Room_Type
                    } : null
                };
            });
        } catch (error) {
            console.error('Error in getAll:', error);
            throw error;
        }
    }

    async getAllByStatus(status) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('status', sql.NVarChar, status)
                .query(`
                    SELECT s.*, cr.Room_Name, cr.Room_Type 
                    FROM Showtimes s
                    LEFT JOIN Cinema_Rooms cr ON s.Cinema_Room_ID = cr.Cinema_Room_ID
                    WHERE s.Status = @status
                `);

            return result.recordset.map(row => {
                return {
                    ...row,
                    CinemaRoom: row.Room_Name ? {
                        Cinema_Room_ID: row.Cinema_Room_ID,
                        Room_Name: row.Room_Name,
                        Room_Type: row.Room_Type
                    } : null
                };
            });
        } catch (error) {
            console.error('Error in getAllByStatus:', error);
            throw error;
        }
    }

    async getAllActive() {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .query(`
                    SELECT s.*, cr.Room_Name, cr.Room_Type 
                    FROM Showtimes s
                    LEFT JOIN Cinema_Rooms cr ON s.Cinema_Room_ID = cr.Cinema_Room_ID
                    WHERE s.Status NOT IN ('Hidden', 'Deleted')
                `);

            return result.recordset.map(row => {
                return {
                    ...row,
                    CinemaRoom: row.Room_Name ? {
                        Cinema_Room_ID: row.Cinema_Room_ID,
                        Room_Name: row.Room_Name,
                        Room_Type: row.Room_Type
                    } : null
                };
            });
        } catch (error) {
            console.error('Error in getAllActive:', error);
            throw error;
        }
    }

    async create(showtime) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Movie_ID', sql.Int, showtime.Movie_ID)
                .input('Cinema_Room_ID', sql.Int, showtime.Cinema_Room_ID)
                .input('Show_Date', sql.Date, showtime.Show_Date)
                .input('Start_Time', sql.Time, showtime.Start_Time)
                .input('End_Time', sql.Time, showtime.End_Time)
                .input('Status', sql.NVarChar, showtime.Status || 'Active')
                .input('Created_At', sql.DateTime, showtime.Created_At || new Date())
                .input('Created_By', sql.Int, showtime.Created_By)
                .query(`
                    INSERT INTO Showtimes (Movie_ID, Cinema_Room_ID, Show_Date, Start_Time, End_Time, Status, Created_At, Created_By)
                    OUTPUT INSERTED.Showtime_ID
                    VALUES (@Movie_ID, @Cinema_Room_ID, @Show_Date, @Start_Time, @End_Time, @Status, @Created_At, @Created_By)
                `);

            return result.recordset[0].Showtime_ID;
        } catch (error) {
            console.error('Error in create:', error);
            throw error;
        }
    }

    async getById(id) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('id', sql.Int, id)
                .query(`
                    SELECT s.*, cr.Room_Name, cr.Room_Type 
                    FROM Showtimes s
                    LEFT JOIN Cinema_Rooms cr ON s.Cinema_Room_ID = cr.Cinema_Room_ID
                    WHERE s.Showtime_ID = @id
                `);

            if (result.recordset.length === 0) {
                return null;
            }

            const row = result.recordset[0];
            return {
                ...row,
                CinemaRoom: row.Room_Name ? {
                    Cinema_Room_ID: row.Cinema_Room_ID,
                    Room_Name: row.Room_Name,
                    Room_Type: row.Room_Type
                } : null
            };
        } catch (error) {
            console.error('Error in getById:', error);
            throw error;
        }
    }

    async getByConditions(conditions) {
        try {
            const pool = await getConnection();

            // Xây dựng câu truy vấn động dựa trên điều kiện
            let query = `
                SELECT s.*, cr.Room_Name, cr.Room_Type 
                FROM Showtimes s
                LEFT JOIN Cinema_Rooms cr ON s.Cinema_Room_ID = cr.Cinema_Room_ID
                WHERE 1=1
            `;

            const request = pool.request();

            // Thêm các điều kiện vào câu truy vấn
            Object.keys(conditions).forEach((key, index) => {
                const paramName = `p${index}`;
                query += ` AND s.${key} = @${paramName}`;
                request.input(paramName, conditions[key]);
            });

            const result = await request.query(query);

            return result.recordset.map(row => {
                return {
                    ...row,
                    CinemaRoom: row.Room_Name ? {
                        Cinema_Room_ID: row.Cinema_Room_ID,
                        Room_Name: row.Room_Name,
                        Room_Type: row.Room_Type
                    } : null
                };
            });
        } catch (error) {
            console.error('Error in getByConditions:', error);
            throw error;
        }
    }

    async update(id, dataToUpdate) {
        try {
            const pool = await getConnection();

            // Xây dựng câu truy vấn UPDATE động
            let query = 'UPDATE Showtimes SET ';
            const request = pool.request();

            // Thêm các trường cần cập nhật vào câu truy vấn
            const updateFields = Object.keys(dataToUpdate);
            updateFields.forEach((field, index) => {
                query += `${field} = @${field}`;
                if (index < updateFields.length - 1) {
                    query += ', ';
                }

                // Xác định kiểu dữ liệu SQL phù hợp
                let sqlType;
                let value = dataToUpdate[field];

                if (field === 'Show_Date') {
                    sqlType = sql.Date;
                } else if (field === 'Start_Time' || field === 'End_Time') {
                    sqlType = sql.VarChar(8); // HH:MM:SS format
                    console.log(`[ShowtimeRepository] Setting ${field} as VarChar: ${value}`);                
                } else if (field === 'Created_At' || field === 'Updated_At') {
                    sqlType = sql.DateTime;
                    if (!(value instanceof Date)) {
                        value = new Date(value);
                    }
                    console.log(`[ShowtimeRepository] Setting ${field} as DateTime: ${value.toISOString()}`);
                } else if (field === 'Movie_ID' || field === 'Cinema_Room_ID' || field === 'Created_By' || field === 'Updated_By') {
                    sqlType = sql.Int;
                } else {
                    sqlType = sql.NVarChar;
                }

                request.input(field, sqlType, value);
            });

            query += ' WHERE Showtime_ID = @id';
            request.input('id', sql.Int, id);

            const result = await request.query(query);
            return result.rowsAffected[0];
        } catch (error) {
            console.error('Error in update:', error);
            throw error;
        }
    }

    async remove(id) {
        try {
            const showtime = await this.getById(id);
            if (!showtime) return false;

            const pool = await getConnection();
            const result = await pool.request()
                .input('id', sql.Int, id)
                .query('DELETE FROM Showtimes WHERE Showtime_ID = @id');

            return result.rowsAffected[0] > 0;
        } catch (error) {
            console.error('Error in remove:', error);
            throw error;
        }
    }

    async updateStatus(id, status, updatedBy) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('id', sql.Int, id)
                .input('status', sql.NVarChar, status)
                .input('updatedAt', sql.DateTime, new Date())
                .input('updatedBy', sql.Int, updatedBy)
                .query(`
                    UPDATE Showtimes 
                    SET Status = @status, Updated_At = @updatedAt, Updated_By = @updatedBy
                    WHERE Showtime_ID = @id
                `);

            return result.rowsAffected[0] > 0;
        } catch (error) {
            console.error('Error in updateStatus:', error);
            throw error;
        }
    }

    async delete(id) {
        try {
            const pool = await getConnection();

            // Bắt đầu transaction
            const transaction = await pool.transaction();

            try {
                // Kiểm tra xem showtime có tồn tại không
                const checkResult = await transaction.request()
                    .input('id', sql.Int, id)
                    .query('SELECT Showtime_ID FROM Showtimes WHERE Showtime_ID = @id');

                if (checkResult.recordset.length === 0) {
                    await transaction.rollback();
                    return false;
                }

                // Lấy danh sách booking IDs
                const bookingsResult = await transaction.request()
                    .input('id', sql.Int, id)
                    .query('SELECT Booking_ID FROM Ticket_Bookings WHERE Showtime_ID = @id');

                const bookingIds = bookingsResult.recordset.map(row => row.Booking_ID);

                // Xóa các bản ghi liên quan
                for (const bookingId of bookingIds) {
                    await transaction.request()
                        .input('bookingId', sql.Int, bookingId)
                        .query('DELETE FROM Payments WHERE Booking_ID = @bookingId');

                    await transaction.request()
                        .input('bookingId', sql.Int, bookingId)
                        .query('DELETE FROM Promotion_Usage WHERE Booking_ID = @bookingId');

                    await transaction.request()
                        .input('bookingId', sql.Int, bookingId)
                        .query('DELETE FROM Booking_History WHERE Booking_ID = @bookingId');

                    await transaction.request()
                        .input('bookingId', sql.Int, bookingId)
                        .query('DELETE FROM Ticket_Bookings WHERE Booking_ID = @bookingId');
                }

                // Xóa ghế
                await transaction.request()
                    .input('id', sql.Int, id)
                    .query('DELETE FROM Seats WHERE Showtime_ID = @id');

                // Xóa showtime
                await transaction.request()
                    .input('id', sql.Int, id)
                    .query('DELETE FROM Showtimes WHERE Showtime_ID = @id');

                // Commit transaction
                await transaction.commit();
                return true;
            } catch (error) {
                await transaction.rollback();
                throw error;
            }
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
                    UPDATE Showtimes 
                    SET Status = 'Hidden', Updated_At = @updatedAt, Updated_By = @updatedBy
                    WHERE Showtime_ID = @id
                `);

            return result.rowsAffected[0] > 0;
        } catch (error) {
            console.error('Error in softDelete:', error);
            throw error;
        }
    }

    async hasBookings(id) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('id', sql.Int, id)
                .query('SELECT COUNT(*) AS BookingCount FROM Ticket_Bookings WHERE Showtime_ID = @id');

            return result.recordset[0].BookingCount > 0;
        } catch (error) {
            console.error('Error in hasBookings:', error);
            throw error;
        }
    }
}

module.exports = new ShowtimeRepository();