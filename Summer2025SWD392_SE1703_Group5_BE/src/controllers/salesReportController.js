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

    /**
     * Lấy tổng quan dashboard (cho Enhanced Dashboard)
     * @route GET /api/sales-report/dashboard-overview
     * @access Private (Admin/Staff only)
     */
    async getDashboardOverview(req, res) {
        try {
            const { period = '30' } = req.query; // Default 30 days

            const days = parseInt(period);
            if (isNaN(days) || days <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Period phải là số ngày hợp lệ (> 0)'
                });
            }

            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            logger.info(`GET /api/sales-report/dashboard-overview - Generating dashboard overview for last ${days} days`);

            // Lấy báo cáo hiện tại
            const currentReport = await salesReportService.getSalesReportAsync(startDate, endDate, 'daily');

            // Lấy báo cáo cùng kỳ trước đó để tính growth
            const prevStartDate = new Date(startDate);
            prevStartDate.setDate(prevStartDate.getDate() - days);
            const prevEndDate = new Date(startDate);

            const prevReport = await salesReportService.getSalesReportAsync(prevStartDate, prevEndDate, 'daily');

            // Tính growth percentages
            const calculateGrowth = (current, previous) => {
                if (previous === 0) return current > 0 ? 100 : 0;
                return parseFloat(((current - previous) / previous * 100).toFixed(1));
            };

            // Get customer count (approximation from bookings)
            const totalCustomers = currentReport.total_bookings; // Simplified - could be more accurate

            // Format dữ liệu theo interface DashboardOverview
            const dashboardOverview = {
                totalRevenue: currentReport.total_amount || 0,
                totalBookings: currentReport.total_bookings || 0,
                totalTickets: currentReport.total_tickets || 0,
                totalCustomers: totalCustomers || 0,
                revenueGrowth: calculateGrowth(currentReport.total_amount, prevReport.total_amount),
                bookingsGrowth: calculateGrowth(currentReport.total_bookings, prevReport.total_bookings),
                ticketsGrowth: calculateGrowth(currentReport.total_tickets, prevReport.total_tickets),
                customersGrowth: calculateGrowth(totalCustomers, prevReport.total_bookings)
            };

            res.json({
                success: true,
                message: 'Lấy tổng quan dashboard thành công',
                data: dashboardOverview
            });

        } catch (error) {
            logger.error('Error in getDashboardOverview:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi tạo tổng quan dashboard',
                error: error.message
            });
        }
    }

    /**
     * Lấy thống kê tổng quan doanh thu
     * @route GET /api/sales-report/overview
     * @access Private (Admin/Staff only)
     */
    async getSalesOverview(req, res) {
        try {
            const { period = '30' } = req.query; // Default 30 days

            const days = parseInt(period);
            if (isNaN(days) || days <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Period phải là số ngày hợp lệ (> 0)'
                });
            }

            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            logger.info(`GET /api/sales-report/overview - Generating sales overview for last ${days} days`);

            const report = await salesReportService.getSalesReportAsync(startDate, endDate, 'daily');

            // Tính toán thêm một số metrics
            const dailySales = report.period_sales;
            const avgDailyRevenue = dailySales.length > 0 ?
                dailySales.reduce((sum, day) => sum + day.total_amount, 0) / dailySales.length : 0;

            // So sánh với period trước đó
            const prevStartDate = new Date(startDate);
            prevStartDate.setDate(prevStartDate.getDate() - days);
            const prevEndDate = new Date(startDate);

            const prevReport = await salesReportService.getSalesReportAsync(prevStartDate, prevEndDate, 'daily');

            const growth = {
                revenue: prevReport.total_amount > 0 ?
                    ((report.total_amount - prevReport.total_amount) / prevReport.total_amount * 100).toFixed(2) : 0,
                bookings: prevReport.total_bookings > 0 ?
                    ((report.total_bookings - prevReport.total_bookings) / prevReport.total_bookings * 100).toFixed(2) : 0,
                tickets: prevReport.total_tickets > 0 ?
                    ((report.total_tickets - prevReport.total_tickets) / prevReport.total_tickets * 100).toFixed(2) : 0
            };

            res.json({
                success: true,
                message: 'Lấy tổng quan doanh thu thành công',
                data: {
                    current_period: {
                        days: days,
                        start_date: startDate,
                        end_date: endDate,
                        total_revenue: report.total_amount,
                        total_bookings: report.total_bookings,
                        total_tickets: report.total_tickets,
                        average_daily_revenue: avgDailyRevenue,
                        average_booking_value: report.average_booking_value
                    },
                    previous_period: {
                        total_revenue: prevReport.total_amount,
                        total_bookings: prevReport.total_bookings,
                        total_tickets: prevReport.total_tickets
                    },
                    growth_percentage: growth,
                    daily_trends: dailySales,
                    top_movies: report.movie_statistics.slice(0, 5),
                    payment_distribution: report.payment_statistics,
                    generated_at: new Date()
                }
            });

        } catch (error) {
            logger.error('Error in getSalesOverview:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi tạo tổng quan doanh thu',
                error: error.message
            });
        }
    }

    /**
     * Export báo cáo doanh thu ra Excel/CSV
     * @route GET /api/sales-report/export
     * @access Private (Admin/Staff only)
     */
    async exportSalesReport(req, res) {
        try {
            const { startDate, endDate, period = 'daily', format = 'json' } = req.query;

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
                    message: 'Định dạng ngày không hợp lệ'
                });
            }

            logger.info(`GET /api/sales-report/export - Exporting sales report from ${startDate} to ${endDate}`);

            const report = await salesReportService.getSalesReportAsync(start, end, period);

            if (format.toLowerCase() === 'csv') {
                // Convert to CSV format
                const csvData = this.convertToCSV(report);

                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename=sales-report-${startDate}-to-${endDate}.csv`);
                res.send(csvData);
            } else {
                // Return JSON format
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename=sales-report-${startDate}-to-${endDate}.json`);
                res.json({
                    success: true,
                    message: 'Export báo cáo doanh thu thành công',
                    data: report,
                    exported_at: new Date()
                });
            }

        } catch (error) {
            logger.error('Error in exportSalesReport:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi export báo cáo doanh thu',
                error: error.message
            });
        }
    }

    /**
     * Convert report data to CSV format
     * @param {Object} report - Report data
     * @returns {string} CSV string
     */
    convertToCSV(report) {
        const headers = ['Period', 'Total Bookings', 'Total Tickets', 'Total Amount', 'Average Booking Value'];
        const rows = report.period_sales.map(period => [
            period.period_name,
            period.total_bookings,
            period.total_tickets,
            period.total_amount,
            period.average_booking_value
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        return csvContent;
    }

    /**
     * Lấy báo cáo realtime (doanh thu hôm nay)
     * @route GET /api/sales-report/realtime
     * @access Private (Admin/Staff only)
     */
    async getRealtimeSales(req, res) {
        try {
            const today = new Date();
            const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

            logger.info('GET /api/sales-report/realtime - Fetching realtime sales data');

            const report = await salesReportService.getSalesReportAsync(startOfDay, endOfDay, 'daily');

            // Lấy doanh thu theo giờ trong ngày - inline implementation
            let hourlyData = [];
            try {
                const { getConnection } = require('../config/database');
                const sql = require('mssql');

                const pool = await getConnection();

                const result = await pool.request()
                    .input('startDate', sql.DateTime, startOfDay)
                    .input('endDate', sql.DateTime, endOfDay)
                    .query(`
                        SELECT 
                            DATEPART(HOUR, tb.Booking_Date) as Hour,
                            COUNT(*) as TotalBookings,
                            SUM(tb.Total_Amount) as TotalAmount,
                            SUM((SELECT COUNT(*) FROM ksf00691_team03.Tickets t WHERE t.Booking_ID = tb.Booking_ID)) as TotalTickets
                        FROM ksf00691_team03.Ticket_Bookings tb
                        WHERE tb.Booking_Date >= @startDate 
                            AND tb.Booking_Date <= @endDate 
                            AND tb.Status = 'Confirmed'
                        GROUP BY DATEPART(HOUR, tb.Booking_Date)
                        ORDER BY Hour
                    `);

                // Create 24-hour array with default values
                hourlyData = Array.from({ length: 24 }, (_, hour) => ({
                    hour: hour,
                    total_bookings: 0,
                    total_amount: 0,
                    total_tickets: 0
                }));

                // Fill with actual data
                result.recordset.forEach(row => {
                    hourlyData[row.Hour] = {
                        hour: row.Hour,
                        total_bookings: row.TotalBookings,
                        total_amount: row.TotalAmount,
                        total_tickets: row.TotalTickets
                    };
                });

            } catch (hourlyError) {
                logger.error('Error getting hourly sales:', hourlyError);
                // Return empty hourly data as fallback
                hourlyData = Array.from({ length: 24 }, (_, hour) => ({
                    hour: hour,
                    total_bookings: 0,
                    total_amount: 0,
                    total_tickets: 0
                }));
            }

            res.json({
                success: true,
                message: 'Lấy dữ liệu doanh thu realtime thành công',
                data: {
                    today: {
                        date: today.toISOString().split('T')[0],
                        total_revenue: report.total_amount,
                        total_bookings: report.total_bookings,
                        total_tickets: report.total_tickets,
                        average_booking_value: report.average_booking_value
                    },
                    hourly_sales: hourlyData,
                    top_movies_today: report.movie_statistics.slice(0, 5),
                    last_updated: new Date()
                }
            });

        } catch (error) {
            logger.error('Error in getRealtimeSales:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi lấy dữ liệu realtime',
                error: error.message
            });
        }
    }

    /**
     * Get hourly sales data for today
     * @param {Date} startOfDay - Start of day
     * @param {Date} endOfDay - End of day
     * @returns {Promise<Array>} Hourly sales data
     */
    async getHourlySales(startOfDay, endOfDay) {
        try {
            const { getConnection } = require('../config/database');
            const sql = require('mssql');

            const pool = await getConnection();

            const result = await pool.request()
                .input('startDate', sql.DateTime, startOfDay)
                .input('endDate', sql.DateTime, endOfDay)
                .query(`
                    SELECT 
                        DATEPART(HOUR, tb.Booking_Date) as Hour,
                        COUNT(*) as TotalBookings,
                        SUM(tb.Total_Amount) as TotalAmount,
                        SUM((SELECT COUNT(*) FROM ksf00691_team03.Tickets t WHERE t.Booking_ID = tb.Booking_ID)) as TotalTickets
                    FROM ksf00691_team03.Ticket_Bookings tb
                    WHERE tb.Booking_Date >= @startDate 
                        AND tb.Booking_Date <= @endDate 
                        AND tb.Status = 'Confirmed'
                    GROUP BY DATEPART(HOUR, tb.Booking_Date)
                    ORDER BY Hour
                `);

            // Create 24-hour array with default values
            const hourlyData = Array.from({ length: 24 }, (_, hour) => ({
                hour: hour,
                total_bookings: 0,
                total_amount: 0,
                total_tickets: 0
            }));

            // Fill with actual data
            result.recordset.forEach(row => {
                hourlyData[row.Hour] = {
                    hour: row.Hour,
                    total_bookings: row.TotalBookings,
                    total_amount: row.TotalAmount,
                    total_tickets: row.TotalTickets
                };
            });

            return hourlyData;

        } catch (error) {
            logger.error('Error getting hourly sales:', error);
            return [];
        }
    }

    /**
     * Lấy báo cáo chi tiết phương thức thanh toán
     * @route GET /api/sales-report/payments
     * @access Private (Admin/Staff only)
     */
    async getPaymentMethodReport(req, res) {
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

            logger.info(`GET /api/sales-report/payments - Generating payment method report from ${startDate} to ${endDate}`);

            const report = await salesReportService.getPaymentMethodReportAsync(start, end);

            res.json({
                success: true,
                message: 'Lấy báo cáo phương thức thanh toán thành công',
                data: report
            });

        } catch (error) {
            logger.error('Error in getPaymentMethodReport:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi tạo báo cáo phương thức thanh toán',
                error: error.message
            });
        }
    }

    /**
     * Lấy báo cáo phân loại doanh thu (vé phim, bắp nước, quảng cáo)
     * @route GET /api/sales-report/categories
     * @access Private (Admin/Staff only)
     */
    async getRevenueCategoryReport(req, res) {
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

            logger.info(`GET /api/sales-report/categories - Generating revenue category report from ${startDate} to ${endDate}`);

            const report = await salesReportService.getRevenueCategoryReportAsync(start, end);

            res.json({
                success: true,
                message: 'Lấy báo cáo phân loại doanh thu thành công',
                data: report
            });

        } catch (error) {
            logger.error('Error in getRevenueCategoryReport:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi tạo báo cáo phân loại doanh thu',
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



}

module.exports = new SalesReportController();