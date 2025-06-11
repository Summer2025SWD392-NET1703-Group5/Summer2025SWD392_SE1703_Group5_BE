'use strict';


const { Ticket, TicketBooking, Seat, SeatLayout, CinemaRoom, TicketPricing, PromotionUsage, BookingHistory, Showtime, Movie, User, sequelize } = require('../models');
const TicketRepository = require('../repositories/TicketRepository');
const EmailService = require('./emailService');
const PdfGenerator = require('./pdfGeneratorService');
const QRCodeGenerator = require('./qrCodeGenerator');
const TicketHtmlGenerator = require('./ticketHtmlGenerator');
const logger = require('../utils/logger');
const { Op } = require('sequelize');
const { NotFoundError, BadRequestError, InternalServerError, UnauthorizedError } = require('../utils/errorHandler');


class TicketService {
    constructor(context) {
        // In Node.js with Sequelize, the context (db models) is typically imported directly
        // and not passed as a constructor argument to services.
        // If you have a specific reason for a context object, you can keep it.
    }


    // Thêm phương thức helper để tạo mã vé
    _generateTicketCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }


    

    /**
     * Gets tickets for the currently authenticated user.
     * @param {number} userId - The ID of the user.
     * @returns {Promise<object>} - List of user's tickets and total count.
     */
    async getMyTicketsAsync(userId) {
        try {
            logger.info(`Đang truy xuất vé cho người dùng ${userId}`);


            const tickets = await Ticket.findAll({
                include: [
                    {
                        model: TicketBooking,
                        as: 'TicketBooking',  // Phải khớp chính xác với alias trong model
                        where: { User_ID: userId },
                        required: true,
                        include: [
                            {
                                model: Showtime,
                                as: 'Showtime',  // Phải khớp chính xác với alias trong model
                                include: [
                                    { model: Movie, as: 'Movie' },  // Phải khớp chính xác với alias trong model
                                    { model: CinemaRoom, as: 'CinemaRoom' }  // Phải khớp chính xác với alias trong model
                                ]
                            }
                        ]
                    },
                    {
                        model: Seat,
                        as: 'Seat',  // Phải khớp chính xác với alias trong model
                        include: [{
                            model: SeatLayout,
                            as: 'SeatLayout'  // Phải khớp chính xác với alias trong model
                        }]
                    }
                ],
                order: [['Ticket_ID', 'DESC']]  // Sắp xếp theo ID thay vì theo ngày đặt vé để tránh lỗi
            });


            logger.info(`Tìm thấy ${tickets.length} vé cho người dùng ${userId}`);


            const formattedTickets = [];


            for (const ticket of tickets) {
                const booking = ticket.TicketBooking;
                if (!booking) continue;


                const showtime = booking.Showtime;
                if (!showtime) continue;


                const movie = showtime.Movie;
                const room = showtime.CinemaRoom;
                const seat = ticket.Seat;
                const seatLayout = seat?.SeatLayout;


                formattedTickets.push({
                    ticket_id: ticket.Ticket_ID,
                    ticket_code: ticket.Ticket_Code,
                    booking_id: ticket.Booking_ID,
                    status: ticket.Status,
                    is_checked_in: ticket.Is_Checked_In,
                    final_price: ticket.Final_Price,
                    booking_date: booking.Booking_Date,
                    movie_info: movie ? {
                        movie_id: movie.Movie_ID,
                        movie_name: movie.Movie_Name,
                        poster_url: movie.Poster_URL
                    } : null,
                    showtime_info: showtime ? {
                        showtime_id: showtime.Showtime_ID,
                        show_date: showtime.Show_Date,
                        start_time: showtime.Start_Time,
                        room_name: room?.Room_Name
                    } : null,
                    seat_info: seatLayout ? `${seatLayout.Row_Label}${seatLayout.Column_Number}` : 'Không có'
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

