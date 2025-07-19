// src/repositories/seatLayoutRepository.js
const { getConnection, sql } = require('../config/database');
const logger = require('../utils/logger');

const fullSeatLayoutTableName = 'ksf00691_team03.Seat_Layouts';

/**
 * Repository để thao tác với dữ liệu SeatLayout trong cơ sở dữ liệu
 * Chuyển đổi từ C# SeatLayoutRepository
 */
class SeatLayoutRepository {
    constructor() {
        logger.info('SeatLayoutRepository (mssql) initialized');
    }

    /**
     * Lấy tất cả seat layouts theo room ID
     */
    async getByRoomIdAsync(roomId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('roomId', sql.Int, roomId)
                .query(`
                    SELECT * FROM ${fullSeatLayoutTableName} 
                    WHERE Cinema_Room_ID = @roomId 
                    ORDER BY Row_Label, Column_Number
                `);
            return result.recordset;
        } catch (error) {
            logger.error(`Error getting seat layouts by room ID ${roomId}:`, error);
            throw error;
        }
    }

    /**
     * Lấy seat layout theo ID
     */
    async getByIdAsync(layoutId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('layoutId', sql.Int, layoutId)
                .query(`
                    SELECT * FROM ${fullSeatLayoutTableName} WHERE Layout_ID = @layoutId
                `);
            return result.recordset.length > 0 ? result.recordset[0] : null;
        } catch (error) {
            logger.error(`Error getting seat layout by ID ${layoutId}:`, error);
            throw error;
        }
    }

    /**
     * Tạo seat layout mới
     */
    async createAsync(seatLayout) {
        try {
            const pool = await getConnection();
            const request = pool.request()
                .input('Cinema_Room_ID', sql.Int, seatLayout.Cinema_Room_ID)
                .input('Row_Label', sql.NVarChar(10), seatLayout.Row_Label)
                .input('Column_Number', sql.Int, seatLayout.Column_Number)
                .input('Seat_Type', sql.NVarChar(50), seatLayout.Seat_Type)
                .input('Is_Active', sql.Bit, seatLayout.Is_Active ? 1 : 0);

            const result = await request.query(`
                INSERT INTO ${fullSeatLayoutTableName} 
                (Cinema_Room_ID, Row_Label, Column_Number, Seat_Type, Is_Active)
                OUTPUT INSERTED.*
                VALUES (@Cinema_Room_ID, @Row_Label, @Column_Number, @Seat_Type, @Is_Active);
            `);

            return result.recordset[0];
        } catch (error) {
            logger.error(`Error creating seat layout:`, error);
            throw error;
        }
    }

    /**
     * Cập nhật seat layout
     */
    async updateAsync(layoutId, seatLayout) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('layoutId', sql.Int, layoutId)
                .input('Row_Label', sql.NVarChar(10), seatLayout.Row_Label)
                .input('Column_Number', sql.Int, seatLayout.Column_Number)
                .input('Seat_Type', sql.NVarChar(50), seatLayout.Seat_Type)
                .input('Is_Active', sql.Bit, seatLayout.Is_Active ? 1 : 0)
                .query(`
                    UPDATE ${fullSeatLayoutTableName} 
                    SET Row_Label = @Row_Label, 
                        Column_Number = @Column_Number, 
                        Seat_Type = @Seat_Type, 
                        Is_Active = @Is_Active
                    WHERE Layout_ID = @layoutId;
                    
                    SELECT @@ROWCOUNT as affectedRows;
                `);

            return result.recordset[0].affectedRows > 0;
        } catch (error) {
            logger.error(`Error updating seat layout ${layoutId}:`, error);
            throw error;
        }
    }

    /**
     * Xóa seat layout theo ID
     */
    async deleteAsync(layoutId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('layoutId', sql.Int, layoutId)
                .query(`
                    DELETE FROM ${fullSeatLayoutTableName} WHERE Layout_ID = @layoutId;
                    SELECT @@ROWCOUNT as affectedRows;
                `);

            return result.recordset[0].affectedRows > 0;
        } catch (error) {
            logger.error(`Error deleting seat layout ${layoutId}:`, error);
            throw error;
        }
    }

    /**
     * Xóa tất cả seat layouts của một phòng
     */
    async deleteByRoomIdAsync(roomId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('roomId', sql.Int, roomId)
                .query(`
                    DELETE FROM ${fullSeatLayoutTableName} WHERE Cinema_Room_ID = @roomId;
                    SELECT @@ROWCOUNT as affectedRows;
                `);

            return result.recordset[0].affectedRows;
        } catch (error) {
            logger.error(`Error deleting seat layouts by room ID ${roomId}:`, error);
            throw error;
        }
    }

    /**
     * Kiểm tra seat layout có tồn tại không
     */
    async existsAsync(layoutId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('layoutId', sql.Int, layoutId)
                .query(`
                    SELECT COUNT(*) as count FROM ${fullSeatLayoutTableName} WHERE Layout_ID = @layoutId
                `);

            return result.recordset[0].count > 0;
        } catch (error) {
            logger.error(`Error checking if seat layout ${layoutId} exists:`, error);
            throw error;
        }
    }

    /**
     * Lấy số lượng ghế theo loại trong một phòng
     */
    async getSeatCountByTypeAsync(roomId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('roomId', sql.Int, roomId)
                .query(`
                    SELECT Seat_Type, COUNT(*) as Count
                    FROM ${fullSeatLayoutTableName}
                    WHERE Cinema_Room_ID = @roomId AND Is_Active = 1
                    GROUP BY Seat_Type
                `);

            return result.recordset;
        } catch (error) {
            logger.error(`Error getting seat count by type for room ID ${roomId}:`, error);
            throw error;
        }
    }

    /**
     * Lấy tổng số ghế trong một phòng
     */
    async getTotalSeatsAsync(roomId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('roomId', sql.Int, roomId)
                .query(`
                    SELECT COUNT(*) as total
                    FROM ${fullSeatLayoutTableName}
                    WHERE Cinema_Room_ID = @roomId AND Is_Active = 1
                `);

            return result.recordset[0].total;
        } catch (error) {
            logger.error(`Error getting total seats for room ID ${roomId}:`, error);
            throw error;
        }
    }
}

module.exports = SeatLayoutRepository;
