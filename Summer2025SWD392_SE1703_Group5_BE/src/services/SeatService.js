// src/services/seatService.js
const seatRepository = require('../repositories/SeatRepository');
const { Ticket, SeatLayout, Seat, sequelize } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const pricingService = require('../services/pricingService');

/**
 * Seat Service - Chuyển đổi từ C# SeatService
 * Xử lý logic nghiệp vụ cho entity Seat
 */
class SeatService {
  constructor() {
    this.logger = logger;
  }

  /**
   * Lấy thông tin giá vé từ PricingService
   */
  getTicketPriceByLayoutInfo(roomType, seatType, showDate, startTime) {
    try {
      // Sử dụng calculateTicketPrice để tính giá có tính đến ngày và giờ
      const priceInfo = pricingService.calculateTicketPrice({
        roomType,
        seatType,
        showDate,
        startTime
      });

      return priceInfo.finalPrice;
    } catch (error) {
      this.logger.error(`Error getting ticket price for ${roomType}/${seatType}:`, error);
      return 0;
    }
  }

  /**
   * Lấy sơ đồ ghế ngồi của một suất chiếu - UPDATED FOR SEAT_LAYOUT BASED LOGIC
   * Seats chỉ được tạo khi có booking, sử dụng Seat_Layout làm nguồn chính
   */
  async getSeatMapAsync(showtimeId) {
    try {
      this.logger.info(`[getSeatMapAsync] Bắt đầu lấy sơ đồ ghế cho showtime ${showtimeId}`);
      
      // Lấy thông tin suất chiếu
      const showtime = await seatRepository.getShowtimeWithDetails(showtimeId);

      if (!showtime) {
        this.logger.warn(`Showtime not found with ID: ${showtimeId}`);
        return {
          Showtime_ID: showtimeId,
          Seats: [],
          Movie: {},
          Room: {},
          Movie_Title: "Không xác định",
          Cinema_Room: "Không xác định"
        };
      }

      // Kiểm tra và gán giá trị mặc định
      const movie = showtime.Movie || { Movie_Title: "Không xác định" };
      const cinemaRoom = showtime.CinemaRoom || { Room_Name: "Không xác định" };
      const roomType = cinemaRoom.Room_Type || "2D";

      // Format Start_Time để chỉ lấy giờ HH:MM:SS (loại bỏ prefix ngày)
      let startTime;
      if (showtime.Start_Time instanceof Date) {
        // Sử dụng UTC để tránh timezone conversion
        const hours = String(showtime.Start_Time.getUTCHours()).padStart(2, '0');
        const minutes = String(showtime.Start_Time.getUTCMinutes()).padStart(2, '0');
        const seconds = String(showtime.Start_Time.getUTCSeconds()).padStart(2, '0');
        startTime = `${hours}:${minutes}:${seconds}`;
      } else if (typeof showtime.Start_Time === 'string') {
        // Nếu có format "1970-01-01T10:00:00.000Z", chỉ lấy phần time
        if (showtime.Start_Time.includes('T')) {
          // Lấy phần sau T và trước dấu chấm hoặc Z
          const timePart = showtime.Start_Time.split('T')[1];
          startTime = timePart.split('.')[0].split('Z')[0];
        } else {
          startTime = showtime.Start_Time;
        }
      } else {
        startTime = showtime.Start_Time;
      }
      


      // Format Show_Date để chỉ lấy ngày (YYYY-MM-DD), loại bỏ phần time
      let formattedDate = showtime.Show_Date;
      if (typeof formattedDate === 'string' && formattedDate.includes('T')) {
        formattedDate = formattedDate.split('T')[0];
      } else if (formattedDate instanceof Date) {
        formattedDate = formattedDate.toISOString().split('T')[0];
      }
      
      // DEBUG: Removed để tăng tốc API

      // Lấy layout ghế cho phòng chiếu (NGUỒN CHÍNH)
      const seatLayouts = await SeatLayout.findAll({
        where: {
          Cinema_Room_ID: cinemaRoom.Cinema_Room_ID,
          Is_Active: true
        },
        order: [['Row_Label', 'ASC'], ['Column_Number', 'ASC']]
      });

      if (seatLayouts.length === 0) {
        this.logger.warn(`[getSeatMap] Không tìm thấy sơ đồ ghế cho showtime ID: ${showtimeId}`);
        return {
          Showtime_ID: showtimeId,
          Seats: [],
          Movie: movie,
          Room: cinemaRoom,
          Movie_Title: movie.Movie_Title || "Không xác định",
          Cinema_Room: cinemaRoom.Room_Name || "Không xác định"
        };
      }

      // Lấy giá vé cho từng loại ghế từ PricingService
      const layoutPrices = {};
      for (const layout of seatLayouts) {
        const seatType = layout.Seat_Type || "Thường";
        const price = this.getTicketPriceByLayoutInfo(roomType, seatType, formattedDate, startTime);
        layoutPrices[layout.Layout_ID] = price;
      }

      // Lấy danh sách vé đã đặt và đang giữ cho suất chiếu này (dựa trên Layout_ID)
      const pool = await seatRepository.getConnection();
      const ticketsResult = await pool.request()
        .input('showtimeId', showtimeId)
        .query(`
          SELECT t.Ticket_ID, t.Seat_ID, t.Status as Ticket_Status, 
                 tb.Booking_ID, tb.Status as Booking_Status, tb.User_ID,
                 u.Full_Name as Username, s.Layout_ID,
                 sl.Row_Label, sl.Column_Number, sl.Seat_Type
          FROM ksf00691_team03.Tickets t
          JOIN ksf00691_team03.Ticket_Bookings tb ON t.Booking_ID = tb.Booking_ID
          LEFT JOIN ksf00691_team03.Users u ON tb.User_ID = u.User_ID
          LEFT JOIN ksf00691_team03.Seats s ON t.Seat_ID = s.Seat_ID
          LEFT JOIN ksf00691_team03.Seat_Layout sl ON s.Layout_ID = sl.Layout_ID
          WHERE t.Showtime_ID = @showtimeId
          AND tb.Status IN ('Pending', 'Confirmed')
          AND t.Status IN ('Active', 'Used')
        `);

      // Tạo danh sách layout đã được book/pending
      const bookedLayouts = new Set();
      const pendingLayouts = new Set();
      const layoutBookingInfo = new Map();

      ticketsResult.recordset.forEach(ticket => {
        const layoutId = ticket.Layout_ID;
        if (!layoutId) return;

        const bookingInfo = {
          seat_id: ticket.Seat_ID,
          layout_id: layoutId,
          ticket_id: ticket.Ticket_ID,
          booking_id: ticket.Booking_ID,
          user_id: ticket.User_ID,
          username: ticket.Username,
          row_label: ticket.Row_Label,
          column_number: ticket.Column_Number,
          seat_type: ticket.Seat_Type,
          price: layoutPrices[layoutId] || 0
        };

        if (ticket.Booking_Status === 'Confirmed') {
          bookedLayouts.add(layoutId);
          layoutBookingInfo.set(layoutId, { ...bookingInfo, status: 'Booked' });
        } else if (ticket.Booking_Status === 'Pending') {
          pendingLayouts.add(layoutId);
          layoutBookingInfo.set(layoutId, { ...bookingInfo, status: 'Pending' });
        }
      });

      // Chuyển đổi layout thành seat DTOs
      const seatDtos = seatLayouts.map(layout => {
        let status = 'Available';
        let isBooked = false;
        let isPending = false;

        if (bookedLayouts.has(layout.Layout_ID)) {
          status = 'Booked';
          isBooked = true;
        } else if (pendingLayouts.has(layout.Layout_ID)) {
          status = 'Pending';
          isPending = true;
        }

        const seatType = layout.Seat_Type || 'Thường';
        const price = layoutPrices[layout.Layout_ID] || 0;
        const seatNumber = `${layout.Row_Label}${layout.Column_Number}`;

        return {
          Seat_ID: layout.Layout_ID, // Sử dụng Layout_ID làm Seat_ID virtual
          Layout_ID: layout.Layout_ID,
          Seat_Number: seatNumber,
          Row_Label: layout.Row_Label,
          Column_Number: layout.Column_Number,
          Seat_Type: seatType,
          Status: status,
          Price: price, // ✅ Giá tính toán từ pricingService, không phải từ database
          Showtime_ID: showtimeId,
          IsAvailable: !isBooked && !isPending,
          IsSelected: false,
          IsBooked: isBooked,
          IsPending: isPending,
          Layout: {
            Layout_ID: layout.Layout_ID,
            Cinema_Room_ID: layout.Cinema_Room_ID,
            Row_Label: layout.Row_Label,
            Column_Number: layout.Column_Number,
            Seat_Type: seatType,
            Is_Active: layout.Is_Active,
            Price: price // ✅ Force sử dụng giá tính toán, không dùng layout.Price từ database
          }
        };
      });

      // Tạo danh sách ghế đã đặt và đang giữ cho response
      const bookedSeats = [];
      const pendingSeats = [];

      layoutBookingInfo.forEach((info, layoutId) => {
        if (info.status === 'Booked') {
          bookedSeats.push(info);
        } else if (info.status === 'Pending') {
          pendingSeats.push(info);
        }
      });

      // Tạo DTO cho phim
      const movieInfoDto = {
        Movie_ID: movie.Movie_ID || 0,
        Movie_Name: movie.Movie_Title || "Không xác định",
        Duration: movie.Duration || 0,
        Genre: movie.Genre || "",
        Rating: movie.Rating || "",
        Release_Date: movie.Release_Date || null,
        Poster_URL: movie.Poster_URL || "",
        Trailer_URL: movie.Trailer_URL || "",
        Description: movie.Description || ""
      };

      // Tạo DTO cho phòng chiếu
      const roomDto = {
        Room_ID: cinemaRoom.Cinema_Room_ID || 0,
        Room_Name: cinemaRoom.Room_Name || "Không xác định",
        Capacity: cinemaRoom.Capacity || 0,
        Room_Type: roomType,
        Status: cinemaRoom.Status || ""
      };

      // Tạo response DTO
      const seatMapDto = {
        Showtime_ID: showtimeId,
        Seats: seatDtos,
        Movie: movieInfoDto,
        Room: roomDto,
        Movie_Title: movie.Movie_Title || "Không xác định",
        Cinema_Room: cinemaRoom.Room_Name || "Không xác định",
        Total_Seats: seatDtos.length,
        Available_Seats: seatDtos.filter(s => s.IsAvailable).length,
        Booked_Seats: seatDtos.filter(s => s.IsBooked).length,
        Pending_Seats: seatDtos.filter(s => s.IsPending).length,
        Showtime_Date: formattedDate || null,
        Showtime_Time: startTime || null,
        SeatLayouts: seatLayouts.map(layout => ({
          Layout_ID: layout.Layout_ID,
          Cinema_Room_ID: layout.Cinema_Room_ID,
          Row_Label: layout.Row_Label,
          Column_Number: layout.Column_Number,
          Seat_Type: layout.Seat_Type || "Standard",
          Is_Active: layout.Is_Active,
          Price: layoutPrices[layout.Layout_ID] || 0 // ✅ Chỉ dùng giá tính toán từ pricingService
        })),
        BookedSeats: bookedSeats,
        PendingSeats: pendingSeats
      };

      this.logger.info(`[getSeatMapAsync] Successfully retrieved seat map for showtime ${showtimeId} with ${seatDtos.length} layouts (${seatLayouts.length} total layouts)`);
      return seatMapDto;

    } catch (error) {
      this.logger.error('Error in getSeatMapAsync:', error);
      throw new Error('Lỗi khi lấy sơ đồ ghế ngồi');
    }
  }

