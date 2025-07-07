const { getConnection } = require('../config/database');
const logger = require('../utils/logger');
const sql = require('mssql');

/**
 * Sales Report Service - Handles sales reporting and analytics
 * Converted from C# SalesReportService
 */
class SalesReportService {
    constructor() {
        logger.info('SalesReportService initialized');
    }

    /**
     * Lấy tất cả dữ liệu báo cáo để FE tự filter theo ngày
     * @returns {Promise<Object>} Tất cả dữ liệu báo cáo
     */
    async getAllSalesReportAsync() {
        let pool;
        try {
            logger.info('Fetching all sales report data for FE filtering');

            pool = await getConnection();

            // Lấy tất cả booking data trong 1 năm gần nhất
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

            const result = await pool.request()
                .input('startDate', sql.DateTime, oneYearAgo)
                .query(`
                    SELECT 
                        tb.Booking_ID,
                        tb.Booking_Date,
                        tb.Total_Amount,
                        tb.Status,
                        s.Showtime_ID,
                        s.Show_Date,
                        s.Start_Time,
                        m.Movie_ID,
                        m.Movie_Name as MovieTitle,
                        m.Genre,
                        cr.Room_Name,
                        c.Cinema_Name,
                        (SELECT COUNT(*) FROM ksf00691_team03.Tickets t WHERE t.Booking_ID = tb.Booking_ID) as TicketCount,
                        (SELECT TOP 1 p.Payment_Method FROM ksf00691_team03.Payments p WHERE p.Booking_ID = tb.Booking_ID) as PaymentMethod
                    FROM ksf00691_team03.Ticket_Bookings tb
                    INNER JOIN ksf00691_team03.Showtimes s ON tb.Showtime_ID = s.Showtime_ID
                    INNER JOIN ksf00691_team03.Movies m ON s.Movie_ID = m.Movie_ID
                    INNER JOIN ksf00691_team03.Cinema_Rooms cr ON s.Cinema_Room_ID = cr.Cinema_Room_ID
                    INNER JOIN ksf00691_team03.Cinemas c ON cr.Cinema_ID = c.Cinema_ID
                    WHERE tb.Booking_Date >= @startDate 
                        AND tb.Status = 'Confirmed'
                    ORDER BY tb.Booking_Date DESC
                `);

            const bookings = result.recordset;

            // Tính toán thống kê tổng quan
            const totalTickets = bookings.reduce((sum, booking) => sum + (booking.TicketCount || 0), 0);
            const totalAmount = bookings.reduce((sum, booking) => sum + booking.Total_Amount, 0);
            const totalBookings = bookings.length;

            // Thống kê theo tháng (12 tháng gần nhất)
            const monthlyData = this.groupSalesByPeriod(bookings, 'monthly', oneYearAgo, new Date());

            // Thống kê top movies, payments, cinemas
            const movieStats = this.getMovieStatistics(bookings);
            const paymentStats = this.getPaymentStatistics(bookings);
            const cinemaStats = this.getCinemaStatistics(bookings);

            const report = {
                data_range: {
                    from: oneYearAgo,
                    to: new Date()
                },
                summary: {
                    total_tickets: totalTickets,
                    total_amount: totalAmount,
                    total_bookings: totalBookings,
                    average_booking_value: totalBookings > 0 ? totalAmount / totalBookings : 0
                },
                monthly_trends: monthlyData,
                top_movies: movieStats.slice(0, 10),
                payment_methods: paymentStats,
                cinema_performance: cinemaStats,
                raw_data: bookings.map(booking => ({
                    booking_id: booking.Booking_ID,
                    booking_date: booking.Booking_Date,
                    total_amount: booking.Total_Amount,
                    ticket_count: booking.TicketCount,
                    movie_title: booking.MovieTitle,
                    cinema_name: booking.Cinema_Name,
                    payment_method: booking.PaymentMethod
                })),
                generated_at: new Date()
            };

            logger.info(`All sales report data fetched successfully. Total bookings: ${totalBookings}`);
            return report;

        } catch (error) {
            logger.error('Error fetching all sales report data:', error);
            throw error;
        }
    }
    /**
     * Export báo cáo ra Excel
     * @param {string} reportType - Loại báo cáo (sales, movies, cinemas, payments, categories)
     * @param {Date} startDate - Ngày bắt đầu
     * @param {Date} endDate - Ngày kết thúc
     * @param {string} period - Chu kỳ (daily, weekly, monthly)
     * @returns {Promise<Buffer>} Excel file buffer
     */
    async exportReportToExcelAsync(reportType, startDate, endDate, period = 'daily') {
        try {
            logger.info(`Exporting ${reportType} report to Excel from ${startDate} to ${endDate}`);

            let reportData;
            let worksheetName;
            let columns;

            switch (reportType.toLowerCase()) {
                case 'sales':
                    reportData = await this.getSalesReportAsync(startDate, endDate, period);
                    worksheetName = 'Báo cáo doanh số';
                    columns = [
                        { header: 'Kỳ báo cáo', key: 'period', width: 20 },
                        { header: 'Tổng đặt vé', key: 'total_bookings', width: 15 },
                        { header: 'Tổng vé bán', key: 'total_tickets', width: 15 },
                        { header: 'Doanh thu', key: 'total_amount', width: 20 },
                        { header: 'Giá trị TB/đơn', key: 'average_booking_value', width: 20 }
                    ];
                    break;

                case 'movies':
                    reportData = await this.getMovieRevenueReportAsync(startDate, endDate);
                    worksheetName = 'Doanh thu theo phim';
                    columns = [
                        { header: 'Tên phim', key: 'title', width: 30 },
                        { header: 'Thể loại', key: 'genre', width: 20 },
                        { header: 'Tổng đặt vé', key: 'total_bookings', width: 15 },
                        { header: 'Tổng vé bán', key: 'total_tickets', width: 15 },
                        { header: 'Doanh thu', key: 'total_revenue', width: 20 },
                        { header: 'Số suất chiếu', key: 'total_showtimes', width: 15 },
                        { header: 'Doanh thu/suất', key: 'revenue_per_showtime', width: 20 }
                    ];
                    break;

                case 'cinemas':
                    reportData = await this.getCinemaRevenueReportAsync(startDate, endDate);
                    worksheetName = 'Doanh thu theo rạp';
                    columns = [
                        { header: 'Tên rạp', key: 'cinema_name', width: 30 },
                        { header: 'Địa điểm', key: 'location', width: 30 },
                        { header: 'Tổng đặt vé', key: 'total_bookings', width: 15 },
                        { header: 'Tổng vé bán', key: 'total_tickets', width: 15 },
                        { header: 'Doanh thu', key: 'total_revenue', width: 20 },
                        { header: 'Số phòng hoạt động', key: 'active_rooms', width: 18 },
                        { header: 'Doanh thu/phòng', key: 'revenue_per_room', width: 20 }
                    ];
                    break;

                case 'payments':
                    reportData = await this.getPaymentMethodReportAsync(startDate, endDate);
                    worksheetName = 'Báo cáo thanh toán';
                    columns = [
                        { header: 'Phương thức', key: 'payment_method', width: 25 },
                        { header: 'Tổng giao dịch', key: 'total_transactions', width: 18 },
                        { header: 'Tổng số tiền', key: 'total_amount', width: 20 },
                        { header: 'Tỷ lệ thành công (%)', key: 'success_rate', width: 20 },
                        { header: '% Doanh thu', key: 'amount_percentage', width: 15 },
                        { header: 'Giá trị TB', key: 'average_transaction_value', width: 20 }
                    ];
                    break;

                case 'categories':
                    reportData = await this.getRevenueCategoryReportAsync(startDate, endDate);
                    worksheetName = 'Doanh thu theo danh mục';
                    columns = [
                        { header: 'Danh mục', key: 'category', width: 25 },
                        { header: 'Số giao dịch', key: 'total_transactions', width: 18 },
                        { header: 'Tổng số tiền', key: 'total_amount', width: 20 },
                        { header: 'Số lượng SP', key: 'total_items', width: 15 },
                        { header: '% Doanh thu', key: 'amount_percentage', width: 15 },
                        { header: 'Giá trị TB', key: 'average_transaction_value', width: 20 }
                    ];
                    break;

                default:
                    throw new Error(`Unsupported report type: ${reportType}`);
            }

            // Create Excel workbook
            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet(worksheetName);

            // Set columns
            worksheet.columns = columns;

            // Add header row styling
            const headerRow = worksheet.getRow(1);
            headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: '4472C4' }
            };

            // Add data rows
            let dataToAdd;
            if (reportType.toLowerCase() === 'sales') {
                dataToAdd = reportData.period_sales.map(item => ({
                    period: item.period_name,
                    total_bookings: item.total_bookings,
                    total_tickets: item.total_tickets,
                    total_amount: item.total_amount,
                    average_booking_value: item.average_booking_value
                }));
            } else if (reportType.toLowerCase() === 'payments') {
                dataToAdd = reportData.payment_methods;
            } else if (reportType.toLowerCase() === 'categories') {
                dataToAdd = reportData.categories;
            } else {
                dataToAdd = reportData;
            }

            dataToAdd.forEach(item => {
                worksheet.addRow(item);
            });

            // Auto-fit columns
            worksheet.columns.forEach(column => {
                column.width = Math.max(column.width, 12);
            });

            // Generate buffer
            const buffer = await workbook.xlsx.writeBuffer();

            logger.info(`Excel report exported successfully. Report type: ${reportType}`);
            return buffer;

        } catch (error) {
            logger.error(`Error exporting ${reportType} report to Excel:`, error);
            throw error;
        }
    }
}

module.exports = new SalesReportService();
