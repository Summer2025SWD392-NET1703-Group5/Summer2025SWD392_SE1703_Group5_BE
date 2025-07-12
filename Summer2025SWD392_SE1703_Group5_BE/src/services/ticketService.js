
'use strict';

const { Ticket, TicketBooking, Seat, SeatLayout, CinemaRoom, Cinema, TicketPricing, PromotionUsage, BookingHistory, Showtime, Movie, User, sequelize } = require('../models');
const TicketRepository = require('../repositories/TicketRepository');
const EmailService = require('./emailService');
const PdfGenerator = require('./pdfGeneratorService');
const QRCodeGenerator = require('./qrCodeGenerator');
const TicketHtmlGenerator = require('./ticketHtmlGenerator');
const logger = require('../utils/logger');
const { Op } = require('sequelize');
// Error classes cho TicketService
class NotFoundError extends Error {
    constructor(message = 'Not Found') {
        super(message);
        this.name = 'NotFoundError';
        this.statusCode = 404;
        this.status = 'fail';
        this.isOperational = true;
        console.log(`[TICKET SERVICE] NotFoundError: ${message}`);
        Error.captureStackTrace(this, this.constructor);
    }
}

class BadRequestError extends Error {
    constructor(message = 'Bad Request') {
        super(message);
        this.name = 'BadRequestError';
        this.statusCode = 400;
        this.status = 'fail';
        this.isOperational = true;
        console.log(`[TICKET SERVICE] BadRequestError: ${message}`);
        Error.captureStackTrace(this, this.constructor);
    }
}

class InternalServerError extends Error {
    constructor(message = 'Internal Server Error') {
        super(message);
        this.name = 'InternalServerError';
        this.statusCode = 500;
        this.status = 'error';
        this.isOperational = true;
        console.log(`[TICKET SERVICE] InternalServerError: ${message}`);
        Error.captureStackTrace(this, this.constructor);
    }
}

class UnauthorizedError extends Error {
    constructor(message = 'Unauthorized') {
        super(message);
        this.name = 'UnauthorizedError';
        this.statusCode = 401;
        this.status = 'fail';
        this.isOperational = true;
        console.log(`[TICKET SERVICE] UnauthorizedError: ${message}`);
        Error.captureStackTrace(this, this.constructor);
    }
}

class TicketService {
    constructor() {
        // Service initialization
    }

    // Generate ticket code helper
    _generateTicketCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    // Helper method để format time với timezone fix
    formatTime(time) {
        if (!time) return '';
        if (typeof time === 'string') {
            return time.slice(0, 8); // Get HH:MM:SS
        }
        // Fix timezone issue: Sử dụng UTC methods thay vì toLocaleTimeString
        if (time instanceof Date) {
            const hours = time.getUTCHours().toString().padStart(2, '0');
            const minutes = time.getUTCMinutes().toString().padStart(2, '0');
            const seconds = time.getUTCSeconds().toString().padStart(2, '0');
            return `${hours}:${minutes}:${seconds}`;
        }
        return '';
    }

    /**
     * Retrieves tickets by booking ID.
     * @param {number} bookingId - The ID of the booking.
     * @returns {Promise<Array<object>>} - A list of tickets with detailed information.
     */
    async getTicketsByBookingIdAsync(bookingId) {
        try {
            console.log(`Lấy thông tin vé cho booking ID: ${bookingId}`);
            
            // Tải pricingService để tính toán lại giá đúng
            const pricingService = require('./pricingService');
            
            // Fetch all tickets for this booking with detailed information
        const tickets = await Ticket.findAll({
            where: { Booking_ID: bookingId },
            include: [
                {
                    model: Seat,
                    as: 'Seat',
                    include: [{ model: SeatLayout, as: 'SeatLayout' }]
                },
                {
                    model: TicketBooking,
                    as: 'TicketBooking',
                    include: [
                        { model: User, as: 'User' },
                        {
                            model: Showtime,
                            as: 'Showtime',
                            include: [
                                { model: Movie, as: 'Movie' },
                                {
                                    model: CinemaRoom,
                                    as: 'CinemaRoom',
                                    include: [{ model: Cinema, as: 'Cinema' }]
                                }
                            ]
                        }
                    ]
                }
            ]
        });

        if (!tickets || tickets.length === 0) {
            throw new NotFoundError('Không tìm thấy vé nào cho đơn đặt này');
        }

            // Lấy thông tin booking để tiện truy cập
            const booking = tickets[0]?.TicketBooking;
            if (!booking) {
                throw new NotFoundError('Không tìm thấy thông tin đặt vé');
            }

            // Fetch payment information for the booking
            const [payment, promotionUsage] = await Promise.all([
                sequelize.models.Payment.findOne({
                    where: { Booking_ID: bookingId },
                    order: [['Transaction_Date', 'DESC']] // Get the most recent payment
                }),
                // Lấy thông tin giảm giá từ promotion nếu có
                PromotionUsage.findOne({
                    where: { Booking_ID: bookingId, HasUsed: true },
                    attributes: ['Discount_Amount']
                })
            ]);

            // Format time helper (to avoid UTC issues)
            const formatTimeString = (timeStr) => {
                if (!timeStr) return null;
                if (typeof timeStr === 'string') {
                    return timeStr.substring(0, 5); // Extract HH:MM from time string
                }
                if (timeStr instanceof Date) {
                    const hours = timeStr.getUTCHours().toString().padStart(2, '0');
                    const minutes = timeStr.getUTCMinutes().toString().padStart(2, '0');
                    return `${hours}:${minutes}`;
                }
                return null;
            };
            
            // Tính toán lại giá vé đúng dựa trên ticketPricing.json
            const calculateCorrectPrice = (ticket) => {
                try {
                    const showDate = ticket.TicketBooking?.Showtime?.Show_Date;
                    const startTime = ticket.TicketBooking?.Showtime?.Start_Time;
                    const roomType = ticket.TicketBooking?.Showtime?.CinemaRoom?.Room_Type || '2D';
                    const seatType = ticket.Seat?.SeatLayout?.Seat_Type || 'Regular';
                    
                    // Định dạng thời gian để khớp với format mà pricingService cần
                    let formattedStartTime = startTime;
                    if (startTime instanceof Date) {
                        const hours = startTime.getUTCHours().toString().padStart(2, '0');
                        const minutes = startTime.getUTCMinutes().toString().padStart(2, '0');
                        formattedStartTime = `${hours}:${minutes}:00`;
                    } else if (typeof startTime === 'string') {
                        // Đảm bảo định dạng HH:MM:SS
                        if (startTime.length <= 5) {
                            formattedStartTime = `${startTime}:00`;
                        }
                    }
                    
                    // Sử dụng pricingService để tính lại giá vé
                    const correctPrice = pricingService.calculateTicketPrice({
                        roomType,
                        seatType,
                        showDate,
                        startTime: formattedStartTime
                    });
                    
                    logger.info(`Tính lại giá vé: ${showDate}, ${formattedStartTime}, ${roomType}, ${seatType} = ${correctPrice.finalPrice} VND`);
                    
                    return {
                        price: correctPrice.finalPrice,
                        details: {
                            base: correctPrice.basePrice,
                            dayMultiplier: correctPrice.multipliers.day,
                            timeMultiplier: correctPrice.multipliers.time,
                            dayType: correctPrice.details.dayType,
                            timeSlot: correctPrice.details.timeSlot
                        }
                    };
                } catch (error) {
                    logger.error(`Lỗi tính lại giá vé: ${error.message}`);
                    return { price: ticket.Final_Price, details: null };
                }
            };

            // Tính toán lại giá vé cho từng vé và tính tổng
            let totalAmount = 0;
            const formattedTickets = [];
            
            for (const ticket of tickets) {
                // Tính giá vé đúng
                const correctPriceInfo = calculateCorrectPrice(ticket);
                const finalPrice = correctPriceInfo.price;
                totalAmount += finalPrice;
                
                formattedTickets.push({
                    Ticket_ID: ticket.Ticket_ID,
                    Booking_ID: ticket.Booking_ID,
                    Ticket_Code: ticket.Ticket_Code,
                    SeatInfo: ticket.Seat ? {
                        Seat_ID: ticket.Seat.Seat_ID,
                        Row_Label: ticket.Seat.SeatLayout?.Row_Label,
                        Column_Number: ticket.Seat.SeatLayout?.Column_Number,
                        Seat_Type: ticket.Seat.SeatLayout?.Seat_Type,
                        SeatLabel: `${ticket.Seat.SeatLayout?.Row_Label}${ticket.Seat.SeatLayout?.Column_Number}`
            } : null,
                    MovieInfo: ticket.TicketBooking?.Showtime?.Movie ? {
                        Movie_ID: ticket.TicketBooking.Showtime.Movie.Movie_ID,
                        Movie_Name: ticket.TicketBooking.Showtime.Movie.Movie_Name,
                        Duration: ticket.TicketBooking.Showtime.Movie.Duration,
                        Rating: ticket.TicketBooking.Showtime.Movie.Rating,
                        Poster_URL: ticket.TicketBooking.Showtime.Movie.Poster_URL
            } : null,
                    ShowtimeInfo: ticket.TicketBooking?.Showtime ? {
                        Showtime_ID: ticket.TicketBooking.Showtime.Showtime_ID,
                        ShowDate: ticket.TicketBooking.Showtime.Show_Date,
                        StartTime: formatTimeString(ticket.TicketBooking.Showtime.Start_Time),
                        EndTime: formatTimeString(ticket.TicketBooking.Showtime.End_Time)
            } : null,
                    CinemaRoomInfo: ticket.TicketBooking?.Showtime?.CinemaRoom ? {
                        Cinema_ID: ticket.TicketBooking.Showtime.CinemaRoom.Cinema?.Cinema_ID,
                        Cinema_Name: ticket.TicketBooking.Showtime.CinemaRoom.Cinema?.Cinema_Name,
                        Cinema_Room_ID: ticket.TicketBooking.Showtime.CinemaRoom.Cinema_Room_ID,
                        Room_Name: ticket.TicketBooking.Showtime.CinemaRoom.Room_Name,
                        Room_Type: ticket.TicketBooking.Showtime.CinemaRoom.Room_Type,
            } : null,
            PriceInfo: {
                        Base_Price: correctPriceInfo.details?.base || ticket.Base_Price,
                        Discount_Amount: ticket.Discount_Amount,
                        Final_Price: finalPrice,
                        Price_Details: correctPriceInfo.details
            },
                    Is_Checked_In: ticket.Is_Checked_In,
                    CheckInTime: ticket.Check_In_Time,
                    Status: ticket.Status
                });
            }

            // Tạo đối tượng kết quả với thông tin booking và payment nổi bật
            const result = {
                booking_info: {
                    booking_id: booking.Booking_ID,
                    booking_date: booking.Booking_Date,
                    status: booking.Status,
                    total_amount: booking.Total_Amount, // Sử dụng giá trị từ database thay vì tính lại
                    points_earned: booking.Points_Earned,
                    points_used: booking.Points_Used,
                    promotion_discount: promotionUsage ? promotionUsage.Discount_Amount : 0, // Thêm thông tin giảm giá từ promotion
                    payment_deadline: booking.Payment_Deadline
                },
                payment_info: payment ? {
                    payment_method: payment.Payment_Method,
                    payment_reference: payment.Payment_Reference,
                    transaction_date: payment.Transaction_Date,
                    payment_status: payment.Payment_Status,
                    amount: payment.Amount // Giữ lại giá trị thanh toán thực tế
                } : {
                    payment_method: 'Chưa thanh toán',
                    payment_status: 'Pending'
                },
                tickets: formattedTickets
            };
            
            // Ghi log để debug
            logger.info(`Tổng tiền đã lưu trong DB: ${booking.Total_Amount} VND, Tổng tiền tính lại từ vé: ${totalAmount} VND, Điểm đã sử dụng: ${booking.Points_Used || 0}`);
            
            console.log(`Đã tìm thấy ${tickets.length} vé cho booking ${bookingId}`);
            return result;
        } catch (error) {
            console.error(`Lỗi khi lấy vé theo booking ID ${bookingId}:`, error);
            throw error;
        }
    }

