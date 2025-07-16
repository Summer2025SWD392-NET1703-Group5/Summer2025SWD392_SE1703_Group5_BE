const { getConnection, sql } = require('../config/database');
const Payment = require('../models/Payment');

const fullPaymentTableName = 'ksf00691_team03.Payments';

/**
 * Lớp Repository để thao tác với dữ liệu Thanh toán (Payment) trong cơ sở dữ liệu.
 */
class PaymentRepository {
    /**
     * Tạo một bản ghi thanh toán mới.
     * @param {object} paymentData - Đối tượng chứa thông tin chi tiết thanh toán (ví dụ: Booking_ID, Amount, Payment_Method, Payment_Date, Status, Transaction_ID).
     * @returns {Promise<Payment|null>} Đối tượng Payment đã tạo hoặc null nếu tạo thất bại.
     */
    static async create(paymentData) {
        try {
            const pool = await getConnection();
            const request = pool.request();

            request.input('Booking_ID', sql.Int, paymentData.Booking_ID);         // ID của đơn đặt vé liên quan
            request.input('Amount', sql.Decimal(18, 2), paymentData.Amount);      // Số tiền thanh toán
            request.input('Payment_Method', sql.NVarChar(100), paymentData.Payment_Method); // Phương thức thanh toán
            // Payment_Date: Ngày thanh toán, mặc định là thời điểm hiện tại nếu không được cung cấp
            request.input('Payment_Date', sql.DateTime, paymentData.Payment_Date ? new Date(paymentData.Payment_Date) : new Date());
            request.input('Status', sql.NVarChar(50), paymentData.Status || 'Completed'); // Trạng thái thanh toán, mặc định là 'Completed'

            // Transaction_ID: Mã giao dịch từ cổng thanh toán (tùy chọn)
            if (paymentData.Transaction_ID !== undefined) {
                request.input('Transaction_ID', sql.NVarChar(255), paymentData.Transaction_ID);
            } else {
                request.input('Transaction_ID', sql.NVarChar(255), null);
            }
            // Payment_Gateway: Tên cổng thanh toán (tùy chọn)
            if (paymentData.Payment_Gateway !== undefined) {
                request.input('Payment_Gateway', sql.NVarChar(100), paymentData.Payment_Gateway);
            } else {
                request.input('Payment_Gateway', sql.NVarChar(100), null);
            }

            const query = `
                INSERT INTO ${fullPaymentTableName} (Booking_ID, Amount, Payment_Method, Payment_Date, Status, Transaction_ID, Payment_Gateway)
                OUTPUT INSERTED.*
                VALUES (@Booking_ID, @Amount, @Payment_Method, @Payment_Date, @Status, @Transaction_ID, @Payment_Gateway);
            `;

            const result = await request.query(query);
            return result.recordset[0] ? new Payment(result.recordset[0]) : null;
        } catch (error) {
            console.error(`[PaymentRepository.js] Lỗi trong hàm create: ${error.message}`);
            if (error.message.includes('FOREIGN KEY constraint') && error.message.includes('Ticket_Bookings')) {
                console.error('[PaymentRepository.js] Lỗi khóa ngoại: Booking_ID không tồn tại trong bảng Ticket_Bookings.');
            }
            throw error;
        }
    }

