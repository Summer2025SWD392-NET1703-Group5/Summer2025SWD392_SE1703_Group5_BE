const { TicketBooking, BookingHistory, Ticket, Seat, SeatLayout, Showtime, Movie, CinemaRoom, User, sequelize, Op } = require('../models'); // Điều chỉnh đường dẫn và models nếu cần
const emailService = require('./emailService');
const ticketService = require('./ticketService');
const { parse, format, addMinutes, differenceInMinutes, isBefore, isEqual } = require('date-fns'); // Thư viện xử lý ngày giờ mạnh mẽ

const CHECK_INTERVAL_MINUTES = 1; // Khoảng thời gian kiểm tra (phút)
const REMINDER_BEFORE_MINUTES = 15; // Gửi nhắc nhở trước X phút

/**
 * @class BookingReminderService
 * @description Dịch vụ nền để gửi email nhắc nhở kèm vé cho các suất chiếu sắp bắt đầu.
 */
class BookingReminderService {
    constructor() {
        this._logger = console; // Thay thế bằng logger phù hợp (ví dụ: Winston)
        this.intervalId = null;
    }

    /**
     * Bắt đầu dịch vụ gửi email nhắc nhở.
     * Chạy ngay một lần khi bắt đầu, sau đó lặp lại theo `CHECK_INTERVAL_MINUTES`.
     */
    start() {
        this._logger.log('[BookingReminderService] Đang khởi động dịch vụ...');
        this.sendReminderEmails().catch(err => {
            this._logger.error('[BookingReminderService] Lỗi trong lần kiểm tra đầu tiên:', err);
        });

        this.intervalId = setInterval(
            () => this.sendReminderEmails().catch(err => {
                this._logger.error('[BookingReminderService] Lỗi trong quá trình kiểm tra định kỳ:', err);
            }),
            CHECK_INTERVAL_MINUTES * 60 * 1000
        );
        this._logger.log(`[BookingReminderService] Dịch vụ đã khởi động. Sẽ kiểm tra mỗi ${CHECK_INTERVAL_MINUTES} phút để gửi nhắc nhở trước ${REMINDER_BEFORE_MINUTES} phút.`);
    }