  /**
   * Kiểm tra layout có khả dụng không cho một xuất chiếu cụ thể - UPDATED FOR LAYOUT BASED LOGIC
   */
  async isLayoutAvailable(layoutId, showtimeId) {
    try {
      // Kiểm tra xem layout có tồn tại không
      const layout = await SeatLayout.findByPk(layoutId);
      if (!layout || !layout.Is_Active) {
        return false;
      }

      // Kiểm tra xem layout đã được đặt trong suất chiếu này chưa (thông qua seats table)
      const checkPool = await seatRepository.getConnection();
      const existingBooking = await checkPool.request()
        .input('layoutId', layoutId)
        .input('showtimeId', showtimeId)
        .query(`
          SELECT COUNT(*) as BookingCount
          FROM ksf00691_team03.Tickets t
          JOIN ksf00691_team03.Ticket_Bookings tb ON t.Booking_ID = tb.Booking_ID
          JOIN ksf00691_team03.Seats s ON t.Seat_ID = s.Seat_ID
          WHERE s.Layout_ID = @layoutId 
          AND t.Showtime_ID = @showtimeId
          AND tb.Status IN ('Pending', 'Confirmed')
          AND t.Status IN ('Active', 'Used')
        `);

      return existingBooking.recordset[0].BookingCount === 0;
    } catch (error) {
      this.logger.error('[isLayoutAvailable] Error checking layout availability:', error);
      throw error;
    }
  }

