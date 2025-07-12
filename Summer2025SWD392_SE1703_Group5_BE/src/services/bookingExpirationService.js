// services/bookingExpirationService.js
const cron = require('node-cron');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

// Import models qua index.js của Sequelize
const db = require('../models');
const { TicketBooking, User, Seat, PointsTransaction } = db;
const sequelize = db.sequelize;

/**
 * Định dạng thời gian theo chuẩn Việt Nam (ngày/tháng/năm giờ:phút:giây)
 * @param {Date} date - Đối tượng Date cần định dạng
 * @return {string} Chuỗi thời gian định dạng dd/MM/yyyy HH:mm:ss
 */
function formatVietnameseDateTime(date) {
    if (!date || !(date instanceof Date) || isNaN(date)) {
        return 'Invalid Date';
    }

    // Sử dụng phương thức locale để lấy thời gian đúng
    // Đảm bảo không bị thay đổi múi giờ
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

class BookingExpirationService {
    constructor() {
        this.isRunning = false;
        this.cronJob = null;
        this.logger = logger;
        this.lastCheck = null;
        this.totalChecks = 0;
    }

    // Khởi động service
    start() {
        if (this.isRunning) {
            this.logger.warn('BookingExpirationService đã đang chạy');
            return { success: false, message: 'Service đã đang chạy' };
        }

        this.logger.info('Khởi động BookingExpirationService...');

        try {
            // Chạy mỗi phút
            this.cronJob = cron.schedule('* * * * *', async () => {
                await this.checkExpiredBookings();
            }, {
                scheduled: false
            });

            this.cronJob.start();
            this.isRunning = true;
            this.lastCheck = new Date();

            this.logger.info('BookingExpirationService đã được khởi động thành công');
            return { success: true, message: 'Service đã được khởi động' };
        } catch (error) {
            this.logger.error('Lỗi khi khởi động service:', error);
            return { success: false, message: 'Lỗi khi khởi động service', error: error.message };
        }
    }

    // Dừng service
    stop() {
        if (!this.isRunning) {
            this.logger.warn('BookingExpirationService chưa được khởi động');
            return { success: false, message: 'Service chưa được khởi động' };
        }

        try {
            if (this.cronJob) {
                this.cronJob.stop();
                this.isRunning = false;
                this.logger.info('BookingExpirationService đã dừng');
            }
            return { success: true, message: 'Đã dừng service thành công' };
        } catch (error) {
            this.logger.error('Lỗi khi dừng service:', error);
            return { success: false, message: 'Lỗi khi dừng service', error: error.message };
        }
    }

    // Lấy trạng thái service
    getStatus() {
        return {
            isRunning: this.isRunning,
            lastCheck: this.lastCheck,
            totalChecks: this.totalChecks,
            currentTime: new Date().toISOString(),
            message: this.isRunning ? 'Service đang hoạt động' : 'Service đã dừng'
        };
    }

    // Kiểm tra và xử lý booking quá hạn
    async checkExpiredBookings() {
        if (!this.isRunning) return;

        // Lấy thời gian hiện tại
        const now = new Date();

        this.totalChecks++;
        this.lastCheck = now;

        this.logger.info(`[${this.totalChecks}] Đang kiểm tra các booking quá hạn thanh toán tại ${formatVietnameseDateTime(now)}`);

        try {
            // Kiểm tra xem models có tồn tại không
            if (!TicketBooking) {
                this.logger.warn('Model TicketBooking chưa được khởi tạo, bỏ qua lần kiểm tra này');
                return {
                    message: 'Model TicketBooking chưa sẵn sàng',
                    currentTime: now,
                    totalChecks: this.totalChecks
                };
            }

            // Tìm các booking quá hạn bằng SQL trực tiếp để đảm bảo chính xác
            const [expiredBookingsFromSQL] = await sequelize.query(`
                SELECT Booking_ID, Payment_Deadline, 
                    GETDATE() as CurrentTime,
                    DATEDIFF(minute, Payment_Deadline, GETDATE()) as MinutesDiff
                FROM Ticket_Bookings 
                WHERE Status = 'Pending' 
                    AND Payment_Deadline < GETDATE()
            `);

            this.logger.info(`SQL trực tiếp tìm thấy ${expiredBookingsFromSQL.length} booking quá hạn`);

            // Xử lý từng booking đã quá hạn theo SQL
            if (expiredBookingsFromSQL.length > 0) {
                for (const sqlBooking of expiredBookingsFromSQL) {
                    this.logger.warn(`Booking #${sqlBooking.Booking_ID} đã quá hạn ${sqlBooking.MinutesDiff} phút theo SQL Server`);

                    // Lấy thông tin đầy đủ của booking
                    const booking = await TicketBooking.findOne({
                        where: { Booking_ID: sqlBooking.Booking_ID, Status: 'Pending' },
                        include: User ? [{
                            model: User,
                            as: 'User',
                            attributes: ['User_ID', 'Full_Name', 'Email']
                        }] : []
                    });

                    if (booking) {
                        await this.processExpiredBooking(booking);
                    }
                }

                return {
                    message: `Đã xử lý ${expiredBookingsFromSQL.length} booking quá hạn theo SQL`,
                    expiredBookings: expiredBookingsFromSQL.map(b => b.Booking_ID),
                    totalChecks: this.totalChecks
                };
            }

            // Hiển thị số lượng booking đang pending
            const pendingCount = await TicketBooking.count({
                where: { Status: 'Pending' }
            });

            if (pendingCount > 0) {
                this.logger.info(`Có ${pendingCount} booking đang Pending`);
            } else {
                this.logger.info(`Không tìm thấy booking nào đang ở trạng thái Pending`);
            }

            return {
                message: 'Không tìm thấy booking nào quá hạn',
                pendingCount: pendingCount,
                totalChecks: this.totalChecks
            };

        } catch (error) {
            this.logger.error('Lỗi trong vòng lặp kiểm tra đơn hàng quá hạn:', error);
            return {
                message: 'Lỗi khi kiểm tra booking quá hạn',
                error: error.message,
                totalChecks: this.totalChecks
            };
        }
    }

    // Xử lý booking đã quá hạn thanh toán
    async processExpiredBooking(booking) {
        this.logger.info(`Đang xử lý booking quá hạn ${booking.Booking_ID}`);

        // Kiểm tra nếu booking không còn trạng thái Pending
        if (booking.Status !== 'Pending') {
            this.logger.warn(`Booking ${booking.Booking_ID} đã không còn ở trạng thái Pending nên bỏ qua`);
            return {
                bookingId: booking.Booking_ID,
                success: false,
                reason: 'Trạng thái booking không phải Pending',
                currentStatus: booking.Status
            };
        }

        // Sử dụng giờ hiện tại
        const now = new Date();
        this.logger.info(`Thời gian hiện tại: ${formatVietnameseDateTime(now)}`);

        let transaction;
        try {
            transaction = await sequelize.transaction();

            // 1. Tìm tất cả các vé liên quan đến booking này
            let tickets = [];
            if (db.Ticket) {
                tickets = await db.Ticket.findAll({
                    where: { Booking_ID: booking.Booking_ID },
                    transaction
                });

                this.logger.info(`Booking ${booking.Booking_ID} có ${tickets.length} vé cần xóa`);

                // Xóa cứng vé thay vì cập nhật trạng thái
                if (tickets.length > 0) {
                    await db.Ticket.destroy({
                        where: { Booking_ID: booking.Booking_ID },
                        transaction
                    });
                    this.logger.info(`Đã xóa cứng ${tickets.length} vé của booking ${booking.Booking_ID}`);
                }
            }

            // 2. Cập nhật trạng thái booking thành Cancelled
            await booking.update(
                {
                    Status: 'Cancelled',
                    Cancellation_Reason: 'Expired Payment',
                    Updated_At: now
                },
                { transaction }
            );

            // 3. Xử lý hoàn điểm nếu khách đã sử dụng điểm
            let refundedPoints = 0;
            if (booking.Points_Used && booking.Points_Used > 0) {
                refundedPoints = booking.Points_Used;
                this.logger.info(`Cần hoàn trả ${refundedPoints} điểm cho người dùng ${booking.User_ID}`);
            }

            // 4. Tạo lịch sử booking
            if (db.BookingHistory) {
                await db.BookingHistory.create({
                    Booking_ID: booking.Booking_ID,
                    Action: 'BOOKING_CANCELLED',
                    Action_Date: sequelize.literal('GETDATE()'),
                    Details: `Đơn hàng được hủy tự động do quá hạn thanh toán. (${tickets.length} vé đã bị xóa)`,
                    User_ID: booking.User_ID || booking.Created_By
                }, { transaction });
            } else {
                this.logger.warn('Model BookingHistory không tồn tại, bỏ qua tạo lịch sử');
            }

            // 5. Gửi thông báo cho người dùng
            await this.sendCancellationNotification(booking, tickets.length);

            // 6. Commit transaction
            await transaction.commit();

            this.logger.info(`Đã hủy thành công booking ${booking.Booking_ID} do quá hạn thanh toán tại ${formatVietnameseDateTime(now)}`);

            // 7. Xử lý hoàn điểm sau khi commit (tránh lỗi với nested transactions)
            if (refundedPoints > 0) {
                try {
                    // Import service từ cache
                    delete require.cache[require.resolve('./pointsService')];
                    const pointsService = require('./pointsService');

                    // Gọi service hoàn điểm
                    const refundResult = await pointsService.refundPointsForCancelledBooking(
                        booking.User_ID,
                        booking.Booking_ID,
                        refundedPoints,
                        'Booking hết hạn thanh toán'
                    );

                    this.logger.info(`Đã xử lý hoàn ${refundedPoints} điểm cho user ${booking.User_ID}: ${refundResult.success ? 'Thành công' : 'Thất bại'}`);
                } catch (pointsError) {
                    this.logger.error(`Lỗi khi hoàn điểm: ${pointsError.message}`);
                }
            }

            return {
                bookingId: booking.Booking_ID,
                success: true,
                ticketsDeleted: tickets.length,
                pointsRefunded: refundedPoints
            };

        } catch (error) {
            // Rollback nếu có lỗi và transaction đã được bắt đầu
            if (transaction && !transaction.finished) {
                try {
                    await transaction.rollback();
                    this.logger.info(`Đã rollback transaction cho booking ${booking.Booking_ID} sau lỗi`);
                } catch (rollbackError) {
                    this.logger.error(`Lỗi khi rollback transaction: ${rollbackError.message}`);
                }
            }
            this.logger.error(`Lỗi khi xử lý booking quá hạn ${booking.Booking_ID}:`, error);
            throw error;
        }
    }

    // Gửi thông báo hủy đơn hàng
    async sendCancellationNotification(booking, seatsCount) {
        try {
            // Skip thông báo nếu không có thông tin người dùng
            if (!booking.User || !booking.User.Email) {
                this.logger.warn(`Không có thông tin người dùng để gửi thông báo cho booking ${booking.Booking_ID}`);
                return;
            }

            this.logger.info(`Gửi thông báo hủy booking ${booking.Booking_ID} cho ${booking.User.Email}`);

            // TODO: Implement email notification
            // await emailService.sendBookingCancelledNotification(booking.User.Email, {
            //     bookingId: booking.Booking_ID,
            //     customerName: booking.User.Full_Name,
            //     seatsCount,
            //     totalAmount: booking.Total_Amount
            // });

        } catch (error) {
            this.logger.error(`Lỗi khi gửi thông báo hủy booking ${booking.Booking_ID}:`, error);
            // Không throw lỗi, cho phép quy trình tiếp tục
        }
    }

    // Lấy thống kê booking quá hạn
    async getExpirationStats(startDate, endDate) {
        try {
            if (!TicketBooking) {
                throw new Error('Model TicketBooking chưa sẵn sàng');
            }

            const whereClause = {
                Status: 'Cancelled',
                Updated_At: {
                    [Op.between]: [startDate, endDate]
                }
            };

            const stats = await TicketBooking.findAll({
                where: whereClause,
                attributes: [
                    [sequelize.fn('COUNT', sequelize.col('Booking_ID')), 'total_expired'],
                    [sequelize.fn('SUM', sequelize.col('Total_Amount')), 'total_amount_lost'],
                    [sequelize.fn('SUM', sequelize.col('Points_Used')), 'total_points_refunded'],
                    [sequelize.fn('DATE', sequelize.col('Updated_At')), 'date']
                ],
                group: [sequelize.fn('DATE', sequelize.col('Updated_At'))],
                raw: true
            });

            return stats;
        } catch (error) {
            this.logger.error('Lỗi khi lấy thống kê booking quá hạn:', error);
            throw error;
        }
    }

    // Kiểm tra booking sắp hết hạn (để gửi thông báo)
    async getBookingsNearExpiration(minutesBefore = 30) {
        try {
            if (!TicketBooking) {
                throw new Error('Model TicketBooking chưa sẵn sàng');
            }

            // Sử dụng SQL để tìm booking sắp hết hạn thay vì JavaScript để tránh vấn đề múi giờ
            const [results] = await sequelize.query(`
                SELECT 
                    Booking_ID,
                    User_ID,
                    Payment_Deadline,
                    GETDATE() as CurrentTime,
                    DATEDIFF(minute, GETDATE(), Payment_Deadline) as MinutesLeft
                FROM Ticket_Bookings 
                WHERE Status = 'Pending' 
                    AND Payment_Deadline > GETDATE()
                    AND DATEDIFF(minute, GETDATE(), Payment_Deadline) <= :minutesBefore
                ORDER BY Payment_Deadline ASC
            `, {
                replacements: { minutesBefore },
                type: sequelize.QueryTypes.SELECT
            });

            if (!results || results.length === 0) {
                return [];
            }

            // Lấy thông tin đầy đủ của các booking sắp hết hạn
            const bookingIds = results.map(r => r.Booking_ID);
            const nearExpiryBookings = await TicketBooking.findAll({
                where: {
                    Booking_ID: { [Op.in]: bookingIds }
                },
                include: User ? [{
                    model: User,
                    as: 'User',
                    attributes: ['User_ID', 'Full_Name', 'Email', 'Phone_Number']
                }] : []
            });

            // Thêm thông tin thời gian còn lại từ SQL query
            const enhancedBookings = nearExpiryBookings.map(booking => {
                const sqlResult = results.find(r => r.Booking_ID === booking.Booking_ID);
                return {
                    ...booking.toJSON(),
                    Minutes_Left: sqlResult ? sqlResult.MinutesLeft : 0
                };
            });

            return enhancedBookings;
        } catch (error) {
            this.logger.error('Lỗi khi tìm booking sắp hết hạn:', error);
            throw error;
        }
    }

    // Force check một booking cụ thể
    async forceCheckBooking(bookingId) {
        try {
            if (!TicketBooking) {
                throw new Error('Model TicketBooking chưa sẵn sàng');
            }

            // Tìm booking bằng ORM
            const booking = await TicketBooking.findOne({
                where: {
                    Booking_ID: bookingId,
                    Status: 'Pending'
                },
                include: User ? [{
                    model: User,
                    as: 'User',
                    attributes: ['User_ID', 'Full_Name', 'Email']
                }] : []
            });

            if (!booking) {
                return {
                    success: false,
                    message: `Không tìm thấy booking ${bookingId} hoặc booking không ở trạng thái Pending`
                };
            }

            // Kiểm tra trực tiếp bằng SQL để tránh vấn đề múi giờ
            const [sqlResult] = await sequelize.query(`
                SELECT 
                    Booking_ID, 
                    CONVERT(VARCHAR, Payment_Deadline, 120) as DeadlineFormatted,
                    CONVERT(VARCHAR, GETDATE(), 120) as CurrentTimeFormatted,
                    DATEDIFF(minute, Payment_Deadline, GETDATE()) as MinutesDiff,
                    CASE WHEN Payment_Deadline < GETDATE() THEN 1 ELSE 0 END as IsExpired
                FROM Ticket_Bookings 
                WHERE Booking_ID = ${bookingId} AND Status = 'Pending'
            `);

            if (sqlResult.length === 0) {
                return {
                    success: false,
                    message: `Không tìm thấy booking ${bookingId} trong SQL check`
                };
            }

            const sqlCheck = sqlResult[0];
            const isExpired = sqlCheck.IsExpired === 1;
            const minutesDiff = sqlCheck.MinutesDiff;

            // Debug log các thông tin về múi giờ
            this.logger.info(`
                FORCE CHECK BOOKING #${bookingId}:
                - SQL Payment_Deadline: ${sqlCheck.DeadlineFormatted}
                - SQL Current Time: ${sqlCheck.CurrentTimeFormatted}
                - Đã quá hạn theo SQL: ${isExpired ? 'CÓ' : 'KHÔNG'} (${minutesDiff} phút)
                - JS Payment_Deadline: ${formatVietnameseDateTime(new Date(booking.Payment_Deadline))}
                - JS Current Time: ${formatVietnameseDateTime(new Date())}
            `);

            // Nếu không hết hạn theo SQL
            if (!isExpired) {
                return {
                    success: false,
                    message: `Booking ${bookingId} chưa quá hạn theo SQL Server`,
                    paymentDeadline: sqlCheck.DeadlineFormatted,
                    currentTime: sqlCheck.CurrentTimeFormatted,
                    remainingMinutes: -minutesDiff
                };
            }

            // Booking đã hết hạn, xử lý
            this.logger.warn(`Booking #${bookingId} đã quá hạn ${minutesDiff} phút theo SQL Server. Tiến hành hủy...`);
            const result = await this.processExpiredBooking(booking);

            return {
                success: true,
                message: `Đã xử lý booking ${bookingId} (quá hạn ${minutesDiff} phút)`,
                result
            };

        } catch (error) {
            this.logger.error(`Lỗi khi force check booking ${bookingId}:`, error);
            throw error;
        }
    }

    // Phương thức mới: Kiểm tra trực tiếp qua SQL để tìm booking hết hạn
    async findExpiredBookingsDirectSQL() {
        try {
            this.logger.info(`Thực hiện kiểm tra booking hết hạn trực tiếp qua SQL...`);

            // Truy vấn SQL trực tiếp để tìm booking quá hạn
            const [results] = await sequelize.query(`
                SELECT 
                    Booking_ID, 
                    User_ID,
                    Payment_Deadline, 
                    GETDATE() AS CurrentTime,
                    CONVERT(VARCHAR, Payment_Deadline, 120) AS DeadlineFormatted,
                    CONVERT(VARCHAR, GETDATE(), 120) AS CurrentTimeFormatted,
                    DATEDIFF(minute, Payment_Deadline, GETDATE()) AS ExpiredMinutes,
                    CASE WHEN Payment_Deadline < GETDATE() THEN 'Yes' ELSE 'No' END AS IsExpired
                FROM Ticket_Bookings 
                WHERE Status = 'Pending'
                ORDER BY Payment_Deadline ASC
            `);

            this.logger.info(`Tìm thấy ${results.length} booking đang pending qua SQL trực tiếp`);

            // Lọc các booking thực sự đã hết hạn
            const expiredBookings = results.filter(b => b.IsExpired === 'Yes');
            this.logger.info(`Trong đó có ${expiredBookings.length} booking đã hết hạn theo SQL`);

            // Xử lý từng booking hết hạn
            for (const expiredBooking of expiredBookings) {
                this.logger.warn(`SQL phát hiện booking #${expiredBooking.Booking_ID} đã hết hạn ${expiredBooking.ExpiredMinutes} phút. Đang thực hiện xử lý thủ công...`);

                try {
                    // Lấy booking đầy đủ từ database
                    const booking = await TicketBooking.findOne({
                        where: {
                            Booking_ID: expiredBooking.Booking_ID,
                            Status: 'Pending'
                        },
                        include: User ? [{
                            model: User,
                            as: 'User',
                            attributes: ['User_ID', 'Full_Name', 'Email']
                        }] : []
                    });

                    if (!booking) {
                        this.logger.warn(`Không tìm thấy booking #${expiredBooking.Booking_ID} hoặc đã không còn ở trạng thái Pending`);
                        continue;
                    }

                    // Xử lý booking hết hạn
                    const result = await this.processExpiredBooking(booking);
                    this.logger.info(`Đã xử lý thành công booking #${expiredBooking.Booking_ID} qua SQL: ${JSON.stringify(result)}`);
                } catch (processError) {
                    this.logger.error(`Lỗi khi xử lý booking #${expiredBooking.Booking_ID} từ SQL: ${processError.message}`, processError);
                }
            }

            return {
                success: true,
                totalChecked: results.length,
                expiredFound: expiredBookings.length,
                expiredBookings: expiredBookings.map(b => ({
                    booking_id: b.Booking_ID,
                    user_id: b.User_ID,
                    deadline: b.DeadlineFormatted,
                    current_time: b.CurrentTimeFormatted,
                    expired_minutes: b.ExpiredMinutes
                }))
            };
        } catch (error) {
            this.logger.error(`Lỗi khi tìm booking hết hạn qua SQL: ${error.message}`, error);
            throw error;
        }
    }
}

// Singleton instance
const bookingExpirationService = new BookingExpirationService();

module.exports = bookingExpirationService;