    /**
     * Retrieves a ticket by its code.
     * @param {string} ticketCode - The code of the ticket.
     * @returns {Promise<object>} - Detailed ticket information.
     */
    async getTicketByCodeAsync(ticketCode) {
        const ticket = await Ticket.findOne({
            where: { Ticket_Code: ticketCode },
            include: [
                {
                    model: Seat,
                    as: 'Seat',
                    include: [{ model: SeatLayout, as: 'SeatLayout' }]
                },
                {
                    model: TicketBooking,
                    as: 'TicketBooking',
                    include: [
                        { model: User, as: 'User' },
                        {
                            model: Showtime,
                            as: 'Showtime',
                            include: [
                                { model: Movie, as: 'Movie' },
                                {
                                    model: CinemaRoom,
                                    as: 'CinemaRoom',
                                    include: [{ model: Cinema, as: 'Cinema' }]
                                }
                            ]
                        }
                    ]
                }
            ]
        });

        if (!ticket) {
            throw new NotFoundError('Không tìm thấy vé với mã này');
        }
        // Transform data
        return {
            Ticket_ID: ticket.Ticket_ID,
            Booking_ID: ticket.Booking_ID,
            Ticket_Code: ticket.Ticket_Code,
            CustomerInfo: ticket.TicketBooking?.User ? {
                User_ID: ticket.TicketBooking.User.User_ID,
                Full_Name: ticket.TicketBooking.User.Full_Name,
                Email: ticket.TicketBooking.User.Email,
                Phone_Number: ticket.TicketBooking.User.Phone_Number,
            } : null,
            SeatInfo: ticket.Seat ? {
                Seat_ID: ticket.Seat.Seat_ID,
                Row_Label: ticket.Seat.SeatLayout?.Row_Label,
                Column_Number: ticket.Seat.SeatLayout?.Column_Number,
                Seat_Type: ticket.Seat.SeatLayout?.Seat_Type,
                SeatLabel: `${ticket.Seat.SeatLayout?.Row_Label}${ticket.Seat.SeatLayout?.Column_Number}`
            } : null,
            MovieInfo: ticket.TicketBooking?.Showtime?.Movie ? {
                Movie_ID: ticket.TicketBooking.Showtime.Movie.Movie_ID,
                Movie_Name: ticket.TicketBooking.Showtime.Movie.Movie_Name,
                Duration: ticket.TicketBooking.Showtime.Movie.Duration,
                Rating: ticket.TicketBooking.Showtime.Movie.Rating,
            } : null,
            ShowtimeInfo: ticket.TicketBooking?.Showtime ? {
                Showtime_ID: ticket.TicketBooking.Showtime.Showtime_ID,
                ShowDate: ticket.TicketBooking.Showtime.Show_Date,
                StartTime: ticket.TicketBooking.Showtime.Start_Time,
                EndTime: ticket.TicketBooking.Showtime.End_Time,
            } : null,
            CinemaRoomInfo: ticket.TicketBooking?.Showtime?.CinemaRoom ? {
                Cinema_ID: ticket.TicketBooking.Showtime.CinemaRoom.Cinema?.Cinema_ID,
                Cinema_Name: ticket.TicketBooking.Showtime.CinemaRoom.Cinema?.Cinema_Name,
                Cinema_Room_ID: ticket.TicketBooking.Showtime.CinemaRoom.Cinema_Room_ID,
                Room_Name: ticket.TicketBooking.Showtime.CinemaRoom.Room_Name,
                Room_Type: ticket.TicketBooking.Showtime.CinemaRoom.Room_Type,
            } : null,
            PriceInfo: {
                Base_Price: ticket.Base_Price,
                Discount_Amount: ticket.Discount_Amount,
                Final_Price: ticket.Final_Price,
            },
            Is_Checked_In: ticket.Is_Checked_In,
            CheckInTime: ticket.Check_In_Time
        };
    }

    /**
     * Verifies a ticket. (Staff/Admin only)
     * @param {string} ticketCode - The code of the ticket.
     * @returns {Promise<object>} - Verification result.
     */
    async verifyTicketAsync(ticketCode) {
        const ticketData = await this.getTicketByCodeAsync(ticketCode); // Leverages existing method
        if (!ticketData) throw new NotFoundError('Không tìm thấy vé');

        const ticket = await Ticket.findOne({
            where: { Ticket_Code: ticketCode },
            include: [{
                model: TicketBooking,
                as: 'TicketBooking'
            }]
        }); // fetch raw ticket for status

        const showtime = await Showtime.findByPk(ticketData.ShowtimeInfo.Showtime_ID, {
            include: [
                { model: Movie, as: 'Movie' },
                {
                    model: CinemaRoom,
                    as: 'CinemaRoom',
                    include: [{ model: Cinema, as: 'Cinema' }]
                }
            ]
        });


        if (!showtime) throw new NotFoundError('Không tìm thấy thông tin suất chiếu cho vé này');

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const showDate = new Date(showtime.Show_Date);
        showDate.setHours(0, 0, 0, 0);

        const isValidForToday = showDate.getTime() === today.getTime();

        // Combine date and time for accurate comparison
        const [hours, minutes] = showtime.Start_Time.split(':').map(Number);
        const showtimeStartDateTime = new Date(showtime.Show_Date);
        showtimeStartDateTime.setHours(hours, minutes, 0, 0);

        const movieDuration = showtime.Movie?.Duration || 0; // minutes
        const showtimeEndDateTime = new Date(showtimeStartDateTime.getTime() + movieDuration * 60000);

        const now = new Date();
        const isShowtimeStarted = now >= showtimeStartDateTime;
        const isShowtimeEnded = now >= showtimeEndDateTime;


        const getValidationReason = (isValidForToday, isShowtimeEnded, isCheckedIn, bookingStatus) => {
            if (!isValidForToday) return "Vé không phải cho ngày hôm nay";
            if (isShowtimeEnded) return "Suất chiếu đã kết thúc";
            if (isCheckedIn) return "Vé đã được sử dụng";
            if (bookingStatus !== "Confirmed") return `Trạng thái đặt vé không hợp lệ: ${bookingStatus}`;
            return "Vé hợp lệ";
        };

        const validationReason = getValidationReason(isValidForToday, isShowtimeEnded, ticketData.Is_Checked_In, ticket.TicketBooking.Status);
        const isValid = isValidForToday && !isShowtimeEnded && ticket.TicketBooking.Status === "Confirmed" && !ticketData.Is_Checked_In;


        return {
            success: true,
            ticket_info: {
                ticket_id: ticketData.Ticket_ID,
                ticket_code: ticketData.Ticket_Code,
                is_checked_in: ticketData.Is_Checked_In,
                check_in_time: ticketData.CheckInTime,
                booking_status: ticket.TicketBooking.Status,
            },
            movie_info: {
                movie_id: ticketData.MovieInfo.Movie_ID,
                movie_name: ticketData.MovieInfo.Movie_Name,
                duration: ticketData.MovieInfo.Duration,
                show_date: ticketData.ShowtimeInfo.ShowDate, // Format as needed
                start_time: ticketData.ShowtimeInfo.StartTime, // Format as needed
                end_time: ticketData.ShowtimeInfo.EndTime, // Format as needed
                showtime_id: ticketData.ShowtimeInfo.Showtime_ID,
            },
            seat_info: {
                seat_id: ticketData.SeatInfo.Seat_ID,
                seat_label: ticketData.SeatInfo.SeatLabel,
                room_name: ticketData.CinemaRoomInfo.Room_Name,
                room_type: ticketData.CinemaRoomInfo.Room_Type,
                cinema_id: ticketData.CinemaRoomInfo.Cinema_ID,
                cinema_name: ticketData.CinemaRoomInfo.Cinema_Name
            },
            validation: {
                is_valid: isValid,
                is_for_today: isValidForToday,
                is_showtime_started: isShowtimeStarted,
                is_showtime_ended: isShowtimeEnded,
                is_checked_in: ticketData.Is_Checked_In,
                reason: validationReason,
            }
        };
    }