  /**
   * Kiểm tra ghế có khả dụng không cho một xuất chiếu cụ thể - LEGACY METHOD (Deprecated)
   * Sử dụng isLayoutAvailable thay thế
   */
  async isSeatAvailable(seatId, showtimeId) {
    try {
      // Kiểm tra xem ghế có tồn tại không
      const seat = await Seat.findByPk(seatId);
      if (!seat || !seat.Is_Active) {
        return false;
      }

      // Kiểm tra xem ghế đã được đặt trong suất chiếu này chưa
      const existingTicket = await Ticket.findOne({
        where: {
          Seat_ID: seatId,
          Showtime_ID: showtimeId,
          Status: { [Op.notIn]: ['Cancelled', 'Expired'] }
        }
      });

      return !existingTicket; // Ghế khả dụng nếu không có vé
    } catch (error) {
      this.logger.error('[isSeatAvailable] Error checking seat availability:', error);
      throw error;
    }
  }

  /**
   * Giữ ghế cho người dùng trong 5 phút - UPDATED FOR LAYOUT BASED LOGIC
   * layoutIds: Array của Layout_ID từ Seat_Layout, không phải Seat_ID
   */
  async holdSeatsAsync(userId, showtimeId, layoutIds) {
    const transaction = await sequelize.transaction();

    try {
      this.logger.info(`[holdSeatsAsync] User ${userId} giữ ${layoutIds.length} ghế cho showtime ${showtimeId}`);
      
      // Kiểm tra xem suất chiếu có tồn tại không
      const showtime = await seatRepository.getShowtimeWithDetails(showtimeId);
      if (!showtime) {
        await transaction.rollback();
        return { success: false, message: 'Suất chiếu không tồn tại' };
      }

      // Kiểm tra tất cả layout có khả dụng không (không bị booking)
      const dbPool = await seatRepository.getConnection();
      for (const layoutId of layoutIds) {
        const existingBooking = await dbPool.request()
          .input('layoutId', layoutId)
          .input('showtimeId', showtimeId)
          .query(`
            SELECT COUNT(*) as BookingCount
            FROM ksf00691_team03.Tickets t
            JOIN ksf00691_team03.Ticket_Bookings tb ON t.Booking_ID = tb.Booking_ID
            JOIN ksf00691_team03.Seats s ON t.Seat_ID = s.Seat_ID
            WHERE s.Layout_ID = @layoutId 
            AND t.Showtime_ID = @showtimeId
            AND tb.Status IN ('Pending', 'Confirmed')
            AND t.Status IN ('Active', 'Used')
          `);

        if (existingBooking.recordset[0].BookingCount > 0) {
          await transaction.rollback();
          return { success: false, message: `Ghế Layout_ID ${layoutId} đã được đặt` };
        }
      }

      // Lấy thông tin layouts
      const layouts = await SeatLayout.findAll({
        where: { 
          Layout_ID: { [Op.in]: layoutIds },
          Is_Active: true 
        }
      });

      if (layouts.length !== layoutIds.length) {
        await transaction.rollback();
        return { success: false, message: 'Một số ghế không tồn tại hoặc không hoạt động' };
      }

      // Lấy thông tin loại phòng
      const roomType = showtime.CinemaRoom?.Room_Type || "2D";

      // Format Start_Time để chỉ lấy giờ HH:MM:SS (loại bỏ prefix ngày)
      let startTime;
      if (showtime.Start_Time instanceof Date) {
        // Sử dụng UTC để tránh timezone conversion
        const hours = String(showtime.Start_Time.getUTCHours()).padStart(2, '0');
        const minutes = String(showtime.Start_Time.getUTCMinutes()).padStart(2, '0');
        const seconds = String(showtime.Start_Time.getUTCSeconds()).padStart(2, '0');
        startTime = `${hours}:${minutes}:${seconds}`;
      } else if (typeof showtime.Start_Time === 'string') {
        // Nếu có format "1970-01-01T10:00:00.000Z", chỉ lấy phần time
        if (showtime.Start_Time.includes('T')) {
          // Lấy phần sau T và trước dấu chấm hoặc Z
          const timePart = showtime.Start_Time.split('T')[1];
          startTime = timePart.split('.')[0].split('Z')[0];
        } else {
          startTime = showtime.Start_Time;
        }
      } else {
        startTime = showtime.Start_Time;
      }
      
      // Format Show_Date để chỉ lấy ngày (YYYY-MM-DD)
      let formattedDate = showtime.Show_Date;
      if (typeof formattedDate === 'string' && formattedDate.includes('T')) {
        formattedDate = formattedDate.split('T')[0];
      } else if (formattedDate instanceof Date) {
        formattedDate = formattedDate.toISOString().split('T')[0];
      }

      // Tính tổng tiền dựa trên layout
      let totalAmount = 0;
      const layoutPrices = {};
      
      layouts.forEach(layout => {
        const seatType = layout.Seat_Type || 'Thường';
        const price = this.getTicketPriceByLayoutInfo(roomType, seatType, formattedDate, startTime);
        layoutPrices[layout.Layout_ID] = price;
        totalAmount += price;
      });

      // Tạo booking mới
      const bookingResult = await dbPool.request()
        .input('User_ID', userId)
        .input('Showtime_ID', showtimeId)
        .input('Booking_Date', new Date())
        .input('Payment_Deadline', new Date(Date.now() + 5 * 60 * 1000)) // 5 phút
        .input('Total_Amount', totalAmount)
        .input('Status', 'Pending')
        .input('Created_By', userId)
        .query(`
          INSERT INTO ksf00691_team03.Ticket_Bookings (User_ID, Showtime_ID, Booking_Date, Payment_Deadline, Total_Amount, Status, Created_By)
          OUTPUT INSERTED.Booking_ID
          VALUES (@User_ID, @Showtime_ID, @Booking_Date, @Payment_Deadline, @Total_Amount, @Status, @Created_By)
        `);

      const bookingId = bookingResult.recordset[0].Booking_ID;

      // Tạo seats từ layouts trước, sau đó tạo tickets
      const createdSeats = [];
      const tickets = [];
      
      for (const layout of layouts) {
        const finalPrice = layoutPrices[layout.Layout_ID] || 0;
        const seatNumber = `${layout.Row_Label}${layout.Column_Number}`;

        // Tạo seat từ layout (chỉ tạo khi có booking)
        const seatResult = await dbPool.request()
          .input('Layout_ID', layout.Layout_ID)
          .input('Seat_Number', seatNumber)
          .input('Is_Active', true)
          .query(`
            INSERT INTO ksf00691_team03.Seats (Layout_ID, Seat_Number, Is_Active)
            OUTPUT INSERTED.*
            VALUES (@Layout_ID, @Seat_Number, @Is_Active)
          `);

        const createdSeat = seatResult.recordset[0];
        createdSeats.push(createdSeat);

        // Tạo ticket cho seat vừa tạo
        const ticketResult = await dbPool.request()
          .input('Booking_ID', bookingId)
          .input('Seat_ID', createdSeat.Seat_ID)
          .input('Showtime_ID', showtimeId)
          .input('Base_Price', finalPrice)
          .input('Discount_Amount', 0)
          .input('Final_Price', finalPrice)
          .input('Status', 'Active')
          .query(`
            INSERT INTO ksf00691_team03.Tickets (Booking_ID, Seat_ID, Showtime_ID, Base_Price, Discount_Amount, Final_Price, Status)
            OUTPUT INSERTED.*
            VALUES (@Booking_ID, @Seat_ID, @Showtime_ID, @Base_Price, @Discount_Amount, @Final_Price, @Status)
          `);

        tickets.push(ticketResult.recordset[0]);
      }

      await transaction.commit();

      // Đặt hẹn giờ để hủy booking sau 5 phút nếu không thanh toán
      setTimeout(async () => {
        try {
          const timeoutPool = await seatRepository.getConnection();
          const booking = await timeoutPool.request()
            .input('bookingId', bookingId)
            .query(`
              SELECT Status FROM ksf00691_team03.Ticket_Bookings WHERE Booking_ID = @bookingId
            `);

          if (booking.recordset.length > 0 && booking.recordset[0].Status === 'Pending') {
            // Cập nhật trạng thái booking thành Expired
            await timeoutPool.request()
              .input('bookingId', bookingId)
              .query(`
                UPDATE ksf00691_team03.Ticket_Bookings 
                SET Status = 'Expired' 
                WHERE Booking_ID = @bookingId AND Status = 'Pending'
              `);

            // Cập nhật trạng thái các vé thành Expired
            await timeoutPool.request()
              .input('bookingId', bookingId)
              .query(`
                UPDATE ksf00691_team03.Tickets 
                SET Status = 'Expired' 
                WHERE Booking_ID = @bookingId AND Status = 'Active'
              `);

            this.logger.info(`[holdSeatsAsync] Automatically expired booking ${bookingId} after 5 minutes`);
          }
        } catch (error) {
          this.logger.error(`[holdSeatsAsync] Error expiring booking ${bookingId}:`, error);
        }
      }, 5 * 60 * 1000); // 5 phút

      return {
        success: true,
        data: {
          booking_id: bookingId,
          seats: layouts.map(layout => ({
            seat_id: createdSeats.find(s => s.Layout_ID === layout.Layout_ID)?.Seat_ID,
            layout_id: layout.Layout_ID,
            seat_type: layout.Seat_Type || 'Thường',
            row_label: layout.Row_Label,
            column_number: layout.Column_Number,
            seat_number: `${layout.Row_Label}${layout.Column_Number}`,
            price: layoutPrices[layout.Layout_ID] || 0
          })),
          total_amount: totalAmount,
          payment_deadline: new Date(Date.now() + 5 * 60 * 1000)
        }
      };

    } catch (error) {
      await transaction.rollback();
      this.logger.error('Error in holdSeatsAsync:', error);
      return { success: false, message: 'Lỗi khi giữ ghế' };
    }
  }

