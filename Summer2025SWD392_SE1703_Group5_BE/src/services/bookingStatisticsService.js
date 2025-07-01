// services/bookingStatisticsService.js
const { getConnection } = require('../config/database');

class BookingStatisticsService {

    /**
     * Helper method để execute query
     */
    async executeQuery(query, params = []) {
        try {
            console.log('[BookingStatisticsService] executeQuery - Query:', query);
            console.log('[BookingStatisticsService] executeQuery - Params:', params);
            
            const pool = await getConnection();
            const request = pool.request();
            
            // Bind parameters với đúng data type
            params.forEach((param, index) => {
                const paramName = `param${index}`;
                
                // Xử lý theo type của parameter
                if (typeof param === 'string') {
                    request.input(paramName, param);
                } else if (typeof param === 'number') {
                    request.input(paramName, param);
                } else if (param instanceof Date) {
                    request.input(paramName, param.toISOString().split('T')[0]);
                } else {
                    request.input(paramName, param);
                }
                
                console.log(`[BookingStatisticsService] Bound parameter ${paramName}:`, param);
            });
            
            // Replace ? với @param0, @param1, ... theo thứ tự
            let processedQuery = query;
            params.forEach((param, index) => {
                processedQuery = processedQuery.replace('?', `@param${index}`);
            });
            
            console.log('[BookingStatisticsService] Final query:', processedQuery);
            
            const result = await request.query(processedQuery);
            
            console.log('[BookingStatisticsService] Query result rows:', result.recordset?.length || 0);
            
            return [result.recordset]; // Để giống format của mysql
        } catch (error) {
            console.error('[BookingStatisticsService] executeQuery error:', error);
            console.error('[BookingStatisticsService] Query that failed:', query);
            console.error('[BookingStatisticsService] Params that failed:', params);
            throw error;
        }
    }

    /**
     * Lấy thống kê đặt vé theo khoảng thời gian
     */
    async getBookingStatistics(startDate = null, endDate = null) {
        try {
            console.log('[BookingStatisticsService] getBookingStatistics - Start:', startDate, 'End:', endDate);

            // Xây dựng điều kiện WHERE
            let whereClause = "WHERE tb.Status = 'Confirmed'";
            const params = [];

            if (startDate && endDate) {
                whereClause += " AND CAST(tb.Booking_Date as DATE) >= ? AND CAST(tb.Booking_Date as DATE) <= ?";
                params.push(
                    startDate.toISOString().split('T')[0],
                    endDate.toISOString().split('T')[0]
                );
            } else if (startDate) {
                whereClause += " AND CAST(tb.Booking_Date as DATE) >= ?";
                params.push(startDate.toISOString().split('T')[0]);
            } else if (endDate) {
                whereClause += " AND CAST(tb.Booking_Date as DATE) <= ?";
                params.push(endDate.toISOString().split('T')[0]);
            }

            // Query chính để lấy thống kê tổng quan
            const mainStatsQuery = `
                SELECT 
                    COUNT(DISTINCT tb.Booking_ID) as totalBookings,
                    COUNT(DISTINCT CASE WHEN tb.Status = 'Confirmed' THEN tb.Booking_ID END) as confirmedBookings,
                    COUNT(DISTINCT CASE WHEN tb.Status = 'Cancelled' THEN tb.Booking_ID END) as cancelledBookings,
                    COALESCE(SUM(CASE WHEN tb.Status = 'Confirmed' THEN tb.Total_Amount END), 0) as totalRevenue,
                    COALESCE(COUNT(t.Ticket_ID), 0) as totalTickets
                FROM ksf00691_team03.Ticket_Bookings tb
                LEFT JOIN ksf00691_team03.Tickets t ON tb.Booking_ID = t.Booking_ID
                LEFT JOIN ksf00691_team03.Showtimes s ON tb.Showtime_ID = s.Showtime_ID
                LEFT JOIN ksf00691_team03.Movies m ON s.Movie_ID = m.Movie_ID
                LEFT JOIN ksf00691_team03.Cinema_Rooms cr ON s.Cinema_Room_ID = cr.Cinema_Room_ID
                ${whereClause.replace("WHERE tb.Status = 'Confirmed'", "WHERE 1=1")}
            `;

            console.log('[BookingStatisticsService] Main stats query:', mainStatsQuery);
            console.log('[BookingStatisticsService] Params:', params);

            const [mainStats] = await this.executeQuery(mainStatsQuery, params);
            const stats = mainStats[0];

            // Tính trung bình vé trên mỗi booking
            const avgTicketsPerBooking = stats.confirmedBookings > 0
                ? (stats.totalTickets / stats.confirmedBookings)
                : 0;

            // Lấy thống kê chi tiết
            const [movieStats, roomStats, dailyStats, paymentStats] = await Promise.all([
                this.getMovieStatistics(startDate, endDate),
                this.getRoomStatistics(startDate, endDate),
                this.getDailyStatistics(startDate, endDate),
                this.getPaymentMethodStatistics(startDate, endDate)
            ]);

            const result = {
                startDate: startDate,
                endDate: endDate,
                totalBookings: parseInt(stats.totalBookings) || 0,
                confirmedBookings: parseInt(stats.confirmedBookings) || 0,
                cancelledBookings: parseInt(stats.cancelledBookings) || 0,
                totalRevenue: parseFloat(stats.totalRevenue) || 0,
                totalTickets: parseInt(stats.totalTickets) || 0,
                averageTicketsPerBooking: parseFloat(avgTicketsPerBooking.toFixed(2)),
                movieStatistics: movieStats,
                roomStatistics: roomStats,
                dailyStatistics: dailyStats,
                paymentMethodStatistics: paymentStats
            };

            console.log('[BookingStatisticsService] Result:', result);
            return result;

        } catch (error) {
            console.error('[BookingStatisticsService] getBookingStatistics error:', error);
            throw new Error(`Lỗi khi lấy thống kê đặt vé: ${error.message}`);
        }
    }

