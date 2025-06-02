const { getConnection, sql } = require('../config/database');
const { Cinema } = require('../models');

const fullCinemaTableName = 'db_ab91f9_gr5.Cinemas';

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
            request.input('Province', sql.NVarChar(50), validCinemaData.Province);
            request.input('Status', sql.NVarChar(20), validCinemaData.Status || 'Active');

            if (validCinemaData.Phone_Number) {
                request.input('Phone_Number', sql.NVarChar(20), validCinemaData.Phone_Number);
            } else {
                request.input('Phone_Number', sql.NVarChar(20), null);
            }

            if (validCinemaData.Email) {
                request.input('Email', sql.NVarChar(100), validCinemaData.Email);
            } else {
                request.input('Email', sql.NVarChar(100), null);
            }

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
                    Province, 
                    Phone_Number, 
                    Email, 
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
                    @Province, 
                    @Phone_Number, 
                    @Email, 
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
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Cinema_ID', sql.Int, cinemaId)
                .query(`SELECT * FROM ${fullCinemaTableName} WHERE Cinema_ID = @Cinema_ID`);
            return result.recordset[0] || null;
        } catch (error) {
            console.error(`[CinemaRepository.js] Lỗi trong hàm findById cho ID ${cinemaId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy tất cả các rạp phim.
     * @returns {Promise<Cinema[]>} Mảng các đối tượng Cinema.
     */
    static async getAll() {
        try {
            const pool = await getConnection();
            const result = await pool.request().query(`SELECT * FROM ${fullCinemaTableName} ORDER BY Cinema_Name`);
            return result.recordset;
        } catch (error) {
            console.error(`[CinemaRepository.js] Lỗi trong hàm getAll: ${error.message}`);
            throw error;
        }
    }

}

module.exports = CinemaRepository; 