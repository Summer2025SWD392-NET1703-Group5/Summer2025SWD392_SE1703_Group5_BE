// controllers/bookingStatisticsController.js
const bookingStatisticsService = require('../services/bookingStatisticsService');

/**
 * Lấy thống kê đặt vé và doanh thu để FE tự filter theo ngày
 */
const getBookingStatistics = async (req, res) => {
    try {
        console.log('[getBookingStatistics] Request params:', req.query);

        const { startDate, endDate } = req.query;

        // Validate date format if provided
        let start = null;
        let end = null;

        if (startDate) {
            start = new Date(startDate);
            if (isNaN(start.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày bắt đầu không hợp lệ. Định dạng: YYYY-MM-DD'
                });
            }
        }

        if (endDate) {
            end = new Date(endDate);
            if (isNaN(end.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày kết thúc không hợp lệ. Định dạng: YYYY-MM-DD'
                });
            }
        }

        if (start && end && start > end) {
            return res.status(400).json({
                success: false,
                message: 'Ngày bắt đầu phải trước ngày kết thúc'
            });
        }

        const statistics = await bookingStatisticsService.getBookingStatistics(start, end);

        return res.status(200).json({
            success: true,
            message: 'Lấy thống kê thành công',
            data: statistics
        });

    } catch (error) {
        console.error('[getBookingStatistics] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê đặt vé',
            error: error.message
        });
    }
};

/**
 * Lấy tất cả dữ liệu thống kê (không filter) để FE tự xử lý
 */
const getAllBookingStatistics = async (req, res) => {
    try {
        console.log('[getAllBookingStatistics] Getting all statistics data');

        const statistics = await bookingStatisticsService.getAllBookingStatistics();

        return res.status(200).json({
            success: true,
            message: 'Lấy tất cả thống kê thành công',
            data: statistics
        });

    } catch (error) {
        console.error('[getAllBookingStatistics] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy tất cả thống kê',
            error: error.message
        });
    }
};

/**
 * Lấy thống kê theo phim
 */
const getMovieStatistics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        let start = null;
        let end = null;

        if (startDate) {
            start = new Date(startDate);
            if (isNaN(start.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày bắt đầu không hợp lệ'
                });
            }
        }

        if (endDate) {
            end = new Date(endDate);
            if (isNaN(end.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày kết thúc không hợp lệ'
                });
            }
        }

        const movieStats = await bookingStatisticsService.getMovieStatistics(start, end);

        return res.status(200).json({
            success: true,
            message: 'Lấy thống kê phim thành công',
            data: movieStats
        });

    } catch (error) {
        console.error('[getMovieStatistics] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê phim',
            error: error.message
        });
    }
};

/**
 * Lấy thống kê theo phòng chiếu
 */
const getRoomStatistics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        let start = null;
        let end = null;

        if (startDate) {
            start = new Date(startDate);
            if (isNaN(start.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày bắt đầu không hợp lệ'
                });
            }
        }

        if (endDate) {
            end = new Date(endDate);
            if (isNaN(end.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày kết thúc không hợp lệ'
                });
            }
        }

        const roomStats = await bookingStatisticsService.getRoomStatistics(start, end);

        return res.status(200).json({
            success: true,
            message: 'Lấy thống kê phòng chiếu thành công',
            data: roomStats
        });

    } catch (error) {
        console.error('[getRoomStatistics] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê phòng chiếu',
            error: error.message
        });
    }
};

/**
 * Lấy thống kê theo ngày
 */
const getDailyStatistics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        let start = null;
        let end = null;

        if (startDate) {
            start = new Date(startDate);
            if (isNaN(start.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày bắt đầu không hợp lệ'
                });
            }
        }

        if (endDate) {
            end = new Date(endDate);
            if (isNaN(end.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày kết thúc không hợp lệ'
                });
            }
        }

        const dailyStats = await bookingStatisticsService.getDailyStatistics(start, end);

        return res.status(200).json({
            success: true,
            message: 'Lấy thống kê theo ngày thành công',
            data: dailyStats
        });

    } catch (error) {
        console.error('[getDailyStatistics] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê theo ngày',
            error: error.message
        });
    }
};

/**
 * Lấy thống kê theo phương thức thanh toán
 */
const getPaymentMethodStatistics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        let start = null;
        let end = null;

        if (startDate) {
            start = new Date(startDate);
            if (isNaN(start.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày bắt đầu không hợp lệ'
                });
            }
        }

        if (endDate) {
            end = new Date(endDate);
            if (isNaN(end.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày kết thúc không hợp lệ'
                });
            }
        }

        const paymentStats = await bookingStatisticsService.getPaymentMethodStatistics(start, end);

        return res.status(200).json({
            success: true,
            message: 'Lấy thống kê phương thức thanh toán thành công',
            data: paymentStats
        });

    } catch (error) {
        console.error('[getPaymentMethodStatistics] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê phương thức thanh toán',
            error: error.message
        });
    }
};

module.exports = {
    getBookingStatistics,
    getAllBookingStatistics,
    getMovieStatistics,
    getRoomStatistics,
    getDailyStatistics,
    getPaymentMethodStatistics
};