    /**
     * Checks in a ticket.
     * @param {string} ticketCode - The code of the ticket.
     * @returns {Promise<object>} - Check-in result.
     */
    async checkInTicketAsync(ticketCode) {
        try {
            const result = await sequelize.transaction(async (t) => {
                const ticket = await Ticket.findOne({
                    where: { Ticket_Code: ticketCode },
                    include: [
                        { model: Seat, as: 'Seat', include: [{ model: SeatLayout, as: 'SeatLayout' }] },
                        {
                            model: TicketBooking,
                            as: 'TicketBooking',
                            include: [
                                { model: User, as: 'User' },
                                {
                                    model: Showtime,
                                    as: 'Showtime',
                                    include: [
                                        { model: Movie, as: 'Movie' },
                                        { model: CinemaRoom, as: 'CinemaRoom' }
                                    ]
                                }
                            ]
                        }
                    ],
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });

                if (!ticket) {
                    throw new NotFoundError('Không tìm thấy vé với mã: ' + ticketCode);
                }

                if (ticket.Is_Checked_In) {
                    throw new BadRequestError('Vé đã được check-in.');
                }

                if (ticket.TicketBooking.Status !== 'Confirmed') {
                    throw new BadRequestError(`Trạng thái đặt vé (${ticket.TicketBooking.Status}) không hợp lệ để check-in.`);
                }

                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const showDate = new Date(ticket.TicketBooking.Showtime.Show_Date);
                showDate.setHours(0, 0, 0, 0);

                if (showDate.getTime() !== today.getTime()) {
                    throw new BadRequestError('Vé không phải cho ngày hôm nay.');
                }

                // Hướng tiếp cận mới: Sử dụng hàm GETDATE() của SQL Server để lấy ngày giờ hiện tại.
                // Điều này giúp tránh hoàn toàn các lỗi chuyển đổi định dạng ngày giờ.
                const responseTime = new Date(); // Chỉ dùng để trả về trong response

                await ticket.update({
                    Is_Checked_In: true,
                    Check_In_Time: sequelize.fn('GETDATE'), // Ra lệnh cho DB tự lấy giờ
                    Status: 'Used'
                }, { transaction: t });

                await BookingHistory.create({
                    Booking_ID: ticket.Booking_ID,
                    Date: sequelize.fn('GETDATE'), // Ra lệnh cho DB tự lấy giờ
                    Status: 'CheckedIn',
                    Notes: `Vé ${ticketCode} đã được check-in.`,
                    IsRead: false
                }, { transaction: t });

                // If everything is successful, return the success payload.
                // Sequelize will automatically commit the transaction.
                return {
                    success: true,
                    message: 'Check-in thành công',
                    ticket_info: {
                        ticket_id: ticket.Ticket_ID,
                        ticket_code: ticket.Ticket_Code,
                        checked_in_time: responseTime, // Trả về thời gian gần đúng cho client
                        seat_info: ticket.Seat ? `${ticket.Seat.SeatLayout?.Row_Label || ''}${ticket.Seat.SeatLayout?.Column_Number || ''}` : 'Không xác định',
                        customer_name: ticket.TicketBooking.User?.Full_Name || 'Khách vãng lai',
                        movie_name: ticket.TicketBooking.Showtime.Movie?.Movie_Name || 'Phim không xác định',
                        show_date: ticket.TicketBooking.Showtime.Show_Date,
                        show_time: ticket.TicketBooking.Showtime.Start_Time,
                        room_name: ticket.TicketBooking.Showtime.CinemaRoom?.Room_Name || 'Phòng không xác định'
                    }
                };
            });
            return result;
        } catch (error) {
            // This will catch errors thrown from inside the transaction,
            // including our custom NotFoundError/BadRequestError, after Sequelize has rolled back.
            if (error instanceof NotFoundError) {
                return { success: false, message: error.message, statusCode: 404 };
            }
            if (error instanceof BadRequestError) {
                return { success: false, message: error.message, statusCode: 400 };
            }

            // Handle any other unexpected errors.
            logger.error('Lỗi không mong muốn khi check-in vé:', { ticketCode, error: error.message, stack: error.stack });
            return { success: false, message: 'Lỗi hệ thống, không thể hoàn tất check-in.', statusCode: 500 };
        }
    }


    /**
     * Gets a list of tickets to scan for a given date. (Staff/Admin only)
     * @param {Date} scanDate - The date to scan for. Defaults to today.
     * @returns {Promise<object>} - List of tickets and summary.
     */
    async getTicketsToScanAsync(scanDate = new Date()) {
        scanDate.setHours(0, 0, 0, 0); // Start of day
        const nextDay = new Date(scanDate);
        nextDay.setDate(scanDate.getDate() + 1); // Start of next day

        try {
            

        const tickets = await Ticket.findAll({
            include: [
                {
                    model: TicketBooking,
                    as: 'TicketBooking',
                    required: true,
                    include: [
                        {
                            model: Showtime,
                            as: 'Showtime',
                            required: true,
                            where: {
                                Show_Date: {
                                    [Op.gte]: scanDate,
                                    [Op.lt]: nextDay
                                }
                            },
                            include: [
                                { model: Movie, as: 'Movie' },
                                {
                                    model: CinemaRoom,
                                    as: 'CinemaRoom',
                                    include: [{ model: Cinema, as: 'Cinema' }]
                                }
                            ]
                        }
                    ]
                },
                {
                    model: Seat,
                    as: 'Seat',
                    include: [{ model: SeatLayout, as: 'SeatLayout' }]
                }
            ],
            where: {
                '$TicketBooking.Status$': 'Confirmed' // Filter by booking status
            }
        });
            
            // Kiểm tra kết quả trả về
            if (!tickets || !Array.isArray(tickets)) {
                logger.info(`Không tìm thấy vé nào cho ngày ${scanDate.toISOString().split('T')[0]}`);
                return {
                    scan_date: scanDate.toISOString().split('T')[0],
                    total_tickets: 0,
                    checked_in: 0,
                    pending: 0,
                    tickets: []
                };
            }
            
    

        const formattedTickets = tickets.map(t => ({
            ticket_id: t.Ticket_ID,
            ticket_code: t.Ticket_Code,
            is_checked_in: t.Is_Checked_In,
            check_in_time: t.Check_In_Time,
            movie_info: {
                movie_id: t.TicketBooking.Showtime.Movie?.Movie_ID,
                movie_name: t.TicketBooking.Showtime.Movie?.Movie_Name
            },
            showtime_info: {
                showtime_id: t.TicketBooking.Showtime.Showtime_ID,
                start_time: this.formatTime(t.TicketBooking.Showtime.Start_Time) // Fix timezone issue
            },
            room_info: {
                room_id: t.TicketBooking.Showtime.CinemaRoom?.Cinema_Room_ID,
                room_name: t.TicketBooking.Showtime.CinemaRoom?.Room_Name,
                cinema_id: t.TicketBooking.Showtime.CinemaRoom.Cinema?.Cinema_ID,
                cinema_name: t.TicketBooking.Showtime.CinemaRoom.Cinema?.Cinema_Name
            },
            seat_info: t.Seat?.SeatLayout ? {
                seat_id: t.Seat.Seat_ID,
                seat_label: `${t.Seat.SeatLayout.Row_Label}${t.Seat.SeatLayout.Column_Number}`
            } : null
        }));

        return {
                scan_date: scanDate.toISOString().split('T')[0],
            total_tickets: formattedTickets.length,
            checked_in: formattedTickets.filter(t => t.is_checked_in).length,
            pending: formattedTickets.filter(t => !t.is_checked_in).length,
            tickets: formattedTickets
        };
        } catch (error) {
            logger.error(`Lỗi khi truy vấn vé để quét: ${error.message}`, { error });
            return {
                scan_date: scanDate.toISOString().split('T')[0],
                error: error.message,
                total_tickets: 0,
                checked_in: 0,
                pending: 0,
                tickets: []
            };
        }
    }

    /**
     * Gets check-in statistics for showtimes on a given date. (Staff/Admin only)
     * @param {Date} statsDate - The date for statistics. Defaults to today.
     * @returns {Promise<object>} - Check-in statistics.
     */
    async getCheckInStatsAsync(statsDate = new Date()) {
        statsDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(statsDate);
        nextDay.setDate(statsDate.getDate() + 1);

        const showtimes = await Showtime.findAll({
            where: {
                Show_Date: {
                    [Op.gte]: statsDate,
                    [Op.lt]: nextDay
                }
            },
            include: [
                { model: Movie, as: 'Movie' },
                {
                    model: CinemaRoom,
                    as: 'CinemaRoom',
                    include: [{ model: Cinema, as: 'Cinema' }]
                },
                {
                    model: TicketBooking,
                    as: 'TicketBookings', // Make sure alias matches model definition
                    where: { Status: 'Confirmed' },
                    required: false, // Use left join to get all showtimes even if no confirmed bookings
                    include: [{ model: Ticket, as: 'Tickets' }] // Make sure alias matches
                }
            ]
        });

        const resultList = [];
        for (const s of showtimes) {
            const confirmedTickets = s.TicketBookings.flatMap(tb => tb.Tickets || []);
            const totalTickets = confirmedTickets.length;
            const checkedInTickets = confirmedTickets.filter(t => t.Is_Checked_In).length;
            const checkInPercentage = totalTickets > 0 ? (checkedInTickets / totalTickets) * 100 : 0;

            resultList.push({
                showtime_id: s.Showtime_ID,
                movie_name: s.Movie?.Movie_Name,
                room_name: s.CinemaRoom?.Room_Name,
                cinema_id: s.CinemaRoom?.Cinema?.Cinema_ID,
                cinema_name: s.CinemaRoom?.Cinema?.Cinema_Name,
                start_time: s.Start_Time, // Format as needed
                end_time: s.End_Time, // Format as needed
                total_tickets: totalTickets,
                checked_in: checkedInTickets,
                pending: totalTickets - checkedInTickets,
                check_in_percentage: parseFloat(checkInPercentage.toFixed(1))
            });
        }

        return {
            date: statsDate, // Format as needed
            total_showtimes: resultList.length,
            total_tickets: resultList.reduce((sum, r) => sum + r.total_tickets, 0),
            total_checkins: resultList.reduce((sum, r) => sum + r.checked_in, 0),
            showtimes: resultList
        };
    }