    /**
     * Tìm thanh toán theo ID.
     * @param {number} paymentId - ID của thanh toán cần tìm.
     * @returns {Promise<Payment|null>} Đối tượng Payment nếu tìm thấy, ngược lại null.
     */
    static async findById(paymentId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Payment_ID', sql.Int, paymentId)
                .query(`SELECT * FROM ${fullPaymentTableName} WHERE Payment_ID = @Payment_ID`);
            return result.recordset[0] ? new Payment(result.recordset[0]) : null;
        } catch (error) {
            console.error(`[PaymentRepository.js] Lỗi trong hàm findById cho ID ${paymentId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy tất cả các bản ghi thanh toán.
     * @returns {Promise<Payment[]>} Mảng các đối tượng Payment.
     * @description Cân nhắc thêm phân trang nếu số lượng bản ghi lớn.
     */
    static async getAll() {
        try {
            const pool = await getConnection();
            // Sắp xếp theo ngày thanh toán giảm dần để hiển thị các thanh toán mới nhất trước
            const result = await pool.request().query(`SELECT * FROM ${fullPaymentTableName} ORDER BY Payment_Date DESC`);
            return result.recordset.map(record => new Payment(record));
        } catch (error) {
            console.error(`[PaymentRepository.js] Lỗi trong hàm getAll: ${error.message}`);
            throw error;
        }
    }

    /**
     * Cập nhật thông tin thanh toán (thường là trạng thái hoặc mã giao dịch).
     * @param {number} paymentId - ID của thanh toán cần cập nhật.
     * @param {object} updateData - Đối tượng chứa các trường cần cập nhật.
     * @returns {Promise<boolean>} True nếu cập nhật thành công, false nếu không.
     */
    static async update(paymentId, updateData) {
        try {
            const pool = await getConnection();
            const request = pool.request().input('Payment_ID', sql.Int, paymentId);
            const setClauses = [];

            if (updateData.Amount !== undefined) { request.input('Amount', sql.Decimal(18, 2), updateData.Amount); setClauses.push('Amount = @Amount'); }
            if (updateData.Payment_Method !== undefined) { request.input('Payment_Method', sql.NVarChar(100), updateData.Payment_Method); setClauses.push('Payment_Method = @Payment_Method'); }
            if (updateData.Status !== undefined) { request.input('Status', sql.NVarChar(50), updateData.Status); setClauses.push('Status = @Status'); }
            if (updateData.Transaction_ID !== undefined) { request.input('Transaction_ID', sql.NVarChar(255), updateData.Transaction_ID); setClauses.push('Transaction_ID = @Transaction_ID'); }
            else if (updateData.hasOwnProperty('Transaction_ID') && updateData.Transaction_ID === null) { setClauses.push('Transaction_ID = NULL'); } // Cho phép đặt Transaction_ID thành null
            if (updateData.Payment_Gateway !== undefined) { request.input('Payment_Gateway', sql.NVarChar(100), updateData.Payment_Gateway); setClauses.push('Payment_Gateway = @Payment_Gateway'); }
            else if (updateData.hasOwnProperty('Payment_Gateway') && updateData.Payment_Gateway === null) { setClauses.push('Payment_Gateway = NULL'); } // Cho phép đặt Payment_Gateway thành null
            // Booking_ID và Payment_Date thường không được thay đổi sau khi tạo.

            if (setClauses.length === 0) {
                console.warn('[PaymentRepository.js] Hàm update được gọi không có trường nào để cập nhật cho ID:', paymentId);
                return false;
            }

            const queryText = `UPDATE ${fullPaymentTableName} SET ${setClauses.join(', ')} WHERE Payment_ID = @Payment_ID`;
            const result = await request.query(queryText);
            return result.rowsAffected[0] > 0;
        } catch (error) {
            console.error(`[PaymentRepository.js] Lỗi trong hàm update cho ID ${paymentId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Xóa bản ghi thanh toán theo ID. (Thường không nên xóa cứng thanh toán, cân nhắc xóa mềm hoặc thay đổi trạng thái).
     * @param {number} paymentId - ID của thanh toán cần xóa.
     * @returns {Promise<boolean>} True nếu xóa thành công, false nếu không.
     */
    static async remove(paymentId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Payment_ID', sql.Int, paymentId)
                .query(`DELETE FROM ${fullPaymentTableName} WHERE Payment_ID = @Payment_ID`);
            return result.rowsAffected[0] > 0;
        } catch (error) {
            console.error(`[PaymentRepository.js] Lỗi trong hàm remove cho ID ${paymentId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Tìm các thanh toán theo Booking_ID.
     * @param {number} bookingId - ID của đơn đặt vé.
     * @returns {Promise<Payment[]>} Mảng các đối tượng Payment liên quan đến đơn đặt vé đó, sắp xếp theo ngày thanh toán giảm dần.
     */
    static async findByBookingId(bookingId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Booking_ID', sql.Int, bookingId)
                .query(`SELECT * FROM ${fullPaymentTableName} WHERE Booking_ID = @Booking_ID ORDER BY Payment_Date DESC`);
            return result.recordset.map(record => new Payment(record));
        } catch (error) {
            console.error(`[PaymentRepository.js] Lỗi trong hàm findByBookingId cho Booking ID ${bookingId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Tìm thanh toán theo Transaction_ID (thường là duy nhất từ cổng thanh toán).
     * @param {string} transactionId - Mã giao dịch cần tìm.
     * @returns {Promise<Payment|null>} Đối tượng Payment nếu tìm thấy, ngược lại null.
     */
    static async findByTransactionId(transactionId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Transaction_ID', sql.NVarChar(255), transactionId)
                .query(`SELECT * FROM ${fullPaymentTableName} WHERE Transaction_ID = @Transaction_ID`);
            return result.recordset[0] ? new Payment(result.recordset[0]) : null;
        } catch (error) {
            console.error(`[PaymentRepository.js] Lỗi trong hàm findByTransactionId cho Transaction ID ${transactionId}: ${error.message}`);
            throw error;
        }
    }
}

module.exports = PaymentRepository; 