  /**
   * Xác nhận bán ghế đã được giữ - UPDATED FOR LAYOUT BASED LOGIC
   */
  async sellSeatsAsync(userId, bookingId) {
    const transaction = await sequelize.transaction();

    try {
      this.logger.info(`[sellSeatsAsync] User ${userId} xác nhận thanh toán booking ${bookingId}`);
      
      const sellPool = await seatRepository.getConnection();

      // Kiểm tra booking có tồn tại không và thuộc về user hiện tại
      const bookingResult = await sellPool.request()
        .input('bookingId', bookingId)
        .input('userId', userId)
        .query(`
          SELECT * FROM ksf00691_team03.Ticket_Bookings 
          WHERE Booking_ID = @bookingId AND User_ID = @userId
        `);

      if (bookingResult.recordset.length === 0) {
        await transaction.rollback();
        return { success: false, message: 'Không tìm thấy đơn đặt vé' };
      }

      const booking = bookingResult.recordset[0];

      // Kiểm tra trạng thái booking
      if (booking.Status !== 'Pending') {
        await transaction.rollback();
        return { success: false, message: `Đơn đặt vé không ở trạng thái chờ thanh toán (${booking.Status})` };
      }

      // Cập nhật trạng thái booking thành Confirmed
      await sellPool.request()
        .input('bookingId', bookingId)
        .query(`
          UPDATE ksf00691_team03.Ticket_Bookings 
          SET Status = 'Confirmed' 
          WHERE Booking_ID = @bookingId
        `);

      // Lấy danh sách vé với thông tin layout
      const ticketsResult = await sellPool.request()
        .input('bookingId', bookingId)
        .query(`
          SELECT t.*, s.Layout_ID, s.Seat_Number,
                 sl.Row_Label, sl.Column_Number, sl.Seat_Type 
          FROM ksf00691_team03.Tickets t
          JOIN ksf00691_team03.Seats s ON t.Seat_ID = s.Seat_ID
          JOIN ksf00691_team03.Seat_Layout sl ON s.Layout_ID = sl.Layout_ID
          WHERE t.Booking_ID = @bookingId
        `);

      const tickets = ticketsResult.recordset;

      await transaction.commit();

      this.logger.info(`[sellSeatsAsync] Successfully confirmed booking ${bookingId} with ${tickets.length} tickets`);

      return {
        success: true,
        data: {
          booking_id: bookingId,
          total_amount: booking.Total_Amount,
          tickets: tickets.map(ticket => ({
            ticket_id: ticket.Ticket_ID,
            seat_id: ticket.Seat_ID,
            layout_id: ticket.Layout_ID,
            seat_number: ticket.Seat_Number,
            final_price: ticket.Final_Price,
            row_label: ticket.Row_Label,
            column_number: ticket.Column_Number,
            seat_type: ticket.Seat_Type
          }))
        }
      };

    } catch (error) {
      await transaction.rollback();
      this.logger.error('[sellSeatsAsync] Error:', error);
      return { success: false, message: 'Lỗi khi bán ghế' };
    }
  }
}

module.exports = new SeatService();