    /**
     * Generates an HTML ticket for a given ticket ID.
     * @param {number} ticketId - The ID of the ticket.
     * @returns {Promise<string>} - The HTML content of the ticket.
     */
    async generateTicketHtmlAsync(ticketId) {
        logger.info(`Tạo vé HTML cho ID: ${ticketId}`);

        const mainTicket = await Ticket.findByPk(ticketId);
        if (!mainTicket) {
            throw new NotFoundError('Không tìm thấy vé với ID đã cho.');
        }
        const bookingId = mainTicket.Booking_ID;

        // Fetch all necessary data in parallel
        const [booking, allTicketsForBooking, payment] = await Promise.all([
            TicketBooking.findByPk(bookingId, {
                include: [
                    { model: User, as: 'User' },
                    {
                        model: Showtime,
                        as: 'Showtime',
                        include: [
                            { model: Movie, as: 'Movie' },
                            {
                                model: CinemaRoom,
                                as: 'CinemaRoom',
                                include: [{
                                    model: Cinema,
                                    as: 'Cinema'
                                }]
                            }
                        ]
                    }
                ]
            }),
            Ticket.findAll({
                where: { Booking_ID: bookingId },
                include: [{ model: Seat, as: 'Seat', include: [{ model: SeatLayout, as: 'SeatLayout' }] }]
            }),
            sequelize.query(
                `SELECT TOP 1 Payment_Reference, Transaction_Date FROM [ksf00691_team03].[Payments] WHERE Booking_ID = :bookingId ORDER BY Transaction_Date DESC`,
                { replacements: { bookingId }, type: sequelize.QueryTypes.SELECT }
            ).then(res => res[0])
        ]);

        if (!booking) throw new NotFoundError('Không tìm thấy thông tin đơn đặt vé.');

        const cinema = booking.Showtime.CinemaRoom.Cinema;
        if (!cinema) throw new InternalServerError('Không tìm thấy thông tin rạp chiếu liên kết.');

        // Prepare data for the HTML template - use ticket code instead of booking ID
        const qrCodeUrl = await QRCodeGenerator.generateQRCode(mainTicket.Ticket_Code);

        const showDate = new Date(booking.Showtime.Show_Date);
        const dayOfWeek = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][showDate.getDay()];
        const formattedDate = `${dayOfWeek}, ${showDate.getDate().toString().padStart(2, '0')}/${(showDate.getMonth() + 1).toString().padStart(2, '0')}/${showDate.getFullYear()}`;

        let formattedTransactionDate = 'N/A';
        if (payment && payment.Transaction_Date) {
            const transactionDate = new Date(payment.Transaction_Date);
            // Fix timezone issue: Sử dụng UTC methods thay vì toLocaleTimeString
            const hours = transactionDate.getUTCHours().toString().padStart(2, '0');
            const minutes = transactionDate.getUTCMinutes().toString().padStart(2, '0');
            const timeString = `${hours}:${minutes}`;
            const dateString = transactionDate.toLocaleDateString('vi-VN');
            formattedTransactionDate = `${timeString} ${dateString}`;
        }

        const formatTime = (time) => {
            if (!time) return '';
            if (typeof time.slice === 'function') {
                return time.slice(0, 5);
            }
            // Fix timezone issue: Sử dụng UTC methods thay vì toLocaleTimeString
            const timeObj = new Date(time);
            const hours = timeObj.getUTCHours().toString().padStart(2, '0');
            const minutes = timeObj.getUTCMinutes().toString().padStart(2, '0');
            return `${hours}:${minutes}`;
        };

        const ticketData = {
            cinemaName: cinema.Cinema_Name || cinema.Name || 'GALAXY Cinema',
            movieTitle: booking.Showtime.Movie.Movie_Name,
            movieFormat: '2D Lồng tiếng',
            moviePosterUrl: booking.Showtime.Movie.Poster_URL,
            bookingCode: booking.Booking_ID,
            qrCodeUrl: qrCodeUrl,
            showtime: `${formatTime(booking.Showtime.Start_Time)} - ${formatTime(booking.Showtime.End_Time)}`,
            showDate: formattedDate,
            room: booking.Showtime.CinemaRoom.Room_Name,
            ticketCount: allTicketsForBooking.length,
            seats: allTicketsForBooking.map(t => t.Seat && t.Seat.SeatLayout ? `${t.Seat.SeatLayout.Row_Label}${t.Seat.SeatLayout.Column_Number}` : '').filter(Boolean).join(', '),
            concessions: [], // Removed sample data
            isUsed: allTicketsForBooking.some(t => t.Is_Checked_In),
            cinemaAddress: cinema.Address || 'Galaxy Cinema, Vietnam',
            transactionCode: payment ? payment.Payment_Reference : 'N/A',
            transactionDate: formattedTransactionDate
        };

        // Generate HTML
        const TicketHtmlGenerator = require('./ticketHtmlGenerator');
        const htmlContent = TicketHtmlGenerator.generate(ticketData);

