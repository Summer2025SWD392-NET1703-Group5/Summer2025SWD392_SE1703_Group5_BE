// src/services/seatLayoutService.js
const { getConnection } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Service xử lý layout ghế ngồi
 * Chuyển đổi từ C# SeatLayoutService
 */
class SeatLayoutService {
    constructor() {
        this.logger = logger;
    }

    /**
     * Lấy layout ghế của phòng chiếu
     * Chuyển đổi từ C# GetSeatLayoutAsync
     */
    async getSeatLayoutAsync(roomId) {
        const connection = await getConnection();

        try {
            // Lấy thông tin phòng chiếu
            const [cinemaRoomRows] = await connection.execute(
                'SELECT * FROM cinema_rooms WHERE Cinema_Room_ID = ?',
                [roomId]
            );

            if (cinemaRoomRows.length === 0) {
                throw new Error(`Không tìm thấy phòng chiếu có ID ${roomId}`);
            }

            const cinemaRoom = cinemaRoomRows[0];

            // Lấy seat layouts
            const [seatLayouts] = await connection.execute(`
                SELECT 
                    Layout_ID,
                    Row_Label,
                    Column_Number,
                    Seat_Type,
                    Is_Active
                FROM seat_layouts 
                WHERE Cinema_Room_ID = ?
                ORDER BY Row_Label, Column_Number
            `, [roomId]);

            // Group theo hàng
            const rowGroups = {};
            seatLayouts.forEach(sl => {
                if (!rowGroups[sl.Row_Label]) {
                    rowGroups[sl.Row_Label] = [];
                }
                rowGroups[sl.Row_Label].push({
                    Layout_ID: sl.Layout_ID,
                    Row_Label: sl.Row_Label,
                    Column_Number: sl.Column_Number,
                    Seat_Type: sl.Seat_Type,
                    Is_Active: sl.Is_Active
                });
            });

            // Chuyển đổi thành array và sắp xếp
            const rows = Object.keys(rowGroups)
                .sort()
                .map(rowLabel => ({
                    Row: rowLabel,
                    Seats: rowGroups[rowLabel].sort((a, b) => a.Column_Number - b.Column_Number)
                }));

            // Lấy danh sách Layout_ID đã được sử dụng trong vé
            const [usedLayoutIds] = await connection.execute(`
                SELECT DISTINCT sl.Layout_ID
                FROM seat_layouts sl
                INNER JOIN seats s ON sl.Layout_ID = s.Layout_ID
                INNER JOIN tickets t ON s.Seat_ID = t.Seat_ID
                WHERE sl.Cinema_Room_ID = ? 
                AND t.Status NOT IN ('Cancelled', 'Expired')
            `, [roomId]);

            const usedIds = usedLayoutIds.map(row => row.Layout_ID);

            // Thống kê ghế theo loại
            const seatCountByType = {};
            seatLayouts.forEach(sl => {
                if (!seatCountByType[sl.Seat_Type]) {
                    seatCountByType[sl.Seat_Type] = 0;
                }
                seatCountByType[sl.Seat_Type]++;
            });

            const seatTypeStats = Object.keys(seatCountByType).map(seatType => ({
                SeatType: seatType,
                Count: seatCountByType[seatType]
            }));

            // Tính dimensions
            const maxRow = rows.length;
            const maxColumn = rows.length > 0 ? Math.max(...rows.map(r => r.Seats.length)) : 0;

            return {
                cinema_room: {
                    Cinema_Room_ID: cinemaRoom.Cinema_Room_ID,
                    Room_Name: cinemaRoom.Room_Name,
                    Room_Type: cinemaRoom.Room_Type
                },
                rows: rows,
                dimensions: {
                    rows: maxRow,
                    columns: maxColumn
                },
                stats: {
                    total_seats: seatLayouts.length,
                    seat_types: seatTypeStats
                },
                can_modify: usedIds.length === 0
            };

        } catch (error) {
            this.logger.error('Error in getSeatLayoutAsync:', error);
            throw error;
        }
    }

