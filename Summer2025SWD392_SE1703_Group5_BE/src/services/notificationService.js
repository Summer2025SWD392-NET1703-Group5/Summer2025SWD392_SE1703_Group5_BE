// File: src/services/notificationService.js
const { getConnection, sql } = require('../config/database');

class NotificationService {
    constructor() {
        // Các trạng thái được phép hiển thị thông báo
        this.allowedStatuses = [
            'Confirmed',
            'Points Earned',
            'Points Refunded',
            'Reminder Sent',
            'Rating Requested',
            'Points Applied',
            'Promotion Code Applied',
            'NULL' // Để hỗ trợ giá trị NULL dưới dạng chuỗi
        ];
    }

    /**
     * Lấy danh sách thông báo của người dùng (chỉ lấy các loại thông báo được phép)
     * @param {number} userId - ID của người dùng
     * @returns {Promise<Object>} Danh sách thông báo và thống kê
     */
    async getUserNotificationsAsync(userId) {
        try {
            console.log(`[NotificationService] Đang lấy thông báo cho user ${userId}`);
            const connection = await getConnection();

            // Query để lấy booking histories với các thông tin liên quan
            const query = `
                SELECT 
                    bh.Booking_History_ID,
                    bh.Booking_ID,
                    bh.Status,
                    bh.Notes,
                    bh.Date,
                    bh.IsRead,
                    tb.User_ID,
                    s.Movie_ID,
                    s.Start_Time,
                    s.End_Time,
                    m.Movie_Name as MovieTitle,
                    m.Poster_URL
                FROM [ksf00691_team03].[Booking_History] bh
                INNER JOIN [ksf00691_team03].[Ticket_Bookings] tb ON bh.Booking_ID = tb.Booking_ID
                INNER JOIN [ksf00691_team03].[Showtimes] s ON tb.Showtime_ID = s.Showtime_ID
                INNER JOIN [ksf00691_team03].[Movies] m ON s.Movie_ID = m.Movie_ID
                WHERE tb.User_ID = @userId 
                ORDER BY bh.Date DESC
            `;

            const request = connection.request();
            request.input('userId', sql.Int, userId);

            const result = await request.query(query);

            const bookingHistories = result.recordset;
            console.log(`[NotificationService] Tìm thấy ${bookingHistories.length} booking histories`);

            // Chuyển đổi sang đối tượng thông báo
            const notificationDtos = [];

            for (const bh of bookingHistories) {
                // Sử dụng cả Notes và Status để lấy tiêu đề và nội dung
                let title = this.getTitleFromNotesAndStatus(bh.Notes, bh.Status);

                // Xác định loại thông báo
                const type = this.mapBookingHistoryToType(bh.Notes, bh.Status);

                // Chỉ thêm vào kết quả nếu loại thông báo không phải là null
                if (type !== null) {
                    notificationDtos.push({
                        Notification_ID: bh.Booking_History_ID,
                        Title: title,
                        Content: this.getContentFromBookingHistory(bh),
                        Creation_Date: bh.Date,
                        Is_Read: bh.IsRead,
                        Read_Date: bh.IsRead ? bh.Date : null,
                        Type: type,
                        Related_ID: bh.Booking_ID
                    });
                }
            }

            console.log(`[NotificationService] Đã lọc được ${notificationDtos.length} thông báo hợp lệ`);

            // Đếm số lượng thông báo chưa đọc trực tiếp từ danh sách đã lọc
            const unreadCount = notificationDtos.filter(notification => !notification.Is_Read).length;
            
            console.log(`[NotificationService] Số thông báo chưa đọc: ${unreadCount}`);

            return {
                Success: true,
                TotalCount: notificationDtos.length,
                UnreadCount: unreadCount,
                Notifications: notificationDtos
            };

        } catch (error) {
            console.error(`[NotificationService] Error getting notifications for user ${userId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy số lượng thông báo chưa đọc
     * @param {number} userId - ID của người dùng
     * @returns {Promise<number>} Số lượng thông báo chưa đọc
     */
    async getUnreadCountAsync(userId) {
        try {
            console.log(`[NotificationService] Đang đếm thông báo chưa đọc cho user ${userId}`);
            const connection = await getConnection();

            // Sử dụng cùng query như getUserNotificationsAsync để đảm bảo đồng bộ
            const query = `
                SELECT 
                    bh.Booking_History_ID,
                    bh.Status,
                    bh.Notes,
                    bh.IsRead
                FROM [ksf00691_team03].[Booking_History] bh
                INNER JOIN [ksf00691_team03].[Ticket_Bookings] tb ON bh.Booking_ID = tb.Booking_ID
                INNER JOIN [ksf00691_team03].[Showtimes] s ON tb.Showtime_ID = s.Showtime_ID
                INNER JOIN [ksf00691_team03].[Movies] m ON s.Movie_ID = m.Movie_ID
                WHERE tb.User_ID = @userId 
            `;

            const request = connection.request();
            request.input('userId', sql.Int, userId);

            const result = await request.query(query);
            const bookingHistories = result.recordset;

            // Áp dụng cùng logic lọc như getUserNotificationsAsync
            let unreadCount = 0;
            
            for (const bh of bookingHistories) {
                // Xác định loại thông báo
                const type = this.mapBookingHistoryToType(bh.Notes, bh.Status);
                
                // Chỉ đếm nếu là thông báo hợp lệ và chưa đọc
                if (type !== null && !bh.IsRead) {
                    unreadCount++;
                }
            }

            console.log(`[NotificationService] Số thông báo chưa đọc: ${unreadCount}`);
            return unreadCount;

        } catch (error) {
            console.error(`[NotificationService] Error getting unread count for user ${userId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy tiêu đề thông báo từ Notes và Status
     * @param {string} notes - Ghi chú
     * @param {string} status - Trạng thái booking
     * @returns {string} Tiêu đề thông báo
     */
    getTitleFromNotesAndStatus(notes, status) {
        if (status === 'Points Applied' || (notes && notes.includes('Áp dụng') && notes.includes('điểm'))) {
            return 'Đã sử dụng điểm';
        }

        if (status === 'Promotion Code Applied' || (notes && notes.includes('mã khuyến mãi'))) {
            return 'Áp dụng khuyến mãi';
        }

        if (status === 'Confirmed') {
            return 'Đặt vé thành công';
        }

        if (status === 'Points Refunded') {
            return 'Hoàn điểm';
        }

        if (status === 'Reminder Sent') {
            return 'Nhắc nhở lịch chiếu';
        }

        if (status === 'Rating Requested') {
            return 'Đánh giá phim';
        }
    }

    /**
     * Ánh xạ Notes và Status sang loại thông báo
     * @param {string} notes - Ghi chú
     * @param {string} status - Trạng thái booking
     * @returns {string} Loại thông báo
     */
    mapBookingHistoryToType(notes, status) {

        if (status === 'Points Applied' || status === 'Promotion Code Applied' || status === 'Confirmed') {
            return 'success';
        }

        if (status === 'Points Refunded') {
            return 'info';
        }

        if (status === 'Rating Requested') {
            return 'question';
        }

        // Xử lý dựa trên nội dung notes nếu không có status rõ ràng
        if (notes) {
            // Xử lý thông báo áp dụng điểm/khuyến mãi
            if ((notes.includes('Áp dụng') && notes.includes('điểm')) ||
                notes.includes('mã khuyến mãi') ||
                notes.includes('giảm giá')) {
                return 'success';
            }

            // Xử lý thông báo hoàn điểm
            if (notes.includes('hoàn') && notes.includes('điểm')) {
                return 'info';
            }

            // Xử lý thông báo đặt vé thành công
            if (notes.includes('đặt vé thành công') || notes.includes('thanh toán thành công')) {
                return 'success';
            }
        }

        // Mặc định không trả về gì nếu không khớp với các trường hợp trên
        return null;
    }

    /**
     * Tạo nội dung thông báo từ booking history
     * @param {Object} bookingHistory - Thông tin booking history
     * @returns {string} Nội dung thông báo
     */
    getContentFromBookingHistory(bookingHistory) {
        const movieTitle = bookingHistory.MovieTitle || 'Phim';
        const showTime = bookingHistory.Start_Time ? new Date(bookingHistory.Start_Time).toLocaleString('vi-VN') : 'không xác định';
        const bookingId = bookingHistory.Booking_ID;

        // Xử lý cho các trường hợp liên quan đến điểm
        if (bookingHistory.Status === 'Points Earned') {
            // Trích xuất số điểm từ ghi chú nếu có
            const pointsMatch = bookingHistory.Notes && bookingHistory.Notes.match(/(\d+) điểm/);
            const points = pointsMatch ? pointsMatch[1] : "một số";
            return `Bạn đã được cộng ${points} điểm từ đơn đặt vé #${bookingId} cho phim "${movieTitle}"`;
        }

        if (bookingHistory.Status === 'Points Refunded') {
            // Trích xuất số điểm hoàn lại từ ghi chú
            const pointsMatch = bookingHistory.Notes && bookingHistory.Notes.match(/(\d+) điểm/);
            const points = pointsMatch ? pointsMatch[1] : "một số";
            return `Bạn đã được hoàn lại ${points} điểm từ đơn đặt vé #${bookingId} đã bị hủy cho phim "${movieTitle}"`;
        }

        // Xử lý sử dụng điểm để giảm giá
        if (bookingHistory.Notes && bookingHistory.Notes.includes('Áp dụng')) {
            // Trích xuất số điểm đã sử dụng
            const usedPointsMatch = bookingHistory.Notes.match(/Áp dụng (\d+) điểm/);
            const usedPoints = usedPointsMatch ? usedPointsMatch[1] : "một số";

            // Trích xuất số điểm còn lại nếu có trong ghi chú
            const remainingPointsMatch = bookingHistory.Notes.match(/còn lại (\d+) điểm/i);
            const remainingPoints = remainingPointsMatch ? remainingPointsMatch[1] : "";

            if (remainingPoints) {
                return `Bạn đã sử dụng ${usedPoints} điểm cho đơn đặt vé #${bookingId}, còn lại ${remainingPoints} điểm trong tài khoản`;
            } else {
                return `Bạn đã sử dụng ${usedPoints} điểm cho đơn đặt vé #${bookingId} xem phim "${movieTitle}"`;
            }
        }

        // Ưu tiên sử dụng Notes nếu có
        if (bookingHistory.Notes) {
            return `${bookingHistory.Notes} khi đặt vé #${bookingId} xem phim "${movieTitle}"`;
        }

        // Nếu không có Notes thì dùng Status
        if (!bookingHistory.Status) {
            return `Có cập nhật về đặt vé #${bookingId} của bạn cho phim "${movieTitle}"`;
        }

        switch (bookingHistory.Status) {
            case 'Confirmed':
                return `Bạn đã đặt vé thành công cho phim "${movieTitle}" vào lúc ${showTime} (Mã đơn: #${bookingId})`;
            case 'Reminder Sent':
                return `Nhắc nhở: Phim "${movieTitle}" sẽ bắt đầu vào lúc ${showTime}`;
            case 'Rating Requested':
                return `Chúng tôi rất mong nhận được đánh giá của bạn về phim "${movieTitle}" mà bạn đã xem gần đây`;
            default:
                return `Cập nhật về đặt vé #${bookingId} phim "${movieTitle}"`;
        }
    }
}

module.exports = NotificationService;