    /**
     * Dừng dịch vụ gửi email nhắc nhở.
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this._logger.log('[BookingReminderService] Dịch vụ đã dừng.');
        }
    }

    /**
     * Truy vấn và gửi email nhắc nhở cho các đơn hàng phù hợp.
     * @async
     * @private
     */
    async sendReminderEmails() {
        const now = new Date();
        // Thời điểm bắt đầu của khoảng thời gian 15 phút tới (tính từ now)
        const reminderWindowStart = now;
        // Thời điểm kết thúc của khoảng thời gian 15 phút tới (chính là thời điểm suất chiếu nên bắt đầu để được nhắc)
        const reminderWindowEnd = addMinutes(now, REMINDER_BEFORE_MINUTES);

        this._logger.log(`[BookingReminderService] Đang kiểm tra các suất chiếu từ ${format(reminderWindowStart, 'yyyy-MM-dd HH:mm:ss')} đến ${format(reminderWindowEnd, 'yyyy-MM-dd HH:mm:ss')} để gửi nhắc nhở.`);
        try {
            const bookingsToRemind = await TicketBooking.findAll({
                where: {
                    Status: 'Confirmed', // Chỉ các đơn đã xác nhận
                    // Điều kiện kiểm tra Showtime.Show_Date và Showtime.Start_Time
                    // Sequelize không hỗ trợ trực tiếp so sánh TimeOfDay, cần xử lý phức tạp hơn hoặc lấy nhiều hơn rồi lọc ở client
                    // Cách tiếp cận đơn giản: lấy các booking có ngày chiếu là hôm nay và giờ bắt đầu trong khoảng hợp lý
                    // và `ReminderSent` flag chưa được đặt (sẽ dùng BookingHistory để kiểm tra)
                },
                include: [
                    { model: User, as: 'User', required: true, where: { Email: { [Op.ne]: null } } }, // Đảm bảo có email
                    {
                        model: Showtime, as: 'Showtime', required: true,
                        include: [
                            { model: Movie, as: 'Movie', required: true },
                            { model: CinemaRoom, as: 'CinemaRoom', required: true }
                        ]
                    },
                    { model: BookingHistory, as: 'BookingHistories' } // Để kiểm tra Reminder Sent
                ]
            });

            let eligibleBookingsCount = 0;
            for (const booking of bookingsToRemind) {
                // Kiểm tra xem đã gửi nhắc nhở chưa
                const reminderAlreadySent = booking.BookingHistories && booking.BookingHistories.some(h => h.Status === 'Reminder Sent');
                if (reminderAlreadySent) {
                    continue; // Bỏ qua nếu đã gửi
                }

                // Xử lý thời gian cho Showtime
                // Giả sử Showtime.Show_Date là Date object (chỉ ngày) và Showtime.Start_Time là string dạng 'HH:mm' hoặc 'HH:mm:ss'
                if (!booking.Showtime || !booking.Showtime.Show_Date || !booking.Showtime.Start_Time) {
                    this._logger.warn(`[BookingReminderService] Booking ID ${booking.Booking_ID} thiếu thông tin Showtime hợp lệ.`);
                    continue;
                }

                let showDateTime;
                try {
                    // Chuẩn hóa Show_Date thành YYYY-MM-DD để parse an toàn hơn
                    const showDateStr = format(new Date(booking.Showtime.Show_Date), 'yyyy-MM-dd');
                    // Kết hợp ngày và giờ, sau đó parse
                    showDateTime = parse(`${showDateStr} ${booking.Showtime.Start_Time}`, 'yyyy-MM-dd HH:mm:ss', new Date());
                    if (isNaN(showDateTime.getTime())) { // Kiểm tra nếu parse không thành công
                        // Thử parse với định dạng 'HH:mm' nếu 'HH:mm:ss' thất bại
                        showDateTime = parse(`${showDateStr} ${booking.Showtime.Start_Time}`, 'yyyy-MM-dd HH:mm', new Date());
                        if (isNaN(showDateTime.getTime())) {
                            this._logger.error(`[BookingReminderService] Không thể parse ngày giờ suất chiếu cho Booking ID ${booking.Booking_ID}: Date=${booking.Showtime.Show_Date}, Time=${booking.Showtime.Start_Time}`);
                            continue;
                        }
                    }
                } catch (parseError) {
                    this._logger.error(`[BookingReminderService] Lỗi parse ngày giờ suất chiếu cho Booking ID ${booking.Booking_ID}:`, parseError);
                    continue;
                }

                // Kiểm tra xem suất chiếu có nằm trong khoảng thời gian cần nhắc nhở không
                // Tức là: now <= showDateTime < now + REMINDER_BEFORE_MINUTES (ví dụ: 15 phút)
                // Điều này có nghĩa là showDateTime phải xảy ra sau `now` một chút và trước `reminderWindowEnd`
                // Chính xác hơn: thời điểm hiện tại `now` phải nằm trong khoảng [showDateTime - REMINDER_BEFORE_MINUTES, showDateTime)
                const targetReminderTimeForShow = showDateTime; // Thời điểm suất chiếu diễn ra
                const reminderTriggerTimeStart = addMinutes(targetReminderTimeForShow, -REMINDER_BEFORE_MINUTES); // Thời điểm bắt đầu gửi nhắc (VD: 15 phút trước suất chiếu)

                // Gửi nếu `now` nằm giữa (thời điểm bắt đầu suất chiếu - 15 phút) và thời điểm bắt đầu suất chiếu
                // và `now` cũng phải trước thời điểm suất chiếu
                if (isBefore(now, targetReminderTimeForShow) && (isEqual(now, reminderTriggerTimeStart) || isBefore(reminderTriggerTimeStart, now))) {
                    this._logger.log(`[BookingReminderService] Booking ID ${booking.Booking_ID} đủ điều kiện gửi nhắc nhở. Suất chiếu lúc: ${format(showDateTime, 'yyyy-MM-dd HH:mm:ss')}`);
                    await this.processSingleReminder(booking, showDateTime);
                    eligibleBookingsCount++;
                }
            }
            if (eligibleBookingsCount > 0) {
                this._logger.log(`[BookingReminderService] Đã xử lý ${eligibleBookingsCount} đơn hàng cần gửi email nhắc nhở.`);
            } else {
                this._logger.log('[BookingReminderService] Không có đơn hàng nào mới cần gửi email nhắc nhở trong lần kiểm tra này.');
            }
        } catch (error) {
            this._logger.error('[BookingReminderService] Lỗi khi truy vấn và xử lý email nhắc nhở:', error);
        }
    }