    /**
     * Lấy tất cả dữ liệu thống kê (không filter)
     */
    async getAllBookingStatistics() {
        try {
            console.log('[BookingStatisticsService] getAllBookingStatistics');

            // Lấy tất cả dữ liệu không filter theo ngày
            return await this.getBookingStatistics(null, null);

        } catch (error) {
            console.error('[BookingStatisticsService] getAllBookingStatistics error:', error);
            throw new Error(`Lỗi khi lấy tất cả thống kê: ${error.message}`);
        }
    }

    /**
     * Lấy thống kê theo phim
     */
    async getMovieStatistics(startDate = null, endDate = null) {
        try {
            console.log('[BookingStatisticsService] getMovieStatistics');

            let whereClause = "WHERE tb.Status = 'Confirmed'";
            const params = [];

            if (startDate && endDate) {
                whereClause += " AND CAST(tb.Booking_Date as DATE) >= ? AND CAST(tb.Booking_Date as DATE) <= ?";
                params.push(
                    startDate.toISOString().split('T')[0],
                    endDate.toISOString().split('T')[0]
                );
            } else if (startDate) {
                whereClause += " AND CAST(tb.Booking_Date as DATE) >= ?";
                params.push(startDate.toISOString().split('T')[0]);
            } else if (endDate) {
                whereClause += " AND CAST(tb.Booking_Date as DATE) <= ?";
                params.push(endDate.toISOString().split('T')[0]);
            }

            const query = `
                SELECT 
                    m.Movie_ID as movieId,
                    m.Movie_Name as movieName,
                    COUNT(DISTINCT tb.Booking_ID) as totalBookings,
                    COUNT(t.Ticket_ID) as totalTickets,
                    COALESCE(SUM(tb.Total_Amount), 0) as totalRevenue,
                    COALESCE(AVG(ticket_counts.ticket_count), 0) as averageTicketsPerBooking
                FROM ksf00691_team03.Ticket_Bookings tb
                INNER JOIN ksf00691_team03.Showtimes s ON tb.Showtime_ID = s.Showtime_ID
                INNER JOIN ksf00691_team03.Movies m ON s.Movie_ID = m.Movie_ID
                LEFT JOIN ksf00691_team03.Tickets t ON tb.Booking_ID = t.Booking_ID
                LEFT JOIN (
                    SELECT 
                        tb2.Booking_ID,
                        COUNT(t2.Ticket_ID) as ticket_count
                    FROM ksf00691_team03.Ticket_Bookings tb2
                    LEFT JOIN ksf00691_team03.Tickets t2 ON tb2.Booking_ID = t2.Booking_ID
                    GROUP BY tb2.Booking_ID
                ) ticket_counts ON tb.Booking_ID = ticket_counts.Booking_ID
                ${whereClause}
                GROUP BY m.Movie_ID, m.Movie_Name
                ORDER BY totalRevenue DESC
            `;

            const [rows] = await this.executeQuery(query, params);

            return rows.map(row => ({
                movieId: parseInt(row.movieId),
                movieName: row.movieName,
                totalBookings: parseInt(row.totalBookings) || 0,
                totalTickets: parseInt(row.totalTickets) || 0,
                totalRevenue: parseFloat(row.totalRevenue) || 0,
                averageTicketsPerBooking: parseFloat(parseFloat(row.averageTicketsPerBooking).toFixed(2))
            }));

        } catch (error) {
            console.error('[BookingStatisticsService] getMovieStatistics error:', error);
            throw new Error(`Lỗi khi lấy thống kê phim: ${error.message}`);
        }
    }

