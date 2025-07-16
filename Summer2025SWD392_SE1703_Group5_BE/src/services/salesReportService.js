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
     * Tạo báo cáo doanh thu theo khoảng thời gian
     * @param {Date} startDate - Ngày bắt đầu
     * @param {Date} endDate - Ngày kết thúc  
     * @param {string} period - Loại báo cáo: 'daily', 'weekly', 'monthly'
     * @returns {Promise<Object>} Báo cáo doanh thu
     */
    async getSalesReportAsync(startDate, endDate, period = 'daily') {
        let pool;
        try {
            // Validation
            if (startDate > endDate) {
                throw new Error('Ngày bắt đầu phải trước ngày kết thúc');
            }

            // Validate period
            if (!['daily', 'weekly', 'monthly'].includes(period.toLowerCase())) {
                throw new Error("Loại báo cáo phải là 'daily', 'weekly', hoặc 'monthly'");
            }

            logger.info(`Generating sales report from ${startDate} to ${endDate}, period: ${period}`);

            pool = await getConnection();

            // Lấy dữ liệu bookings với các thông tin liên quan
            const result = await pool.request()
                .input('startDate', sql.DateTime, startDate)
                .input('endDate', sql.DateTime, endDate)
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
                        -- Đếm số vé từ bảng Tickets
                        (SELECT COUNT(*) FROM ksf00691_team03.Tickets t WHERE t.Booking_ID = tb.Booking_ID) as TicketCount,
                        -- Lấy thông tin payment method
                        (SELECT TOP 1 p.Payment_Method FROM ksf00691_team03.Payments p WHERE p.Booking_ID = tb.Booking_ID) as PaymentMethod
                    FROM ksf00691_team03.Ticket_Bookings tb
                    INNER JOIN ksf00691_team03.Showtimes s ON tb.Showtime_ID = s.Showtime_ID
                    INNER JOIN ksf00691_team03.Movies m ON s.Movie_ID = m.Movie_ID
                    INNER JOIN ksf00691_team03.Cinema_Rooms cr ON s.Cinema_Room_ID = cr.Cinema_Room_ID
                    INNER JOIN ksf00691_team03.Cinemas c ON cr.Cinema_ID = c.Cinema_ID
                    WHERE CAST(tb.Booking_Date as DATE) >= CAST(@startDate as DATE)
                        AND CAST(tb.Booking_Date as DATE) <= CAST(@endDate as DATE)
                        AND tb.Status = 'Confirmed'
                    ORDER BY tb.Booking_Date
                `);

            const bookings = result.recordset;

            // Group data by the specified period
            const groupedSales = this.groupSalesByPeriod(bookings, period, startDate, endDate);

            // Tính tổng số vé từ TicketCount
            const totalTickets = bookings.reduce((sum, booking) => sum + (booking.TicketCount || 0), 0);
            const totalAmount = bookings.reduce((sum, booking) => sum + booking.Total_Amount, 0);
            const totalBookings = bookings.length;

            // Thống kê thêm
            const movieStats = this.getMovieStatistics(bookings);
            const paymentStats = this.getPaymentStatistics(bookings);
            const cinemaStats = this.getCinemaStatistics(bookings);

            const report = {
                start_date: startDate,
                end_date: endDate,
                period: period,
                total_tickets: totalTickets,
                total_amount: totalAmount,
                total_bookings: totalBookings,
                average_booking_value: totalBookings > 0 ? totalAmount / totalBookings : 0,
                period_sales: groupedSales,
                movie_statistics: movieStats,
                payment_statistics: paymentStats,
                cinema_statistics: cinemaStats,
                generated_at: new Date()
            };

            logger.info(`Sales report generated successfully. Total bookings: ${totalBookings}, Total amount: ${totalAmount}`);
            return report;

        } catch (error) {
            logger.error(`Error generating sales report from ${startDate} to ${endDate}:`, error);
            throw error;
        }
    }

    /**
     * Group sales data by period (daily, weekly, monthly)
     * @param {Array} bookings - Booking data
     * @param {string} period - Period type
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {Array} Grouped sales data
     */
    groupSalesByPeriod(bookings, period, startDate, endDate) {
        const result = [];
        const periodMap = new Map();

        // Group bookings by period
        bookings.forEach(booking => {
            const bookingDate = new Date(booking.Booking_Date);
            let periodKey;

            switch (period.toLowerCase()) {
                case 'daily':
                    periodKey = bookingDate.toISOString().split('T')[0]; // YYYY-MM-DD
                    break;
                case 'weekly':
                    const weekStart = this.getWeekStart(bookingDate);
                    periodKey = weekStart.toISOString().split('T')[0];
                    break;
                case 'monthly':
                    periodKey = `${bookingDate.getFullYear()}-${String(bookingDate.getMonth() + 1).padStart(2, '0')}`;
                    break;
            }

            if (!periodMap.has(periodKey)) {
                periodMap.set(periodKey, {
                    period_name: this.formatPeriodName(periodKey, period),
                    period_key: periodKey,
                    total_bookings: 0,
                    total_tickets: 0,
                    total_amount: 0,
                    bookings: []
                });
            }

            const periodData = periodMap.get(periodKey);
            periodData.total_bookings++;
            periodData.total_tickets += booking.TicketCount || 0;
            periodData.total_amount += booking.Total_Amount;
            periodData.bookings.push(booking);
        });

        // Convert map to array and sort
        for (const [key, data] of periodMap) {
            result.push({
                period_name: data.period_name,
                period_key: data.period_key,
                total_bookings: data.total_bookings,
                total_tickets: data.total_tickets,
                total_amount: data.total_amount,
                average_booking_value: data.total_bookings > 0 ? data.total_amount / data.total_bookings : 0
            });
        }

        // Sort by period_key
        result.sort((a, b) => a.period_key.localeCompare(b.period_key));

        return result;
    }

    /**
     * Get start of week (Monday)
     * @param {Date} date - Input date
     * @returns {Date} Start of week
     */
    getWeekStart(date) {
        const result = new Date(date);
        const day = result.getDay();
        const diff = result.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        result.setDate(diff);
        result.setHours(0, 0, 0, 0);
        return result;
    }

    /**
     * Format period name for display
     * @param {string} periodKey - Period key
     * @param {string} period - Period type
     * @returns {string} Formatted period name
     */
    formatPeriodName(periodKey, period) {
        switch (period.toLowerCase()) {
            case 'daily':
                return new Date(periodKey).toLocaleDateString('vi-VN');
            case 'weekly':
                const weekStart = new Date(periodKey);
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekEnd.getDate() + 6);
                return `${weekStart.toLocaleDateString('vi-VN')} - ${weekEnd.toLocaleDateString('vi-VN')}`;
            case 'monthly':
                const [year, month] = periodKey.split('-');
                return `${month}/${year}`;
            default:
                return periodKey;
        }
    }

    /**
     * Get movie statistics
     * @param {Array} bookings - Booking data
     * @returns {Array} Movie statistics
     */
    getMovieStatistics(bookings) {
        const movieMap = new Map();

        bookings.forEach(booking => {
            const movieKey = booking.Movie_ID;
            if (!movieMap.has(movieKey)) {
                movieMap.set(movieKey, {
                    movie_id: booking.Movie_ID,
                    movie_title: booking.MovieTitle,
                    genre: booking.Genre,
                    total_bookings: 0,
                    total_tickets: 0,
                    total_revenue: 0
                });
            }

            const movieData = movieMap.get(movieKey);
            movieData.total_bookings++;
            movieData.total_tickets += booking.TicketCount || 0;
            movieData.total_revenue += booking.Total_Amount;
        });

        return Array.from(movieMap.values())
            .sort((a, b) => b.total_revenue - a.total_revenue)
            .slice(0, 10); // Top 10 movies
    }

    /**
     * Get payment method statistics
     * @param {Array} bookings - Booking data
     * @returns {Array} Payment statistics
     */
    getPaymentStatistics(bookings) {
        const paymentMap = new Map();

        bookings.forEach(booking => {
            const method = booking.PaymentMethod || 'Unknown';
            if (!paymentMap.has(method)) {
                paymentMap.set(method, {
                    payment_method: method,
                    total_bookings: 0,
                    total_amount: 0,
                    percentage: 0
                });
            }

            const paymentData = paymentMap.get(method);
            paymentData.total_bookings++;
            paymentData.total_amount += booking.Total_Amount;
        });

        const totalAmount = bookings.reduce((sum, b) => sum + b.Total_Amount, 0);
        const result = Array.from(paymentMap.values());

        // Calculate percentages
        result.forEach(item => {
            item.percentage = totalAmount > 0 ? (item.total_amount / totalAmount * 100).toFixed(2) : 0;
        });

        return result.sort((a, b) => b.total_amount - a.total_amount);
    }

    /**
     * Get cinema statistics
     * @param {Array} bookings - Booking data
     * @returns {Array} Cinema statistics
     */
    getCinemaStatistics(bookings) {
        const cinemaMap = new Map();

        bookings.forEach(booking => {
            const cinemaKey = booking.Cinema_Name;
            if (!cinemaMap.has(cinemaKey)) {
                cinemaMap.set(cinemaKey, {
                    cinema_name: booking.Cinema_Name,
                    total_bookings: 0,
                    total_tickets: 0,
                    total_revenue: 0
                });
            }

            const cinemaData = cinemaMap.get(cinemaKey);
            cinemaData.total_bookings++;
            cinemaData.total_tickets += booking.TicketCount || 0;
            cinemaData.total_revenue += booking.Total_Amount;
        });

        return Array.from(cinemaMap.values())
            .sort((a, b) => b.total_revenue - a.total_revenue);
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
     * Lấy báo cáo doanh thu theo phim
     * @param {Date} startDate - Ngày bắt đầu
     * @param {Date} endDate - Ngày kết thúc
     * @returns {Promise<Array>} Báo cáo theo phim
     */
    async getMovieRevenueReportAsync(startDate, endDate) {
        let pool;
        try {
            logger.info(`Generating movie revenue report from ${startDate} to ${endDate}`);

            pool = await getConnection();

            const result = await pool.request()
                .input('startDate', sql.DateTime, startDate)
                .input('endDate', sql.DateTime, endDate)
                .query(`
                    SELECT 
                        m.Movie_ID,
                        m.Movie_Name,
                        m.Genre,
                        m.Duration,
                        m.Release_Date,
                        COUNT(DISTINCT tb.Booking_ID) as TotalBookings,
                        SUM(CASE WHEN t.Ticket_ID IS NOT NULL THEN 1 ELSE 0 END) as TotalTickets,
                        SUM(tb.Total_Amount) as TotalRevenue,
                        AVG(tb.Total_Amount) as AverageBookingValue,
                        COUNT(DISTINCT s.Showtime_ID) as TotalShowtimes,
                        COUNT(DISTINCT cr.Cinema_ID) as CinemasShowing
                    FROM ksf00691_team03.Movies m
                    INNER JOIN ksf00691_team03.Showtimes s ON m.Movie_ID = s.Movie_ID
                    INNER JOIN ksf00691_team03.Ticket_Bookings tb ON s.Showtime_ID = tb.Showtime_ID
                    LEFT JOIN ksf00691_team03.Tickets t ON tb.Booking_ID = t.Booking_ID
                    INNER JOIN ksf00691_team03.Cinema_Rooms cr ON s.Cinema_Room_ID = cr.Cinema_Room_ID
                    WHERE CAST(tb.Booking_Date as DATE) >= CAST(@startDate as DATE)
                        AND CAST(tb.Booking_Date as DATE) <= CAST(@endDate as DATE)
                        AND tb.Status = 'Confirmed'
                    GROUP BY m.Movie_ID, m.Movie_Name, m.Genre, m.Duration, m.Release_Date
                    ORDER BY TotalRevenue DESC
                `);

            const movies = result.recordset.map(movie => ({
                movie_id: movie.Movie_ID,
                title: movie.Movie_Name,
                genre: movie.Genre,
                duration: movie.Duration,
                release_date: movie.Release_Date,
                total_bookings: movie.TotalBookings,
                total_tickets: movie.TotalTickets,
                total_revenue: movie.TotalRevenue,
                average_booking_value: movie.AverageBookingValue,
                total_showtimes: movie.TotalShowtimes,
                cinemas_showing: movie.CinemasShowing,
                revenue_per_showtime: movie.TotalShowtimes > 0 ? movie.TotalRevenue / movie.TotalShowtimes : 0
            }));

            logger.info(`Movie revenue report generated successfully. ${movies.length} movies found`);
            return movies;

        } catch (error) {
            logger.error('Error generating movie revenue report:', error);
            throw error;
        }
    }

    /**
     * Lấy báo cáo doanh thu theo rạp
     * @param {Date} startDate - Ngày bắt đầu
     * @param {Date} endDate - Ngày kết thúc
     * @returns {Promise<Array>} Báo cáo theo rạp
     */
    async getCinemaRevenueReportAsync(startDate, endDate) {
        let pool;
        try {
            logger.info(`Generating cinema revenue report from ${startDate} to ${endDate}`);

            pool = await getConnection();

            const result = await pool.request()
                .input('startDate', sql.DateTime, startDate)
                .input('endDate', sql.DateTime, endDate)
                .query(`
                    SELECT 
                        c.Cinema_ID,
                        c.Cinema_Name,
                        c.Address,
                        COUNT(DISTINCT tb.Booking_ID) as TotalBookings,
                        SUM(CASE WHEN t.Ticket_ID IS NOT NULL THEN 1 ELSE 0 END) as TotalTickets,
                        SUM(tb.Total_Amount) as TotalRevenue,
                        AVG(tb.Total_Amount) as AverageBookingValue,
                        COUNT(DISTINCT s.Showtime_ID) as TotalShowtimes,
                        COUNT(DISTINCT cr.Cinema_Room_ID) as ActiveRooms,
                        COUNT(DISTINCT m.Movie_ID) as MoviesShown
                    FROM ksf00691_team03.Cinemas c
                    INNER JOIN ksf00691_team03.Cinema_Rooms cr ON c.Cinema_ID = cr.Cinema_ID
                    INNER JOIN ksf00691_team03.Showtimes s ON cr.Cinema_Room_ID = s.Cinema_Room_ID
                    INNER JOIN ksf00691_team03.Ticket_Bookings tb ON s.Showtime_ID = tb.Showtime_ID
                    LEFT JOIN ksf00691_team03.Tickets t ON tb.Booking_ID = t.Booking_ID
                    INNER JOIN ksf00691_team03.Movies m ON s.Movie_ID = m.Movie_ID
                    WHERE CAST(tb.Booking_Date as DATE) >= CAST(@startDate as DATE)
                        AND CAST(tb.Booking_Date as DATE) <= CAST(@endDate as DATE)
                        AND tb.Status = 'Confirmed'
                    GROUP BY c.Cinema_ID, c.Cinema_Name, c.Address
                    ORDER BY TotalRevenue DESC
                `);

            const cinemas = result.recordset.map(cinema => ({
                cinema_id: cinema.Cinema_ID,
                cinema_name: cinema.Cinema_Name,
                location: cinema.Address,
                total_bookings: cinema.TotalBookings,
                total_tickets: cinema.TotalTickets,
                total_revenue: cinema.TotalRevenue,
                average_booking_value: cinema.AverageBookingValue,
                total_showtimes: cinema.TotalShowtimes,
                active_rooms: cinema.ActiveRooms,
                movies_shown: cinema.MoviesShown,
                revenue_per_room: cinema.ActiveRooms > 0 ? cinema.TotalRevenue / cinema.ActiveRooms : 0
            }));

            logger.info(`Cinema revenue report generated successfully. ${cinemas.length} cinemas found`);
            return cinemas;

        } catch (error) {
            logger.error('Error generating cinema revenue report:', error);
            throw error;
        }
    }

    /**
     * Lấy báo cáo chi tiết phương thức thanh toán
     * @param {Date} startDate - Ngày bắt đầu
     * @param {Date} endDate - Ngày kết thúc
     * @returns {Promise<Object>} Báo cáo phương thức thanh toán
     */
    async getPaymentMethodReportAsync(startDate, endDate) {
        let pool;
        try {
            logger.info(`Generating payment method report from ${startDate} to ${endDate}`);

            pool = await getConnection();

            const result = await pool.request()
                .input('startDate', sql.DateTime, startDate)
                .input('endDate', sql.DateTime, endDate)
                .query(`
                    SELECT 
                        p.Payment_Method,
                        p.Payment_Status,
                        COUNT(DISTINCT p.Payment_ID) as TotalTransactions,
                        COUNT(DISTINCT tb.Booking_ID) as TotalBookings,
                        SUM(p.Amount) as TotalAmount,
                        AVG(p.Amount) as AverageTransactionValue,
                        MIN(p.Amount) as MinTransactionValue,
                        MAX(p.Amount) as MaxTransactionValue,
                        COUNT(CASE WHEN p.Payment_Status = 'Completed' THEN 1 END) as SuccessfulTransactions,
                        COUNT(CASE WHEN p.Payment_Status = 'Failed' THEN 1 END) as FailedTransactions,
                        COUNT(CASE WHEN p.Payment_Status = 'Pending' THEN 1 END) as PendingTransactions
                    FROM ksf00691_team03.Payments p
                    INNER JOIN ksf00691_team03.Ticket_Bookings tb ON p.Booking_ID = tb.Booking_ID
                    WHERE CAST(p.Transaction_Date as DATE) >= CAST(@startDate as DATE)
                        AND CAST(p.Transaction_Date as DATE) <= CAST(@endDate as DATE)
                    GROUP BY p.Payment_Method, p.Payment_Status
                    ORDER BY p.Payment_Method, TotalAmount DESC
                `);

            // Tính tổng để tính phần trăm
            const totalAmount = result.recordset.reduce((sum, row) => sum + row.TotalAmount, 0);
            const totalTransactions = result.recordset.reduce((sum, row) => sum + row.TotalTransactions, 0);

            // Group by payment method
            const methodMap = new Map();
            result.recordset.forEach(row => {
                const method = row.Payment_Method;
                if (!methodMap.has(method)) {
                    methodMap.set(method, {
                        payment_method: method,
                        total_transactions: 0,
                        total_bookings: 0,
                        total_amount: 0,
                        successful_transactions: 0,
                        failed_transactions: 0,
                        pending_transactions: 0,
                        success_rate: 0,
                        amount_percentage: 0,
                        transaction_percentage: 0,
                        average_transaction_value: 0,
                        min_transaction_value: 0,
                        max_transaction_value: 0
                    });
                }

                const methodData = methodMap.get(method);
                methodData.total_transactions += row.TotalTransactions;
                methodData.total_bookings += row.TotalBookings;
                methodData.total_amount += row.TotalAmount;
                methodData.successful_transactions += row.SuccessfulTransactions;
                methodData.failed_transactions += row.FailedTransactions;
                methodData.pending_transactions += row.PendingTransactions;
                methodData.min_transaction_value = Math.min(methodData.min_transaction_value || row.MinTransactionValue, row.MinTransactionValue);
                methodData.max_transaction_value = Math.max(methodData.max_transaction_value || row.MaxTransactionValue, row.MaxTransactionValue);
            });

            // Calculate percentages and success rates
            const methods = Array.from(methodMap.values()).map(method => {
                method.success_rate = method.total_transactions > 0 ? 
                    ((method.successful_transactions / method.total_transactions) * 100).toFixed(2) : 0;
                method.amount_percentage = totalAmount > 0 ? 
                    ((method.total_amount / totalAmount) * 100).toFixed(2) : 0;
                method.transaction_percentage = totalTransactions > 0 ? 
                    ((method.total_transactions / totalTransactions) * 100).toFixed(2) : 0;
                method.average_transaction_value = method.total_transactions > 0 ? 
                    (method.total_amount / method.total_transactions) : 0;
                return method;
            });

            // Sort by total amount
            methods.sort((a, b) => b.total_amount - a.total_amount);

            const report = {
                period: {
                    start_date: startDate,
                    end_date: endDate
                },
                summary: {
                    total_amount: totalAmount,
                    total_transactions: totalTransactions,
                    unique_payment_methods: methods.length
                },
                payment_methods: methods,
                generated_at: new Date()
            };

            logger.info(`Payment method report generated successfully. ${methods.length} payment methods found`);
            return report;

        } catch (error) {
            logger.error('Error generating payment method report:', error);
            throw error;
        }
    }

    /**
     * Lấy báo cáo phân loại doanh thu (vé phim, bắp nước, quảng cáo)
     * @param {Date} startDate - Ngày bắt đầu
     * @param {Date} endDate - Ngày kết thúc
     * @returns {Promise<Object>} Báo cáo phân loại doanh thu
     */
    async getRevenueCategoryReportAsync(startDate, endDate) {
        let pool;
        try {
            logger.info(`Generating revenue category report from ${startDate} to ${endDate}`);

            pool = await getConnection();

            // Lấy doanh thu từ vé phim
            const ticketRevenue = await pool.request()
                .input('startDate', sql.DateTime, startDate)
                .input('endDate', sql.DateTime, endDate)
                .query(`
                    SELECT 
                        'Vé phim' as Category,
                        COUNT(DISTINCT tb.Booking_ID) as TotalTransactions,
                        SUM(tb.Total_Amount) as TotalAmount,
                        SUM(CASE WHEN t.Ticket_ID IS NOT NULL THEN 1 ELSE 0 END) as TotalItems
                    FROM ksf00691_team03.Ticket_Bookings tb
                    LEFT JOIN ksf00691_team03.Tickets t ON tb.Booking_ID = t.Booking_ID
                    WHERE CAST(tb.Booking_Date as DATE) >= CAST(@startDate as DATE)
                        AND CAST(tb.Booking_Date as DATE) <= CAST(@endDate as DATE)
                        AND tb.Status = 'Confirmed'
                `);

            // Simulate concession sales (bắp nước) - Giả lập vì chưa có bảng concession
            const concessionRevenue = await pool.request()
                .input('startDate', sql.DateTime, startDate)
                .input('endDate', sql.DateTime, endDate)
                .query(`
                    SELECT 
                        'Bắp nước' as Category,
                        COUNT(DISTINCT tb.Booking_ID) * 0.6 as TotalTransactions,
                        SUM(tb.Total_Amount) * 0.3 as TotalAmount,
                        COUNT(DISTINCT tb.Booking_ID) * 1.8 as TotalItems
                    FROM ksf00691_team03.Ticket_Bookings tb
                    WHERE CAST(tb.Booking_Date as DATE) >= CAST(@startDate as DATE)
                        AND CAST(tb.Booking_Date as DATE) <= CAST(@endDate as DATE)
                        AND tb.Status = 'Confirmed'
                `);

            // Simulate advertising revenue (quảng cáo) - Giả lập
            const advertisingRevenue = await pool.request()
                .input('startDate', sql.DateTime, startDate)
                .input('endDate', sql.DateTime, endDate)
                .query(`
                    SELECT 
                        'Quảng cáo' as Category,
                        COUNT(DISTINCT s.Showtime_ID) * 0.8 as TotalTransactions,
                        COUNT(DISTINCT s.Showtime_ID) * 15000 as TotalAmount,
                        COUNT(DISTINCT s.Showtime_ID) * 2.5 as TotalItems
                    FROM ksf00691_team03.Showtimes s
                    INNER JOIN ksf00691_team03.Ticket_Bookings tb ON s.Showtime_ID = tb.Showtime_ID
                    WHERE CAST(tb.Booking_Date as DATE) >= CAST(@startDate as DATE)
                        AND CAST(tb.Booking_Date as DATE) <= CAST(@endDate as DATE)
                        AND tb.Status = 'Confirmed'
                `);

            const categories = [
                ...ticketRevenue.recordset,
                ...concessionRevenue.recordset,
                ...advertisingRevenue.recordset
            ];

            // Tính tổng và phần trăm
            const totalAmount = categories.reduce((sum, cat) => sum + cat.TotalAmount, 0);
            const totalTransactions = categories.reduce((sum, cat) => sum + cat.TotalTransactions, 0);

            const processedCategories = categories.map(category => ({
                category: category.Category,
                total_transactions: Math.round(category.TotalTransactions),
                total_amount: Math.round(category.TotalAmount),
                total_items: Math.round(category.TotalItems),
                amount_percentage: totalAmount > 0 ? 
                    ((category.TotalAmount / totalAmount) * 100).toFixed(2) : 0,
                transaction_percentage: totalTransactions > 0 ? 
                    ((category.TotalTransactions / totalTransactions) * 100).toFixed(2) : 0,
                average_transaction_value: category.TotalTransactions > 0 ? 
                    (category.TotalAmount / category.TotalTransactions) : 0
            }));

            // Sort by total amount
            processedCategories.sort((a, b) => b.total_amount - a.total_amount);

            const report = {
                period: {
                    start_date: startDate,
                    end_date: endDate
                },
                summary: {
                    total_amount: totalAmount,
                    total_transactions: totalTransactions,
                    total_categories: processedCategories.length
                },
                categories: processedCategories,
                generated_at: new Date()
            };

            logger.info(`Revenue category report generated successfully. Total amount: ${totalAmount}`);
            return report;

        } catch (error) {
            logger.error('Error generating revenue category report:', error);
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