    /**
     * Xử lý gửi email nhắc nhở cho một đơn hàng cụ thể.
     * @async
     * @param {object} booking - Đối tượng TicketBooking từ Sequelize (đã include User, Showtime, Movie, CinemaRoom).
     * @param {Date} showDateTimeObject - Đối tượng Date của suất chiếu.
     * @private
     */
    async processSingleReminder(booking, showDateTimeObject) {
        if (!booking.User || !booking.User.Email) {
            this._logger.warn(`[BookingReminderService] Booking ID ${booking.Booking_ID} không có thông tin email người dùng hợp lệ.`);
            return;
        }

        const transaction = await sequelize.transaction();
        try {
            this._logger.log(`[BookingReminderService] Đang chuẩn bị gửi email nhắc nhở cho Booking ID ${booking.Booking_ID} đến ${booking.User.Email}`);

            // Lấy thông tin vé (Tickets) liên quan đến Booking này
            const tickets = await Ticket.findAll({
                where: {
                    Booking_ID: booking.Booking_ID,
                    Status: { [Op.ne]: 'Cancelled' } // Không lấy vé đã hủy
                },
                include: [
                    {
                        model: Seat, as: 'Seat', required: true,
                        include: [{ model: SeatLayout, as: 'SeatLayout', required: true }]
                    }
                ],
                transaction
            });

            if (!tickets || tickets.length === 0) {
                this._logger.warn(`[BookingReminderService] Không tìm thấy vé hợp lệ cho Booking ID: ${booking.Booking_ID}. Sẽ không gửi email.`);
                await transaction.commit(); // Commit vì không có lỗi, chỉ là không có vé
                return;
            }

            const showDateStr = format(showDateTimeObject, 'dd/MM/yyyy');
            const showTimeStr = format(showDateTimeObject, 'HH:mm');
            const movieName = booking.Showtime.Movie.Movie_Name;
            const cinemaRoom = booking.Showtime.CinemaRoom.Room_Name;
            const seatsStr = tickets.map(t => `${t.Seat.SeatLayout.Row_Label}${t.Seat.SeatLayout.Column_Number}`).join(', ');

            // Tạo các file PDF cho từng vé
            const pdfTickets = [];
            for (const ticket of tickets) {
                try {
                    // Dữ liệu này sẽ được ticketService sử dụng để tạo PDF
                    // Bạn cần đảm bảo ticketService.generateTicketFromTemplateAsync có thể truy cập dữ liệu cần thiết hoặc bạn truyền nó vào
                    const pdfContent = await ticketService.generateTicketFromTemplateAsync(ticket.Ticket_ID, { Ticket: ticket, Seat: ticket.Seat, Showtime: booking.Showtime }); // Truyền context nếu cần
                    if (pdfContent && pdfContent.length > 0) {
                        pdfTickets.push({ ticketCode: ticket.Ticket_Code, pdfContent });
                        this._logger.log(`[BookingReminderService] PDF vé được tạo thành công cho vé ${ticket.Ticket_Code} (Booking ID: ${booking.Booking_ID})`);
                    }
                } catch (ex) {
                    this._logger.error(`[BookingReminderService] Lỗi khi tạo PDF cho vé ${ticket.Ticket_ID} (Booking ID: ${booking.Booking_ID}):`, ex);
                    // Cân nhắc: có nên gửi email nếu một vài vé PDF lỗi không? Hoặc bỏ qua luôn?
                }
            }

            if (pdfTickets.length === 0 && tickets.length > 0) {
                this._logger.warn(`[BookingReminderService] Đã có ${tickets.length} vé nhưng không thể tạo được file PDF nào cho Booking ID: ${booking.Booking_ID}. Sẽ không gửi email.`);
                await transaction.commit();
                return;
            }

            // Chuẩn bị thông tin để gửi email
            const bookingInfoForEmail = {
                BookingId: booking.Booking_ID.toString(),
                MovieName: movieName,
                CinemaRoom: cinemaRoom,
                ShowDate: showDateStr,
                ShowTime: showTimeStr,
                Seats: seatsStr
            };

            // Gửi email nhắc nhở với vé đính kèm
            const emailSent = await emailService.sendReminderEmail(
                booking.User.Email,
                booking.User.Full_Name || booking.User.Email, // Sử dụng Full_Name nếu có
                bookingInfoForEmail,
                pdfTickets,
                REMINDER_BEFORE_MINUTES
            );

            if (emailSent) {
                // Lưu lịch sử đã gửi email nhắc nhở
                await BookingHistory.create({
                    Booking_ID: booking.Booking_ID,
                    Status: 'Reminder Sent',
                    Date: new Date(),
                    Notes: `Đã gửi email nhắc nhở trước suất chiếu ${REMINDER_BEFORE_MINUTES} phút kèm ${pdfTickets.length} vé.`
                }, { transaction });
                await transaction.commit();
                this._logger.log(`[BookingReminderService] Đã gửi email nhắc nhở thành công cho Booking ID: ${booking.Booking_ID} kèm ${pdfTickets.length} vé.`);
            } else {
                this._logger.warn(`[BookingReminderService] Không thể gửi email nhắc nhở cho Booking ID: ${booking.Booking_ID}. Transaction sẽ được rollback.`);
                await transaction.rollback(); // Rollback nếu gửi email thất bại để thử lại lần sau
            }
        } catch (error) {
            await transaction.rollback();
            this._logger.error(`[BookingReminderService] Lỗi nghiêm trọng khi xử lý nhắc nhở cho Booking ID: ${booking.Booking_ID}:`, error);
        }
    }
}

// Cách sử dụng dịch vụ này:
// const bookingReminderService = new BookingReminderService();
// bookingReminderService.start();
// process.on('SIGINT', () => bookingReminderService.stop());
// process.on('SIGTERM', () => bookingReminderService.stop());

module.exports = BookingReminderService; 