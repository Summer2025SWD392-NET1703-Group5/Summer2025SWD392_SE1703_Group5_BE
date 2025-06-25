const { Op } = require('sequelize');
const {
    User,
    TicketBooking,
    Showtime,
    Movie,
    CinemaRoom,
    Payment,
    BookingHistory,
    Ticket,
    Seat,
    SeatLayout
} = require('../models');
const bookingService = require('../services/bookingService');
const PayOSService = require('../services/payosService');
const logger = require('../utils/logger');


// Hàm hỗ trợ format thời gian (trả về chỉ HH:MM:SS)
const formatTimeOnly = (timeString) => {
    if (!timeString) return null;


    // Nếu có chứa 'T' (định dạng ISO), trích xuất phần giờ
    if (typeof timeString === 'string' && timeString.includes('T')) {
        return timeString.substring(11, 19); // Lấy HH:mm:ss
    }


    // Nếu là đối tượng Date
    if (timeString instanceof Date) {
        return timeString.toTimeString().substring(0, 8); // Lấy HH:MM:SS
    }


    // Nếu đã là định dạng giờ HH:MM:SS
    if (typeof timeString === 'string' && /^\d{2}:\d{2}:\d{2}/.test(timeString)) {
        return timeString;
    }


    return timeString;
};





/**
 * @typedef {object} DebugTestDTO
 * @property {string} testMessage - This is a test message.
 * @property {number} testNumber - This is a test number.
 */


// --- DTOs (JSDoc from original file) ---
/*
/**
 * @typedef {object} SeatSelectionDTO
 * @property {string} rowLabel - Nhãn hàng ghế, ví dụ: "A", "B", "C"
 * @property {number} columnNumber - Số thứ tự cột ghế, ví dụ: 1, 2, 3
 */


/**
 * @typedef {object} BookingRequestDTO
 * @property {number} showtimeId - ID của suất chiếu.
 * @property {Array<number>} layoutSeatIds - Danh sách các ID của SeatLayout được chọn.
 * @property {string} paymentMethod - Phương thức thanh toán (ví dụ: "CreditCard", "MoMo", "VNPay").
 */


/**
 * @typedef {object} BookingResponseDTO
 * @property {number} Booking_ID
 * @property {number} User_ID
 * @property {string} User_Name
 * @property {number} Showtime_ID
 * @property {string} Movie_Name
 * @property {Date} Show_Date
 * @property {string} Start_Time
 * @property {string} Cinema_Room_Name
 * @property {Array<object>} Seats
 * @property {number} Total_Amount
 * @property {string} Status
 * @property {Date} Booking_Date
 * @property {string} [Payment_URL]
 * @property {string} [Payment_Method]
 * @property {string} [Notes]
 */


/**
 * @typedef {object} BookingHistoryDTO
 * @property {number} Booking_History_ID
 * @property {number} Booking_ID
 * @property {Date} Date
 * @property {string} Status
 * @property {string} Notes
 */


/**
 * @typedef {object} BookingSearchResponseDTO
 * @property {number} Booking_ID
 * @property {string} [CustomerName]
 * @property {string} [CustomerEmail]
 * @property {string} [CustomerPhone]
 * @property {string} MovieName
 * @property {Date} ShowDate
 * @property {string} StartTime
 * @property {string} RoomName
 * @property {number} Amount
 * @property {string} Status
 * @property {Date} BookingDate
 * @property {string} [PaymentMethod]
 * @property {string} Seats
 */


// --- Controller Methods ---





const GetMyBookings = async (req, res) => {
    logger.info('GetMyBookings called', { service: 'BookingController' });
    const userIdFromToken = req.user?.id;
    if (!userIdFromToken) {
        logger.warn('GetMyBookings: User ID not found', { service: 'BookingController' });
        return res.status(401).json({ message: "Không thể xác định người dùng" });
    }
    try {
        if (!bookingService) return res.status(500).json({ message: "BookingService not available" });
        const bookings = await bookingService.getUserBookings(userIdFromToken);
        res.status(200).json(bookings);
    } catch (error) {
        logger.error('Error in GetMyBookings', {
            userId: userIdFromToken,
            error: error.message,
            stack: error.stack,
            service: 'BookingController'
        });
        res.status(500).json({ message: "Có lỗi xảy ra khi lấy danh sách đơn đặt vé" });
    }
};





module.exports = {
    GetAllBookings,
    GetMyBookings,
    CreateBooking,
    GetBookingById,
    UpdateBookingStatus,
    UpdateBookingPayment,
    CancelBooking,
    GetBookingsByUserId,
    GetBookingsByShowtimeId,
    ConfirmPayment,
    SearchBookings,
    ExportBookings,
    CheckPendingBooking,
    CheckPendingBookingForStaff
};

