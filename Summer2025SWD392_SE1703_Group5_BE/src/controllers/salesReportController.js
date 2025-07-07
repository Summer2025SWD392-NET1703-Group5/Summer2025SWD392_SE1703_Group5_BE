const salesReportService = require('../services/salesReportService');
const logger = require('../utils/logger');

/**
 * Sales Report Controller - Handles HTTP requests for sales reporting
 * Converted from C# SalesReportController
 */
class SalesReportController {
    /**
     * Lấy tất cả báo cáo doanh thu để FE tự filter theo ngày
     * @route GET /api/sales-report
     * @access Private (Admin/Staff only)
     */
    async getSalesReport(req, res) {
        try {
            const { startDate, endDate, period = 'daily' } = req.query;

            // Kiểm tra tham số period
            if (!['daily', 'weekly', 'monthly'].includes(period.toLowerCase())) {
                return res.status(400).json({
                    success: false,
                    message: "Loại báo cáo phải là 'daily', 'weekly', hoặc 'monthly'"
                });
            }

            logger.info(`GET /api/sales-report - Generating sales report with period: ${period}`);

            let report;

            if (startDate && endDate) {
                // Nếu có startDate và endDate, tạo báo cáo theo khoảng thời gian
                const start = new Date(startDate);
                const end = new Date(endDate);

                if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                    return res.status(400).json({
                        success: false,
                        message: 'Định dạng ngày không hợp lệ. Sử dụng định dạng YYYY-MM-DD'
                    });
                }

                report = await salesReportService.getSalesReportAsync(start, end, period);
            } else {
                // Nếu không có startDate và endDate, lấy tất cả dữ liệu để FE tự filter
                report = await salesReportService.getAllSalesReportAsync();
            }

            res.json({
                success: true,
                message: 'Lấy báo cáo doanh thu thành công',
                data: report
            });

        } catch (error) {
            logger.error('Error in getSalesReport:', error);

            if (error.message.includes('phải trước') ||
                error.message.includes('phải là')) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi tạo báo cáo doanh thu',
                error: error.message
            });
        }
    }

    /**
     * Export báo cáo ra Excel
     * @route GET /api/sales-report/export-excel
     * @access Private (Admin/Staff only)
     */
    async exportReportToExcel(req, res) {
        try {
            const { 
                reportType = 'sales', 
                startDate, 
                endDate, 
                period = 'daily' 
            } = req.query;

            // Validation
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
                    message: 'Định dạng ngày không hợp lệ. Sử dụng định dạng YYYY-MM-DD'
                });
            }

            // Kiểm tra loại báo cáo
            const validReportTypes = ['sales', 'movies', 'cinemas', 'payments', 'categories'];
            if (!validReportTypes.includes(reportType.toLowerCase())) {
                return res.status(400).json({
                    success: false,
                    message: `Loại báo cáo không hợp lệ. Chọn một trong: ${validReportTypes.join(', ')}`
                });
            }

            logger.info(`GET /api/sales-report/export-excel - Exporting ${reportType} report to Excel`);

            const buffer = await salesReportService.exportReportToExcelAsync(
                reportType, 
                start, 
                end, 
                period
            );

            // Tạo tên file
            const fileName = `bao-cao-${reportType}-${startDate}-${endDate}.xlsx`;

            // Set headers cho file download
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.setHeader('Content-Length', buffer.length);

            // Gửi file
            res.send(buffer);

            logger.info(`Excel report exported successfully: ${fileName}`);

        } catch (error) {
            logger.error('Error in exportReportToExcel:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi export báo cáo Excel',
                error: error.message
            });
        }
    }

/**
     * Lấy báo cáo doanh thu theo phim
     * @route GET /api/sales-report/movies
     * @access Private (Admin/Staff only)
     */
    async getMovieRevenueReport(req, res) {
        try {
            const { startDate, endDate } = req.query;

            // Validation
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
                    message: 'Định dạng ngày không hợp lệ. Sử dụng định dạng YYYY-MM-DD'
                });
            }

            logger.info(`GET /api/sales-report/movies - Generating movie revenue report from ${startDate} to ${endDate}`);

            const report = await salesReportService.getMovieRevenueReportAsync(start, end);

            res.json({
                success: true,
                message: 'Lấy báo cáo doanh thu theo phim thành công',
                data: {
                    period: {
                        start_date: start,
                        end_date: end
                    },
                    movies: report,
                    total_movies: report.length,
                    total_revenue: report.reduce((sum, movie) => sum + movie.total_revenue, 0),
                    generated_at: new Date()
                }
            });

        } catch (error) {
            logger.error('Error in getMovieRevenueReport:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi tạo báo cáo doanh thu theo phim',
                error: error.message
            });
        }
    }

    /**
     * Lấy báo cáo doanh thu theo rạp
     * @route GET /api/sales-report/cinemas
     * @access Private (Admin/Staff only)
     */
    async getCinemaRevenueReport(req, res) {
        try {
            const { startDate, endDate } = req.query;

            // Validation
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
                    message: 'Định dạng ngày không hợp lệ. Sử dụng định dạng YYYY-MM-DD'
                });
            }

            logger.info(`GET /api/sales-report/cinemas - Generating cinema revenue report from ${startDate} to ${endDate}`);

            const report = await salesReportService.getCinemaRevenueReportAsync(start, end);

            res.json({
                success: true,
                message: 'Lấy báo cáo doanh thu theo rạp thành công',
                data: {
                    period: {
                        start_date: start,
                        end_date: end
                    },
                    cinemas: report,
                    total_cinemas: report.length,
                    total_revenue: report.reduce((sum, cinema) => sum + cinema.total_revenue, 0),
                    generated_at: new Date()
                }
            });

        } catch (error) {
            logger.error('Error in getCinemaRevenueReport:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi tạo báo cáo doanh thu theo rạp',
                error: error.message
            });
        }
    }

}

module.exports = new SalesReportController();

