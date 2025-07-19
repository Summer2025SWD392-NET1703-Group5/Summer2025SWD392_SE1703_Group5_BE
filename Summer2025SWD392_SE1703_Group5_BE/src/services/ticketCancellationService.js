// src/services/ticketCancellationService.js
const logger = require('../utils/logger');
const { Ticket, TicketBooking, Showtime, Movie, User, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * Background Service để tự động hủy vé quá hạn
 * Hủy các vé đã được xác nhận nhưng suất chiếu đã qua
 */
class TicketCancellationService {
    constructor() {
        this.logger = logger;
        // Khoảng thời gian chạy (mặc định là 2 giờ một lần)
        this.checkInterval = 2 * 60 * 60 * 1000; // 2 giờ = 7200000ms

        // Biến để lưu trữ interval ID
        this.intervalId = null;

        // Biến để lưu trữ timeout ID cho lần chạy đầu tiên
        this.timeoutId = null;

        // Biến để kiểm soát việc dừng service
        this.isRunning = false;

        // Đếm số lần kiểm tra
        this.totalChecks = 0;
        this.totalCancelledTickets = 0;

        // Thời gian delay sau khi suất chiếu kết thúc mới hủy vé (phút)
        this.gracePeriodMinutes = 30;
    }

    /**
     * Bắt đầu background service
     */
    async start() {
        if (this.isRunning) {
            this.logger.warn('[TicketCancellationService] Service đã đang chạy');
            return;
        }

        try {
            this.logger.info('[TicketCancellationService] Đang khởi động service hủy vé quá hạn...');
            
            // Chạy lần đầu tiên ngay lập tức
            await this.executeCheck();
            
            // Thiết lập interval để chạy định kỳ
            this.intervalId = setInterval(async () => {
                await this.executeCheck();
            }, this.checkInterval);

            this.isRunning = true;
            this.logger.info(`[TicketCancellationService] ✅ Service đã khởi động thành công! Sẽ chạy mỗi ${this.checkInterval / (60 * 1000)} phút`);
            
        } catch (error) {
            this.logger.error('[TicketCancellationService] ❌ Lỗi khi khởi động service:', error);
            this.isRunning = false;
        }
    }

    /**
     * Dừng background service
     */
    stop() {
        if (!this.isRunning) {
            this.logger.warn('[TicketCancellationService] Service không đang chạy');
            return;
        }

        try {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }

            if (this.timeoutId) {
                clearTimeout(this.timeoutId);
                this.timeoutId = null;
            }

            this.isRunning = false;
            this.logger.info('[TicketCancellationService] ✅ Service đã dừng thành công');
            
        } catch (error) {
            this.logger.error('[TicketCancellationService] ❌ Lỗi khi dừng service:', error);
        }
    }

    /**
     * Thực hiện kiểm tra và hủy vé quá hạn
     */
    async executeCheck() {
        const startTime = new Date();
        this.totalChecks++;

        try {
            this.logger.info(`[TicketCancellationService] 🔍 Bắt đầu kiểm tra vé quá hạn lần thứ ${this.totalChecks} - ${startTime.toISOString()}`);

            // Kiểm tra xem models có tồn tại không
            if (!Ticket || !TicketBooking || !Showtime) {
                this.logger.warn('[TicketCancellationService] Models chưa được khởi tạo, bỏ qua lần kiểm tra này');
                return {
                    message: 'Models chưa sẵn sàng',
                    currentTime: startTime,
                    totalChecks: this.totalChecks
                };
            }

            // Tìm các vé cần hủy bằng cách join manual để tránh lỗi associations
            const expiredTickets = await sequelize.query(`
                SELECT
                    t.Ticket_ID,
                    t.Booking_ID,
                    s.Showtime_ID,
                    s.Show_Date,
                    s.Start_Time,
                    s.End_Time,
                    m.Movie_Name,
                    m.Duration
                FROM ksf00691_team03.Tickets t
                INNER JOIN ksf00691_team03.Ticket_Bookings tb ON t.Booking_ID = tb.Booking_ID
                INNER JOIN ksf00691_team03.Showtimes s ON tb.Showtime_ID = s.Showtime_ID
                INNER JOIN ksf00691_team03.Movies m ON s.Movie_ID = m.Movie_ID
                WHERE t.Status = 'Active'
                    AND tb.Status = 'Confirmed'
            `, {
                type: sequelize.QueryTypes.SELECT
            });

            // Filter expired tickets in JavaScript để tránh SQL date conversion issues
            const now = new Date();
            const expiredTicketsFromSQL = [];

            for (const ticket of expiredTickets) {
                try {
                    // Parse show date and time safely
                    let showDateTime;

                    // Handle different date formats
                    if (ticket.Show_Date && ticket.Start_Time) {
                        // Convert Show_Date to proper date format
                        const showDate = new Date(ticket.Show_Date);

                        // Parse Start_Time (could be HH:mm:ss or HH:mm format)
                        const timeStr = ticket.Start_Time.toString();
                        const timeParts = timeStr.split(':');
                        const hours = parseInt(timeParts[0]) || 0;
                        const minutes = parseInt(timeParts[1]) || 0;
                        const seconds = parseInt(timeParts[2]) || 0;

                        // Create combined datetime
                        showDateTime = new Date(showDate);
                        showDateTime.setHours(hours, minutes, seconds, 0);
                    } else {
                        this.logger.warn(`[TicketCancellationService] Invalid date/time for ticket ${ticket.Ticket_ID}`);
                        continue;
                    }

                    // Calculate expected end time (movie duration + grace period)
                    const durationMinutes = parseInt(ticket.Duration) || 0;
                    const expectedEndTime = new Date(showDateTime.getTime() + (durationMinutes + this.gracePeriodMinutes) * 60000);

                    // Check if ticket is expired
                    if (expectedEndTime < now) {
                        const minutesOverdue = Math.floor((now - expectedEndTime) / 60000);

                        expiredTicketsFromSQL.push({
                            Ticket_ID: ticket.Ticket_ID,
                            Booking_ID: ticket.Booking_ID,
                            Showtime_ID: ticket.Showtime_ID,
                            Show_Date: ticket.Show_Date,
                            Start_Time: ticket.Start_Time,
                            End_Time: ticket.End_Time,
                            Movie_Name: ticket.Movie_Name,
                            Duration: ticket.Duration,
                            ExpectedEndTime: expectedEndTime,
                            CurrentTime: now,
                            MinutesOverdue: minutesOverdue
                        });
                    }
                } catch (error) {
                    this.logger.warn(`[TicketCancellationService] Lỗi khi xử lý ticket ${ticket.Ticket_ID}:`, error.message);
                }
            }

            this.logger.info(`[TicketCancellationService] Tìm thấy ${expiredTicketsFromSQL.length} vé cần hủy`);

            if (expiredTicketsFromSQL.length === 0) {
                this.logger.info('[TicketCancellationService] ✅ Không có vé nào cần hủy');
                return {
                    message: 'Không có vé quá hạn',
                    currentTime: startTime,
                    totalChecks: this.totalChecks,
                    totalCancelledTickets: this.totalCancelledTickets
                };
            }

            // Xử lý từng vé quá hạn
            let cancelledCount = 0;
            const cancelledTickets = [];

            for (const sqlTicket of expiredTicketsFromSQL) {
                try {
                    this.logger.warn(`[TicketCancellationService] Vé #${sqlTicket.Ticket_ID} đã quá hạn ${sqlTicket.MinutesOverdue} phút (Phim: ${sqlTicket.Movie_Name})`);

                    const result = await this.cancelExpiredTicket(sqlTicket);
                    if (result.success) {
                        cancelledCount++;
                        cancelledTickets.push(sqlTicket.Ticket_ID);
                        this.totalCancelledTickets++;
                    }

                } catch (error) {
                    this.logger.error(`[TicketCancellationService] Lỗi khi hủy vé #${sqlTicket.Ticket_ID}:`, error);
                }
            }

            const endTime = new Date();
            const duration = endTime - startTime;

            this.logger.info(`[TicketCancellationService] ✅ Hoàn thành kiểm tra: ${cancelledCount}/${expiredTicketsFromSQL.length} vé đã được hủy trong ${duration}ms`);

            return {
                message: `Đã hủy ${cancelledCount} vé quá hạn`,
                cancelledTickets,
                totalProcessed: expiredTicketsFromSQL.length,
                totalCancelled: cancelledCount,
                duration: `${duration}ms`,
                totalChecks: this.totalChecks,
                totalCancelledTickets: this.totalCancelledTickets
            };

        } catch (error) {
            this.logger.error('[TicketCancellationService] ❌ Lỗi trong quá trình kiểm tra:', error);
            throw error;
        }
    }

    /**
     * Hủy một vé quá hạn
     */
    async cancelExpiredTicket(ticketData) {
        const transaction = await sequelize.transaction();

        try {
            // Cập nhật trạng thái vé thành 'Cancelled'
            const [updatedRows] = await Ticket.update(
                { 
                    Status: 'Cancelled',
                    Updated_At: new Date()
                },
                { 
                    where: { 
                        Ticket_ID: ticketData.Ticket_ID,
                        Status: 'Active'
                    },
                    transaction 
                }
            );

            if (updatedRows === 0) {
                await transaction.rollback();
                return {
                    success: false,
                    message: `Vé #${ticketData.Ticket_ID} không thể hủy (có thể đã được hủy trước đó)`
                };
            }

            // Log chi tiết
            this.logger.info(`[TicketCancellationService] ✅ Đã hủy vé #${ticketData.Ticket_ID} - Phim: ${ticketData.Movie_Name}, Suất chiếu: ${ticketData.Show_Date} ${ticketData.Start_Time}`);

            await transaction.commit();

            return {
                success: true,
                message: `Đã hủy vé #${ticketData.Ticket_ID}`,
                ticketId: ticketData.Ticket_ID,
                movieName: ticketData.Movie_Name,
                showtime: `${ticketData.Show_Date} ${ticketData.Start_Time}`
            };

        } catch (error) {
            await transaction.rollback();
            this.logger.error(`[TicketCancellationService] Lỗi khi hủy vé #${ticketData.Ticket_ID}:`, error);
            throw error;
        }
    }

    /**
     * Lấy thống kê service
     */
    getStats() {
        return {
            isRunning: this.isRunning,
            totalChecks: this.totalChecks,
            totalCancelledTickets: this.totalCancelledTickets,
            checkInterval: this.checkInterval,
            gracePeriodMinutes: this.gracePeriodMinutes,
            nextCheckIn: this.intervalId ? 'Running' : 'Stopped'
        };
    }

    /**
     * Force check một vé cụ thể
     */
    async forceCheckTicket(ticketId) {
        try {
            this.logger.info(`[TicketCancellationService] Force check vé #${ticketId}...`);

            // Kiểm tra vé bằng SQL
            const [sqlCheck] = await sequelize.query(`
                SELECT 
                    t.Ticket_ID,
                    t.Status as Ticket_Status,
                    tb.Status as Booking_Status,
                    s.Show_Date,
                    s.Start_Time,
                    m.Duration,
                    m.Movie_Name,
                    DATEADD(MINUTE, m.Duration + ${this.gracePeriodMinutes}, 
                           CAST(CONCAT(s.Show_Date, ' ', s.Start_Time) AS DATETIME)) as ExpectedEndTime,
                    GETDATE() as CurrentTime,
                    CASE WHEN DATEADD(MINUTE, m.Duration + ${this.gracePeriodMinutes}, 
                                     CAST(CONCAT(s.Show_Date, ' ', s.Start_Time) AS DATETIME)) < GETDATE()
                         THEN 1 ELSE 0 END as IsExpired
                FROM ksf00691_team03.Tickets t
                INNER JOIN ksf00691_team03.Ticket_Bookings tb ON t.Booking_ID = tb.Booking_ID
                INNER JOIN ksf00691_team03.Showtimes s ON tb.Showtime_ID = s.Showtime_ID
                INNER JOIN ksf00691_team03.Movies m ON s.Movie_ID = m.Movie_ID
                WHERE t.Ticket_ID = ${ticketId}
            `);

            if (!sqlCheck || sqlCheck.length === 0) {
                return {
                    success: false,
                    message: `Không tìm thấy vé #${ticketId}`
                };
            }

            const ticketInfo = sqlCheck[0];

            if (ticketInfo.Ticket_Status !== 'Active') {
                return {
                    success: false,
                    message: `Vé #${ticketId} đã có trạng thái: ${ticketInfo.Ticket_Status}`
                };
            }

            if (ticketInfo.Booking_Status !== 'Confirmed') {
                return {
                    success: false,
                    message: `Booking của vé #${ticketId} chưa được xác nhận: ${ticketInfo.Booking_Status}`
                };
            }

            if (!ticketInfo.IsExpired) {
                return {
                    success: false,
                    message: `Vé #${ticketId} chưa quá hạn. Suất chiếu kết thúc lúc: ${ticketInfo.ExpectedEndTime}`
                };
            }

            // Vé đã quá hạn, tiến hành hủy
            const result = await this.cancelExpiredTicket(ticketInfo);

            return {
                success: true,
                message: `Đã force hủy vé #${ticketId}`,
                result
            };

        } catch (error) {
            this.logger.error(`[TicketCancellationService] Lỗi khi force check vé #${ticketId}:`, error);
            throw error;
        }
    }
}

module.exports = new TicketCancellationService();