        return htmlContent;
    }

    /**
     * Sends a ticket by email.
     * @param {number} bookingId - The ID of the booking.
     * @param {string} email - The recipient's email address.
     * @returns {Promise<boolean>} - True if successful.
     */
    async sendTicketByEmailAsync(bookingIdOrCode, email) {
        logger.info(`Gửi vé cho đơn đặt ${bookingIdOrCode} đến email ${email}`);
        
        try {
            let booking = null;
            let bookingId = null;
            
            // Kiểm tra xem đầu vào có phải là số không 
            const isNumeric = !isNaN(parseInt(bookingIdOrCode, 10));
            
            if (isNumeric) {
                // Nếu là số, thử tìm theo ID
                bookingId = parseInt(bookingIdOrCode, 10);
                logger.info(`Đang tìm đơn đặt có ID=${bookingId} trong database`);
                
                // Kiểm tra tồn tại của đơn đặt vé bằng raw query trước
                const bookingExists = await sequelize.query(
                    `SELECT Booking_ID FROM [ksf00691_team03].[Ticket_Bookings] WHERE Booking_ID = :bookingId`,
                    { 
                        replacements: { bookingId },
                        type: sequelize.QueryTypes.SELECT 
                    }
                );
                
                if (bookingExists && bookingExists.length > 0) {
                    logger.info(`Đã tìm thấy đơn đặt vé ID=${bookingId}, tiếp tục lấy thông tin chi tiết.`);
                    booking = await TicketBooking.findOne({
                        where: { Booking_ID: bookingId },
                include: [
                    { model: User, as: 'User' },
                    {
                        model: Showtime,
                        as: 'Showtime',
                        include: [
                            { model: Movie, as: 'Movie' },
                                    { model: CinemaRoom, as: 'CinemaRoom', 
                                      include: [{ model: Cinema, as: 'Cinema' }]
                                    }
                        ]
                    }
                ]
            });
                } else {
                    logger.error(`Không tìm thấy đơn đặt vé ID=${bookingId} trong bảng [ksf00691_team03].[Ticket_Bookings]`);
                }
            } else {
                // Nếu không phải số, thử tìm theo mã ticket
                logger.info(`Đang tìm vé theo mã code=${bookingIdOrCode} trong database`);
                
                // Kiểm tra tồn tại của vé bằng raw query trước
                const ticketExists = await sequelize.query(
                    `SELECT t.Booking_ID FROM [ksf00691_team03].[Tickets] t WHERE t.Ticket_Code = :ticketCode`,
                    { 
                        replacements: { ticketCode: bookingIdOrCode },
                        type: sequelize.QueryTypes.SELECT 
                    }
                );
                
                if (ticketExists && ticketExists.length > 0) {
                    bookingId = ticketExists[0].Booking_ID;
                    logger.info(`Đã tìm thấy vé với mã ${bookingIdOrCode}, thuộc về đơn đặt ID=${bookingId}`);
                    
                    booking = await TicketBooking.findOne({
                        where: { Booking_ID: bookingId },
                        include: [
                            { model: User, as: 'User' },
                            {
                                model: Showtime,
                                as: 'Showtime',
                                include: [
                                    { model: Movie, as: 'Movie' },
                                    { model: CinemaRoom, as: 'CinemaRoom', 
                                      include: [{ model: Cinema, as: 'Cinema' }]
                                    }
                                ]
                            }
                        ]
                    });
                } else {
                    logger.error(`Không tìm thấy vé với mã ${bookingIdOrCode} trong bảng [ksf00691_team03].[Tickets]`);
                }
            }

            if (!booking) {
                throw new Error(`Không tìm thấy đơn đặt vé hoặc vé với mã ${bookingIdOrCode} để gửi email.`);
            }

            // Thực hiện song song các truy vấn database để tăng tốc
            const [tickets, paymentResult] = await Promise.all([
                // Lấy tất cả vé của booking
                Ticket.findAll({
                    where: { Booking_ID: bookingId },
                    include: [{ 
                        model: Seat, 
                        as: 'Seat', 
                        include: [{ model: SeatLayout, as: 'SeatLayout' }] 
                    }]
                }),
                
                // Lấy thông tin thanh toán
                sequelize.query(
                    `SELECT TOP 1 Payment_Reference, Transaction_Date, Payment_Method, Payment_Status, Amount FROM [ksf00691_team03].[Payments] WHERE Booking_ID = :bookingId ORDER BY Transaction_Date DESC`,
                    { replacements: { bookingId }, type: sequelize.QueryTypes.SELECT }
                )
            ]);

            if (!tickets || tickets.length === 0) {
                logger.error(`Không tìm thấy vé nào cho đơn đặt ID=${bookingId} để gửi email.`);
                throw new Error('Không tìm thấy vé nào để gửi email.');
            }
            
            // Lấy payment từ kết quả truy vấn
            const payment = paymentResult[0];

            // Khởi tạo email service
            const emailConfig = {
                smtpServer: process.env.EMAIL_HOST || 'smtp.gmail.com',
                smtpPort: process.env.EMAIL_PORT || 587,
                enableSsl: process.env.EMAIL_SSL === 'true',
                smtpUsername: process.env.EMAIL_USER || 'your-email@gmail.com',
                smtpPassword: process.env.EMAIL_PASSWORD || 'your-password',
                senderEmail: process.env.EMAIL_FROM || 'noreply@galaxycinema.com',
                senderName: 'GALAXY Cinema',
                apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
                supportPhone: process.env.SUPPORT_PHONE || '1900 xxxx'
            };

            const emailService = new EmailService(logger, emailConfig);

            // Kiểm tra thông tin khuyến mãi nếu có
            let promotionUsage = null;
            try {
                promotionUsage = await PromotionUsage.findOne({
                    where: { Booking_ID: bookingId, HasUsed: true },
                    attributes: ['Discount_Amount']
                });
            } catch (promoError) {
                logger.warn(`Không thể lấy thông tin khuyến mãi: ${promoError.message}`);
            }

            // Format ngày giờ
            const formatDate = (dateString) => {
                if (!dateString) return 'N/A';
                const date = new Date(dateString);
                const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
                const monthNames = ['tháng 1', 'tháng 2', 'tháng 3', 'tháng 4', 'tháng 5', 'tháng 6', 
                                   'tháng 7', 'tháng 8', 'tháng 9', 'tháng 10', 'tháng 11', 'tháng 12'];
                
                return `${dayNames[date.getUTCDay()]}, ${date.getUTCDate()} ${monthNames[date.getUTCMonth()]}, ${date.getUTCFullYear()}`;
            };

            const formatTime = (time) => {
                if (!time) return '';
                if (typeof time === 'string') {
                    return time.slice(0, 5);
                }
                // Fix timezone issue: Sử dụng UTC methods thay vì toLocaleTimeString
                const timeObj = new Date(time);
                const hours = timeObj.getUTCHours().toString().padStart(2, '0');
                const minutes = timeObj.getUTCMinutes().toString().padStart(2, '0');
                return `${hours}:${minutes}`;
            };

            // Chuẩn bị dữ liệu cho template
            const cinema = booking.Showtime.CinemaRoom.Cinema;
                            const emailData = {
                    bookingCode: booking.Booking_ID.toString(),
                    customerName: booking.User?.Full_Name || email,
                    movieTitle: booking.Showtime.Movie?.Movie_Name || 'Không có thông tin phim',
                    moviePosterUrl: booking.Showtime.Movie?.Poster_URL || '',
                    movieFormat: booking.Showtime.CinemaRoom?.Room_Type || '2D',
                    movieRating: booking.Showtime.Movie?.Rating || 'PG',
                    cinemaName: cinema?.Cinema_Name || 'GALAXY Cinema',
                    room: booking.Showtime.CinemaRoom?.Room_Name || 'Không xác định',
                    showDate: formatDate(booking.Showtime.Show_Date),
                    showtime: formatTime(booking.Showtime.Start_Time),
                    seats: tickets.map(t => t.Seat && t.Seat.SeatLayout ? `${t.Seat.SeatLayout.Row_Label}${t.Seat.SeatLayout.Column_Number}` : '').filter(Boolean).join(', '),
                    subtotal: tickets.reduce((sum, t) => sum + (t.Final_Price || 0), 0).toLocaleString('vi-VN') + ' VND',
                    discount: booking.Points_Used ? (booking.Points_Used).toLocaleString('vi-VN') + ' điểm' : '0 điểm',
                    promotion_discount: promotionUsage ? (promotionUsage.Discount_Amount).toLocaleString('vi-VN') + ' VND' : '0 VND',
                    total: booking.Total_Amount.toLocaleString('vi-VN') + ' VND',
                    paymentMethod: payment?.Payment_Method || 'Không xác định',
                    paymentReference: payment?.Payment_Reference || 'N/A',
                    paymentDate: payment?.Transaction_Date ? new Date(payment.Transaction_Date).toLocaleString('vi-VN') : 'N/A',
                
                // Thêm các trường cần thiết cho emailService.sendTicketsEmailAsync
                BookingId: booking.Booking_ID.toString(),
                MovieName: booking.Showtime.Movie?.Movie_Name || 'Không có thông tin phim',
                CinemaRoom: booking.Showtime.CinemaRoom?.Room_Name || 'Không xác định',
                ShowDate: formatDate(booking.Showtime.Show_Date),
                ShowTime: formatTime(booking.Showtime.Start_Time),
                Seats: tickets.map(t => t.Seat && t.Seat.SeatLayout ? `${t.Seat.SeatLayout.Row_Label}${t.Seat.SeatLayout.Column_Number}` : '').filter(Boolean).join(', ')
            };

                            // Tạo PDF vé cho từng vé
            const pdfTickets = [];
            
            try {
                const puppeteer = require('puppeteer');
                
                // Khởi tạo browser một lần với các tùy chọn tối ưu
                const browser = await puppeteer.launch({
                    headless: 'new',
                    args: [
                        '--no-sandbox', 
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-extensions',
                        '--disable-gpu',
                        '--js-flags=--max-old-space-size=512'
                    ]
                });
                
                // Tạo QR codes cho tất cả vé trước (song song) với giới hạn số lượng
                // Đọc giá trị từ biến môi trường MAX_TICKET_PDF, mặc định là 8
                const DEFAULT_MAX_TICKETS = 8; 
                const configMaxTickets = process.env.MAX_TICKET_PDF ? parseInt(process.env.MAX_TICKET_PDF) : DEFAULT_MAX_TICKETS;
                
                // Nếu MAX_TICKET_PDF là 0 hoặc giá trị âm, không giới hạn số lượng vé
                const MAX_TICKETS = configMaxTickets <= 0 ? tickets.length : configMaxTickets;
                const ticketsToProcess = tickets.slice(0, MAX_TICKETS);
                
                if (tickets.length > MAX_TICKETS && configMaxTickets > 0) {
                    logger.info(`Giới hạn số lượng vé từ ${tickets.length} xuống ${MAX_TICKETS} để tối ưu hiệu suất`);
                } else if (configMaxTickets <= 0) {
                    logger.info(`Xử lý tất cả ${tickets.length} vé không giới hạn (MAX_TICKET_PDF = ${configMaxTickets || 0})`);
                }
                
                const qrCodePromises = ticketsToProcess.map(ticket => 
                    QRCodeGenerator.generateQRCode(ticket.Ticket_Code)
                );
                const qrCodes = await Promise.all(qrCodePromises);
                
                // Xử lý từng vé với QR code đã có sẵn
                for (let i = 0; i < ticketsToProcess.length; i++) {
                    try {
                        const ticket = ticketsToProcess[i];
                        const qrCodeUrl = qrCodes[i];
                        
                        // Chuyển đổi buffer thành URL base64
                        const qrCodeBase64 = Buffer.isBuffer(qrCodeUrl) 
                            ? `data:image/png;base64,${qrCodeUrl.toString('base64')}`
                            : qrCodeUrl;
                        
                        // Tạo HTML cho vé theo thiết kế mới (gradient tím/đỏ/vàng từ booking success)
                        const ticketHtml = `
                        <!DOCTYPE html>
                        <html lang="vi">
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>Vé xem phim - GALAXY Cinema</title>
                            <style>
                                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
                                
                                * {
                                    margin: 0;
                                    padding: 0;
                                    box-sizing: border-box;
                                }
                                
                                body {
                                    font-family: 'Inter', sans-serif;
                                    line-height: 1.6;
                                    background: #ffffff;
                                    width: 100%;
                                    max-width: 400px;
                                    margin: 0 auto;
                                }
                                
                                .ticket-wrapper {
                                    width: 100%;
                                    max-width: 400px;
                                    margin: 0 auto;
                                }
                                
                                .ticket {
                                    background: #ffffff;
                                    border-radius: 12px;
                                    overflow: hidden;
                                    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
                                }
                                
                                .ticket-header {
                                    background: #FFD875;
                                    background: linear-gradient(135deg, #FFD875, #E8B73E);
                                    padding: 20px;
                                    text-align: center;
                                    color: #333;
                                }
                                
                                .ticket-header h1 {
                                    font-size: 24px;
                                    margin: 0;
                                    font-weight: 700;
                                    color: #333;
                                }
                                
                                .ticket-header p {
                                    margin: 5px 0 0;
                                    font-size: 12px;
                                    text-transform: uppercase;
                                    letter-spacing: 2px;
                                    color: #333;
                                }
                                
                                .ticket-divider {
                                    position: relative;
                                    height: 20px;
                                    border-bottom: 2px dashed #FFE9A8;
                                }
                                
                                .ticket-divider:before, .ticket-divider:after {
                                    content: '';
                                    position: absolute;
                                    bottom: -6px;
                                    width: 12px;
                                    height: 12px;
                                    background: #FFFAED;
                                    border-radius: 50%;
                                }
                                
                                .ticket-divider:before {
                                    left: -6px;
                                }
                                
                                .ticket-divider:after {
                                    right: -6px;
                                }
                                
                                .ticket-body {
                                    padding: 20px;
                                }
                                
                                .movie-title {
                                    font-size: 20px;
                                    font-weight: 700;
                                    text-align: center;
                                    margin-bottom: 5px;
                                    color: #333;
                                }
                                
                                .movie-format {
                                    text-align: center;
                                    color: #666;
                                    margin-bottom: 20px;
                                    font-size: 14px;
                                }
                                
                                .ticket-info {
                                    display: grid;
                                    grid-template-columns: 1fr 1fr;
                                    gap: 20px;
                                    margin-bottom: 20px;
                                }
                                
                                .info-col {
                                    display: flex;
                                    flex-direction: column;
                                }
                                
                                .info-col.center {
                                    align-items: center;
                                    justify-content: center;
                                }
                                
                                .info-item {
                                    display: flex;
                                    align-items: center;
                                    margin-bottom: 10px;
                                }
                                
                                .info-icon {
                                    margin-right: 10px;
                                    font-size: 16px;
                                }
                                
                                .info-text {
                                    font-size: 14px;
                                }
                                
                                .seat-badge {
                                    background-color: #FFE9A8;
                                    color: #B38A28;
                                    width: 60px;
                                    height: 60px;
                                    border-radius: 50%;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    font-size: 24px;
                                    font-weight: bold;
                                    margin-bottom: 8px;
                                }
                                
                                .seat-label {
                                    font-size: 12px;
                                    color: #666;
                                    text-align: center;
                                }
                                
                                .ticket-footer {
                                    display: flex;
                                    justify-content: space-between;
                                    align-items: center;
                                    padding-top: 15px;
                                    margin-top: 15px;
                                    border-top: 1px solid #FFE9A8;
                                }
                                
                                .ticket-code {
                                    flex: 1;
                                }
                                
                                .code-label {
                                    font-size: 12px;
                                    color: #666;
                                    margin-bottom: 4px;
                                }
                                
                                .code-value {
                                    font-family: monospace;
                                    font-size: 18px;
                                    font-weight: bold;
                                    color: #B38A28;
                                }
                                
                                .qr-code {
                                    padding: 4px;
                                    background: white;
                                    border: 3px solid #FFD875;
                                    border-radius: 4px;
                                }
                                
                                .qr-code img {
                                    display: block;
                                    width: 100px;
                                    height: 100px;
                                }
                                
                                .ticket-note {
                                    background-color: #FFFAED;
                                    padding: 15px;
                                    text-align: center;
                                    font-size: 14px;
                                    color: #666;
                                    border-top: 1px solid #FFE9A8;
                                }
                            </style>
                        </head>
                        <body>
                            <div class="ticket-wrapper">
                                <div class="ticket">
                                    <div class="ticket-header">
                                        <h1>GALAXY CINEMA</h1>
                                        <p>VŨ TRỤ ĐIỆN ẢNH</p>
                                    </div>
                                    
                                    <div class="ticket-divider"></div>
                                    
                                    <div class="ticket-body">
                                        <h2 class="movie-title">${booking.Showtime.Movie?.Movie_Name || 'Không có thông tin phim'}</h2>
                                        <p class="movie-format">${booking.Showtime.Movie?.Duration || '120'} phút | ${booking.Showtime.Movie?.Rating || 'PG-13'}</p>
                                        
                                        <div class="ticket-info">
                                            <div class="info-col">
                                                <div class="info-item">
                                                    <span class="info-icon">📅</span>
                                                    <span class="info-text">${formatDate(booking.Showtime.Show_Date)}</span>
                                                </div>
                                                <div class="info-item">
                                                    <span class="info-icon">⏰</span>
                                                    <span class="info-text">${formatTime(booking.Showtime.Start_Time)}</span>
                                                </div>
                                                <div class="info-item">
                                                    <span class="info-icon">🏢</span>
                                                    <span class="info-text">${booking.Showtime.CinemaRoom?.Room_Name || 'Không xác định'}</span>
                                                </div>
                                            </div>
                                            
                                            <div class="info-col center">
                                                <div class="seat-badge">
                                                    ${ticket.Seat?.SeatLayout ? `${ticket.Seat.SeatLayout.Row_Label}${ticket.Seat.SeatLayout.Column_Number}` : 'A1'}
                                                </div>
                                                <p class="seat-label">Ghế của bạn</p>
                                            </div>
                                        </div>
                                        
                                        <div class="ticket-footer">
                                            <div class="ticket-code">
                                                <p class="code-label">MÃ VÉ</p>
                                                <p class="code-value">${ticket.Ticket_Code}</p>
                                            </div>
                                            
                                            <div class="qr-code">
                                                <img src="${qrCodeBase64}" alt="QR Code" />
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="ticket-note">
                                        <p>Vui lòng đến trước 15 phút để check-in</p>
                                        <small>Vé có giá trị duy nhất cho suất chiếu này</small>
                                    </div>
                                </div>
                            </div>
                        </body>
                        </html>`;
                        
                                                    // Tạo PDF từ HTML với tối ưu hiệu suất
                            const page = await browser.newPage();
                            
                            // Tắt các tính năng không cần thiết để tăng tốc
                            await page.setRequestInterception(true);
                            page.on('request', (req) => {
                                if (req.resourceType() === 'image' && !req.url().includes('base64')) {
                                    req.abort();
                                } else {
                                    req.continue();
                                }
                            });
                            
                            // Giảm thời gian chờ và sử dụng domcontentloaded thay vì networkidle0
                            await page.setContent(ticketHtml, {
                                waitUntil: 'domcontentloaded',
                                timeout: 5000 // Giảm timeout xuống 5s
                            });
                            
                            // Tối ưu PDF kích thước vé
                            const pdfBuffer = await page.pdf({
                                width: '400px',
                                height: '600px',
                                printBackground: true,
                                margin: {
                                    top: '0px',
                                    right: '0px', 
                                    bottom: '0px',
                                    left: '0px'
                                },
                                scale: 0.9 // Giảm scale để tối ưu kích thước
                            });
                            
                            await page.close(); // Đóng page nhưng giữ browser
                            
                        // Thêm PDF vào danh sách để đính kèm email
                            pdfTickets.push({
                                filename: `Ve_GALAXY_Cinema_${ticket.Ticket_Code}.pdf`,
                                content: pdfBuffer,
                                contentType: 'application/pdf'
                            });
                        
                    } catch (pdfError) {
                        logger.error(`Lỗi khi tạo PDF cho vé: ${pdfError.message}`);
                    }
            }

                // Tạo PDF hóa đơn
                try {
                    // HTML cho hóa đơn
                    const invoiceHtml = `
                    <!DOCTYPE html>
                    <html lang="vi">
              <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Hóa đơn - GALAXY Cinema</title>
                <style>
                            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
                            
                            * {
                                margin: 0;
                                padding: 0;
                                box-sizing: border-box;
                            }
                            
                            body {
                                font-family: 'Inter', sans-serif;
                                line-height: 1.6;
                                color: #333;
                                background-color: #ffffff;
                                width: 100%;
                                max-width: 800px;
                                margin: 0 auto;
                            }
                            
                            .invoice {
                                width: 100%;
                                max-width: 800px;
                                margin: 0 auto;
                                background: white;
                                border-radius: 10px;
                                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
                                overflow: hidden;
                            }
                            
                            .invoice-header {
                                background: #FFD875;
                                background: linear-gradient(135deg, #FFD875, #E8B73E);
                                padding: 30px;
                                color: #333;
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                            }
                            
                            .invoice-title {
                                font-size: 28px;
                                font-weight: 700;
                                margin: 0;
                                color: #333;
                            }
                            
                            .invoice-title-sub {
                                font-size: 14px;
                                opacity: 0.9;
                                margin-top: 5px;
                                color: #333;
                            }
                            
                            .cinema-logo {
                                font-size: 24px;
                                font-weight: 700;
                                letter-spacing: 1px;
                                color: #333;
                            }
                            
                            .cinema-logo-sub {
                                font-size: 10px;
                                text-transform: uppercase;
                                letter-spacing: 2px;
                                text-align: center;
                                margin-top: 3px;
                                color: #333;
                            }
                            
                            .invoice-body {
                                padding: 30px;
                            }
                            
                            .invoice-details {
                                display: flex;
                                justify-content: space-between;
                                margin-bottom: 30px;
                            }
                            
                            .detail-col {
                                flex: 1;
                            }
                            
                            .detail-col h3 {
                                font-size: 16px;
                                color: #666;
                                margin-bottom: 10px;
                                font-weight: 500;
                            }
                            
                            .detail-col p {
                                margin: 5px 0;
                            }
                            
                            .detail-col strong {
                                font-weight: 600;
                            }
                            
                            .movie-info {
                                background: #FFFAED;
                                border-radius: 8px;
                                padding: 20px;
                                margin-bottom: 30px;
                                display: flex;
                                align-items: center;
                                gap: 20px;
                                border: 1px solid #FFE9A8;
                            }
                            
                            .movie-poster {
                                width: 80px;
                                height: 120px;
                                object-fit: cover;
                                border-radius: 4px;
                            }
                            
                            .movie-details {
                                flex: 1;
                            }
                            
                            .movie-title {
                                font-size: 20px;
                                font-weight: 700;
                                margin-bottom: 5px;
                                color: #333;
                            }
                            
                            .movie-meta {
                                color: #666;
                                margin-bottom: 10px;
                                font-size: 14px;
                            }
                            
                            .tag {
                                display: inline-block;
                                padding: 3px 8px;
                                background: #FFE9A8;
                                color: #B38A28;
                                border-radius: 4px;
                                font-size: 12px;
                                font-weight: 500;
                                margin-right: 5px;
                            }
                            
                            .tickets-table {
                                width: 100%;
                                border-collapse: collapse;
                                margin-bottom: 30px;
                            }
                            
                            .tickets-table th {
                                background: #FFFAED;
                                padding: 12px 15px;
                                text-align: left;
                                font-weight: 600;
                                color: #333;
                                border-bottom: 2px solid #FFE9A8;
                            }
                            
                            .tickets-table td {
                                padding: 12px 15px;
                                border-bottom: 1px solid #FFE9A8;
                            }
                            
                            .tickets-table tr:last-child td {
                                border-bottom: none;
                            }
                            
                            .seat-cell {
                                font-weight: 600;
                                background: #FFE9A8;
                                color: #B38A28;
                                border-radius: 4px;
                                text-align: center;
                                width: 40px;
                                padding: 6px;
                            }
                            
                            .price-cell {
                                font-weight: 600;
                                text-align: right;
                            }
                            
                            .total-section {
                                background: #FFFAED;
                                border-radius: 8px;
                                padding: 20px;
                                margin-top: 20px;
                                border: 1px solid #FFE9A8;
                            }
                            
                            .price-row {
                                display: flex;
                                justify-content: space-between;
                                padding: 10px 0;
                                border-bottom: 1px solid #FFE9A8;
                            }
                            
                            .price-row:last-child {
                                border-bottom: none;
                            }
                            
                            .price-row.total {
                                font-weight: 700;
                                font-size: 18px;
                                margin-top: 10px;
                                border-top: 2px dashed #FFE9A8;
                                padding-top: 15px;
                                border-bottom: none;
                                color: #B38A28;
                            }
                            
                            .price-row.discount {
                                color: #B38A28;
                            }
                            
                            .invoice-footer {
                                background: #FFFAED;
                                padding: 20px 30px;
                                text-align: center;
                                color: #666;
                                font-size: 14px;
                                border-top: 1px solid #FFE9A8;
                            }
                            
                            .invoice-footer p {
                                margin: 5px 0;
                            }
                </style>
              </head>
              <body>
                        <div class="invoice">
                            <div class="invoice-header">
                                <div>
                                    <h1 class="invoice-title">Hóa đơn thanh toán</h1>
                                    <p class="invoice-title-sub">Mã đặt vé: ${booking.Booking_ID}</p>
                  </div>
                                <div>
                                    <div class="cinema-logo">GALAXY CINEMA</div>
                                    <div class="cinema-logo-sub">Vũ trụ điện ảnh</div>
                      </div>
                    </div>
                    
                            <div class="invoice-body">
                                <div class="invoice-details">
                                    <div class="detail-col">
                                        <h3>Thông tin khách hàng</h3>
                                        <p><strong>Họ tên:</strong> ${booking.User?.Full_Name || email}</p>
                                        <p><strong>Email:</strong> ${booking.User?.Email || email}</p>
                                        <p><strong>SĐT:</strong> ${booking.User?.Phone_Number || 'N/A'}</p>
                    </div>
                    
                                    <div class="detail-col">
                                        <h3>Thông tin thanh toán</h3>
                                        <p><strong>Phương thức:</strong> ${payment?.Payment_Method || 'Không xác định'}</p>
                                        <p><strong>Mã giao dịch:</strong> ${payment?.Payment_Reference || 'N/A'}</p>
                                        <p><strong>Ngày thanh toán:</strong> ${payment?.Transaction_Date ? new Date(payment.Transaction_Date).toLocaleString('vi-VN') : 'N/A'}</p>
                              </div>
                              </div>
                                
                                <div class="movie-info">
                                    <img 
                                        src="${booking.Showtime.Movie?.Poster_URL || 'https://via.placeholder.com/80x120?text=No+Poster'}" 
                                        alt="${booking.Showtime.Movie?.Movie_Name || 'Movie'}" 
                                        class="movie-poster"
                                        onerror="this.src='https://via.placeholder.com/80x120?text=No+Poster'"
                                    >
                                    <div class="movie-details">
                                        <h2 class="movie-title">${booking.Showtime.Movie?.Movie_Name || 'Không có thông tin phim'}</h2>
                                        <p class="movie-meta">
                                            ${cinema?.Cinema_Name || 'GALAXY Cinema'} | 
                                            ${formatDate(booking.Showtime.Show_Date)} | 
                                            ${formatTime(booking.Showtime.Start_Time)} | 
                                            ${booking.Showtime.CinemaRoom?.Room_Name || 'Không xác định'}
                                        </p>
                                        <div>
                                            <span class="tag">${booking.Showtime.CinemaRoom?.Room_Type || '2D'}</span>
                                            <span class="tag">${booking.Showtime.Movie?.Rating || 'PG-13'}</span>
                              </div>
                              </div>
                            </div>
                                
                                <h3>Danh sách vé (${tickets.length})</h3>
                                <table class="tickets-table">
                                    <thead>
                                        <tr>
                                            <th>STT</th>
                                            <th>Mã vé</th>
                                            <th>Ghế</th>
                                            <th>Loại ghế</th>
                                            <th>Giá (VND)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${tickets.map((ticket, index) => `
                                            <tr>
                                                <td>${index + 1}</td>
                                                <td>${ticket.Ticket_Code}</td>
                                                <td class="seat-cell" style="width:40px; padding:6px;">${ticket.Seat?.SeatLayout ? `${ticket.Seat.SeatLayout.Row_Label}${ticket.Seat.SeatLayout.Column_Number}` : '-'}</td>
                                                <td>${ticket.Seat?.SeatLayout?.Seat_Type || 'Thường'}</td>
                                                <td class="price-cell">${ticket.Final_Price.toLocaleString('vi-VN')}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                                
                                <div class="total-section">
                                    <div class="price-row">
                                        <span>Tổng tiền vé:</span>
                                        <span>${tickets.reduce((sum, t) => sum + (t.Final_Price || 0), 0).toLocaleString('vi-VN')} VND</span>
                    </div>
                    
                                    ${booking.Points_Used ? `
                                        <div class="price-row discount">
                                            <span>Giảm giá (sử dụng ${booking.Points_Used} điểm):</span>
                                            <span>${booking.Points_Used.toLocaleString('vi-VN')} điểm</span>
                    </div>
                    ` : ''}
                    
                                    ${promotionUsage && promotionUsage.Discount_Amount > 0 ? `
                                        <div class="price-row discount">
                                            <span>Giảm giá (khuyến mãi):</span>
                                            <span>${promotionUsage.Discount_Amount.toLocaleString('vi-VN')} VND</span>
                    </div>
                    ` : ''}
                    
                                    <div class="price-row total">
                                        <span>TỔNG THANH TOÁN:</span>
                                        <span>${booking.Total_Amount.toLocaleString('vi-VN')} VND</span>
                    </div>
                                </div>
                  </div>
                  
                            <div class="invoice-footer">
                    <p><strong>GALAXY Cinema</strong> - Hệ thống rạp chiếu phim hàng đầu Việt Nam</p>
                                <p>Thời gian phát hành: ${new Date().toLocaleString('vi-VN')}</p>
                                <p>&copy; ${new Date().getFullYear()} GALAXY Cinema. Bảo lưu mọi quyền.</p>
                  </div>
                </div>
              </body>
              </html>
            `;

                    // Tạo PDF từ HTML - tối ưu hóa
                    const page = await browser.newPage();
                    
                    // Tắt các tính năng không cần thiết
                    await page.setRequestInterception(true);
                    page.on('request', (req) => {
                        if (req.resourceType() === 'image' && !req.url().includes('base64')) {
                            req.abort();
                        } else {
                            req.continue();
                        }
                    });
                    
                    await page.setContent(invoiceHtml, {
                        waitUntil: 'domcontentloaded', // Sử dụng domcontentloaded thay vì networkidle0
                        timeout: 5000 // Giảm timeout xuống 5s
                    });
                    
                    // Tối ưu PDF hóa đơn
                    const pdfBuffer = await page.pdf({
                        format: 'A4',
                        printBackground: true,
                        margin: {
                            top: '10mm',
                            right: '10mm',
                            bottom: '10mm',
                            left: '10mm'
                        },
                        scale: 0.95 // Giảm scale để tối ưu kích thước
                    });
                    
                    await page.close(); // Đóng page nhưng giữ browser
                    
                    // Thêm PDF hóa đơn vào danh sách để đính kèm email
                    pdfTickets.push({
                        filename: `Hoa_Don_GALAXY_Cinema_${booking.Booking_ID}.pdf`,
                        content: pdfBuffer,
                        contentType: 'application/pdf'
                    });
                    
                } catch (invoiceError) {
                    logger.error(`Lỗi khi tạo PDF hóa đơn: ${invoiceError.message}`);
                }
                
                // Đóng browser sau khi đã tạo xong tất cả PDF
                await browser.close();
                
            } catch (pdfServiceError) {
                logger.error(`Lỗi khởi tạo Puppeteer: ${pdfServiceError.message}`);
            }

            // Tạo nội dung email
            const emailSubject = `Vé điện tử GALAXY CINEMA - Mã đặt vé: ${booking.Booking_ID}`;
            
            // Sử dụng TicketHtmlGenerator để tạo email HTML
            const emailHtml = TicketHtmlGenerator.generateEmail(emailData, tickets);
            
            // Gửi email với PDF đính kèm
            let emailSent = false;
            
            if (pdfTickets.length > 0) {
                emailSent = await emailService.sendTicketsEmailAsync(
                    email,
                    booking.User?.Full_Name || email,
                    emailData,
                    pdfTickets
                );
            } else {
                emailSent = await emailService.sendEmailAsync(email, emailSubject, emailHtml);
            }
            
            if (emailSent) {
                logger.info(`✅ Gửi email thành công ${pdfTickets.length > 0 ? `với ${pdfTickets.length} PDF` : ''} đến ${email}`);
                return true;
            } else {
                logger.error(`❌ Không thể gửi email đến ${email}`);
                return false;
            }

        } catch (error) {
            logger.error(`Lỗi gửi vé qua email: ${error.message}`);
            throw error;
        }
    }

    /**
     * Cleans up invalid tickets (e.g., for unconfirmed bookings). (Admin only)
     * @returns {Promise<number>} - Number of tickets removed.
     */
    async cleanupTicketsAsync() {
        // Delete tickets whose bookings are in a 'Cancelled' or 'Failed' state
        const bookingsToDeleteTicketsFor = await TicketBooking.findAll({
            where: {
                Status: { [Op.notIn]: ['Confirmed', 'Pending'] }
            },
            attributes: ['Booking_ID']
        });

        if (bookingsToDeleteTicketsFor.length === 0) {
            return 0;
        }

        const bookingIds = bookingsToDeleteTicketsFor.map(b => b.Booking_ID);

        const result = await Ticket.destroy({
            where: {
                Booking_ID: { [Op.in]: bookingIds }
            }
        });
        return result;
    }

    /**
     * Updates ticket status for confirmed bookings (e.g., from null to 'Active'). (Admin only)
     * @returns {Promise<number>} - Number of tickets updated.
     */
    async updateTicketStatusForConfirmedBookingsAsync() {
        const [affectedCount] = await Ticket.update(
            { Status: 'Active' },
            {
                where: {
                    Status: { [Op.is]: null },
                    '$TicketBooking.Status$': 'Confirmed'
                },
                include: [{ model: TicketBooking, as: 'TicketBooking', attributes: [] }]
            }
        );
        return affectedCount;
    }

    /**
     * Gets all tickets (Admin only).
     * @returns {Promise<object>} - List of all tickets and total count.
     */
    async getAllTicketsAsync() {
        const tickets = await Ticket.findAll({
            order: [['Ticket_ID', 'DESC']],
            // attributes: ['Ticket_ID', 'Ticket_Code', 'Booking_ID', 'Is_Checked_In', 'Status'] // Select specific fields
        });
        const totalCount = await Ticket.count();
        return {
            success: true,
            total_records: totalCount,
            tickets: tickets.map(t => ({
                ticket_id: t.Ticket_ID,
                ticket_code: t.Ticket_Code,
                booking_id: t.Booking_ID,
                is_checked_in: t.Is_Checked_In,
                status: t.Status
            }))
        };
    }

    /**
     * Gets a ticket by its ID with full information for display.
     * @param {number} ticketId - The ID of the ticket.
     * @returns {Promise<object>} - Detailed ticket information for display.
     */
    async getTicketByIdAsync(ticketId) {
        try {
            logger.info(`Lấy thông tin vé với ID: ${ticketId}`);

            // Sử dụng raw query để tránh lỗi với nested includes phức tạp
            const rawTickets = await sequelize.query(`
                SELECT
                    t.Ticket_ID,
                    t.Ticket_Code,
                    t.Status as Ticket_Status,
                    t.Is_Checked_In,
                    t.Check_In_Time,
                    t.Final_Price,

                    tb.Booking_ID,
                    tb.Booking_Date,
                    tb.Status as Booking_Status,
                    tb.Total_Amount,
                    tb.Payment_Deadline,

                    u.User_ID,
                    u.Full_Name,
                    u.Email,
                    u.Phone_Number,

                    s.Seat_ID,
                    sl.Row_Label,
                    sl.Column_Number,
                    sl.Seat_Type,

                    st.Showtime_ID,
                    st.Show_Date,
                    st.Start_Time,

                    m.Movie_ID,
                    m.Movie_Name,
                    m.Poster_URL,
                    m.Duration,
                    m.Rating,

                    cr.Cinema_Room_ID,
                    cr.Room_Name,
                    cr.Room_Type,

                    c.Cinema_ID,
                    c.Cinema_Name,
                    c.Address as Cinema_Address

                FROM [ksf00691_team03].[Tickets] t
                INNER JOIN [ksf00691_team03].[Ticket_Bookings] tb ON t.Booking_ID = tb.Booking_ID
                LEFT JOIN [ksf00691_team03].[Users] u ON tb.User_ID = u.User_ID
                LEFT JOIN [ksf00691_team03].[Seats] s ON t.Seat_ID = s.Seat_ID
                LEFT JOIN [ksf00691_team03].[Seat_Layout] sl ON s.Layout_ID = sl.Layout_ID
                LEFT JOIN [ksf00691_team03].[Showtimes] st ON t.Showtime_ID = st.Showtime_ID
                LEFT JOIN [ksf00691_team03].[Movies] m ON st.Movie_ID = m.Movie_ID
                LEFT JOIN [ksf00691_team03].[Cinema_Rooms] cr ON st.Cinema_Room_ID = cr.Cinema_Room_ID
                LEFT JOIN [ksf00691_team03].[Cinemas] c ON cr.Cinema_ID = c.Cinema_ID
                WHERE t.Ticket_ID = :ticketId
            `, {
                replacements: { ticketId },
                type: sequelize.QueryTypes.SELECT
            });

            if (!rawTickets || rawTickets.length === 0) {
                throw new NotFoundError('Không tìm thấy vé với ID này');
            }

            const rawTicket = rawTickets[0];

            // Format date and time (fix UTC timezone issue)
            const formatDateTime = (showDate, startTime) => {
                if (!showDate || !startTime) return { date: 'Invalid Date', time: 'Invalid Time' };
                
                try {
                    // Fix UTC timezone issue - sử dụng UTC methods thay vì local methods
                    const date = new Date(showDate);
                    const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
                    const monthNames = ['tháng 1', 'tháng 2', 'tháng 3', 'tháng 4', 'tháng 5', 'tháng 6', 
                                       'tháng 7', 'tháng 8', 'tháng 9', 'tháng 10', 'tháng 11', 'tháng 12'];
                    
                    const formattedDate = `${dayNames[date.getUTCDay()]}, ${date.getUTCDate()} ${monthNames[date.getUTCMonth()]}, ${date.getUTCFullYear()}`;
                    
                    // Format time - chỉ lấy HH:MM từ string, tránh UTC conversion
                    let formattedTime = 'Invalid Time';
                    if (typeof startTime === 'string') {
                        // Nếu là string dạng "14:00:00" hoặc "14:00"
                        formattedTime = startTime.slice(0, 5); // Get HH:MM
                    } else if (startTime instanceof Date) {
                        // Nếu là Date object, sử dụng UTC để tránh timezone offset
                        const hours = startTime.getUTCHours().toString().padStart(2, '0');
                        const minutes = startTime.getUTCMinutes().toString().padStart(2, '0');
                        formattedTime = `${hours}:${minutes}`;
                    }
                    
                    return { date: formattedDate, time: formattedTime };
                } catch (error) {
                    logger.error(`Lỗi format datetime: ${error.message}`);
                    return { date: 'Invalid Date', time: 'Invalid Time' };
                }
            };

            const dateTime = formatDateTime(rawTicket.Show_Date, rawTicket.Start_Time);

            // Generate QR code for the ticket
            let qrCodeUrl = null;
            try {
                qrCodeUrl = await QRCodeGenerator.generateQRCode(rawTicket.Ticket_Code);
                // Đảm bảo QR code trả về đúng format base64 string
                if (qrCodeUrl && typeof qrCodeUrl !== 'string') {
                    // Nếu là Buffer, chuyển thành base64 string
                    if (Buffer.isBuffer(qrCodeUrl)) {
                        qrCodeUrl = `data:image/png;base64,${qrCodeUrl.toString('base64')}`;
                    }
                }
            } catch (qrError) {
                logger.warn(`Không thể tạo QR code cho vé ${rawTicket.Ticket_Code}: ${qrError.message}`);
            }

            // Build complete ticket information
            const ticketInfo = {
                success: true,
                ticket_details: {
                    ticket_id: rawTicket.Ticket_ID,
                    ticket_code: rawTicket.Ticket_Code,
                    status: rawTicket.Ticket_Status,
                    is_checked_in: rawTicket.Is_Checked_In,
                    check_in_time: rawTicket.Check_In_Time,
                    final_price: rawTicket.Final_Price
                },
                cinema_info: {
                    cinema_id: rawTicket.Cinema_ID,
                    cinema_name: rawTicket.Cinema_Name || 'Galaxy Cinema',
                    cinema_address: rawTicket.Cinema_Address || ''
                },
                room_info: {
                    room_id: rawTicket.Cinema_Room_ID,
                    room_name: rawTicket.Room_Name || 'Phòng Chiếu',
                    room_type: rawTicket.Room_Type || '2D'
                },
                seat_info: {
                    seat_id: rawTicket.Seat_ID,
                    seat_label: rawTicket.Row_Label && rawTicket.Column_Number ?
                        `${rawTicket.Row_Label}${rawTicket.Column_Number}` : 'N/A',
                    row_label: rawTicket.Row_Label || '',
                    column_number: rawTicket.Column_Number || '',
                    seat_type: rawTicket.Seat_Type || 'Thường'
                },
                showtime_info: {
                    showtime_id: rawTicket.Showtime_ID,
                    show_date_formatted: dateTime.date,
                    show_time_formatted: dateTime.time,
                    show_date_raw: rawTicket.Show_Date
                },
                movie_info: {
                    movie_id: rawTicket.Movie_ID,
                    movie_name: rawTicket.Movie_Name || 'Unknown Movie',
                    movie_poster: rawTicket.Poster_URL || '',
                    duration: rawTicket.Duration || 0,
                    rating: rawTicket.Rating || ''
                },
                booking_info: {
                    booking_id: rawTicket.Booking_ID,
                    booking_date: rawTicket.Booking_Date,
                    booking_status: rawTicket.Booking_Status,
                    total_amount: rawTicket.Total_Amount,
                    payment_deadline: rawTicket.Payment_Deadline
                },
                customer_info: {
                    user_id: rawTicket.User_ID,
                    full_name: rawTicket.Full_Name || '',
                    email: rawTicket.Email || '',
                    phone: rawTicket.Phone_Number || ''
                },
                qr_code: {
                    data: rawTicket.Ticket_Code,
                    image_url: qrCodeUrl
                },
                usage_instructions: [
                    "Xuất trình mã QR này tại quầy check-in rạp chiếu phim",
                    "Mã vé chỉ có hiệu lực trong ngày chiếu được chỉ định"
                ]
            };

            logger.info(`✅ Lấy thông tin vé thành công cho ID: ${ticketId}`);
            return ticketInfo;

        } catch (error) {
            logger.error(`Lỗi khi lấy thông tin vé ${ticketId}: ${error.message}`, { stack: error.stack });
            
            if (error instanceof NotFoundError) {
                throw error;
            }
            
            throw new InternalServerError(`Lỗi hệ thống khi lấy thông tin vé: ${error.message}`);
        }
    }

    /**
     * Gets tickets for the currently authenticated user.
     * @param {number} userId - The ID of the user.
     * @returns {Promise<object>} - List of user's tickets and total count.
     */
    async getMyTicketsAsync(userId) {
        try {
            logger.info(`Truy xuất vé cho người dùng ${userId}`);

            // Sử dụng raw query để tránh lỗi với nested includes phức tạp
            const rawTickets = await sequelize.query(`
                SELECT
                    t.Ticket_ID,
                    t.Ticket_Code,
                    t.Booking_ID,
                    t.Status as Ticket_Status,
                    t.Is_Checked_In,
                    t.Final_Price,
                    t.Check_In_Time,

                    tb.Booking_Date,
                    tb.User_ID,

                    s.Seat_ID,
                    sl.Row_Label,
                    sl.Column_Number,

                    st.Showtime_ID,
                    st.Show_Date,
                    st.Start_Time,

                    m.Movie_ID,
                    m.Movie_Name,
                    m.Poster_URL,

                    cr.Cinema_Room_ID,
                    cr.Room_Name,

                    c.Cinema_ID,
                    c.Cinema_Name

                FROM [ksf00691_team03].[Tickets] t
                INNER JOIN [ksf00691_team03].[Ticket_Bookings] tb ON t.Booking_ID = tb.Booking_ID
                LEFT JOIN [ksf00691_team03].[Seats] s ON t.Seat_ID = s.Seat_ID
                LEFT JOIN [ksf00691_team03].[Seat_Layout] sl ON s.Layout_ID = sl.Layout_ID
                LEFT JOIN [ksf00691_team03].[Showtimes] st ON t.Showtime_ID = st.Showtime_ID
                LEFT JOIN [ksf00691_team03].[Movies] m ON st.Movie_ID = m.Movie_ID
                LEFT JOIN [ksf00691_team03].[Cinema_Rooms] cr ON st.Cinema_Room_ID = cr.Cinema_Room_ID
                LEFT JOIN [ksf00691_team03].[Cinemas] c ON cr.Cinema_ID = c.Cinema_ID
                WHERE tb.User_ID = :userId
                ORDER BY t.Ticket_ID DESC
            `, {
                replacements: { userId },
                type: sequelize.QueryTypes.SELECT
            });

            const formattedTickets = [];

            for (const rawTicket of rawTickets) {
                // Format start_time để tránh lỗi UTC (fix 1970 issue)
                let formattedStartTime = rawTicket.Start_Time;
                if (typeof rawTicket.Start_Time === 'string') {
                    // Nếu là string dạng "14:00:00" hoặc "14:00", giữ nguyên
                    formattedStartTime = rawTicket.Start_Time;
                } else if (rawTicket.Start_Time instanceof Date) {
                    // Nếu là Date object, chỉ lấy HH:MM
                    const hours = rawTicket.Start_Time.getUTCHours().toString().padStart(2, '0');
                    const minutes = rawTicket.Start_Time.getUTCMinutes().toString().padStart(2, '0');
                    formattedStartTime = `${hours}:${minutes}:00`;
                }

                formattedTickets.push({
                    ticket_id: rawTicket.Ticket_ID,
                    ticket_code: rawTicket.Ticket_Code,
                    booking_id: rawTicket.Booking_ID,
                    status: rawTicket.Ticket_Status,
                    is_checked_in: rawTicket.Is_Checked_In,
                    final_price: rawTicket.Final_Price,
                    check_in_time: rawTicket.Check_In_Time,
                    booking_date: rawTicket.Booking_Date,
                    movie_info: rawTicket.Movie_ID ? {
                        movie_id: rawTicket.Movie_ID,
                        movie_name: rawTicket.Movie_Name,
                        poster_url: rawTicket.Poster_URL
                    } : null,
                    showtime_info: rawTicket.Showtime_ID ? {
                        showtime_id: rawTicket.Showtime_ID,
                        show_date: rawTicket.Show_Date,
                        start_time: formattedStartTime,
                        room_name: rawTicket.Room_Name,
                        cinema_id: rawTicket.Cinema_ID,
                        cinema_name: rawTicket.Cinema_Name
                    } : null,
                    room_info: {
                        room_name: rawTicket.Room_Name,
                        cinema_name: rawTicket.Cinema_Name
                    },
                    seat_info: rawTicket.Row_Label && rawTicket.Column_Number ?
                        { seat_label: `${rawTicket.Row_Label}${rawTicket.Column_Number}` } :
                        { seat_label: 'Không có' }
                });
            }

            return {
                success: true,
                total: formattedTickets.length,
                tickets: formattedTickets
            };
        } catch (error) {
            logger.error(`Lỗi khi lấy vé cho người dùng ${userId}: ${error.message}`, { stack: error.stack });
            throw error;
        }
    }
}

module.exports = TicketService;
