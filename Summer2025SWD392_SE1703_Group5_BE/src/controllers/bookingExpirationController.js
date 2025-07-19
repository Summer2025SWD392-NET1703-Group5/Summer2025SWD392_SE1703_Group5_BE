// controllers/bookingExpirationController.js
const bookingExpirationService = require('../services/bookingExpirationService');

class BookingExpirationController {
    // Kiểm tra booking quá hạn thủ công
    async checkExpiredBookings(req, res) {
        try {
            const result = await bookingExpirationService.checkExpiredBookings();
            res.json({
                success: true,
                message: 'Kiểm tra booking quá hạn hoàn tất',
                data: result
            });
        } catch (error) {
            console.error('Error checking expired bookings:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi kiểm tra booking quá hạn',
                error: error.message
            });
        }
    }

    // Force check một booking cụ thể
    async forceCheckBooking(req, res) {
        try {
            const bookingId = parseInt(req.params.bookingId);

            if (isNaN(bookingId) || bookingId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'ID booking không hợp lệ'
                });
            }

            const result = await bookingExpirationService.forceCheckBooking(bookingId);

            if (result.success) {
                res.json({
                    success: true,
                    message: result.message,
                    data: result.result
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: result.message,
                    data: result
                });
            }
        } catch (error) {
            console.error('Error force checking booking:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi kiểm tra booking',
                error: error.message
            });
        }
    }

    // Lấy thống kê booking quá hạn
    async getExpirationStats(req, res) {
        try {
            const { startDate, endDate } = req.query;

            if (!startDate || !endDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp startDate và endDate'
                });
            }

            const start = new Date(startDate);
            const end = new Date(endDate);

            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Định dạng ngày không hợp lệ'
                });
            }

            const stats = await bookingExpirationService.getExpirationStats(start, end);

            res.json({
                success: true,
                message: 'Lấy thống kê thành công',
                data: {
                    period: { startDate, endDate },
                    stats
                }
            });
        } catch (error) {
            console.error('Error getting expiration stats:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi lấy thống kê',
                error: error.message
            });
        }
    }

    // Lấy booking sắp hết hạn
    async getBookingsNearExpiration(req, res) {
        try {
            const minutesBefore = parseInt(req.query.minutes) || 30;

            if (minutesBefore < 5 || minutesBefore > 120) {
                return res.status(400).json({
                    success: false,
                    message: 'Thời gian cảnh báo phải từ 5 đến 120 phút'
                });
            }

            const bookings = await bookingExpirationService.getBookingsNearExpiration(minutesBefore);

            res.json({
                success: true,
                message: `Tìm thấy ${bookings.length} booking sắp hết hạn`,
                data: {
                    minutesBefore,
                    count: bookings.length,
                    bookings: bookings.map(booking => ({
                        Booking_ID: booking.Booking_ID,
                        User_ID: booking.User_ID,
                        User_Name: booking.User?.Full_Name,
                        User_Email: booking.User?.Email,
                        Total_Amount: booking.Total_Amount,
                        Payment_Deadline: booking.Payment_Deadline,
                        Minutes_Left: Math.round((new Date(booking.Payment_Deadline) - new Date()) / (1000 * 60))
                    }))
                }
            });
        } catch (error) {
            console.error('Error getting bookings near expiration:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi lấy danh sách booking sắp hết hạn',
                error: error.message
            });
        }
    }

    // Lấy trạng thái service
    async getServiceStatus(req, res) {
        try {
            res.json({
                success: true,
                data: {
                    isRunning: bookingExpirationService.isRunning,
                    message: bookingExpirationService.isRunning
                        ? 'Service đang hoạt động'
                        : 'Service đã dừng',
                    currentTime: new Date()
                }
            });
        } catch (error) {
            console.error('Error getting service status:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi lấy trạng thái service',
                error: error.message
            });
        }
    }

    // Khởi động service (chỉ dành cho admin)
    async startService(req, res) {
        try {
            bookingExpirationService.start();
            res.json({
                success: true,
                message: 'Service đã được khởi động',
                isRunning: bookingExpirationService.isRunning
            });
        } catch (error) {
            console.error('Error starting service:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi khởi động service',
                error: error.message
            });
        }
    }

    // Dừng service (chỉ dành cho admin)
    async stopService(req, res) {
        try {
            bookingExpirationService.stop();
            res.json({
                success: true,
                message: 'Service đã được dừng',
                isRunning: bookingExpirationService.isRunning
            });
        } catch (error) {
            console.error('Error stopping service:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi dừng service',
                error: error.message
            });
        }
    }
}

module.exports = new BookingExpirationController();