    /**
     * Lấy thống kê theo phòng chiếu
     */
    async getRoomStatistics(startDate = null, endDate = null) {
        try {
            console.log('[BookingStatisticsService] getRoomStatistics');

            let whereClause = "WHERE tb.Status = 'Confirmed'";
            const params = [];

            if (startDate && endDate) {
                whereClause += " AND CAST(tb.Booking_Date as DATE) >= ? AND CAST(tb.Booking_Date as DATE) <= ?";
                params.push(
                    startDate.toISOString().split('T')[0],
                    endDate.toISOString().split('T')[0]
                );
            } else if (startDate) {
                whereClause += " AND CAST(tb.Booking_Date as DATE) >= ?";
                params.push(startDate.toISOString().split('T')[0]);
            } else if (endDate) {
                whereClause += " AND CAST(tb.Booking_Date as DATE) <= ?";
                params.push(endDate.toISOString().split('T')[0]);
            }

            const query = `
                SELECT 
                    cr.Cinema_Room_ID as roomId,
                    cr.Room_Name as roomName,
                    cr.Seat_Quantity as roomCapacity,
                    COUNT(DISTINCT tb.Booking_ID) as totalBookings,
                    COUNT(t.Ticket_ID) as totalTickets,
                    COALESCE(SUM(tb.Total_Amount), 0) as totalRevenue,
                    ROUND(
                        (COUNT(t.Ticket_ID) * 100.0 / 
                        (cr.Seat_Quantity * COUNT(DISTINCT s.Showtime_ID))), 2
                    ) as occupancyRate
                FROM ksf00691_team03.Ticket_Bookings tb
                INNER JOIN ksf00691_team03.Showtimes s ON tb.Showtime_ID = s.Showtime_ID
                INNER JOIN ksf00691_team03.Cinema_Rooms cr ON s.Cinema_Room_ID = cr.Cinema_Room_ID
                LEFT JOIN ksf00691_team03.Tickets t ON tb.Booking_ID = t.Booking_ID
                ${whereClause}
                GROUP BY cr.Cinema_Room_ID, cr.Room_Name, cr.Seat_Quantity
                ORDER BY totalRevenue DESC
            `;

            const [rows] = await this.executeQuery(query, params);

            return rows.map(row => ({
                roomId: parseInt(row.roomId),
                roomName: row.roomName,
                roomCapacity: parseInt(row.roomCapacity),
                totalBookings: parseInt(row.totalBookings) || 0,
                totalTickets: parseInt(row.totalTickets) || 0,
                totalRevenue: parseFloat(row.totalRevenue) || 0,
                occupancyRate: parseFloat(row.occupancyRate) || 0
            }));

        } catch (error) {
            console.error('[BookingStatisticsService] getRoomStatistics error:', error);
            throw new Error(`Lỗi khi lấy thống kê phòng chiếu: ${error.message}`);
        }
    }

