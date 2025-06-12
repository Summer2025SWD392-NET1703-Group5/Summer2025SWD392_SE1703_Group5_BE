const { Op, Sequelize, Transaction } = require('sequelize');
const {
  TicketBooking,
  Seat,
  SeatLayout,
  Showtime,
  Movie,
  CinemaRoom,
  Ticket,
  Payment,
  BookingHistory,
  User,
  TicketPricing,
  Promotion,        // Thêm
  PromotionUsage,
  sequelize
} = require('../models');
const logger = require('../utils/logger');
const pointsService = require('./pointsService');
const emailService = require('./emailService');
const { v4: uuidv4 } = require('uuid');

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

class InvalidOperationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidOperationError';
  }
}

class UnauthorizedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

class BookingService {
  /**
   * Constructor
   */
  constructor() {
    try {
      // Khởi tạo PayOSService cho tích điểm
      const PayOSService = require('../services/payosService');
      this.payosService = new PayOSService();
      logger.info('BookingService initialized with PayOSService');
    } catch (error) {
      logger.warn('Failed to initialize PayOSService in BookingService, will initialize on-demand', error.message);
    }
  }

  /**
   * Phương thức getUserBookings - Lấy danh sách các đơn đặt vé của một người dùng
   * 
   * @param {number} userId - ID của người dùng cần lấy danh sách đặt vé
   * @returns {Promise<Array>} Danh sách các đơn đặt vé đã được định dạng
   * @throws {Error} Nếu có lỗi khi truy vấn dữ liệu
   */
  async getUserBookings(userId) {
    try {
      // Bước 1: Ghi log thông tin bắt đầu truy vấn
      logger.info(`Getting bookings for user ${userId}`);

      // Bước 2: Truy vấn cơ sở dữ liệu để lấy các đơn đặt vé của người dùng
      const bookings = await TicketBooking.findAll({
        where: { User_ID: userId },
        include: [
          {
            model: Showtime,
            as: 'Showtime',
            include: [
              { model: Movie, as: 'Movie', attributes: ['Movie_ID', 'Movie_Name', 'Poster_URL'] },
              { model: CinemaRoom, as: 'CinemaRoom', attributes: ['Cinema_Room_ID', 'Room_Name'] }
            ]
          }
        ],
        order: [['Booking_Date', 'DESC']] // Sắp xếp theo thời gian đặt vé giảm dần
      });

      // Bước 3: Chuẩn bị mảng kết quả định dạng cho người dùng
      const formattedBookings = [];

      // Bước 4: Xử lý từng đơn đặt vé để chuẩn bị dữ liệu trả về
      for (const booking of bookings) {
        // Bước 4.1: Lấy thông tin ghế cho đơn đặt vé
        let seatInfo = "Đang tải thông tin ghế...";

        try {
          // Truy vấn thông tin vé và ghế cho booking hiện tại
          const tickets = await Ticket.findAll({
            where: { Booking_ID: booking.Booking_ID },
            include: [
              {
                model: Seat,
                as: 'Seat',
                required: true,
                include: [
                  {
                    model: SeatLayout,
                    as: 'SeatLayout',
                    attributes: ['Row_Label', 'Column_Number']
                  }
                ]
              }
            ]
          });

          // Nếu có vé và ghế, tạo chuỗi mô tả vị trí ghế (VD: A1, A2, B5)
          if (tickets && tickets.length > 0) {
            seatInfo = tickets
              .filter(ticket => ticket.Seat && ticket.Seat.SeatLayout)
              .map(ticket => `${ticket.Seat.SeatLayout.Row_Label}${ticket.Seat.SeatLayout.Column_Number}`)
              .join(', ');
          }
        } catch (seatError) {
          // Log lỗi nếu không thể lấy thông tin ghế
          logger.warn(`Error getting seats for booking ${booking.Booking_ID}: ${seatError.message}`);
        }

        // Bước 4.2: Lấy thông tin phương thức thanh toán
        let paymentMethod = null;

        try {
          // Truy vấn thông tin thanh toán gần nhất cho đơn này
          const payment = await Payment.findOne({
            where: { Booking_ID: booking.Booking_ID },
            order: [['Transaction_Date', 'DESC']]
          });
          paymentMethod = payment?.Payment_Method;
        } catch (paymentError) {
          // Log lỗi nếu không thể lấy thông tin thanh toán
          logger.warn(`Error getting payment for booking ${booking.Booking_ID}: ${paymentError.message}`);
        }

        // Bước 4.3: Thêm đơn đặt vé đã định dạng vào mảng kết quả
        formattedBookings.push({
          Booking_ID: booking.Booking_ID,
          Booking_Date: booking.Booking_Date,
          Payment_Deadline: booking.Payment_Deadline,
          Total_Amount: booking.Total_Amount,
          Status: booking.Status,
          Seats: seatInfo,
          MovieName: booking.Showtime?.Movie?.Movie_Name,
          RoomName: booking.Showtime?.CinemaRoom?.Room_Name,
          Show_Date: booking.Showtime?.Show_Date,
          Start_Time: booking.Showtime?.Start_Time ? new Date(booking.Showtime.Start_Time).toLocaleTimeString('vi-VN') : null,
          PaymentMethod: paymentMethod,
          PosterURL: booking.Showtime?.Movie?.Poster_URL || null
        });
      }

      // Bước 5: Trả về danh sách các đơn đặt vé đã định dạng
      return formattedBookings;
    } catch (error) {
      // Bước xử lý lỗi: Ghi log lỗi và chuyển tiếp ngoại lệ
      logger.error(`Lỗi trong getUserBookings đối với người dùng ${userId}: ${error.message || error}`);
      throw error;
    }
  }
}
// Debug log trước khi export
const bookingServiceInstance = new BookingService();
logger.info('BookingService instance created and getUserBookings method exists:', {
  hasGetUserBookings: typeof bookingServiceInstance.getUserBookings === 'function'
});

// Export instance của class
module.exports = bookingServiceInstance;

