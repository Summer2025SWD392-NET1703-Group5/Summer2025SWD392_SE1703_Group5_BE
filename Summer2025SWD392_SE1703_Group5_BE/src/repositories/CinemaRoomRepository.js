const { getConnection, sql } = require('../config/database');
// Sửa import, CinemaRoom không phải constructor
// const CinemaRoom = require('../models/CinemaRoom');

const fullCinemaRoomTableName = 'ksf00691_team03.Cinema_Rooms';

/**
 * Lớp Repository để thao tác với dữ liệu Phòng chiếu (CinemaRoom) trong cơ sở dữ liệu.
 */
class CinemaRoomRepository {
    /**
     * Tạo một phòng chiếu mới.
     * @param {object} roomData - Đối tượng chứa thông tin chi tiết phòng chiếu (ví dụ: Room_Name, Seat_Quantity, Status).
     * @returns {Promise<object|null>} Đối tượng CinemaRoom đã tạo hoặc null nếu tạo thất bại.
     */
    static async create(roomData) {
        try {
            const pool = await getConnection();
            const request = pool.request();

            request.input('Room_Name', sql.NVarChar(100), roomData.Room_Name); // Tên phòng chiếu
            request.input('Seat_Quantity', sql.Int, roomData.Seat_Quantity); // Số lượng ghế
            request.input('Status', sql.NVarChar(50), roomData.Status || 'Available'); // Trạng thái, ví dụ: 'Available', 'Maintenance', 'Closed'
            request.input('Cinema_ID', sql.Int, roomData.Cinema_ID); // ID của rạp phim

            // Room_Type: Loại phòng chiếu (ví dụ: '2D', '3D', 'IMAX') (tùy chọn)
            if (roomData.Room_Type !== undefined) {
                request.input('Room_Type', sql.NVarChar(50), roomData.Room_Type);
            } else {
                request.input('Room_Type', sql.NVarChar(50), null);
            }

            // Notes: Ghi chú về phòng chiếu (tùy chọn)
            if (roomData.Notes !== undefined) {
                request.input('Notes', sql.NVarChar(500), roomData.Notes);
            } else {
                request.input('Notes', sql.NVarChar(500), null);
            }

            const query = `
                INSERT INTO ${fullCinemaRoomTableName} (Room_Name, Seat_Quantity, Status, Room_Type, Notes, Cinema_ID)
                OUTPUT INSERTED.*
                VALUES (@Room_Name, @Seat_Quantity, @Status, @Room_Type, @Notes, @Cinema_ID);
            `;

            const result = await request.query(query);
            // Trả về trực tiếp đối tượng từ recordset thay vì tạo instance mới
            return result.recordset[0] || null;
        } catch (error) {
            console.error(`[CinemaRoomRepository.js] Lỗi trong hàm create: ${error.message}`);
            if (error.message.includes('UNIQUE KEY constraint') && error.message.includes('Room_Name')) {
                console.error(`[CinemaRoomRepository.js] Lỗi: Tên phòng chiếu '${roomData.Room_Name}' đã tồn tại.`);
            }
            throw error;
        }
    }

