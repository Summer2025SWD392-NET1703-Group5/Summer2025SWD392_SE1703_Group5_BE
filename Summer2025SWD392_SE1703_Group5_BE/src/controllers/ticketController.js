'use strict';

const TicketService = require('../services/ticketService');
const logger = require('../utils/logger');

// Tạo một thể hiện của TicketService
const ticketService = new TicketService();

class TicketController {
    async getTicketsByBookingId(req, res) {
        try {
            const { bookingId } = req.params;
            const parsedBookingId = parseInt(bookingId, 10);

            if (isNaN(parsedBookingId) || parsedBookingId <= 0) {
                return res.status(400).json({ message: 'ID đơn đặt vé không hợp lệ' });
            }

            const result = await ticketService.getTicketsByBookingIdAsync(parsedBookingId);
            
            // Nếu service trả về kết quả là object có cấu trúc mới
            if (result && result.tickets) {
                return res.status(200).json(result);
            }
            
            // Trường hợp service trả về mảng vé (cấu trúc cũ)
            if (Array.isArray(result)) {
                const formattedResult = {
                    tickets: result.map((t) => ({
                Ticket_ID: t.Ticket_ID,
                Booking_ID: t.Booking_ID,
                Ticket_Code: t.Ticket_Code,
                SeatInfo: {
                            Seat_ID: t.SeatInfo?.Seat_ID,
                            Row_Label: t.SeatInfo?.Row_Label,
                            Column_Number: t.SeatInfo?.Column_Number,
                            Seat_Type: t.SeatInfo?.Seat_Type,
                            SeatLabel: t.SeatInfo?.SeatLabel,
                },
                MovieInfo: {
                            Movie_ID: t.MovieInfo?.Movie_ID,
                            Movie_Name: t.MovieInfo?.Movie_Name,
                            Duration: t.MovieInfo?.Duration,
                            Rating: t.MovieInfo?.Rating,
                },
                ShowtimeInfo: {
                            Showtime_ID: t.ShowtimeInfo?.Showtime_ID,
                            ShowDate: t.ShowtimeInfo?.ShowDate,
                            StartTime: t.ShowtimeInfo?.StartTime,
                            EndTime: t.ShowtimeInfo?.EndTime,
                },
                CinemaRoomInfo: {
                            Cinema_Room_ID: t.CinemaRoomInfo?.Cinema_Room_ID,
                            Room_Name: t.CinemaRoomInfo?.Room_Name,
                            Room_Type: t.CinemaRoomInfo?.Room_Type,
                },
                PriceInfo: {
                            Base_Price: t.PriceInfo?.Base_Price,
                            Discount_Amount: t.PriceInfo?.Discount_Amount,
                            Final_Price: t.PriceInfo?.Final_Price,
                },
                Is_Checked_In: t.Is_Checked_In,
                CheckInTime: t.CheckInTime ? new Date(t.CheckInTime).toISOString() : null,
                    }))
                };

                return res.status(200).json(formattedResult);
            }
            
            return res.status(404).json({ message: 'Không tìm thấy vé cho đơn đặt vé này' });
        } catch (error) {
            logger.error(`Lỗi khi lấy vé theo booking ${req.params.bookingId}: ${error.message}`);
            res.status(500).json({ message: 'Đã xảy ra lỗi khi lấy vé.' });
        }
    }

    async getTicketByCode(req, res) {
        try {
            const { ticketCode } = req.params;

            if (!ticketCode) {
                return res.status(400).json({ message: 'Mã vé không hợp lệ' });
            }

            const ticket = await ticketService.getTicketByCodeAsync(ticketCode);
            if (!ticket) {
                return res.status(404).json({ message: 'Không tìm thấy vé với mã này' });
            }

            const result = {
                Ticket_ID: ticket.Ticket_ID,
                Booking_ID: ticket.Booking_ID,
                Ticket_Code: ticket.Ticket_Code,
                CustomerInfo: {
                    User_ID: ticket.CustomerInfo ? ticket.CustomerInfo.User_ID : null,
                    Full_Name: ticket.CustomerInfo ? ticket.CustomerInfo.Full_Name : null,
                    Email: ticket.CustomerInfo ? ticket.CustomerInfo.Email : null,
                    Phone_Number: ticket.CustomerInfo ? ticket.CustomerInfo.Phone_Number : null,
                },
                SeatInfo: {
                    Seat_ID: ticket.SeatInfo.Seat_ID,
                    Row_Label: ticket.SeatInfo.Row_Label,
                    Column_Number: ticket.SeatInfo.Column_Number,
                    Seat_Type: ticket.SeatInfo.Seat_Type,
                    SeatLabel: ticket.SeatInfo.SeatLabel,
                },
                MovieInfo: {
                    Movie_ID: ticket.MovieInfo.Movie_ID,
                    Movie_Name: ticket.MovieInfo.Movie_Name,
                    Duration: ticket.MovieInfo.Duration,
                    Rating: ticket.MovieInfo.Rating,
                },
                ShowtimeInfo: {
                    Showtime_ID: ticket.ShowtimeInfo.Showtime_ID,
                    ShowDate: ticket.ShowtimeInfo.ShowDate,
                    StartTime: ticket.ShowtimeInfo.StartTime,
                    EndTime: ticket.ShowtimeInfo.EndTime,
                },
                CinemaRoomInfo: {
                    Cinema_Room_ID: ticket.CinemaRoomInfo.Cinema_Room_ID,
                    Room_Name: ticket.CinemaRoomInfo.Room_Name,
                    Room_Type: ticket.CinemaRoomInfo.Room_Type,
                },
                PriceInfo: {
                    Base_Price: ticket.PriceInfo.Base_Price,
                    Discount_Amount: ticket.PriceInfo.Discount_Amount,
                    Final_Price: ticket.PriceInfo.Final_Price,
                },
                Is_Checked_In: ticket.Is_Checked_In,
                CheckInTime: ticket.CheckInTime ? new Date(ticket.CheckInTime).toISOString() : null,
            };

            res.status(200).json(result);
        } catch (error) {
            logger.error(`Lỗi khi lấy vé theo mã ${req.params.ticketCode}: ${error.message}`);
            res.status(500).json({ message: 'Đã xảy ra lỗi khi lấy vé.' });
        }
    }

