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
   * Phương thức getUserBookings - Lấy danh sách các đơn đặt vé của một người dùng (OPTIMIZED)
   * 
   * @param {number} userId - ID của người dùng cần lấy danh sách đặt vé
   * @returns {Promise<Array>} Danh sách các đơn đặt vé đã được định dạng
   * @throws {Error} Nếu có lỗi khi truy vấn dữ liệu
   */
  async getUserBookings(userId) {
    try {
      logger.info(`Getting bookings for user ${userId}`);

      // OPTIMIZATION 1: Query chính với attributes được tối ưu
      const bookings = await TicketBooking.findAll({
        where: { User_ID: userId },
        include: [
          {
            model: Showtime,
            as: 'Showtime',
            attributes: ['Showtime_ID', 'Show_Date', 'Start_Time'], // Chỉ lấy field cần thiết
            include: [
              { 
                model: Movie, 
                as: 'Movie', 
                attributes: ['Movie_ID', 'Movie_Name', 'Poster_URL'] // Chỉ lấy field cần thiết
              },
              { 
                model: CinemaRoom, 
                as: 'CinemaRoom', 
                attributes: ['Cinema_Room_ID', 'Room_Name'] // Chỉ lấy field cần thiết
              }
            ]
          }
        ],
        attributes: ['Booking_ID', 'Booking_Date', 'Payment_Deadline', 'Total_Amount', 'Status'], // Chỉ lấy field cần thiết
        order: [['Booking_Date', 'DESC']]
      });

      if (bookings.length === 0) {
        return [];
      }

      // OPTIMIZATION 2: Bulk queries thay vì N+1 queries
      const bookingIds = bookings.map(b => b.Booking_ID);
      
      const [seatsData, paymentsData] = await Promise.all([
        // Query 1: Lấy tất cả thông tin ghế cho tất cả bookings
        Ticket.findAll({
          where: { Booking_ID: { [Op.in]: bookingIds } },
          include: [{
            model: Seat,
            as: 'Seat',
            required: true,
            include: [{
              model: SeatLayout,
              as: 'SeatLayout',
              required: true,
              attributes: ['Row_Label', 'Column_Number']
            }],
            attributes: ['Seat_ID', 'Layout_ID'] // Chỉ lấy field cần thiết
          }],
          attributes: ['Booking_ID', 'Seat_ID'] // Chỉ lấy field cần thiết
        }),

        // Query 2: Lấy tất cả thông tin payment cho tất cả bookings
        Payment.findAll({
          where: { 
            Booking_ID: { [Op.in]: bookingIds }
          },
          attributes: ['Booking_ID', 'Payment_Method', 'Transaction_Date'],
          order: [['Transaction_Date', 'DESC']]
        })
      ]);

      // OPTIMIZATION 3: Tạo maps để lookup nhanh
      const seatsByBooking = new Map();
      const paymentsByBooking = new Map();

      // Map seats by booking
      seatsData.forEach(ticket => {
        if (!seatsByBooking.has(ticket.Booking_ID)) {
          seatsByBooking.set(ticket.Booking_ID, []);
        }
        if (ticket.Seat?.SeatLayout) {
          const seatLabel = `${ticket.Seat.SeatLayout.Row_Label}${ticket.Seat.SeatLayout.Column_Number}`;
          seatsByBooking.get(ticket.Booking_ID).push(seatLabel);
        }
      });

      // Map payments by booking (lấy payment method mới nhất)
      paymentsData.forEach(payment => {
        if (!paymentsByBooking.has(payment.Booking_ID)) {
          paymentsByBooking.set(payment.Booking_ID, payment.Payment_Method);
        }
      });

      // OPTIMIZATION 4: Format tất cả bookings song song
      const formattedBookings = bookings.map(booking => {
        const seats = seatsByBooking.get(booking.Booking_ID) || [];
        const seatInfo = seats.length > 0 ? seats.join(', ') : "Đang tải thông tin ghế...";
        const paymentMethod = paymentsByBooking.get(booking.Booking_ID) || null;

        // OPTIMIZATION 5: Format thời gian hiệu quả hơn
        let formattedStartTime = null;
        if (booking.Showtime?.Start_Time) {
          const startTime = booking.Showtime.Start_Time;
          if (typeof startTime === 'string') {
            // Nếu đã là string, chỉ cần extract HH:MM
            formattedStartTime = startTime.includes(':') ? startTime.split(':').slice(0, 2).join(':') : startTime;
          } else {
            // Nếu là Date object
            formattedStartTime = new Date(startTime).toLocaleTimeString('vi-VN', { 
              hour: '2-digit', 
              minute: '2-digit' 
            });
          }
        }

        return {
          Booking_ID: booking.Booking_ID,
          Booking_Date: booking.Booking_Date,
          Payment_Deadline: booking.Payment_Deadline,
          Total_Amount: booking.Total_Amount,
          Status: booking.Status,
          Seats: seatInfo,
          MovieName: booking.Showtime?.Movie?.Movie_Name,
          RoomName: booking.Showtime?.CinemaRoom?.Room_Name,
          Show_Date: booking.Showtime?.Show_Date,
          Start_Time: formattedStartTime,
          PaymentMethod: paymentMethod,
          PosterURL: booking.Showtime?.Movie?.Poster_URL || null
        };
      });

      logger.info(`Successfully retrieved ${formattedBookings.length} bookings for user ${userId}`);
      return formattedBookings;

    } catch (error) {
      logger.error(`Lỗi trong getUserBookings đối với người dùng ${userId}: ${error.message || error}`);
      throw error;
    }
  }

  /**
   * Phương thức getAllBookings - Lấy tất cả các đơn đặt vé trong hệ thống (dành cho admin) - OPTIMIZED
   * 
   * @returns {Promise<Array>} Danh sách tất cả các đơn đặt vé đã được định dạng
   * @throws {Error} Nếu có lỗi khi truy vấn dữ liệu
   */
  async getAllBookings() {
    try {
      logger.info('Getting all bookings with optimization');

      // OPTIMIZATION 1: Query chính với pagination support và attributes tối ưu
      const bookings = await TicketBooking.findAll({
        include: [
          {
            model: User,
            as: 'User',
            attributes: ['User_ID', 'Full_Name', 'Email', 'Phone_Number'] // Chỉ lấy field cần thiết
          },
          {
            model: Showtime,
            as: 'Showtime',
            attributes: ['Showtime_ID', 'Show_Date', 'Start_Time'], // Chỉ lấy field cần thiết
            include: [
              {
                model: Movie,
                as: 'Movie',
                attributes: ['Movie_ID', 'Movie_Name', 'Poster_URL'] // Chỉ lấy field cần thiết
              },
              {
                model: CinemaRoom,
                as: 'CinemaRoom',
                attributes: ['Cinema_Room_ID', 'Room_Name'] // Chỉ lấy field cần thiết
              }
            ]
          }
        ],
        attributes: ['Booking_ID', 'User_ID', 'Booking_Date', 'Payment_Deadline', 'Total_Amount', 'Status', 'Showtime_ID'], // Chỉ lấy field cần thiết
        order: [['Booking_Date', 'DESC']],
        limit: 1000 // OPTIMIZATION: Giới hạn kết quả để tránh overload
      });

      if (bookings.length === 0) {
        return [];
      }

      // OPTIMIZATION 2: Bulk queries cho seats và payments
      const bookingIds = bookings.map(b => b.Booking_ID);
      
      const [seatsData, paymentsData] = await Promise.all([
        // Query ghế với JOIN optimized
        sequelize.query(`
          SELECT 
            t.Booking_ID,
            CONCAT(sl.Row_Label, sl.Column_Number) as SeatLabel
          FROM [ksf00691_team03].[Tickets] t
          INNER JOIN [ksf00691_team03].[Seats] s ON t.Seat_ID = s.Seat_ID
          INNER JOIN [ksf00691_team03].[Seat_Layout] sl ON s.Layout_ID = sl.Layout_ID
          WHERE t.Booking_ID IN (${bookingIds.map(id => `'${id}'`).join(',')})
          ORDER BY t.Booking_ID, sl.Row_Label, sl.Column_Number
        `, {
          type: sequelize.QueryTypes.SELECT
        }),

        // Query payments
        Payment.findAll({
          where: { 
            Booking_ID: { [Op.in]: bookingIds }
          },
          attributes: ['Booking_ID', 'Payment_Method', 'Transaction_Date'],
          order: [['Transaction_Date', 'DESC']]
        })
      ]);

      // OPTIMIZATION 3: Tạo maps để lookup nhanh
      const seatsByBooking = new Map();
      const paymentsByBooking = new Map();

      // Group seats by booking
      seatsData.forEach(seat => {
        if (!seatsByBooking.has(seat.Booking_ID)) {
          seatsByBooking.set(seat.Booking_ID, []);
        }
        seatsByBooking.get(seat.Booking_ID).push(seat.SeatLabel);
      });

      // Group payments by booking (lấy payment method mới nhất)
      paymentsData.forEach(payment => {
        if (!paymentsByBooking.has(payment.Booking_ID)) {
          paymentsByBooking.set(payment.Booking_ID, payment.Payment_Method);
        }
      });

      // OPTIMIZATION 4: Map tất cả bookings song song
      const formattedBookings = bookings.map(booking => {
        const seats = seatsByBooking.get(booking.Booking_ID) || [];
        const seatInfo = seats.length > 0 ? seats.join(', ') : "Không có thông tin ghế";
        const paymentMethod = paymentsByBooking.get(booking.Booking_ID) || null;

        // OPTIMIZATION 5: Format thời gian hiệu quả
        let formattedStartTime = null;
        if (booking.Showtime?.Start_Time) {
          const startTime = booking.Showtime.Start_Time;
          if (typeof startTime === 'string') {
            formattedStartTime = startTime.includes(':') ? startTime.split(':').slice(0, 2).join(':') : startTime;
          } else {
            formattedStartTime = new Date(startTime).toLocaleTimeString('vi-VN', { 
              hour: '2-digit', 
              minute: '2-digit' 
            });
          }
        }

        return {
          Booking_ID: booking.Booking_ID,
          Booking_Date: booking.Booking_Date,
          Payment_Deadline: booking.Payment_Deadline,
          Total_Amount: booking.Total_Amount,
          Status: booking.Status,
          Seats: seatInfo,
          User_ID: booking.User_ID,
          CustomerName: booking.User?.Full_Name,
          CustomerEmail: booking.User?.Email,
          CustomerPhone: booking.User?.Phone_Number,
          Showtime_ID: booking.Showtime_ID,
          MovieName: booking.Showtime?.Movie?.Movie_Name,
          RoomName: booking.Showtime?.CinemaRoom?.Room_Name,
          Show_Date: booking.Showtime?.Show_Date,
          Start_Time: formattedStartTime,
          PaymentMethod: paymentMethod,
          PosterURL: booking.Showtime?.Movie?.Poster_URL || null
        };
      });

      logger.info(`Successfully retrieved ${formattedBookings.length} bookings (optimized)`);
      return formattedBookings;

    } catch (error) {
      logger.error(`Lỗi trong getAllBookings: ${error.message || error}`);
      throw error;
    }
  }

  /**
   * Phương thức createBooking - Tạo một đơn đặt vé mới trong hệ thống
   * 
   * @param {Object} bookingData - Dữ liệu đơn đặt vé cần tạo
   * @param {number} userId - ID của người dùng thực hiện đặt vé
   * @returns {Promise<Object>} Thông tin chi tiết về đơn đặt vé đã tạo
   * @throws {Error} Các lỗi liên quan đến việc đặt vé
   */
  async createBooking(bookingData, userId) {
    let transaction = null;

    try {
      // Initialize transaction
      transaction = await sequelize.transaction();
      logger.info(`Bắt đầu tạo đặt vé mới cho người dùng ${userId}`, { bookingData });

      // Kiểm tra xem người dùng đã có booking nào đang pending chưa
      const pendingBookingCheck = await this.checkPendingBooking(userId, transaction);

      // Nếu đã có booking pending và chưa hết hạn
      if (!pendingBookingCheck.canCreateNewBooking) {
        const pendingInfo = pendingBookingCheck.pendingBooking;

        // Tạo thông tin chi tiết về booking đang pending
        const remainingTime = pendingInfo.RemainingMinutes > 0
          ? `(còn ${pendingInfo.RemainingMinutes} phút để thanh toán)`
          : '(đã hết hạn)';

        // Tạo thông báo lỗi chi tiết
        const error = new Error(
          `Bạn đang có một đơn đặt vé chưa thanh toán cho phim "${pendingInfo.MovieName}" ${remainingTime}. ` +
          `Vui lòng thanh toán hoặc hủy đơn đặt vé hiện tại trước khi đặt vé mới.`
        );

        // Thiết lập thuộc tính cho lỗi để xử lý ở phía client
        error.code = 'PENDING_BOOKING_EXISTS';
        error.statusCode = 409; // Conflict
        error.pendingBooking = pendingInfo;

        // Rollback transaction và ném lỗi
        await transaction.rollback();
        throw error;
      }

      // Bước 1: Chuẩn hóa dữ liệu đầu vào để phù hợp với logic hiện tại
      const normalizedBookingData = {
        showtimeId: bookingData.Showtime_ID || bookingData.showtimeId,
        selectedSeats: bookingData.layoutSeatIds || bookingData.selectedSeats || [],
        promotionId: bookingData.Promotion_ID || bookingData.promotionId,
        paymentMethod: bookingData.Payment_Method || bookingData.paymentMethod
      };

      // Bước 2: Validate thông tin suất chiếu
      const showtime = await Showtime.findByPk(normalizedBookingData.showtimeId, {
        include: [
          { model: Movie, as: 'Movie' },
          { model: CinemaRoom, as: 'CinemaRoom' }
        ],
        transaction
      });

      if (!showtime) {
        throw new Error(`Không tìm thấy suất chiếu với ID ${normalizedBookingData.showtimeId}`);
      }

      if (showtime.Status !== 'Active' && showtime.Status !== 'Scheduled') {
        throw new Error(`Suất chiếu ${normalizedBookingData.showtimeId} không ở trạng thái hoạt động`);
      }

      // Bước 3: Lấy thông tin ghế được chọn
      const seatsWithLayouts = await this.createOrUpdateSeats(
        normalizedBookingData.selectedSeats,
        normalizedBookingData.showtimeId,
        null, // bookingId chưa có, sẽ được tạo sau
        transaction
      );

      const seatLayouts = seatsWithLayouts.map(seatWithLayout => seatWithLayout.layout);

      // Bước 4: Tính giá tiền dựa trên loại ghế và phòng
      const roomType = showtime.CinemaRoom.Room_Type;

      // Sử dụng phương thức calculateTotalAmount đã được cập nhật để sử dụng pricingService
      const priceCalculation = await this.calculateTotalAmount(
        seatLayouts,
        roomType,
        transaction
      );

      // Lấy kết quả tính toán
      const ticketPricings = priceCalculation.ticketPricings;
      let totalAmount = priceCalculation.totalAmount;

      logger.info(`Đã tính tổng tiền: ${totalAmount} cho đơn đặt vé với ${seatLayouts.length} ghế`);

      // Bước 5: Tạo đơn đặt vé mới
      // Tính điểm tích lũy (10% tổng tiền) ngay khi tạo booking
      const pointsToEarn = Math.floor(totalAmount * 0.1);
      logger.info(`Tính điểm tích lũy dự kiến: ${pointsToEarn} điểm (10% của ${totalAmount})`);

      // Kiểm tra xem người tạo booking có phải là staff/admin hay không
      // Nếu là staff/admin, User_ID sẽ được đặt là null để có thể liên kết sau này
      let bookingUserId = userId;

      try {
        // Kiểm tra vai trò của người tạo booking
        const { User } = require('../models');
        const user = await User.findByPk(userId, {
          attributes: ['Role'],
          transaction
        });

        if (user && ['Admin', 'Staff', 'Manager'].includes(user.Role)) {
          // Nếu là staff/admin/manager, đặt User_ID là null
          logger.info(`Người dùng ${userId} có vai trò ${user.Role}, đặt User_ID là null cho booking`);
          bookingUserId = null;
        }
      } catch (error) {
        logger.warn(`Không thể kiểm tra vai trò của người dùng ${userId}: ${error.message}`);
        // Tiếp tục với userId ban đầu nếu có lỗi
      }

      // Sử dụng DATEADD từ SQL Server để đảm bảo múi giờ nhất quán với booking
      const booking = await TicketBooking.create({
        User_ID: bookingUserId, // Sử dụng bookingUserId thay vì userId
        Showtime_ID: normalizedBookingData.showtimeId,
        Promotion_ID: normalizedBookingData.promotionId || null,
        Booking_Date: sequelize.literal('GETDATE()'),
        Payment_Deadline: sequelize.literal('DATEADD(minute, 5, GETDATE())'), // Thêm 5 phút vào thời điểm hiện tại của server
        Total_Amount: totalAmount,
        Points_Earned: pointsToEarn, // Đặt điểm tích lũy ngay khi tạo booking
        Points_Used: 0, // Sẽ cập nhật nếu người dùng sử dụng điểm
        Status: 'Pending',
        Created_By: userId
      }, { transaction });

      // Bước 6: Tạo vé cho từng ghế đã chọn
      const tickets = await this.createTickets(
        seatsWithLayouts,
        ticketPricings,
        booking.Booking_ID,
        normalizedBookingData.showtimeId,
        transaction
      );

      // Bước 7: Tạo history booking
      await BookingHistory.create({
        Booking_ID: booking.Booking_ID,
        Date: sequelize.literal('GETDATE()'),
        Status: 'Pending',
        Notes: 'Đơn đặt vé đã được tạo, đang chờ thanh toán.',
        IsRead: false
      }, { transaction });

      // Bước 8: Commit transaction nếu tất cả thành công
      await transaction.commit();
      transaction = null; // Clear transaction after successful commit

      // Bước 9: Format dữ liệu trả về
      const formattedSeats = seatLayouts.map(layout => ({
        Row: layout.Row_Label,
        Column: layout.Column_Number,
        Type: layout.Seat_Type
      })).sort((a, b) => {
        if (a.Row !== b.Row) {
          return a.Row.localeCompare(b.Row);
        }
        return a.Column - b.Column;
      });

      // Trả về thông tin đặt vé đã tạo
      return {
        success: true,
        booking: {
          Booking_ID: booking.Booking_ID,
          User_ID: bookingUserId,
          Showtime_ID: normalizedBookingData.showtimeId,
          Movie_Name: showtime.Movie.Movie_Name,
          Show_Date: showtime.Show_Date,
          Start_Time: showtime.Start_Time,
          Room_Name: showtime.CinemaRoom.Room_Name,
          Seats: formattedSeats,
          Total_Amount: totalAmount,
          Payment_Deadline: booking.Payment_Deadline,
          Status: 'Pending',
          Payment_Method: normalizedBookingData.paymentMethod || null
        }
      };

    } catch (error) {
      // Bước xử lý lỗi: Rollback transaction nếu có lỗi
      if (transaction && !transaction.finished) {
        try {
          await transaction.rollback();
        } catch (rollbackError) {
          logger.error(`Lỗi khi rollback giao dịch: ${rollbackError.message}`, { stack: rollbackError.stack });
        }
      }
      logger.error(`Lỗi trong quá trình tạo đặt vé: ${error.message}`, { stack: error.stack });
      throw error;
    }
  }

  // Helper method to generate ticket code
  generateTicketCode(bookingId, seatId) {
    const timestamp = Date.now().toString().slice(-6);
    return `TK${bookingId}S${seatId}${timestamp}`.toUpperCase();
  }

  /**
   * Phương thức checkSeatAvailability - Kiểm tra xem các ghế có sẵn để đặt hay không
   */
  async checkSeatAvailability(layoutIds, showtimeId, transaction) {
    // Bước 1: Kiểm tra SeatLayout tồn tại
    const layouts = await SeatLayout.findAll({
      where: {
        layout_id: { [Op.in]: layoutIds }, // Sử dụng Op.in để tìm nhiều ID cùng lúc
        is_active: true // Chỉ lấy ghế đang hoạt động
      },
      transaction // Chuyển transaction để đảm bảo tính nhất quán dữ liệu
    });

    // Kiểm tra số lượng ghế tìm được có bằng số lượng yêu cầu không
    if (layouts.length !== layoutIds.length) {
      return {
        available: false,
        reason: 'Một số ghế không tồn tại hoặc không hoạt động'
      };
    }

    // Bước 2: Lấy ra danh sách seat_id từ layout_id
    const seats = await Seat.findAll({
      where: {
        layout_id: { [Op.in]: layoutIds }
      },
      transaction
    });

    // Nếu không tìm thấy đủ ghế
    if (seats.length !== layoutIds.length) {
      return {
        available: false,
        reason: 'Một số ghế không tồn tại trong hệ thống'
      };
    }

    const seatIds = seats.map(seat => seat.seat_id);

    // Bước 3: Kiểm tra xem các ghế này đã được đặt trong suất chiếu này chưa
    const existingTickets = await Ticket.findAll({
      where: {
        seat_id: { [Op.in]: seatIds },
        showtime_id: showtimeId,
        status: { [Op.notIn]: ['Cancelled', 'Expired'] }
      },
      transaction
    });

    // Nếu có vé nào đã được đặt cho ghế trong suất chiếu này
    if (existingTickets.length > 0) {
      // Lấy ra danh sách số ghế đã được đặt
      const bookedSeatIds = existingTickets.map(ticket => ticket.seat_id);
      const bookedSeats = seats.filter(seat => bookedSeatIds.includes(seat.seat_id));

      return {
        available: false,
        reason: `Ghế ${bookedSeats.map(s => s.seat_number).join(', ')} đã được đặt`
      };
    }

    // Nếu mọi điều kiện đều hợp lệ
    return {
      available: true,
      seats: seats
    };
  }

  /**
   * Phương thức calculateTotalAmount - Tính tổng tiền cho các ghế đã chọn
   */
  async calculateTotalAmount(layouts, roomType, transaction) {
    let totalAmount = 0;
    const ticketPricings = {}; // Object lưu trữ giá vé theo loại ghế

    // Import pricingService
    const pricingService = require('./pricingService');
    const { Showtime } = require('../models');

    // Bước 1: Tạo giả lập một showtime để tính giá (vào ngày hiện tại, sử dụng local timezone)
    // Sử dụng timezone local thay vì UTC để tránh lỗi ngày
    const now = new Date();
    const currentDate = now.getFullYear() + '-' + 
                       String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                       String(now.getDate()).padStart(2, '0');
    const defaultTime = '12:00:00'; // Mặc định là buổi trưa để tránh hệ số tăng giá

    // Bước 2: Tính giá vé cho từng ghế dựa trên loại ghế
    for (const layout of layouts) {
      // Lấy loại ghế và chuẩn hóa để khớp với cấu hình trong ticketPricing.json
      // Cấu hình định nghĩa "Regular" và "VIP" (với chữ cái đầu viết hoa)
      let seatType = layout.seat_type || layout.Seat_Type;

      // Chuẩn hóa loại ghế - đảm bảo chữ cái đầu viết hoa, các chữ còn lại viết thường
      seatType = seatType.charAt(0).toUpperCase() + seatType.slice(1).toLowerCase();

      // Bước 3: Nếu chưa có thông tin giá của loại ghế này, tính toán từ pricingService
      if (!ticketPricings[seatType]) {
        try {
          // Sử dụng pricingService thay vì truy vấn DB
          const priceInfo = pricingService.calculateTicketPrice({
            roomType,
            seatType,
            showDate: currentDate,
            startTime: defaultTime
          });

          // Lưu giá vé vào cache để dùng lại
          ticketPricings[seatType] = priceInfo.finalPrice;
          logger.info(`Tính giá vé thành công cho loại ghế ${seatType}, phòng ${roomType}: ${priceInfo.finalPrice} VND`);
          logger.info(`Chi tiết tính giá: ngày=${currentDate}, giờ=${defaultTime}, loại ngày=${priceInfo.details.dayType}, hệ số ngày=${priceInfo.multipliers.day}, hệ số giờ=${priceInfo.multipliers.time}`);
        } catch (error) {
          logger.error(`Lỗi khi tính giá vé: ${error.message}`, error);

          // Thử với cách khác nếu thất bại (để tương thích với dữ liệu cũ)
          try {
            // Kiểm tra danh sách các loại ghế có sẵn trong cấu hình
            const availableSeatTypes = pricingService.getAllSeatTypes();
            logger.info(`Các loại ghế có sẵn trong cấu hình: ${availableSeatTypes.join(', ')}`);

            // Thử lại với loại ghế đầu tiên trong cấu hình nếu không khớp
            if (availableSeatTypes.length > 0) {
              const firstAvailable = availableSeatTypes[0];
              logger.info(`Thử lại với loại ghế mặc định: ${firstAvailable}`);

              const priceInfo = pricingService.calculateTicketPrice({
                roomType,
                seatType: firstAvailable,
                showDate: currentDate,
                startTime: defaultTime
              });

              ticketPricings[seatType] = priceInfo.finalPrice;
              logger.info(`Đã sử dụng giá ghế mặc định ${firstAvailable} cho loại ghế ${seatType}: ${priceInfo.finalPrice} VND`);
            } else {
              throw new Error(`Không thể tính giá vé cho loại phòng ${roomType} và loại ghế ${seatType}`);
            }
          } catch (fallbackError) {
            logger.error(`Không thể xử lý giá vé sau khi thử tất cả các phương án: ${fallbackError.message}`);
            throw new Error(`Không thể tính giá vé cho loại phòng ${roomType} và loại ghế ${seatType}`);
          }
        }
      }

      // Bước 4: Cộng dồn giá vé vào tổng
      totalAmount += ticketPricings[seatType];
    }

    // Bước 5: Trả về kết quả tính toán
    return {
      totalAmount,  // Tổng tiền của tất cả ghế
      ticketPricings // Object chứa giá vé theo loại ghế để sử dụng sau này
    };
  }

  /**
   * Phương thức createOrUpdateSeats - Tạo các vé cho ghế được chọn trong xuất chiếu
   */
  async createOrUpdateSeats(layoutIds, showtimeId, bookingId, transaction) {
    logger.info(`Đang tạo/cập nhật ghế với layoutIds: ${JSON.stringify(layoutIds)}, showtimeId: ${showtimeId}, bookingId: ${bookingId}`);

    // Bước 1: Lấy thông tin các ghế từ Layout ID
    const seatLayouts = await SeatLayout.findAll({
      where: {
        Layout_ID: { [Op.in]: layoutIds },
        Is_Active: true // Chỉ lấy những ghế còn hoạt động
      },
      transaction
    });

    logger.info(`Tìm thấy ${seatLayouts.length} layout ghế cho các layout ID đã chọn`);

    if (seatLayouts.length !== layoutIds.length) {
      logger.error(`Không tìm thấy đủ layout. Yêu cầu: ${layoutIds.length}, Tìm thấy: ${seatLayouts.length}`);
      throw new Error('Một số ghế được chọn không hợp lệ hoặc không còn hoạt động');
    }

    // Bước 2: Lấy thông tin các ghế
    let seats = await Seat.findAll({
      where: {
        Layout_ID: { [Op.in]: layoutIds }
      },
      transaction
    });

    logger.info(`Tìm thấy ${seats.length} ghế cho các layout ID đã chọn`);

    // Bước 3: Tạo ghế mới nếu chưa tồn tại
    const seatsToCreate = [];
    for (const layout of seatLayouts) {
      const existingSeat = seats.find(seat => seat.Layout_ID === layout.Layout_ID);
      if (!existingSeat) {
        // Tạo một ghế mới nếu chưa tồn tại
        seatsToCreate.push({
          Layout_ID: layout.Layout_ID,
          Seat_Number: `${layout.Row_Label}${layout.Column_Number}`,
          Is_Active: true
        });
      }
    }

    if (seatsToCreate.length > 0) {
      logger.info(`Đang tạo ${seatsToCreate.length} ghế mới cho các layout chưa có ghế`);
      const newSeats = await Seat.bulkCreate(seatsToCreate, { transaction });
      seats = [...seats, ...newSeats];
      logger.info(`Đã tạo thành công ${newSeats.length} ghế mới`);
    }

    if (seats.length === 0) {
      logger.error(`Không tìm thấy hoặc không thể tạo ghế cho layout IDs: ${JSON.stringify(layoutIds)}`);
      throw new Error('Không tìm thấy thông tin ghế từ layout IDs');
    }

    // Bước 4: Kiểm tra xem ghế đã được đặt cho xuất chiếu này chưa
    const existingTickets = await Ticket.findAll({
      where: {
        Seat_ID: { [Op.in]: seats.map(seat => seat.Seat_ID) },
        Showtime_ID: showtimeId,
        Status: { [Op.notIn]: ['Cancelled', 'Expired'] }
      },
      transaction
    });

    logger.info(`Tìm thấy ${existingTickets.length} vé đã tồn tại cho các ghế này trong suất chiếu`);

    // Nếu có vé tồn tại cho ghế và xuất chiếu này, nghĩa là ghế đã được đặt
    if (existingTickets.length > 0) {
      const seatIds = existingTickets.map(ticket => ticket.Seat_ID);
      const takenSeats = seats
        .filter(seat => seatIds.includes(seat.Seat_ID));

      const takenLayouts = takenSeats.map(seat => seat.Layout_ID);

      const seatPositions = await SeatLayout.findAll({
        where: { Layout_ID: { [Op.in]: takenLayouts } },
        attributes: ['Row_Label', 'Column_Number'],
        transaction
      });

      const takenSeatsInfo = seatPositions.map(s => `${s.Row_Label}${s.Column_Number}`).join(', ');

      const seatTakenError = new Error(`Ghế sau đã được đặt: ${takenSeatsInfo}. Vui lòng chọn ghế khác.`);
      seatTakenError.name = 'SeatUnavailableError';
      seatTakenError.code = 'SEAT_TAKEN';
      seatTakenError.statusCode = 409; // Conflict
      seatTakenError.takenSeats = takenLayouts;
      throw seatTakenError;
    }

    // Kết hợp thông tin chi tiết seats và layouts để trả về
    const seatsWithLayouts = seats.map(seat => {
      const layout = seatLayouts.find(layout => layout.Layout_ID === seat.Layout_ID);
      return {
        seat,
        layout
      };
    });

    logger.info(`Trả về ${seatsWithLayouts.length} ghế kèm theo thông tin layout`);

    // Trả về danh sách ghế để tạo vé
    return seatsWithLayouts;
  }

  /**
   * Tạo các vé mới cho booking
   */
  async createTickets(seatsWithLayouts, ticketPricings, bookingId, showtimeId, transaction) {
    logger.info(`Đang tạo vé cho đơn đặt ${bookingId}, suất chiếu ${showtimeId} với ${seatsWithLayouts.length} ghế`);

    const tickets = []; // Mảng lưu trữ các vé được tạo

    // Bước 1: Tạo vé cho từng ghế đã đặt
    for (const seatWithLayout of seatsWithLayouts) {
      const seat = seatWithLayout.seat;
      const layout = seatWithLayout.layout;

      if (!seat || !layout) {
        logger.error(`Thiếu thông tin ghế hoặc layout cho một mục`);
        continue;
      }

      const seatType = layout.Seat_Type;

      // Xử lý case-insensitive cho loại ghế
      let price = null;
      let normalizedSeatType = null;

      // Tìm loại ghế theo case-insensitive
      const availableSeatTypes = Object.keys(ticketPricings);
      normalizedSeatType = availableSeatTypes.find(
        type => type.toUpperCase() === seatType.toUpperCase()
      );

      // Nếu tìm thấy, sử dụng giá tương ứng
      if (normalizedSeatType) {
        price = ticketPricings[normalizedSeatType];
        if (normalizedSeatType !== seatType) {
          logger.info(`Tìm thấy giá cho "${normalizedSeatType}" thay vì "${seatType}"`);
        }
      } else if (ticketPricings['Regular']) {
        // Fallback: sử dụng giá ghế Regular nếu không tìm được loại ghế tương ứng
        normalizedSeatType = 'Regular';
        price = ticketPricings['Regular'];
        logger.info(`Không tìm thấy loại ghế "${seatType}", sử dụng giá ghế Regular thay thế`);
      } else {
        logger.error(`Không tìm thấy thông tin giá vé cho loại ghế: ${seatType}`);
        throw new Error(`Không tìm thấy thông tin giá vé cho loại ghế ${seatType}`);
      }

      const ticketCode = this.generateTicketCode(bookingId, seat.Seat_ID);

      logger.info(`Đang tạo vé cho ghế ${seat.Seat_ID}, layout ${layout.Layout_ID}, loại ${seatType} (sử dụng giá của ${normalizedSeatType}), giá ${price}`);

      try {
        // Bước 1.2: Tạo vé mới trong cơ sở dữ liệu
        const ticket = await Ticket.create({
          Booking_ID: bookingId,
          Seat_ID: seat.Seat_ID, // Liên kết vé với ghế
          Showtime_ID: showtimeId, // Liên kết vé với xuất chiếu
          Base_Price: price, // Giá gốc
          Discount_Amount: 0, // Giảm giá (mặc định là 0)
          Final_Price: price, // Giá cuối cùng (hiện tại = giá gốc vì chưa giảm giá)
          Ticket_Code: ticketCode, // Tạo mã vé
          Is_Checked_In: false, // Ban đầu vé chưa được check in
          Status: 'Active' // Trạng thái vé
        }, { transaction }); // Sử dụng transaction để đảm bảo tính nhất quán

        // Bước 1.3: Thêm vé vào mảng kết quả
        tickets.push(ticket);
        logger.info(`Đã tạo thành công vé với ID: ${ticket.Ticket_ID}`);
      } catch (err) {
        logger.error(`Lỗi khi tạo vé: ${err.message}`, { stack: err.stack });
        throw err;
      }
    }

    logger.info(`Đã tạo thành công ${tickets.length} vé`);

    // Bước 2: Trả về danh sách tất cả các vé đã tạo
    return tickets;
  }

  /**
   * Cập nhật booking payment
   */
  async updateBookingPayment(bookingId, userId) {
    let transaction = null;
    const paymentMethod = 'Cash';

    try {
      // Initialize transaction
      transaction = await sequelize.transaction();
      logger.info(`Bắt đầu cập nhật thanh toán cho đơn đặt vé ${bookingId} bởi người dùng ${userId}`);

      // Bước 1: Tìm booking và kiểm tra quyền truy cập
      const booking = await TicketBooking.findByPk(bookingId, {
        transaction
      });

      if (!booking) {
        throw new Error(`Không tìm thấy đơn đặt vé với ID ${bookingId}`);
      }

      // Kiểm tra quyền: cho phép nếu là chủ sở hữu (User_ID) hoặc người tạo (Created_By)
      if (booking.User_ID !== userId && booking.Created_By !== userId) {
        throw new Error(`Người dùng ${userId} không có quyền cập nhật đơn đặt vé ${bookingId}`);
      }

      if (booking.Status !== 'Pending') {
        throw new Error(`Đơn đặt vé ${bookingId} không ở trạng thái chờ thanh toán. Trạng thái hiện tại: ${booking.Status}`);
      }

      logger.info(`Tìm thấy đơn đặt vé ${bookingId} với trạng thái: ${booking.Status}`);

      // Bước 2: Lấy thông tin vé
      const tickets = await Ticket.findAll({
        where: { Booking_ID: bookingId },
        transaction
      });

      if (tickets.length === 0) {
        throw new Error(`Không tìm thấy vé cho đơn đặt ${bookingId}`);
      }

      logger.info(`Tìm thấy ${tickets.length} vé cho đơn đặt ${bookingId}`);

      // Bước 3: Lấy thông tin ghế thông qua vé
      const seatIds = tickets.map(ticket => ticket.Seat_ID);
      const seats = await Seat.findAll({
        where: { Seat_ID: { [Op.in]: seatIds } },
        include: [{
          model: SeatLayout,
          as: 'SeatLayout',
          attributes: ['Row_Label', 'Column_Number', 'Seat_Type']
        }],
        transaction
      });

      if (seats.length === 0) {
        throw new Error(`Không tìm thấy ghế cho vé của đơn đặt ${bookingId}`);
      }

      logger.info(`Tìm thấy ${seats.length} ghế cho đơn đặt vé ${bookingId}`);

      // Bước 4: Cập nhật trạng thái booking
      await booking.update({
        Status: 'Confirmed',
        Updated_At: sequelize.literal('GETDATE()')
      }, { transaction });

      logger.info(`Đã cập nhật đơn đặt vé ${bookingId} sang trạng thái Đã xác nhận`);

      // Bước 5: Cập nhật trạng thái tất cả vé
      const updatedTicketsCount = await Ticket.update({
        Status: 'Active',
      }, {
        where: { Booking_ID: bookingId },
        transaction
      });

      logger.info(`Đã cập nhật ${updatedTicketsCount[0]} vé sang trạng thái Đang hoạt động cho đơn đặt vé ${bookingId}`);

      // Bước 6: Tạo bản ghi lịch sử đặt vé
      await BookingHistory.create({
        Booking_ID: bookingId,
        Date: sequelize.literal('GETDATE()'),
        Status: 'Confirmed',
        Notes: `Thanh toán thành công, đơn đặt vé đã được xác nhận. Tích lũy ${booking.Points_Earned} điểm.`,
        IsRead: false
      }, { transaction });

      logger.info(`Đã tạo bản ghi lịch sử cho đơn đặt vé ${bookingId}`);

      // Bước 7: Tạo bản ghi thanh toán
      logger.info(`Payment method: ${paymentMethod}`);

      try {
        logger.info(`Đang tạo bản ghi thanh toán cho đơn đặt vé ${bookingId} với số tiền ${booking.Total_Amount}`);

        // Đảm bảo các giá trị hợp lệ
        const paymentData = {
          Booking_ID: bookingId,
          Amount: booking.Total_Amount || 0,
          Payment_Method: paymentMethod,
          Payment_Reference: this.generatePaymentReference(),
          Transaction_Date: sequelize.literal('GETDATE()'),
          Payment_Status: 'PAID',
          Processor_Response: JSON.stringify({
            status: 'paid',
            message: 'Payment processed successfully',
            timestamp: new Date().toISOString()
          }).substring(0, 255), // Giới hạn độ dài để tránh lỗi
          Processed_By: userId
        };

        // Tạo bản ghi payment
        try {
          await Payment.create(paymentData, { transaction });
          logger.info(`Đã tạo bản ghi thanh toán thành công cho đơn đặt vé ${bookingId}`);
        } catch (innerPaymentError) {
          logger.error(`Chi tiết lỗi khi tạo payment: ${innerPaymentError.message}`);
          // Tiếp tục thực hiện, ngay cả khi không thể tạo payment
          // Sẽ tạo payment dự phòng sau commit
        }

      } catch (paymentError) {
        logger.error(`Lỗi khi tạo bản ghi thanh toán: ${paymentError.message}`);
        // Tiếp tục thực hiện các bước kế tiếp mà không throw lỗi
      }

      // Bước 8: Commit transaction nếu tất cả thành công
      await transaction.commit();
      logger.info(`Giao dịch đã được hoàn thành thành công cho đơn đặt vé ${bookingId}`);

      // Bước 9: Tạo payment record dự phòng nếu chưa có
      let paymentExists = false;
      try {
        const existingPayment = await Payment.findOne({
          where: { Booking_ID: bookingId },
          order: [['Transaction_Date', 'DESC']]
        });

        paymentExists = !!existingPayment;

        if (!paymentExists) {
          // Không tìm thấy payment, tạo bản ghi dự phòng
          await this.createBackupPaymentRecord(bookingId, paymentMethod, userId);
        }
      } catch (error) {
        logger.error(`Lỗi khi kiểm tra hoặc tạo payment dự phòng: ${error.message}`);
        // Thử một lần nữa với phương pháp trực tiếp
        await this.createBackupPaymentRecord(bookingId, paymentMethod, userId);
      }

      // Bước 10: Tích điểm cho người dùng
      try {
        logger.info(`Bắt đầu tính điểm tích lũy cho đơn đặt vé ${bookingId}, người dùng ${userId}`);

        // Kiểm tra xem user có tồn tại không
        const userExists = await User.findByPk(userId);
        if (!userExists) {
          logger.error(`Không thể tích điểm: User ${userId} không tồn tại`);
          return {
            success: true,
            message: 'Thanh toán đã cập nhật thành công nhưng không thể tích điểm (không tìm thấy người dùng)',
            booking: {
              ...booking.toJSON(),
              Payment_Method: paymentMethod,
              Seats: await this.getFormattedSeatPositions(bookingId)
            }
          };
        }

        logger.info(`Gọi pointsService.addPointsFromBookingAsync với: userId=${userId}, bookingId=${bookingId}, totalAmount=${booking.Total_Amount}, pointsUsed=${booking.Points_Used || 0}`);

        // Tạo instance mới của pointsService
        const pointsService = require('./pointsService');

        // Gọi hàm thêm điểm
        const pointsResult = await pointsService.addPointsFromBookingAsync(
          userId,
          bookingId,
          booking.Total_Amount,
          booking.Points_Used || 0
        );

        logger.info(`✅ Kết quả tích điểm: Đã cộng ${pointsResult} điểm cho người dùng ${userId} từ đơn đặt vé ${bookingId}`);
      } catch (pointsError) {
        logger.error(`❌ Lỗi khi tích điểm: ${pointsError.message}`);
        // Không throw lỗi ở đây để không ảnh hưởng đến flow chính
      }

      // Bước 11: Gửi thông báo xác nhận thanh toán
      try {
        const user = await User.findByPk(userId);
        await this.sendPaymentConfirmationNotifications(booking, user, tickets, seats);
      } catch (notificationError) {
        logger.error(`Lỗi khi gửi thông báo xác nhận thanh toán: ${notificationError.message}`);
        // Không throw lỗi ở đây để không ảnh hưởng đến việc xác nhận payment đã thành công
      }

      // Bước 12: Trả về thông tin đơn đặt vé đã xác nhận với Payment_Method
      const formattedSeats = await this.getFormattedSeatPositions(bookingId);

      const bookingJSON = booking.toJSON();

      // Đảm bảo Payment_Method luôn có giá trị trong kết quả trả về
      const responseObject = {
        success: true,
        message: 'Thanh toán đã được cập nhật thành công',
        booking: {
          ...bookingJSON,
          Seats: formattedSeats,
          Payment_Method: paymentMethod // Thêm payment method vào response
        }
      };

      return responseObject;
    } catch (error) {
      // Xử lý lỗi và rollback transaction
      if (transaction && !transaction.finished) {
        try {
          await transaction.rollback();
        } catch (rollbackError) {
          logger.error(`Lỗi khi rollback giao dịch: ${rollbackError.message}`);
        }
      }
      logger.error(`Lỗi trong quá trình cập nhật thanh toán: ${error.message}`);

      // Vẫn đảm bảo response có payment method
      throw {
        ...error,
        paymentMethod: paymentMethod
      };
    }
  }

  async createBackupPaymentRecord(bookingId, paymentMethod, userId) {
    try {
      logger.info(`Thử tạo payment record dự phòng`);

      // Truy vấn booking để lấy Total_Amount
      const booking = await TicketBooking.findByPk(bookingId);
      const amount = booking ? booking.Total_Amount : 0;
      logger.info(`Lấy được Total_Amount từ booking: ${amount}`);

      const paymentRef = `BACKUP-${Date.now()}`;
      const paymentData = {
        Booking_ID: bookingId,
        Amount: amount, // Sử dụng Total_Amount từ booking
        Payment_Method: paymentMethod || 'Cash',
        Payment_Reference: paymentRef,
        Transaction_Date: new Date(),
        Payment_Status: 'PAID',
        Processor_Response: JSON.stringify({ source: 'backup', status: 'paid' }),
        Processed_By: userId
      };

      const createdPayment = await Payment.create(paymentData);

      logger.info(`Đã tạo payment record dự phòng thành công với Payment_Method: ${paymentMethod || 'Cash'} và Amount: ${amount}`);
      return true;
    } catch (error) {
      logger.error(`Không thể tạo payment record dự phòng: ${error.message}`);

      // Thử phương án cuối cùng với SQL trực tiếp
      try {
        // Truy vấn booking để lấy Total_Amount
        const [bookingResult] = await sequelize.query(`
          SELECT [Total_Amount] FROM [ksf00691_team03].[Ticket_Bookings]
          WHERE [Booking_ID] = :bookingId
        `, {
          replacements: { bookingId: bookingId },
          type: sequelize.QueryTypes.SELECT
        });

        const amount = bookingResult ? bookingResult.Total_Amount : 0;
        logger.info(`Lấy được Total_Amount từ SQL trực tiếp: ${amount}`);

        await sequelize.query(`
          INSERT INTO [ksf00691_team03].[Payments]
          ([Booking_ID], [Amount], [Payment_Method], [Payment_Reference], [Transaction_Date], [Payment_Status], [Processor_Response], [Processed_By])
          VALUES
          (:bookingId, :amount, :paymentMethod, :paymentRef, GETDATE(), 'PAID', :processorResponse, :userId)
        `, {
          replacements: {
            bookingId: bookingId,
            amount: amount, // Sử dụng Total_Amount từ booking
            paymentMethod: paymentMethod || 'Cash',
            paymentRef: `BACKUP-SQL-${Date.now()}`,
            processorResponse: JSON.stringify({ source: 'backup-sql', status: 'paid' }),
            userId: userId
          },
          type: sequelize.QueryTypes.INSERT
        });

        logger.info(`Đã tạo payment record dự phòng thành công qua SQL trực tiếp với Amount: ${amount}`);
        return true;
      } catch (sqlError) {
        logger.error(`Không thể tạo payment record qua SQL trực tiếp: ${sqlError.message}`);
        return false;
      }
    }
  }

  async formatBookingResponse(booking, formattedSeats, isStaffBooking, pointsRefunded = 0, isCancelled = false) {
    logger.info(`Bắt đầu formatBookingResponse cho booking ${booking.Booking_ID}`);

    let currentPoints = 0;
    if (!isStaffBooking && booking.User_ID) {
      try {
        currentPoints = await pointsService.getUserPointsTotalAsync(booking.User_ID);
      } catch (e) {
        logger.error(`Failed to get current points for user ${booking.User_ID} in formatBookingResponse: ${e.message}`);
      }
    }

    const ticketsForResponse = Array.isArray(booking.tickets) ? booking.tickets.map(t => ({
      Ticket_ID: t.Ticket_ID,
      Ticket_Code: t.Ticket_Code,
      Seat_ID: t.Seat_ID,
      Price: t.Final_Price,
      Seat_Label: (() => {
        const seat = booking.Seats?.find(s => s.Seat_ID === t.Seat_ID);
        const layout = seat?.SeatLayout;
        return layout ? `${layout.Row_Label}${layout.Column_Number}` : 'N/A';
      })()
    })) : [];

    // Lấy Payment_Method từ bảng Payments
    let paymentMethod = 'Cash'; // Mặc định
    let transactionDate = null;

    try {
      // Truy vấn thông tin thanh toán từ bảng Payments
      const payment = await Payment.findOne({
        where: { Booking_ID: booking.Booking_ID },
        order: [['Transaction_Date', 'DESC']]
      });

      if (payment) {
        logger.info(`Tìm thấy payment cho booking ${booking.Booking_ID}: ${payment.Payment_Method}`);
        paymentMethod = payment.Payment_Method || 'Cash';
        transactionDate = payment.Transaction_Date;
      } else {
        logger.warn(`Không tìm thấy payment trong DB cho booking ${booking.Booking_ID}`);
      }
    } catch (error) {
      logger.warn(`Lỗi khi truy vấn payment từ DB: ${error.message}`);
    }

    // Tạo đối tượng kết quả
    const result = {
      Booking_ID: booking.Booking_ID,
      User_ID: booking.User_ID,
      Created_By: booking.Created_By,
      Booking_Date: booking.Booking_Date,
      Payment_Deadline: booking.Payment_Deadline,
      Total_Amount: booking.Total_Amount,
      Status: booking.Status,
      Seats: formattedSeats,
      Payment_Method: paymentMethod,
      Transaction_Date: transactionDate,
      Cancellation_Date: isCancelled ? new Date() : null,
      IsStaffBooking: isStaffBooking,
      Promotion_ID: booking.Promotion_ID,
      Points_Used: booking.Points_Used,
      Discount_Amount: booking.Discount_Amount,
      Points_Earned: booking.Points_Earned,
      PointsRefunded: pointsRefunded,
      MovieName: booking.Showtime?.Movie?.Movie_Name,
      RoomName: booking.Showtime?.CinemaRoom?.Room_Name,
      Show_Date: booking.Showtime?.Show_Date,
      Start_Time: booking.Showtime?.Start_Time,
      Showtime: booking.Showtime ? {
        Showtime_ID: booking.Showtime.Showtime_ID,
        Show_Date: booking.Showtime.Show_Date,
        Start_Time: booking.Showtime.Start_Time,
        Movie: booking.Showtime.Movie ? {
          Movie_ID: booking.Showtime.Movie.Movie_ID,
          Movie_Name: booking.Showtime.Movie.Movie_Name,
          Duration: booking.Showtime.Movie.Duration,
          Rating: booking.Showtime.Movie.Rating,
          Poster_URL: booking.Showtime.Movie.Poster_URL
        } : null,
        Room: booking.Showtime.CinemaRoom ? {
          Cinema_Room_ID: booking.Showtime.CinemaRoom.Cinema_Room_ID,
          Room_Name: booking.Showtime.CinemaRoom.Room_Name,
          Room_Type: booking.Showtime.CinemaRoom.Room_Type
        } : null
      } : null,
      Tickets: ticketsForResponse,
      CurrentPoints: currentPoints
    };

    logger.info(`Kết quả formatBookingResponse hoàn tất cho booking ${booking.Booking_ID}`);
    return result;
  }

  // Hàm gửi thông báo xác nhận thanh toán
  async sendPaymentConfirmationNotifications(booking, user, tickets, seats) {
    try {
      logger.info(`📧 Sending payment confirmation notification for booking ${booking.Booking_ID}:`, {
        userId: booking.User_ID,
        userEmail: user?.Email,
        ticketsCount: tickets.length,
        seatsCount: seats.length,
        totalAmount: booking.Total_Amount,
        message: `Thanh toán đơn đặt vé #${booking.Booking_ID} đã được xác nhận thành công. ${tickets.length} vé đã được kích hoạt.`
      });

      // Kiểm tra có email người dùng không
      if (!user || !user.Email) {
        logger.warn(`Không có email người dùng để gửi thông báo cho booking ${booking.Booking_ID}`);
        return;
      }

      // Tạo emailService instance
      const emailConfig = {
        smtpServer: process.env.SMTP_SERVER || 'smtp.gmail.com',
        smtpPort: process.env.SMTP_PORT || 587,
        enableSsl: process.env.SMTP_SSL === 'true',
        smtpUsername: process.env.SMTP_USERNAME || 'your-email@gmail.com',
        smtpPassword: process.env.SMTP_PASSWORD || 'your-password',
        senderEmail: process.env.SENDER_EMAIL || 'noreply@galaxycinema.com',
        senderName: 'GALAXY Cinema',
        apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
        supportPhone: process.env.SUPPORT_PHONE || '1900 xxxx'
      };

      const emailService = new (require('./emailService'))(logger, emailConfig);

      // Lấy thông tin chi tiết cho email
      const { Showtime } = require('../models');
      const detailedBooking = await TicketBooking.findByPk(booking.Booking_ID, {
        include: [
          {
            model: Showtime,
            as: 'Showtime',
            include: [
              { model: Movie, as: 'Movie' },
              { model: CinemaRoom, as: 'CinemaRoom' }
            ]
          }
        ]
      });

      if (!detailedBooking || !detailedBooking.Showtime) {
        logger.error(`Không tìm thấy thông tin chi tiết cho booking ${booking.Booking_ID}`);
        return;
      }

      // Chuẩn bị thông tin booking cho email
      const showDate = new Date(detailedBooking.Showtime.Show_Date);
      const formattedShowDate = showDate.toLocaleDateString('vi-VN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const formatTime = (time) => {
        if (!time) return '';
        if (typeof time === 'string') {
          return time.slice(0, 5);
        }
        return new Date(time).toLocaleTimeString('vi-VN', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
      };

      // Tạo danh sách ghế
      const seatLabels = seats.map(seat => {
        const layout = seat.SeatLayout;
        return layout ? `${layout.Row_Label}${layout.Column_Number}` : '';
      }).filter(Boolean);

      const bookingInfoForEmail = {
        BookingId: booking.Booking_ID.toString(),
        MovieName: detailedBooking.Showtime.Movie.Movie_Name,
        CinemaRoom: detailedBooking.Showtime.CinemaRoom.Room_Name,
        ShowDate: formattedShowDate,
        ShowTime: formatTime(detailedBooking.Showtime.Start_Time),
        Seats: seatLabels.join(', '),
        TotalAmount: booking.Total_Amount.toLocaleString('vi-VN') + ' VND',
        PaymentDate: new Date().toLocaleDateString('vi-VN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      };

      // Tạo PDF vé cho từng ticket
      const pdfTickets = [];
      const ticketService = require('./ticketService');
      const pdfGenerator = new (require('./pdfGeneratorService'))();
      const qrCodeGenerator = new (require('./qrCodeGenerator'))();

      logger.info(`Bắt đầu tạo ${tickets.length} vé PDF cho booking ${booking.Booking_ID}`);

      for (const ticket of tickets) {
        try {
          // Tạo QR code cho vé
          const qrCodeBuffer = await qrCodeGenerator.generateQRCode(ticket.Ticket_Code);
          
          // Tìm thông tin ghế cho vé này
          const ticketSeat = seats.find(s => s.Seat_ID === ticket.Seat_ID);
          const seatInfo = ticketSeat?.SeatLayout ? 
            `${ticketSeat.SeatLayout.Row_Label}${ticketSeat.SeatLayout.Column_Number}` : 
            'N/A';

          // Chuẩn bị dữ liệu để tạo PDF
          const ticketData = {
            TicketCode: ticket.Ticket_Code,
            MovieName: detailedBooking.Showtime.Movie.Movie_Name,
            CinemaRoom: detailedBooking.Showtime.CinemaRoom.Room_Name,
            ShowDate: formattedShowDate,
            ShowTime: formatTime(detailedBooking.Showtime.Start_Time),
            SeatInfo: seatInfo,
            BookingCode: booking.Booking_ID.toString(),
            Price: ticket.Final_Price
          };

          // Tạo PDF vé
          const pdfContent = await pdfGenerator.generateTicketPdf(ticketData, qrCodeBuffer);
          
          if (pdfContent && pdfContent.length > 0) {
            pdfTickets.push({
              filename: `Ve_GALAXY_Cinema_${ticket.Ticket_Code}.pdf`,
              content: pdfContent,
              contentType: 'application/pdf'
            });
            logger.info(`✅ Tạo PDF thành công cho vé ${ticket.Ticket_Code}`);
          }
        } catch (pdfError) {
          logger.error(`❌ Lỗi khi tạo PDF cho vé ${ticket.Ticket_Code}:`, pdfError.message);
          // Tiếp tục với các vé khác
        }
      }

      logger.info(`Đã tạo thành công ${pdfTickets.length}/${tickets.length} vé PDF`);

      // Gửi email xác nhận thanh toán với vé đính kèm
      let emailSent = false;
      
      if (pdfTickets.length > 0) {
        // Gửi email với vé PDF đính kèm
        emailSent = await emailService.sendTicketsEmailAsync(
          user.Email,
          user.Full_Name || user.Email,
          bookingInfoForEmail,
          pdfTickets
        );
        
        if (emailSent) {
          logger.info(`✅ Đã gửi email vé thành công với ${pdfTickets.length} vé PDF đến ${user.Email}`);
        }
      }

      // Nếu không tạo được PDF hoặc gửi email thất bại, gửi email thông báo đơn giản
      if (!emailSent) {
        const simpleEmailSubject = `Xác nhận thanh toán thành công - Mã đặt vé: ${booking.Booking_ID}`;
        const simpleEmailBody = `
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
              .header { background-color: #28a745; color: white; padding: 15px; text-align: center; border-radius: 5px 5px 0 0; }
              .content { padding: 20px; }
              .booking-info { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
              .footer { background-color: #f8f9fa; padding: 10px; text-align: center; font-size: 12px; color: #6c757d; border-radius: 0 0 5px 5px; }
            </style>
          </head>
          <body>
            <div class='container'>
              <div class='header'>
                <h2>✅ Thanh toán thành công - GALAXY Cinema</h2>
              </div>
              <div class='content'>
                <p>Xin chào <strong>${user.Full_Name || user.Email}</strong>,</p>
                <p>Cảm ơn bạn đã thanh toán thành công! Đơn đặt vé của bạn đã được xác nhận.</p>
                
                <div class='booking-info'>
                  <h3>Thông tin đặt vé:</h3>
                  <p><strong>Mã đặt vé:</strong> ${bookingInfoForEmail.BookingId}</p>
                  <p><strong>Phim:</strong> ${bookingInfoForEmail.MovieName}</p>
                  <p><strong>Phòng chiếu:</strong> ${bookingInfoForEmail.CinemaRoom}</p>
                  <p><strong>Ngày chiếu:</strong> ${bookingInfoForEmail.ShowDate}</p>
                  <p><strong>Giờ chiếu:</strong> ${bookingInfoForEmail.ShowTime}</p>
                  <p><strong>Ghế:</strong> ${bookingInfoForEmail.Seats}</p>
                  <p><strong>Tổng tiền:</strong> ${bookingInfoForEmail.TotalAmount}</p>
                  <p><strong>Thời gian thanh toán:</strong> ${bookingInfoForEmail.PaymentDate}</p>
                </div>
                
                <p><strong>Lưu ý quan trọng:</strong></p>
                <ul>
                  <li>Vui lòng đến rạp trước giờ chiếu ít nhất 15 phút</li>
                  <li>Mang theo mã đặt vé <strong>${bookingInfoForEmail.BookingId}</strong> để check-in</li>
                  <li>Liên hệ hotline nếu cần hỗ trợ: ${emailConfig.supportPhone}</li>
                </ul>
                
                <p>Chúc bạn có trải nghiệm xem phim tuyệt vời!</p>
                <p>Trân trọng,<br>Đội ngũ GALAXY Cinema</p>
              </div>
              <div class='footer'>
                <p>Đây là email tự động, vui lòng không trả lời email này.</p>
                <p>Nếu bạn cần hỗ trợ, vui lòng liên hệ hotline: ${emailConfig.supportPhone}</p>
              </div>
            </div>
          </body>
          </html>
        `;

        emailSent = await emailService.sendEmailAsync(user.Email, simpleEmailSubject, simpleEmailBody);
        
        if (emailSent) {
          logger.info(`✅ Đã gửi email xác nhận thanh toán đơn giản đến ${user.Email}`);
        } else {
          logger.error(`❌ Không thể gửi email xác nhận thanh toán đến ${user.Email}`);
        }
      }

      // Tạo booking history cho việc gửi email
      if (emailSent) {
        try {
          const { BookingHistory } = require('../models');
          await BookingHistory.create({
            Booking_ID: booking.Booking_ID,
            Date: sequelize.literal('GETDATE()'),
            Status: 'Email Sent',
            Notes: `Đã gửi email xác nhận thanh toán và ${pdfTickets.length > 0 ? `${pdfTickets.length} vé PDF` : 'thông tin đặt vé'} đến ${user.Email}`,
            IsRead: false
          });
        } catch (historyError) {
          logger.error(`Lỗi khi tạo booking history cho email:`, historyError.message);
        }
      }

    } catch (error) {
      logger.error('Error sending payment confirmation notifications:', error);
      // Don't throw error - notification failure shouldn't break payment confirmation
    }
  }

  /**
   * Tự động hủy đơn đặt vé hết hạn thanh toán
   */
  async autoCancelExpiredBooking(bookingId) {
    logger.info(`Bắt đầu tự động hủy đơn đặt vé quá hạn ${bookingId}`);
    const transaction = await sequelize.transaction();

    try {
      // Bước 1: Tìm booking với booking ID
      const booking = await TicketBooking.findByPk(bookingId, {
        transaction,
        include: [{
          model: User,
          as: 'User',
          attributes: ['User_ID', 'Full_Name', 'Email', 'Phone_Number']
        }]
      });

      if (!booking) {
        logger.error(`Không tìm thấy đơn đặt vé ${bookingId} để hủy tự động`);
        await transaction.rollback();
        return {
          success: false,
          message: `Không tìm thấy đơn đặt vé ${bookingId}`
        };
      }

      // Kiểm tra nếu booking không phải trạng thái Pending
      if (booking.Status !== 'Pending') {
        logger.info(`Đơn đặt vé ${bookingId} không ở trạng thái Chờ thanh toán. Trạng thái hiện tại: ${booking.Status}`);
        await transaction.rollback();
        return {
          success: false,
          message: `Đơn đặt vé ${bookingId} không ở trạng thái Chờ thanh toán. Trạng thái hiện tại: ${booking.Status}`
        };
      }

      // Bước 2: Tìm tất cả vé thuộc đơn đặt vé
      const tickets = await Ticket.findAll({
        where: { Booking_ID: bookingId },
        include: [
          {
            // Lấy thông tin ghế qua quan hệ với vé
            model: Seat,
            as: 'Seat',
            include: [{
              model: SeatLayout,
              as: 'SeatLayout',
              attributes: ['Layout_ID', 'Row_Label', 'Column_Number']
            }]
          }
        ],
        transaction
      });

      logger.info(`Tìm thấy ${tickets.length} vé cho đơn đặt vé ${bookingId}`);

      // Bước 3: Lấy thông tin ghế từ vé 
      // Lưu ý: Không lấy ghế trực tiếp từ Booking_ID vì không có quan hệ đó
      const seats = tickets.map(ticket => ticket.Seat).filter(Boolean);
      const seatIds = seats.map(seat => seat.Seat_ID);

      logger.info(`Tìm thấy ${seats.length} ghế cho đơn đặt vé ${bookingId}`);

      // Bước 4: Cập nhật trạng thái booking
      await booking.update({
        Status: 'Cancelled',
        Updated_At: sequelize.literal('GETDATE()')
      }, { transaction });

      logger.info(`Đã cập nhật đơn đặt vé ${bookingId} thành trạng thái Đã hủy`);

      // Bước 5: Xóa vé thay vì cập nhật trạng thái
      if (tickets.length > 0) {
        await Ticket.destroy({
          where: { Booking_ID: bookingId },
          transaction
        });
        logger.info(`Đã xóa ${tickets.length} vé của đơn đặt vé ${bookingId}`);
      }

      // Bước 6: Tạo lịch sử đơn đặt vé
      await BookingHistory.create({
        Booking_ID: bookingId,
        Date: sequelize.literal('GETDATE()'),
        Status: 'Cancelled',
        Notes: 'Đơn đặt vé đã bị hủy tự động do quá thời gian thanh toán. Tất cả vé đã bị xóa.',
        IsRead: false
      }, { transaction });

      logger.info(`Đã tạo bản ghi lịch sử cho việc tự động hủy đơn đặt vé ${bookingId}`);

      // Bước 7: Commit transaction
      await transaction.commit();
      logger.info(`Giao dịch đã được hoàn thành thành công cho việc tự động hủy đơn đặt vé ${bookingId}`);

      // Thông tin về ghế đã hủy để hiển thị trong thông báo
      const formattedSeats = seats.map(seat => ({
        SeatPosition: `${seat.SeatLayout?.Row_Label}${seat.SeatLayout?.Column_Number}`
      }));

      // Gửi thông báo hủy đặt vé
      try {
        if (booking.User) {
          await this.sendCancellationNotifications(booking, booking.User, formattedSeats);
        }
      } catch (notificationError) {
        logger.error(`Không thể gửi thông báo hủy đơn đặt vé ${bookingId}: ${notificationError.message}`);
      }

      return {
        success: true,
        message: `Đã tự động hủy đơn đặt vé ${bookingId} do hết thời hạn thanh toán`,
        bookingId: bookingId
      };

    } catch (error) {
      // Xử lý lỗi và rollback transaction
      if (transaction) {
        try {
          await transaction.rollback();
          logger.info(`Đã rollback giao dịch cho đơn đặt vé ${bookingId} sau khi gặp lỗi`);
        } catch (rollbackError) {
          logger.error(`Lỗi khi rollback giao dịch: ${rollbackError.message}`);
        }
      }
      logger.error(`Lỗi trong quá trình tự động hủy đơn đặt vé ${bookingId}: ${error.message}`, { stack: error.stack });

      return {
        success: false,
        message: `Lỗi khi hủy đơn đặt vé ${bookingId}: ${error.message}`
      };
    }
  }

  /**
   * Kiểm tra pending booking
   */
  async checkPendingBooking(userId, existingTransaction = null) {
    const runInTransaction = async (transaction) => {
      // Bước 1: Tìm đơn đặt vé đang ở trạng thái Pending được tạo bởi người dùng
      const pendingBooking = await TicketBooking.findOne({
        where: { Created_By: userId, Status: 'Pending' }, // Chỉ lấy đơn hàng Pending mới nhất được tạo bởi user này
        include: [
          {
            model: Showtime,
            as: 'Showtime',
            include: [
              { model: Movie, as: 'Movie' },
              {
                model: CinemaRoom,
                as: 'CinemaRoom',
                include: [{ model: SeatLayout, as: 'SeatLayouts' }]
              }
            ]
          }
          // Loại bỏ quan hệ với Seat vì nó không được định nghĩa đúng
          // và gây ra lỗi: "Seat is not associated to TicketBooking"
        ],
        order: [['Booking_Date', 'DESC']], // Sắp xếp theo thời gian đặt vé mới nhất
        transaction
      });

      // Bước 2: Nếu không có đơn đặt vé đang chờ, trả về kết quả cho phép tạo đơn mới
      if (!pendingBooking) {
        return { canCreateNewBooking: true };
      }

      // Bước 3: Kiểm tra xem đơn đặt vé đã quá hạn thanh toán chưa - SỬA ĐỂ DÙNG SQL THAY VÌ JAVASCRIPT
      // Sử dụng SQL để so sánh thời gian thay vì JavaScript để tránh vấn đề múi giờ
      const [timeCheckResult] = await sequelize.query(`
        SELECT 
          Booking_ID,
          Payment_Deadline,
          GETDATE() as CurrentServerTime,
          CASE WHEN Payment_Deadline < GETDATE() THEN 1 ELSE 0 END as IsExpired,
          CASE 
            WHEN Payment_Deadline < GETDATE() THEN 0 
            ELSE DATEDIFF(minute, GETDATE(), Payment_Deadline) 
          END as RemainingMinutes
        FROM Ticket_Bookings 
        WHERE Booking_ID = :bookingId
      `, {
        replacements: { bookingId: pendingBooking.Booking_ID },
        type: sequelize.QueryTypes.SELECT,
        transaction
      });

      if (!timeCheckResult) {
        logger.error(`Không thể kiểm tra thời gian cho booking ${pendingBooking.Booking_ID}`);
        return { canCreateNewBooking: true };
      }

      const isExpired = timeCheckResult.IsExpired === 1;
      const remainingMinutes = timeCheckResult.RemainingMinutes || 0;

      logger.info(`[TIME CHECK] Booking ${pendingBooking.Booking_ID}: IsExpired=${isExpired}, RemainingMinutes=${remainingMinutes}, CurrentServerTime=${timeCheckResult.CurrentServerTime}, PaymentDeadline=${timeCheckResult.Payment_Deadline}`);

      if (isExpired) {
        logger.info(`Đơn đặt vé ${pendingBooking.Booking_ID} được tạo bởi người dùng ${userId} đã hết hạn. Đang thực hiện hủy tự động.`);
        try {
          // Hủy đơn đặt vé tự động nếu đã hết hạn
          await this.autoCancelExpiredBooking(pendingBooking.Booking_ID);
          return { canCreateNewBooking: true, autoCancelled: true }; // Trả về kết quả cho phép tạo đơn mới
        } catch (cancelError) {
          logger.error(`Không thể tự động hủy đơn đặt vé ${pendingBooking.Booking_ID} đã hết hạn: ${cancelError.message}`);
        }
      }

      // Bước 4: Định dạng thông tin ghế để hiển thị
      // Sửa cách lấy thông tin ghế vì chúng ta đã loại bỏ quan hệ trực tiếp với Seat
      let formattedSeats = "Chưa có thông tin ghế";
      try {
        // Lấy thông tin ghế từ vé thay vì trực tiếp từ quan hệ
        const tickets = await Ticket.findAll({
          where: { Booking_ID: pendingBooking.Booking_ID },
          include: [{
            model: Seat,
            as: 'Seat',
            include: [{
              model: SeatLayout,
              as: 'SeatLayout'
            }]
          }],
          transaction
        });

        formattedSeats = tickets.map(ticket => {
          const layout = ticket.Seat?.SeatLayout;
          return layout ? `${layout.Row_Label}${layout.Column_Number}` : '';
        }).filter(Boolean).join(', ');
      } catch (error) {
        logger.error(`Lỗi khi lấy thông tin ghế cho đơn đặt vé ${pendingBooking.Booking_ID}: ${error.message}`);
      }

      // Bước 5: Trả về thông tin đơn đặt vé đang chờ
      return {
        canCreateNewBooking: false, // Không cho phép tạo đơn mới khi có đơn Pending
        pendingBooking: {
          Booking_ID: pendingBooking.Booking_ID,
          Booking_Date: pendingBooking.Booking_Date,
          Payment_Deadline: pendingBooking.Payment_Deadline,
          IsExpired: isExpired, // Trạng thái hết hạn từ SQL
          Seats: formattedSeats, // Chuỗi mô tả ghế đã đặt
          Total_Amount: pendingBooking.Total_Amount,
          MovieName: pendingBooking.Showtime?.Movie?.Movie_Name,
          RoomName: pendingBooking.Showtime?.CinemaRoom?.Room_Name,
          Show_Date: pendingBooking.Showtime?.Show_Date,
          Start_Time: pendingBooking.Showtime?.Start_Time,
          RemainingMinutes: Math.max(0, remainingMinutes) // Sử dụng kết quả từ SQL thay vì tính toán JavaScript
        }
      };
    };

    // Bước 6: Kiểm tra xem có sử dụng transaction hiện có hay tạo mới
    if (existingTransaction) {
      return await runInTransaction(existingTransaction);
    } else {
      const transaction = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED });
      try {
        const result = await runInTransaction(transaction);
        await transaction.commit(); // Hoàn tất transaction
        return result;
      } catch (error) {
        await transaction.rollback(); // Hủy transaction nếu có lỗi
        logger.error(`Lỗi trong checkPendingBooking cho đơn đặt vé được tạo bởi người dùng ${userId}: ${error.message}`);
        throw error;
      }
    }
  }

  /**
   * Kiểm tra xem người dùng có đơn đặt vé đang pending không và trả về thông tin cho controller
   * @param {number} userId - ID của người dùng
   * @returns {Promise<Object|null>} - Thông tin đơn đặt vé đang pending hoặc null nếu không có
   */
  async checkUserPendingBookings(userId) {
    try {
      logger.info(`Checking pending bookings created by user ${userId}`);

      const pendingBookingResult = await this.checkPendingBooking(userId);

      if (!pendingBookingResult.canCreateNewBooking) {
        return pendingBookingResult.pendingBooking;
      }

      return null;
    } catch (error) {
      logger.error(`Error checking pending bookings created by user ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Kiểm tra đơn đặt vé đang pending của khách hàng (cho nhân viên)
   * @param {number} staffId - ID của nhân viên
   * @param {number} targetUserId - ID của khách hàng cần kiểm tra
   * @returns {Promise<Object|null>} - Thông tin đơn đặt vé đang pending hoặc null nếu không có
   */
  async checkPendingBookingForStaff(staffId, targetUserId) {
    try {
      logger.info(`Staff ${staffId} checking pending bookings created by user ${targetUserId}`);
      return await this.checkUserPendingBookings(targetUserId);
    } catch (error) {
      logger.error(`Error when staff ${staffId} checked pending bookings created by user ${targetUserId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Helper functions
   */
  generateTicketCode() {
    return Math.random().toString(36).substr(2, 8).toUpperCase();
  }

  generatePaymentReference() {
    return `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  }

  async getFormattedSeatPositions(bookingId) {
    try {
      const tickets = await Ticket.findAll({
        where: { booking_id: bookingId },
        include: [{
          model: Seat,
          as: 'Seat',
          include: [{
            model: SeatLayout,
            as: 'SeatLayout',
            attributes: ['Row_Label', 'Column_Number']
          }]
        }]
      });

      if (tickets.length === 0) {
        return 'Không có thông tin ghế';
      }

      const seatCodes = tickets.map(ticket =>
        `${ticket.Seat.SeatLayout.Row_Label}${ticket.Seat.SeatLayout.Column_Number}`
      );

      return seatCodes.join(', ');
    } catch (error) {
      logger.error('Error getting formatted seat positions:', error);
      return 'Lỗi khi lấy thông tin ghế';
    }
  }

  async restoreCancelledBooking(booking, transaction) {
    logger.info(`Đang phục hồi đơn đặt vé đã hủy ${booking.booking_id}`);

    const tickets = await Ticket.findAll({
      where: { booking_id: booking.booking_id },
      transaction
    });

    if (!tickets || tickets.length === 0) {
      throw new Error('Không tìm thấy vé nào trong đơn đặt vé này');
    }

    const ticketSeatIds = tickets.map(t => t.seat_id);
    const showtimeId = tickets[0].showtime_id;

    // Kiểm tra xem có vé nào đang đặt cho ghế trong suất chiếu này không
    const conflictingTickets = await Ticket.findAll({
      where: {
        seat_id: { [Op.in]: ticketSeatIds },
        showtime_id: showtimeId,
        booking_id: {
          [Op.ne]: booking.booking_id
        },
        status: { [Op.notIn]: ['Cancelled', 'Expired'] }
      },
      transaction
    });

    if (conflictingTickets.length > 0) {
      throw new Error('Không thể khôi phục đơn đặt vé vì ghế đã được đặt bởi đơn khác');
    }

    // Cập nhật trạng thái vé thành Active
    await Ticket.update(
      { status: 'Active' },
      {
        where: { booking_id: booking.booking_id },
        transaction
      }
    );

    return true;
  }

  async processManualCancellation(bookingId, adminUserId, reason) {
    const transaction = await sequelize.transaction();

    try {
      logger.info(`Starting manual cancellation for booking ${bookingId} by admin ${adminUserId}`, { reason });

      // Bước 1: Tìm thông tin đơn đặt vé và các thông tin liên quan
      const booking = await TicketBooking.findByPk(bookingId, {
        include: [
          {
            model: User,
            as: 'User',
            attributes: ['User_ID', 'Full_Name', 'Email', 'Phone_Number'] // Thông tin liên hệ khách hàng
          },
          {
            model: Showtime,
            as: 'Showtime',
            include: [
              { model: Movie, as: 'Movie' },
              { model: CinemaRoom, as: 'CinemaRoom' }
            ]
          },
          {
            model: Promotion,
            as: 'Promotion'
          }
        ],
        transaction
      });

      if (!booking) {
        throw new Error(`Booking ${bookingId} not found`);
      }

      // Bước 2: Kiểm tra điều kiện cho phép hủy
      if (booking.Status === 'Cancelled') {
        throw new Error(`Booking ${bookingId} is already cancelled`);
      }

      if (booking.Status === 'Completed') {
        throw new Error(`Booking ${bookingId} is completed and cannot be cancelled`);
      }

      const originalStatus = booking.Status;
      logger.info(`Found booking ${bookingId} with status: ${originalStatus}`);

      // Bước 3: Lấy thông tin các vé
      const tickets = await Ticket.findAll({
        where: { Booking_ID: bookingId },
        attributes: ['Ticket_ID', 'Ticket_Code', 'Seat_ID', 'Final_Price', 'Status', 'Is_Checked_In'],
        transaction
      });

      logger.info(`Found ${tickets.length} tickets for booking ${bookingId}`);

      // Bước 4: Lấy danh sách Seat_ID từ vé rồi mới lấy thông tin ghế
      if (tickets.length === 0) {
        logger.warn(`No tickets found for booking ${bookingId}`);
      }

      // Lấy danh sách Seat_ID từ vé
      const seatIds = tickets.map(ticket => ticket.Seat_ID);

      // Lấy thông tin ghế dựa trên Seat_ID
      const seats = seatIds.length > 0 ? await Seat.findAll({
        where: { Seat_ID: { [Op.in]: seatIds } },
        include: [{
          model: SeatLayout,
          as: 'SeatLayout',
          attributes: ['Row_Label', 'Column_Number', 'Seat_Type']
        }],
        transaction
      }) : [];

      logger.info(`Found ${seats.length} seats for the tickets of booking ${bookingId}`);

      // Kiểm tra vé đã được check-in chưa
      const checkedInTickets = tickets.filter(ticket => ticket.Is_Checked_In);
      if (checkedInTickets.length > 0) {
        logger.warn(`Warning: ${checkedInTickets.length} tickets have been checked in for booking ${bookingId}`);
        // Admin vẫn có thể hủy nhưng hệ thống sẽ ghi log để kiểm tra sau
      }

      // Bước 5: Tính toán số tiền hoàn trả
      let refundAmount = 0;
      if (originalStatus === 'Confirmed') {
        refundAmount = booking.Total_Amount; // Hoàn 100% nếu đã xác nhận
        logger.info(`Refund amount calculated: ${refundAmount} for booking ${bookingId}`);
      }

      // Bước 6: Xóa các vé
      let deletedTicketsCount = 0;
      if (tickets.length > 0) {
        deletedTicketsCount = await Ticket.destroy({
          where: { Booking_ID: bookingId },
          transaction
        });
        logger.info(`Deleted ${deletedTicketsCount} tickets for booking ${bookingId}`);
      }

      // Bước 7: Sau đó mới xóa thông tin ghế - xóa theo từng ghế thay vì hàng loạt
      let deletedSeatsCount = 0;
      if (seatIds.length > 0) {
        try {
          // Xóa từng ghế, không dùng hàm xóa hàng loạt để xử lý lỗi nếu có
          for (const seatId of seatIds) {
            try {
              await Seat.destroy({
                where: { Seat_ID: seatId },
                transaction
              });
              deletedSeatsCount++;
            } catch (seatDeleteError) {
              logger.warn(`Không thể xóa ghế ${seatId} do lỗi: ${seatDeleteError.message}`);
            }
          }
          logger.info(`Deleted ${deletedSeatsCount} seats for booking ${bookingId}`);
        } catch (bulkDeleteError) {
          logger.error(`Lỗi khi xóa ghế cho booking ${bookingId}: ${bulkDeleteError.message}`);
          // Không throw lỗi ở đây, tiếp tục xử lý các bước còn lại
        }
      }

      // Bước 8: Xử lý giải phóng khuyến mãi nếu có
      if (booking.Promotion_ID) {
        try {
          // Tìm bản ghi sử dụng khuyến mãi
          const promotionUsage = await PromotionUsage.findOne({
            where: {
              Booking_ID: bookingId,
              Promotion_ID: booking.Promotion_ID,
              HasUsed: true // Chỉ xử lý các bản ghi đã sử dụng
            },
            transaction
          });

          // Tìm thông tin khuyến mãi
          const promotion = await Promotion.findByPk(booking.Promotion_ID, { transaction });

          if (promotionUsage && promotion) {
            // Đánh dấu khuyến mãi chưa sử dụng để có thể dùng lại
            await promotionUsage.update({
              HasUsed: false
            }, { transaction });

            // Giảm số lần sử dụng của khuyến mãi
            if (promotion.Current_Usage > 0) {
              promotion.Current_Usage -= 1;
              await promotion.save({ transaction });
            }

            // Ghi lại lịch sử
            await BookingHistory.create({
              Booking_ID: bookingId,
              Action: 'PROMOTION_RELEASED',
              Action_Date: new Date(),
              Details: `Đã giải phóng khuyến mãi: ${promotion.Promotion_Code || 'KM'} (có thể sử dụng lại)`,
              User_ID: adminUserId
            }, { transaction });

            logger.info(`Đã giải phóng khuyến mãi cho booking ${bookingId}, giảm số lần sử dụng của mã ${promotion.Promotion_Code}`);
          } else {
            logger.warn(`Không tìm thấy bản ghi sử dụng hoặc thông tin khuyến mãi cho booking ${bookingId}`);
          }
        } catch (promoError) {
          logger.error(`Lỗi khi giải phóng khuyến mãi cho booking ${bookingId}: ${promoError.message}`);
          // Tiếp tục quá trình hủy đặt vé
        }
      }

      // Bước 9: Cập nhật trạng thái đơn đặt vé
      await booking.update({
        Status: 'Cancelled', // Chuyển trạng thái thành đã hủy
        Promotion_ID: null, // Xóa liên kết với khuyến mãi
        Updated_At: sequelize.literal('GETDATE()') // Cập nhật thời gian chỉnh sửa
      }, { transaction });

      // Bước 10: Cập nhật sức chứa suất chiếu (trả lại số ghế trống)
      const showtime = booking.showtime;
      if (showtime && seats.length > 0) {
        await showtime.update({
          Capacity_Available: showtime.Capacity_Available + seats.length // Tăng số chỗ trống
        }, { transaction });
        logger.info(`Restored ${seats.length} seats to showtime ${showtime.Showtime_ID} capacity`);
      }

      // Bước 11: Xử lý hoàn trả điểm
      let pointsRefunded = 0;
      if (booking.Points_Used > 0) {
        pointsRefunded = booking.Points_Used;
        logger.info(`Points to refund: ${pointsRefunded} for user ${booking.User_ID}`);

        // Xử lý hoàn điểm sau khi commit transaction để tránh lỗi nested transaction
      }

      // Bước 12: Tạo bản ghi lịch sử chi tiết
      const historyDetails = {
        reason: reason,
        originalStatus: originalStatus,
        seatsDeleted: deletedSeatsCount,
        ticketsDeleted: deletedTicketsCount,
        refundAmount: refundAmount,
        pointsRefunded: pointsRefunded,
        checkedInTickets: checkedInTickets.length,
        seats: seats.map(seat => ({
          seatId: seat.Seat_ID,
          row: seat.SeatLayout?.Row_Label,
          number: seat.SeatLayout?.Column_Number,
          type: seat.SeatLayout?.Seat_Type
        })),
        tickets: tickets.map(ticket => ({
          ticketId: ticket.Ticket_ID,
          ticketCode: ticket.Ticket_Code,
          price: ticket.Final_Price,
          wasCheckedIn: ticket.Is_Checked_In
        }))
      };

      await BookingHistory.create({
        Booking_ID: bookingId,
        Status: 'Booking Cancelled',
        Notes: `Người dùng đã hủy đặt vé.`,
        Date: sequelize.literal('GETDATE()'),
        IsRead: false,
        Additional_Data: JSON.stringify(historyDetails) // Lưu thông tin chi tiết dạng JSON
      }, { transaction });

      // Bước 13: Gửi thông báo hủy vé cho khách hàng
      await this.sendCancellationNotification(booking, reason, refundAmount, seats, tickets);

      // Bước 14: Hoàn thành giao dịch
      await transaction.commit();
      logger.info(`✅ Manual cancellation completed successfully for booking ${bookingId}`);

      // Bước 15: Xử lý hoàn điểm sau khi commit transaction
      if (booking.Points_Used > 0 && booking.User_ID) {
        try {
          // Tải lại module để tránh vấn đề circular dependency
          delete require.cache[require.resolve('./pointsService')];
          const pointsService = require('./pointsService');

          // Gọi service hoàn điểm
          const refundResult = await pointsService.refundPointsForCancelledBooking(
            booking.User_ID,
            bookingId,
            pointsRefunded,
            `Hủy thủ công bởi admin: ${reason || 'Không có lý do'}`
          );

          if (refundResult && refundResult.success) {
            logger.info(`Successfully refunded ${pointsRefunded} points to user ${booking.User_ID} for cancelled booking ${bookingId}`);

            // Tạo bản ghi lịch sử hoàn điểm
            await BookingHistory.create({
              Booking_ID: bookingId,
              Status: 'Points Refunded',
              Notes: `Hoàn trả ${pointsRefunded} điểm cho người dùng`,
              Date: sequelize.literal('GETDATE()'),
              IsRead: false
            });
          }
        } catch (pointsError) {
          logger.error(`Error refunding points for cancelled booking ${bookingId}: ${pointsError.message}`);
          // Lỗi hoàn điểm không làm dừng quy trình hủy vé
        }
      }

      // Bước 16: Trả về kết quả chi tiết
      return {
        success: true,
        message: `Booking ${bookingId} has been manually cancelled`,
        cancellation: {
          bookingId: bookingId,
          originalStatus: originalStatus,
          cancelledAt: new Date(),
          cancelledBy: adminUserId,
          reason: reason,
          customer: {
            userId: booking.User_ID,
            name: booking.User?.Full_Name,
            email: booking.User?.Email,
            phone: booking.User?.Phone_Number
          },
          movie: {
            name: showtime?.Movie?.Movie_Name,
            showDate: showtime?.Show_Date,
            startTime: showtime?.Start_Time,
            roomName: showtime?.CinemaRoom?.Room_Name
          },
          financial: {
            originalAmount: booking.Total_Amount,
            refundAmount: refundAmount,
            pointsUsed: booking.Points_Used,
            pointsRefunded: pointsRefunded
          },
          deletedItems: {
            seatsCount: deletedSeatsCount,
            ticketsCount: deletedTicketsCount,
            checkedInTicketsCount: checkedInTickets.length,
            seats: seats.map(seat => ({
              seatId: seat.Seat_ID,
              position: `${seat.SeatLayout?.Row_Label}${seat.SeatLayout?.Column_Number}`,
              type: seat.SeatLayout?.Seat_Type
            })),
            tickets: tickets.map(ticket => ({
              ticketId: ticket.Ticket_ID,
              ticketCode: ticket.Ticket_Code,
              price: ticket.Final_Price,
              wasCheckedIn: ticket.Is_Checked_In
            }))
          }
        }
      };

    } catch (error) {
      // Xử lý lỗi và rollback transaction
      await transaction.rollback();
      logger.error(`❌ Error in manual cancellation for booking ${bookingId}:`, error);
      throw new Error(`Failed to cancel booking ${bookingId}: ${error.message}`);
    }
  }

  // Helper method to send cancellation notification
  async sendCancellationNotification(booking, reason, refundAmount, seats, tickets) {
    try {
      const notificationData = {
        bookingId: booking.Booking_ID,
        customerEmail: booking.User?.Email,
        customerName: booking.User?.Full_Name,
        movieName: booking.Showtime?.Movie?.Movie_Name,
        showDate: booking.Showtime?.Show_Date,
        startTime: booking.Showtime?.Start_Time,
        roomName: booking.Showtime?.CinemaRoom?.Room_Name,
        reason: reason,
        refundAmount: refundAmount,
        seatsCount: seats.length,
        ticketsCount: tickets.length,
        seats: seats.map(seat => `${seat.SeatLayout?.Row_Label}${seat.SeatLayout?.Column_Number}`).join(', ')
      };

      logger.info(`📧 Sending cancellation notification for booking ${booking.Booking_ID}:`, notificationData);

      // TODO: Implement actual email notification
      // await emailService.sendCancellationEmail(user?.Email, booking.Booking_ID, deletedSeats.length);

    } catch (error) {
      logger.error('Error sending cancellation notifications:', error);
      // Don't throw error - notification failure shouldn't break cancellation
    }
  }

  // Additional helper method for bulk manual cancellations
  async processBulkManualCancellation(bookingIds, adminUserId, reason) {
    const results = [];
    const errors = [];

    logger.info(`Starting bulk manual cancellation for ${bookingIds.length} bookings by admin ${adminUserId}`);

    for (const bookingId of bookingIds) {
      try {
        const result = await this.processManualCancellation(bookingId, adminUserId, reason);
        results.push(result);
        logger.info(`✅ Successfully cancelled booking ${bookingId}`);
      } catch (error) {
        const errorResult = {
          bookingId: bookingId,
          success: false,
          error: error.message
        };
        errors.push(errorResult);
        logger.error(`❌ Failed to cancel booking ${bookingId}:`, error.message);
      }
    }

    return {
      success: errors.length === 0,
      totalProcessed: bookingIds.length,
      successCount: results.length,
      errorCount: errors.length,
      results: results,
      errors: errors,
      summary: {
        totalBookingsCancelled: results.length,
        totalSeatsDeleted: results.reduce((sum, r) => sum + r.cancellation.deletedItems.seatsCount, 0),
        totalTicketsDeleted: results.reduce((sum, r) => sum + r.cancellation.deletedItems.ticketsCount, 0),
        totalRefundAmount: results.reduce((sum, r) => sum + r.cancellation.financial.refundAmount, 0)
      }
    };
  }

  // Hàm gửi thông báo hủy vé
  async sendCancellationNotifications(booking, user, deletedSeats) {
    try {
      logger.info(`📧 Sending cancellation notification for booking ${booking.Booking_ID}:`, {
        userId: booking.User_ID,
        userEmail: user?.Email,
        deletedSeats: deletedSeats.length,
        message: `Đơn đặt vé #${booking.Booking_ID} đã được hủy thành công. ${deletedSeats.length} ghế đã được xóa hoàn toàn khỏi hệ thống.`
      });

      // TODO: Implement actual email/push notification here
      // await emailService.sendCancellationEmail(user?.Email, booking.Booking_ID, deletedSeats.length);

    } catch (error) {
      logger.error('Error sending cancellation notifications:', error);
      // Don't throw error - notification failure shouldn't break cancellation
    }
  }

  // Thêm hàm mới vào class BookingService
  async updatePaymentMethodDirectSQL(bookingId, paymentMethod) {
    try {
      logger.info(`[DEBUG-SQL] Cập nhật Payment_Method bằng SQL trực tiếp cho booking ${bookingId}`);

      // Sử dụng tên bảng chính xác từ database với dấu ngoặc vuông đúng cú pháp
      const tableName = 'ksf00691_team03].[Ticket_Bookings';
      logger.info(`[DEBUG-SQL] Sử dụng tên bảng: [${tableName}]`);

      // Thực hiện SQL đơn giản để cập nhật Payment_Method
      const [results, metadata] = await sequelize.query(`
        UPDATE [${tableName}] 
        SET [Payment_Method] = :paymentMethod 
        WHERE [Booking_ID] = :bookingId
      `, {
        replacements: {
          paymentMethod: paymentMethod || 'Cash',
          bookingId: bookingId
        }
      });

      logger.info(`[DEBUG-SQL] Kết quả cập nhật SQL: ${JSON.stringify(metadata)}`);

      // Kiểm tra kết quả bằng SQL trực tiếp
      const [checkResults] = await sequelize.query(`
        SELECT [Payment_Method] 
        FROM [${tableName}] 
        WHERE [Booking_ID] = :bookingId
      `, {
        replacements: { bookingId: bookingId }
      });

      if (checkResults && checkResults.length > 0) {
        logger.info(`[DEBUG-SQL] Giá trị Payment_Method sau khi cập nhật: ${checkResults[0].Payment_Method}`);
        return checkResults[0].Payment_Method;
      } else {
        logger.warn(`[DEBUG-SQL] Không tìm thấy booking sau khi cập nhật SQL`);
        return paymentMethod;
      }
    } catch (error) {
      logger.error(`[DEBUG-SQL] Lỗi khi cập nhật Payment_Method bằng SQL: ${error.message}`, {
        stack: error.stack,
        sql: error.sql,
        parameters: error.parameters
      });
      return null; // Trả về null nếu có lỗi
    }
  }

  // Cập nhật Payment_Method bằng cách sử dụng Sequelize update
  async updatePaymentMethodViaModel(bookingId, paymentMethod) {
    try {
      logger.info(`[DEBUG-MODEL] Cập nhật Payment_Method thông qua SQL trực tiếp cho booking ${bookingId}`);

      // Sử dụng SQL trực tiếp nhưng với cú pháp khác
      const tableName = 'ksf00691_team03].[Ticket_Bookings';

      // Thực hiện lệnh UPDATE trực tiếp
      await sequelize.query(`
        UPDATE [${tableName}] 
        SET [Payment_Method] = :paymentMethod 
        WHERE [Booking_ID] = :bookingId
      `, {
        replacements: {
          paymentMethod: paymentMethod || 'Cash',
          bookingId: bookingId
        },
        type: sequelize.QueryTypes.UPDATE
      });

      logger.info(`[DEBUG-MODEL] Cập nhật thành công thông qua lệnh SQL trực tiếp`);

      // Kiểm tra sau khi cập nhật
      const results = await sequelize.query(`
        SELECT [Payment_Method] 
        FROM [${tableName}] 
        WHERE [Booking_ID] = :bookingId
      `, {
        replacements: { bookingId: bookingId },
        type: sequelize.QueryTypes.SELECT
      });

      if (results && results.length > 0) {
        const updatedValue = results[0].Payment_Method;
        logger.info(`[DEBUG-MODEL] Payment_Method sau khi update: ${updatedValue}`);
        return updatedValue;
      } else {
        logger.warn(`[DEBUG-MODEL] Không tìm thấy booking sau khi cập nhật`);
        return null;
      }
    } catch (error) {
      logger.error(`[DEBUG-MODEL] Lỗi khi cập nhật Payment_Method: ${error.message}`, {
        stack: error.stack,
        sql: error.sql,
        parameters: error.parameters
      });
      return null;
    }
  }

  // Phương thức tổng hợp để thử các phương pháp cập nhật khác nhau
  async ensurePaymentMethodUpdated(bookingId, paymentMethod) {
    // Thử phương pháp 1: Update thông qua model
    const result1 = await this.updatePaymentMethodViaModel(bookingId, paymentMethod);
    if (result1) {
      logger.info(`[DEBUG] Cập nhật Payment_Method thành công thông qua SQL thứ nhất: ${result1}`);
      return result1;
    }

    // Thử phương pháp 2: Update thông qua SQL trực tiếp
    const result2 = await this.updatePaymentMethodDirectSQL(bookingId, paymentMethod);
    if (result2) {
      logger.info(`[DEBUG] Cập nhật Payment_Method thành công thông qua SQL thứ hai: ${result2}`);
      return result2;
    }

    // Thử phương pháp 3: Tạo một payment record để liên kết
    try {
      logger.info(`[DEBUG] Thử tạo payment record bằng SQL trực tiếp`);

      const paymentTableName = '[ksf00691_team03].[Payments]';
      const paymentRef = `BACKUP-${Date.now()}`;
      const currentDate = new Date().toISOString();

      await sequelize.query(`
        INSERT INTO ${paymentTableName} 
        ([Booking_ID], [Amount], [Payment_Method], [Payment_Reference], [Transaction_Date], [Payment_Status], [Processor_Response]) 
        VALUES 
        (:bookingId, 0, :paymentMethod, :paymentRef, :transactionDate, 'Success', '{"source":"backup"}')
      `, {
        replacements: {
          bookingId: bookingId,
          paymentMethod: paymentMethod || 'Cash',
          paymentRef: paymentRef,
          transactionDate: currentDate
        },
        type: sequelize.QueryTypes.INSERT
      });

      logger.info(`[DEBUG] Đã tạo payment record dự phòng thành công với Payment_Method: ${paymentMethod || 'Cash'}`);
      return paymentMethod || 'Cash';
    } catch (error) {
      logger.error(`[DEBUG] Không thể tạo payment record dự phòng: ${error.message}`, {
        stack: error.stack,
        sql: error.sql,
        parameters: error.parameters
      });
    }

    // Trả về giá trị mặc định nếu tất cả phương pháp đều thất bại
    return paymentMethod || 'Cash';
  }
}

// Debug log trước khi export
const bookingServiceInstance = new BookingService();
logger.info('BookingService instance created and getUserBookings method exists:', {
  hasGetUserBookings: typeof bookingServiceInstance.getUserBookings === 'function'
});

// Export instance của class
module.exports = bookingServiceInstance;