    /**
     * Tìm phòng chiếu theo ID.
     * @param {number} roomId - ID của phòng chiếu cần tìm.
     * @returns {Promise<object|null>} Đối tượng CinemaRoom nếu tìm thấy, ngược lại null.
     */
    static async findById(roomId) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('Cinema_Room_ID', sql.Int, roomId)
                .query(`SELECT * FROM ${fullCinemaRoomTableName} WHERE Cinema_Room_ID = @Cinema_Room_ID`);
            // Trả về trực tiếp đối tượng từ recordset
            return result.recordset[0] || null;
        } catch (error) {
            console.error(`[CinemaRoomRepository.js] Lỗi trong hàm findById cho ID ${roomId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Tìm phòng chiếu theo Cinema ID.
     * @param {number} cinemaId - ID của rạp phim cần tìm phòng chiếu.
     * @returns {Promise<object[]>} Mảng các đối tượng CinemaRoom thuộc rạp phim.
     */
    static async findByCinemaId(cinemaId) {
        try {
            console.log(`[CinemaRoomRepository.js] Lấy phòng chiếu cho rạp ID: ${cinemaId}`);
            const pool = await getConnection();
            const result = await pool.request()
                .input('Cinema_ID', sql.Int, cinemaId)
                .query(`SELECT * FROM ${fullCinemaRoomTableName} WHERE Cinema_ID = @Cinema_ID ORDER BY Room_Name`);

            console.log(`[CinemaRoomRepository.js] Tìm thấy ${result.recordset.length} phòng chiếu cho rạp ID ${cinemaId}`);
            return result.recordset;
        } catch (error) {
            console.error(`[CinemaRoomRepository.js] Lỗi trong hàm findByCinemaId cho Cinema ID ${cinemaId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy tất cả các phòng chiếu.
     * @returns {Promise<object[]>} Mảng các đối tượng CinemaRoom.
     */
    static async getAll() {
        try {
            const pool = await getConnection();
            // Sắp xếp theo tên phòng để dễ theo dõi
            const result = await pool.request().query(`SELECT * FROM ${fullCinemaRoomTableName} ORDER BY Room_Name`);
            // Trả về trực tiếp mảng recordset
            return result.recordset;
        } catch (error) {
            console.error(`[CinemaRoomRepository.js] Lỗi trong hàm getAll: ${error.message}`);
            throw error;
        }
    }

    /**
     * Cập nhật thông tin phòng chiếu hiện có.
     * @param {number} roomId - ID của phòng chiếu cần cập nhật.
     * @param {object} updateData - Đối tượng chứa các trường cần cập nhật.
     * @returns {Promise<boolean>} True nếu cập nhật thành công, false nếu không.
     */
    static async update(roomId, updateData) {
        try {
            const pool = await getConnection();
            const request = pool.request().input('Cinema_Room_ID', sql.Int, roomId);
            const setClauses = [];

            if (updateData.Room_Name !== undefined) { request.input('Room_Name', sql.NVarChar(100), updateData.Room_Name); setClauses.push('Room_Name = @Room_Name'); }
            if (updateData.Seat_Quantity !== undefined) { request.input('Seat_Quantity', sql.Int, updateData.Seat_Quantity); setClauses.push('Seat_Quantity = @Seat_Quantity'); }
            if (updateData.Status !== undefined) { request.input('Status', sql.NVarChar(50), updateData.Status); setClauses.push('Status = @Status'); }
            if (updateData.Room_Type !== undefined) { request.input('Room_Type', sql.NVarChar(50), updateData.Room_Type); setClauses.push('Room_Type = @Room_Type'); }
            else if (updateData.hasOwnProperty('Room_Type') && updateData.Room_Type === null) { setClauses.push('Room_Type = NULL'); }
            if (updateData.Notes !== undefined) { request.input('Notes', sql.NVarChar(500), updateData.Notes); setClauses.push('Notes = @Notes'); }
            else if (updateData.hasOwnProperty('Notes') && updateData.Notes === null) { setClauses.push('Notes = NULL'); }

            if (setClauses.length === 0) {
                console.warn('[CinemaRoomRepository.js] Hàm update được gọi không có trường nào để cập nhật cho ID:', roomId);
                return false;
            }

            const queryText = `UPDATE ${fullCinemaRoomTableName} SET ${setClauses.join(', ')} WHERE Cinema_Room_ID = @Cinema_Room_ID`;
            const result = await request.query(queryText);
            return result.rowsAffected[0] > 0;
        } catch (error) {
            console.error(`[CinemaRoomRepository.js] Lỗi trong hàm update cho ID ${roomId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Xóa phòng chiếu theo ID.
     * @param {number} roomId - ID của phòng chiếu cần xóa.
     * @returns {Promise<boolean>} True nếu xóa thành công, false nếu không.
     * @description Cân nhắc việc xóa mềm (ví dụ: thay đổi Status thành 'Closed' hoặc 'Deleted') thay vì xóa cứng, 
     * đặc biệt nếu có lịch chiếu hoặc dữ liệu khác liên quan đến phòng này.
     */
    static async remove(roomId) {
        try {
            const pool = await getConnection();
            // Trước khi xóa, kiểm tra xem phòng có lịch chiếu đang hoạt động không.
            // Ví dụ: SELECT COUNT(*) FROM Showtimes WHERE Cinema_Room_ID = @roomId AND Status IN ('Scheduled', 'Active')
            // Nếu có, có thể không cho xóa hoặc yêu cầu xử lý các lịch chiếu đó trước.
            const result = await pool.request()
                .input('Cinema_Room_ID', sql.Int, roomId)
                .query(`DELETE FROM ${fullCinemaRoomTableName} WHERE Cinema_Room_ID = @Cinema_Room_ID`);
            return result.rowsAffected[0] > 0;
        } catch (error) {
            console.error(`[CinemaRoomRepository.js] Lỗi trong hàm remove cho ID ${roomId}: ${error.message}`);
            // Bắt lỗi ràng buộc khóa ngoại nếu phòng không thể xóa
            if (error.message.includes('The DELETE statement conflicted with the REFERENCE constraint')) {
                console.error(`[CinemaRoomRepository.js] Không thể xóa phòng chiếu ID ${roomId} do có dữ liệu liên quan (ví dụ: lịch chiếu).`);
            }
            throw error;
        }
    }

    /**
     * Lấy các phòng chiếu đang hoạt động (ví dụ: Status là 'Available').
     * @returns {Promise<object[]>} Mảng các đối tượng CinemaRoom đang hoạt động.
     */
    static async getActiveRooms() {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .query(`SELECT * FROM ${fullCinemaRoomTableName} WHERE Status = 'Available' ORDER BY Room_Name`);
            // Trả về trực tiếp mảng recordset
            return result.recordset;
        } catch (error) {
            console.error(`[CinemaRoomRepository.js] Lỗi trong hàm getActiveRooms: ${error.message}`);
            throw error;
        }
    }
}

module.exports = CinemaRoomRepository; 