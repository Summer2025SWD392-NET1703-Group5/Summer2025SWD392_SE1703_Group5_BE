const { getConnection, sql } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Lớp Repository để thao tác với dữ liệu Lịch sử Đặt vé (BookingHistory) trong cơ sở dữ liệu.
 * Ghi lại các thay đổi trạng thái hoặc các sự kiện quan trọng của một đơn đặt vé.
 */
class BookingHistoryRepository {
    constructor() {
        this.logger = logger;
    }

    /**
     * Tạo một bản ghi lịch sử đặt vé mới.
     * @param {object} historyData - Đối tượng chứa thông tin chi tiết lịch sử 
     * (ví dụ: Booking_ID, Status, Notes, Date, Changed_By_User_ID).
     * @param {object} [transaction=null] - Đối tượng transaction (nếu có).
     * @returns {Promise<object|null>} Đối tượng BookingHistory đã tạo.
     */
    async create(historyData, transaction = null) {
        try {
            // Trong model BookingHistory, các trường như Status_Before, Status_After, Changed_By_User_ID, Reason
            // có thể không cần thiết nếu chúng ta đơn giản hóa thành Status (trạng thái hiện tại của sự kiện) và Notes (mô tả chi tiết).
            // Date sẽ là ngày ghi nhận lịch sử.
            const dataToCreate = {
                Booking_ID: historyData.Booking_ID,
                Status: historyData.Status, // Ví dụ: 'Promotion Applied', 'Payment Successful', 'Booking Cancelled'
                Notes: historyData.Notes,    // Mô tả chi tiết hơn, ví dụ: 'Áp dụng mã XYZ, giảm 50k'
                Date: historyData.Date || new Date(), // Mặc định là thời điểm hiện tại
                // Changed_By_User_ID: historyData.Changed_By_User_ID, // Có thể thêm nếu cần theo dõi ai đã thực hiện
            };

            let pool;
            let request;

            // Sử dụng transaction nếu có
            if (transaction) {
                request = transaction.request();
            } else {
                pool = await getConnection();
                request = pool.request();
            }

            request.input('Booking_ID', sql.Int, dataToCreate.Booking_ID);
            request.input('Status', sql.NVarChar, dataToCreate.Status);
            request.input('Notes', sql.NVarChar, dataToCreate.Notes);
            request.input('Date', sql.DateTime, dataToCreate.Date);

            if (historyData.Changed_By_User_ID) {
                request.input('Changed_By_User_ID', sql.Int, historyData.Changed_By_User_ID);
            }

            const result = await request.query(`
                INSERT INTO Booking_History (Booking_ID, Status, Notes, Date${historyData.Changed_By_User_ID ? ', Changed_By_User_ID' : ''})
                OUTPUT INSERTED.*
                VALUES (@Booking_ID, @Status, @Notes, @Date${historyData.Changed_By_User_ID ? ', @Changed_By_User_ID' : ''})
            `);

            return result.recordset[0];
        } catch (error) {
            this.logger.error('Error creating booking history:', error);
            throw error;
        }
    }

    /**
     * Tìm bản ghi lịch sử theo ID.
     * @param {number} historyId - ID của bản ghi lịch sử cần tìm.
     * @returns {Promise<object|null>} Đối tượng BookingHistory nếu tìm thấy.
     */
    async findById(historyId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('historyId', sql.Int, historyId)
                .query('SELECT * FROM Booking_History WHERE History_ID = @historyId');

            return result.recordset[0] || null;
        } catch (error) {
            this.logger.error('Error finding booking history by ID:', error);
            throw error;
        }
    }

    /**
     * Lấy tất cả các bản ghi lịch sử đặt vé (có thể cần phân trang cho ứng dụng thực tế).
     * @returns {Promise<object[]>} Mảng các đối tượng BookingHistory.
     */
    async getAll() {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .query('SELECT * FROM Booking_History ORDER BY Date DESC');

            return result.recordset;
        } catch (error) {
            this.logger.error('Error getting all booking history:', error);
            throw error;
        }
    }

    /**
     * Tìm các bản ghi lịch sử theo Booking_ID.
     * @param {number} bookingId - ID của đơn đặt vé.
     * @returns {Promise<object[]>} Mảng các đối tượng BookingHistory liên quan.
     */
    async findByBookingId(bookingId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('bookingId', sql.Int, bookingId)
                .query('SELECT * FROM Booking_History WHERE Booking_ID = @bookingId ORDER BY Date DESC');

            return result.recordset;
        } catch (error) {
            this.logger.error('Error finding booking history by booking ID:', error);
            throw error;
        }
    }

    /**
     * Xóa bản ghi lịch sử đặt vé theo ID.
     * @param {number} historyId - ID của bản ghi lịch sử cần xóa.
     * @param {object} [transaction=null] - Đối tượng transaction (nếu có).
     * @returns {Promise<number>} Số lượng bản ghi đã xóa (0 hoặc 1).
     */
    async remove(historyId, transaction = null) {
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

            // Kiểm tra xem bản ghi có tồn tại không
            const checkResult = await request
                .input('historyId', sql.Int, historyId)
                .query('SELECT COUNT(*) AS count FROM Booking_History WHERE History_ID = @historyId');

            if (checkResult.recordset[0].count === 0) {
                return 0;
            }

            // Xóa bản ghi
            const result = await request
                .input('historyId', sql.Int, historyId)
                .query('DELETE FROM Booking_History WHERE History_ID = @historyId');

            return result.rowsAffected[0];
        } catch (error) {
            this.logger.error('Error removing booking history:', error);
            throw error;
        }
    }
}

module.exports = new BookingHistoryRepository(); 