    /**
     * Lấy thống kê theo ngày
     */
    async getDailyStatistics(startDate = null, endDate = null) {
        try {
            console.log('[BookingStatisticsService] getDailyStatistics');

            let whereClause = "WHERE tb.Status = 'Confirmed'";
            const params = [];

            if (startDate && endDate) {
                whereClause += " AND CAST(tb.Booking_Date as DATE) >= ? AND CAST(tb.Booking_Date as DATE) <= ?";
                params.push(
                    startDate.toISOString().split('T')[0],
                    endDate.toISOString().split('T')[0]
                );
            } else if (startDate) {
                whereClause += " AND CAST(tb.Booking_Date as DATE) >= ?";
                params.push(startDate.toISOString().split('T')[0]);
            } else if (endDate) {
                whereClause += " AND CAST(tb.Booking_Date as DATE) <= ?";
                params.push(endDate.toISOString().split('T')[0]);
            }

            const query = `
                SELECT 
                    CAST(tb.Booking_Date as DATE) as date,
                    COUNT(DISTINCT tb.Booking_ID) as totalBookings,
                    COUNT(t.Ticket_ID) as totalTickets,
                    COALESCE(SUM(tb.Total_Amount), 0) as totalRevenue
                FROM ksf00691_team03.Ticket_Bookings tb
                LEFT JOIN ksf00691_team03.Tickets t ON tb.Booking_ID = t.Booking_ID
                ${whereClause}
                GROUP BY CAST(tb.Booking_Date as DATE)
                ORDER BY date DESC
            `;

            const [rows] = await this.executeQuery(query, params);

            return rows.map(row => ({
                date: row.date,
                totalBookings: parseInt(row.totalBookings) || 0,
                totalTickets: parseInt(row.totalTickets) || 0,
                totalRevenue: parseFloat(row.totalRevenue) || 0
            }));

        } catch (error) {
            console.error('[BookingStatisticsService] getDailyStatistics error:', error);
            throw new Error(`Lỗi khi lấy thống kê theo ngày: ${error.message}`);
        }
    }

    /**
     * Lấy thống kê theo phương thức thanh toán
     */
    async getPaymentMethodStatistics(startDate = null, endDate = null) {
        try {
            console.log('[BookingStatisticsService] getPaymentMethodStatistics');

            let whereClause = "WHERE tb.Status = 'Confirmed' AND p.Payment_Status = 'Completed'";
            const params = [];

            if (startDate && endDate) {
                whereClause += " AND CAST(tb.Booking_Date as DATE) >= ? AND CAST(tb.Booking_Date as DATE) <= ?";
                params.push(
                    startDate.toISOString().split('T')[0],
                    endDate.toISOString().split('T')[0]
                );
            } else if (startDate) {
                whereClause += " AND CAST(tb.Booking_Date as DATE) >= ?";
                params.push(startDate.toISOString().split('T')[0]);
            } else if (endDate) {
                whereClause += " AND CAST(tb.Booking_Date as DATE) <= ?";
                params.push(endDate.toISOString().split('T')[0]);
            }

            // Lấy tổng doanh thu để tính phần trăm
            const totalRevenueQuery = `
                SELECT COALESCE(SUM(p.Amount), 0) as totalRevenue
                FROM ksf00691_team03.Ticket_Bookings tb
                INNER JOIN ksf00691_team03.Payments p ON tb.Booking_ID = p.Booking_ID
                ${whereClause}
            `;

            const [totalResult] = await this.executeQuery(totalRevenueQuery, params);
            const totalRevenue = parseFloat(totalResult[0].totalRevenue) || 0;

            // Lấy thống kê theo phương thức thanh toán
            const query = `
                SELECT 
                    p.Payment_Method as paymentMethod,
                    COUNT(DISTINCT tb.Booking_ID) as totalBookings,
                    COALESCE(SUM(p.Amount), 0) as totalAmount
                FROM ksf00691_team03.Ticket_Bookings tb
                INNER JOIN ksf00691_team03.Payments p ON tb.Booking_ID = p.Booking_ID
                ${whereClause}
                GROUP BY p.Payment_Method
                ORDER BY totalAmount DESC
            `;

            const [rows] = await this.executeQuery(query, params);

            return rows.map(row => ({
                paymentMethod: row.paymentMethod,
                totalBookings: parseInt(row.totalBookings) || 0,
                totalAmount: parseFloat(row.totalAmount) || 0,
                percentage: totalRevenue > 0
                    ? parseFloat(((parseFloat(row.totalAmount) / totalRevenue) * 100).toFixed(2))
                    : 0
            }));

        } catch (error) {
            console.error('[BookingStatisticsService] getPaymentMethodStatistics error:', error);
            throw new Error(`Lỗi khi lấy thống kê phương thức thanh toán: ${error.message}`);
        }
    }
}

module.exports = new BookingStatisticsService();