    async verifyTicket(req, res) {
        try {
            const { ticketCode } = req.params;

            if (!ticketCode) {
                return res.status(400).json({ success: false, message: 'Mã vé không hợp lệ' });
            }

            const ticketData = await ticketService.verifyTicketAsync(ticketCode);

            if (!ticketData || !ticketData.success) {
                return res.status(ticketData.status || 404).json({ success: false, message: ticketData.message || 'Không tìm thấy hoặc không thể xác thực vé.' });
            }

            res.status(200).json(ticketData);
        } catch (error) {
            logger.error(`Lỗi khi kiểm tra vé ${req.params.ticketCode}: ${error.message}`);
            res.status(500).json({ success: false, message: `Lỗi kiểm tra vé: ${error.message}` });
        }
    }

    async scanTicket(req, res) {
        try {
            const { ticketCode } = req.params;
            if (!ticketCode) {
                return res.status(400).json({ success: false, message: 'Mã vé không được để trống.' });
            }

            // Call the service, which now returns a result object { success, message, data, statusCode }
            const result = await ticketService.checkInTicketAsync(ticketCode);

            if (result.success) {
                return res.status(200).json(result);
            } else {
                // Return an error with the status code and message provided by the service
                return res.status(result.statusCode || 400).json({
                    success: false,
                    message: result.message
                });
            }

        } catch (error) {
            // This catch block now only handles truly unexpected errors (e.g., DB connection lost)
            logger.error(`Lỗi nghiêm trọng tại controller scanTicket cho mã vé ${req.params.ticketCode}: ${error.message}`, { stack: error.stack });
            return res.status(500).json({ success: false, message: `Đã xảy ra lỗi hệ thống không mong muốn.` });
        }
    }

    async getTicketsToScan(req, res) {
        try {
            const { date } = req.query;
            const scanDate = date ? new Date(date) : new Date();

            const ticketData = await ticketService.getTicketsToScanAsync(scanDate);
            
            // Đảm bảo tickets là một mảng
            if (!ticketData || !ticketData.tickets || !Array.isArray(ticketData.tickets)) {
                logger.info(`Không tìm thấy vé nào để quét cho ngày ${scanDate.toISOString().split('T')[0]}`);
                return res.status(200).json({
                scan_date: scanDate.toISOString().split('T')[0],
                    total_tickets: 0,
                    checked_in: 0,
                    pending: 0,
                    tickets: []
            });
            }
            
            res.status(200).json(ticketData);
        } catch (error) {
            logger.error(`Lỗi khi lấy danh sách vé cần quét: ${error.message}`);
            res.status(500).json({ message: `Lỗi lấy danh sách vé: ${error.message}` });
        }
    }

    async getCheckInStats(req, res) {
        try {
            const { date } = req.query;
            const statsDate = date ? new Date(date) : new Date();

            const stats = await ticketService.getCheckInStatsAsync(statsDate);
            res.status(200).json(stats);
        } catch (error) {
            logger.error(`Lỗi khi lấy thống kê check-in: ${error.message}`);
            res.status(500).json({ message: `Lỗi lấy thống kê check-in: ${error.message}` });
        }
    }

    async checkInTicket(req, res) {
        try {
            const { ticketCode } = req.params;

            if (!ticketCode) {
                return res.status(400).json({ message: 'Mã vé không hợp lệ' });
            }

            const result = await ticketService.checkInTicketAsync(ticketCode);

            if (!result || !result.success) {
                return res.status(result.status || 400).json({ success: false, message: result.message || 'Không thể check-in vé.' });
            }

            res.status(200).json(result);
        } catch (error) {
            logger.error(`Lỗi khi check-in vé ${req.params.ticketCode}: ${error.message}`);
            res.status(500).json({ message: 'Đã xảy ra lỗi khi check-in vé.' });
        }
    }