    /**
     * Cấu hình layout ghế
     * Chuyển đổi từ C# ConfigureSeatLayoutAsync
     */
    async configureSeatLayoutAsync(roomId, model) {
        const connection = await getConnection();

        try {
            // Lấy thông tin phòng chiếu
            const [cinemaRoomRows] = await connection.execute(
                'SELECT * FROM cinema_rooms WHERE Cinema_Room_ID = ?',
                [roomId]
            );

            if (cinemaRoomRows.length === 0) {
                throw new Error(`Không tìm thấy phòng chiếu có ID ${roomId}`);
            }

            // THÊM MỚI: Kiểm tra số lượng ghế hợp lệ
            let totalSeats = 0;
            for (const row of model.Rows) {
                totalSeats += model.ColumnsPerRow - (row.EmptyColumns?.length || 0);
            }

            if (totalSeats < 20 || totalSeats > 150) {
                throw new Error(`Số lượng ghế phải từ 20 đến 150 (hiện tại: ${totalSeats})`);
            }

            // ✅ SECURITY FIX: Kiểm tra có booking hoạt động không
            if (await this.hasPendingBookingsForRoomAsync(roomId)) {
                throw new Error('Không thể cập nhật layout ghế vì có đơn đặt vé đang hoạt động (chờ thanh toán, đang xử lý hoặc đã xác nhận). Vui lòng đợi các đơn này được hoàn tất hoặc hủy trước.');
            }

            // Kiểm tra xem phòng có showtime không
            const [showtimeRows] = await connection.execute(`
                SELECT COUNT(*) as count
                FROM showtimes 
                WHERE Cinema_Room_ID = ? 
                AND Show_Date >= CURDATE() 
                AND Status != 'Hidden'
            `, [roomId]);

            if (showtimeRows[0].count > 0) {
                throw new Error('Không thể thay đổi sơ đồ ghế vì phòng chiếu có lịch chiếu trong tương lai. Vui lòng hủy hoặc chuyển các lịch chiếu trước khi thay đổi layout.');
            }

            await connection.beginTransaction();

            try {
                // Xóa layout cũ
                await connection.execute(
                    'DELETE FROM seat_layouts WHERE Cinema_Room_ID = ?',
                    [roomId]
                );

                // Tạo layout mới
                const insertQuery = `
                    INSERT INTO seat_layouts (Cinema_Room_ID, Row_Label, Column_Number, Seat_Type, Is_Active)
                    VALUES (?, ?, ?, ?, ?)
                `;

                for (const row of model.Rows) {
                    const emptyColumns = row.EmptyColumns || [];

                    for (let col = 1; col <= model.ColumnsPerRow; col++) {
                        if (!emptyColumns.includes(col)) {
                            await connection.execute(insertQuery, [
                                roomId,
                                row.RowLabel,
                                col,
                                row.SeatType || 'Standard',
                                true
                            ]);
                        }
                    }
                }

                await connection.commit();

                this.logger.info(`Successfully configured seat layout for room ${roomId}`);

                return {
                    success: true,
                    message: 'Cấu hình layout ghế thành công',
                    room_id: roomId,
                    total_seats: totalSeats,
                    rows_configured: model.Rows.length
                };

            } catch (error) {
                await connection.rollback();
                throw error;
            }

        } catch (error) {
            this.logger.error('Error in configureSeatLayoutAsync:', error);
            throw error;
        }
    }

    /**
     * Kiểm tra có booking hoạt động không
     * ✅ SECURITY FIX: Đổi tên và mở rộng để kiểm tra cả Pending, Processing và Confirmed bookings
     */
    async hasPendingBookingsForRoomAsync(roomId) {
        const connection = await getConnection();

        try {
            const [rows] = await connection.execute(`
                SELECT COUNT(*) as count
                FROM bookings b
                INNER JOIN showtimes s ON b.Showtime_ID = s.Showtime_ID
                WHERE s.Cinema_Room_ID = ?
                AND b.Status IN ('Pending', 'Processing', 'Confirmed')
            `, [roomId]);

            return rows[0].count > 0;

        } catch (error) {
            this.logger.error('Error checking pending bookings:', error);
            throw error;
        }
    }

    /**
     * Lấy thông tin ghế cho booking
     * Chuyển đổi từ C# GetSeatsForBookingAsync
     */
    async getSeatsForBookingAsync(showtimeId) {
        const connection = await getConnection();

        try {
            const [seats] = await connection.execute(`
                SELECT 
                    sl.Layout_ID,
                    sl.Row_Label,
                    sl.Column_Number,
                    sl.Seat_Type,
                    s.Seat_ID,
                    CASE 
                        WHEN t.Ticket_ID IS NOT NULL AND t.Status NOT IN ('Cancelled', 'Expired') THEN 'Booked'
                        WHEN s.Is_Active = 0 THEN 'Maintenance'
                        ELSE 'Available'
                    END as AvailabilityStatus
                FROM seat_layouts sl
                LEFT JOIN seats s ON sl.Layout_ID = s.Layout_ID
                LEFT JOIN tickets t ON s.Seat_ID = t.Seat_ID AND t.Showtime_ID = ?
                INNER JOIN showtimes st ON st.Showtime_ID = ?
                WHERE sl.Cinema_Room_ID = st.Cinema_Room_ID
                AND sl.Is_Active = true
                ORDER BY sl.Row_Label, sl.Column_Number
            `, [showtimeId, showtimeId]);

            // Group theo hàng
            const rowGroups = {};
            seats.forEach(seat => {
                if (!rowGroups[seat.Row_Label]) {
                    rowGroups[seat.Row_Label] = [];
                }
                rowGroups[seat.Row_Label].push(seat);
            });

            const rows = Object.keys(rowGroups)
                .sort()
                .map(rowLabel => ({
                    Row: rowLabel,
                    Seats: rowGroups[rowLabel].sort((a, b) => a.Column_Number - b.Column_Number)
                }));

            return {
                showtime_id: showtimeId,
                rows: rows,
                summary: {
                    total_seats: seats.length,
                    available: seats.filter(s => s.AvailabilityStatus === 'Available').length,
                    booked: seats.filter(s => s.AvailabilityStatus === 'Booked').length,
                    maintenance: seats.filter(s => s.AvailabilityStatus === 'Maintenance').length
                }
            };

        } catch (error) {
            this.logger.error('Error getting seats for booking:', error);
            throw error;
        }
    }

    /**
     * Cập nhật trạng thái ghế
     * Chuyển đổi từ C# UpdateSeatStatusAsync
     */
    async updateSeatStatusAsync(seatId, status) {
        const connection = await getConnection();

        try {
            const [result] = await connection.execute(
                'UPDATE seats SET Status = ? WHERE Seat_ID = ?',
                [status, seatId]
            );

            if (result.affectedRows === 0) {
                throw new Error(`Không tìm thấy ghế với ID ${seatId}`);
            }

            this.logger.info(`Updated seat ${seatId} status to ${status}`);

            return {
                success: true,
                message: 'Cập nhật trạng thái ghế thành công',
                seat_id: seatId,
                new_status: status
            };

        } catch (error) {
            this.logger.error('Error updating seat status:', error);
            throw error;
        }
    }
}

module.exports = SeatLayoutService;