    async getTicketHtml(req, res) {
        try {
            const { ticketId } = req.params;
            const parsedTicketId = parseInt(ticketId, 10);

            if (isNaN(parsedTicketId) || parsedTicketId <= 0) {
                return res.status(400).json({ message: 'ID vé không hợp lệ' });
            }

            const htmlContent = await ticketService.generateTicketHtmlAsync(parsedTicketId);
            if (!htmlContent) {
                return res.status(404).json({ message: 'Không tìm thấy vé hoặc không thể tạo vé' });
            }

            res.setHeader('Content-Type', 'text/html');
            res.send(htmlContent);
        } catch (error) {
            logger.error(`Lỗi khi tạo HTML vé ${req.params.ticketId}: ${error.message}`);
            if (error.name === 'NotFoundError') {
                return res.status(404).send(`<h1>Lỗi 404: ${error.message}</h1>`);
            }
            res.status(500).send(`<h1>Lỗi hệ thống: ${error.message}</h1>`);
        }
    }

    async sendTicketByEmail(req, res) {
        try {
            const { bookingId } = req.params;
            const { email } = req.body;

            if (!bookingId || bookingId <= 0) {
                return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
            }

            await ticketService.sendTicketByEmailAsync(parseInt(bookingId, 10), email);
            res.status(200).json({ success: true, message: 'Email vé đã được gửi.' });
        } catch (error) {
            logger.error(`Lỗi khi gửi vé qua email: ${error.message}`);
            res.status(500).json({ message: 'Đã xảy ra lỗi khi gửi vé qua email.' });
        }
    }

    async cleanupTickets(req, res) {
        try {
            await ticketService.cleanupTicketsAsync();
            res.status(200).json({ success: true, message: 'Đã dọn dẹp vé cũ.' });
        } catch (error) {
            logger.error(`Lỗi khi dọn dẹp vé không hợp lệ: ${error.message}`);
            res.status(500).json({ success: false, message: 'Đã xảy ra lỗi khi dọn dẹp vé', error: error.message });
        }
    }

    async updateTicketStatus(req, res) {
        try {
            res.status(501).json({ message: 'Chưa được triển khai' });
        } catch (error) {
            logger.error(`Lỗi khi cập nhật trạng thái vé: ${error.message}`);
            res.status(500).json({ success: false, message: 'Đã xảy ra lỗi khi cập nhật trạng thái vé', error: error.message });
        }
    }

    async getAllTickets(req, res) {
        try {
            const tickets = await ticketService.getAllTicketsAsync();
            res.status(200).json(tickets);
        } catch (error) {
            logger.error(`Lỗi khi lấy tất cả vé: ${error.message}`);
            res.status(500).json({ success: false, message: 'Lỗi server', error: error.message });
        }
    }

    async getMyTickets(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ message: "Không thể xác thực người dùng" });
            }

            logger.info(`[TicketController] Đang lấy vé của người dùng ${userId}`);

            const result = await ticketService.getMyTicketsAsync(userId);

            return res.status(200).json(result);
        } catch (error) {
            logger.error(`[TicketController] Lỗi khi lấy vé của người dùng ${req.user?.id}: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: `Đã xảy ra lỗi khi lấy danh sách vé của bạn. Vui lòng thử lại sau.`,
                error_details: error.message
            });
        }
    }

    /**
     * Lấy thông tin chi tiết vé theo ID
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async getTicketById(req, res) {
        try {
            const { ticketId } = req.params;
            const parsedTicketId = parseInt(ticketId, 10);

            if (isNaN(parsedTicketId) || parsedTicketId <= 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'ID vé không hợp lệ' 
                });
            }

            logger.info(`[TicketController] Đang lấy thông tin vé với ID: ${parsedTicketId}`);

            const ticketInfo = await ticketService.getTicketByIdAsync(parsedTicketId);

            return res.status(200).json(ticketInfo);
        } catch (error) {
            logger.error(`[TicketController] Lỗi khi lấy thông tin vé ${req.params.ticketId}: ${error.message}`);
            
            // Handle specific errors
            if (error.name === 'NotFoundError') {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            if (error.name === 'InternalServerError') {
                return res.status(500).json({
                    success: false,
                    message: error.message
                });
            }

            // Handle unexpected errors
            return res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi không mong muốn khi lấy thông tin vé',
                error_details: error.message
            });
        }
    }

    getValidationReason(isForToday, isShowtimeEnded, isCheckedIn, bookingStatus) {
        if (!isForToday) return 'Vé không phải cho ngày hôm nay';
        if (isShowtimeEnded) return 'Suất chiếu đã kết thúc';
        if (isCheckedIn) return 'Vé đã được sử dụng';
        if (bookingStatus !== 'Confirmed') return `Trạng thái đặt vé không hợp lệ: ${bookingStatus}`;
        return 'Vé hợp lệ';
    }
}

module.exports = new TicketController();