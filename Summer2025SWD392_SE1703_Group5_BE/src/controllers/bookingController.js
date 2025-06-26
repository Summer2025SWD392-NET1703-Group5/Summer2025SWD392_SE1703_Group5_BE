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

// QUAN TRỌNG: Khởi tạo service instances.
// BẠN PHẢI THAY THẾ BẰNG KHỞI TẠO SERVICE THỰC SỰ
let payOSService;
try {
    const PayOSService = require('../services/payosService');
    payOSService = new PayOSService();
    logger.info('PayOSService initialized successfully');
} catch (error) {
    logger.error('Failed to initialize PayOSService:', error);
    // Fallback service for development
    payOSService = {
        cancelBookingPayment: async (bookingId, userId) => {
            logger.warn(`Using fallback PayOS service for booking ${bookingId}`);
            return {
                success: true,
                message: 'Fallback cancellation (development mode)'
            };
        },
        getBookingPaymentStatus: async (bookingId) => {
            return {
                found: false,
                message: 'Fallback service - no payment info available'
            };
        }
    };
}

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

const GetAllBookings = async (req, res) => {
    const startTime = Date.now(); // Đo thời gian response
    logger.info('GetAllBookings called', { service: 'BookingController' });
    
    try {
        if (!bookingService) {
            return res.status(500).json({ 
                success: false,
                message: "BookingService not available" 
            });
        }

        // OPTIMIZATION 1: Thêm pagination support
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        // OPTIMIZATION 2: Gọi service đã được tối ưu hóa  
        const bookings = await bookingService.getAllBookings();
        
        // OPTIMIZATION 3: Implement pagination ở application layer
        const paginatedBookings = bookings.slice(offset, offset + limit);
        const totalCount = bookings.length;
        const totalPages = Math.ceil(totalCount / limit);

        // OPTIMIZATION 4: Tạo response với metadata
        const responseTime = Date.now() - startTime;
        const responseData = {
            success: true,
            data: paginatedBookings,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalCount: totalCount,
                limit: limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            },
            metadata: {
                responseTime: `${responseTime}ms`,
                dataCount: paginatedBookings.length
            }
        };

        // OPTIMIZATION 5: Disable cache để luôn lấy dữ liệu mới
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        res.status(200).json(responseData);

    } catch (error) {
        const responseTime = Date.now() - startTime;
        
        logger.error('Error in GetAllBookings', {
            error: error.message,
            stack: error.stack,
            responseTime: responseTime,
            service: 'BookingController'
        });

        res.status(500).json({ 
            success: false,
            message: "Lỗi khi lấy danh sách đơn đặt vé: " + error.message,
            metadata: {
                responseTime: `${responseTime}ms`
            }
        });
    }
};

const GetMyBookings = async (req, res) => {
    const startTime = Date.now(); // Đo thời gian response
    logger.info('GetMyBookings called', { service: 'BookingController' });
    
    const userIdFromToken = req.user?.id;
    if (!userIdFromToken) {
        logger.warn('GetMyBookings: User ID not found', { service: 'BookingController' });
        return res.status(401).json({ message: "Không thể xác định người dùng" });
    }

    try {
        // OPTIMIZATION 1: Validate userId ngay từ đầu
        const userId = parseInt(userIdFromToken, 10);
        if (isNaN(userId) || userId <= 0) {
            return res.status(400).json({ 
                message: "ID người dùng không hợp lệ",
                userId: userIdFromToken 
            });
        }

        if (!bookingService) {
            return res.status(500).json({ message: "BookingService not available" });
        }

        // OPTIMIZATION 2: Gọi service đã được tối ưu hóa
        const bookings = await bookingService.getUserBookings(userId);
        
        // OPTIMIZATION 3: Thêm metadata để monitor performance
        const responseTime = Date.now() - startTime;
        const responseData = {
            success: true,
            data: bookings,
            metadata: {
                count: bookings.length,
                responseTime: `${responseTime}ms`,
                userId: userId
            }
        };

        // OPTIMIZATION 4: Log performance metrics
        logger.info(`GetMyBookings completed for user ${userId}`, {
            bookingsCount: bookings.length,
            responseTime: responseTime,
            service: 'BookingController'
        });

        // OPTIMIZATION 5: Disable cache để luôn lấy dữ liệu mới
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        res.status(200).json(responseData);

    } catch (error) {
        const responseTime = Date.now() - startTime;
        
        logger.error('Error in GetMyBookings', {
            userId: userIdFromToken,
            error: error.message,
            stack: error.stack,
            responseTime: responseTime,
            service: 'BookingController'
        });

        // OPTIMIZATION 6: Trả về error response có cấu trúc
        res.status(500).json({ 
            success: false,
            message: "Có lỗi xảy ra khi lấy danh sách đơn đặt vé",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            metadata: {
                responseTime: `${responseTime}ms`,
                userId: userIdFromToken
            }
        });
    }
};

const CreateBooking = async (req, res) => {
    logger.info('CreateBooking called', { service: 'BookingController' });
    const userIdFromToken = req.user?.id;

    if (!userIdFromToken) {
        logger.warn('CreateBooking: User ID not found in token', { service: 'BookingController' });
        return res.status(401).json({ success: false, message: "Không thể xác định người dùng từ token." });
    }

    try {
        const { Showtime_ID, layoutSeatIds, Payment_Method } = req.body;

        if (!Showtime_ID || !layoutSeatIds || !Array.isArray(layoutSeatIds) || layoutSeatIds.length === 0) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin cần thiết hoặc không hợp lệ: Showtime_ID, layoutSeatIds (phải là một mảng và không rỗng).' });
        }
        if (!layoutSeatIds.every(id => typeof id === 'number')) {
            return res.status(400).json({ success: false, message: 'layoutSeatIds phải là một mảng các số (ID của SeatLayout).' });
        }

        const bookingDataForService = {
            Showtime_ID: Showtime_ID,
            layoutSeatIds: layoutSeatIds,
            Payment_Method: Payment_Method || null, // Đặt giá trị mặc định là null nếu không có
        };

        const result = await bookingService.createBooking(bookingDataForService, userIdFromToken);

        // Format thời gian trước khi trả về response
        if (result && result.booking && result.booking.Start_Time) {
            result.booking.Start_Time = formatTimeOnly(result.booking.Start_Time);
        }

        res.status(201).json(result);

    } catch (error) {
        logger.error('Error in CreateBooking', {
            errorName: error.name,
            error: error.message,
            stack: error.stack,
            requestBody: req.body,
            userId: userIdFromToken,
            service: 'BookingController'
        });

        if (error.pendingBookingDetails) {
            return res.status(400).json({
                success: false,
                message: error.message,
                pendingBookingDetails: error.pendingBookingDetails
            });
        }

        // Xử lý lỗi ghế đã đặt
        if (error.name === 'SeatUnavailableError') {
            return res.status(error.statusCode || 409).json({
                success: false,
                message: error.message,
                code: error.code,
                takenSeats: error.takenSeats
            });
        }

        if (error.name === 'SequelizeValidationError' || error.message.toLowerCase().includes('không hợp lệ') || error.message.toLowerCase().includes('thiếu thông tin')) {
            return res.status(400).json({ success: false, message: error.message });
        }
        if (error.message.toLowerCase().includes('không tồn tại') || error.message.toLowerCase().includes('không tìm thấy')) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message.toLowerCase().includes('đã được đặt') || error.message.toLowerCase().includes('xung đột')) {
            return res.status(409).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: "Có lỗi xảy ra khi tạo đơn đặt vé: " + error.message });
    }
};

const GetBookingById = async (req, res) => {
    const bookingId = parseInt(req.params.id, 10);
    logger.info('GetBookingById called', {
        bookingId: bookingId,
        service: 'BookingController'
    });
    const userIdFromToken = req.user?.id;
    const userRole = req.user?.Role;

    if (isNaN(bookingId)) {
        return res.status(400).json({ message: "ID đặt vé không hợp lệ" });
    }
    try {
        if (!bookingService) return res.status(500).json({ message: "BookingService not available" });
        const booking = await bookingService.getBookingDetail(bookingId);
        if (!booking) {
            return res.status(404).json({ message: "Không tìm thấy đặt vé." });
        }
        // Kiểm tra quyền: Admin/Staff hoặc chủ sở hữu (User_ID) hoặc người tạo (Created_By)
        if (userRole !== 'Admin' && userRole !== 'Staff' &&
            booking.User_ID !== userIdFromToken && booking.Created_By !== userIdFromToken) {
            logger.warn(`User ${userIdFromToken} (Role: ${userRole}) attempt to access booking ${bookingId} of user ${booking.User_ID}, created by ${booking.Created_By}`);
            return res.status(403).json({ message: "Bạn không có quyền xem đặt vé này." });
        }
        res.status(200).json(booking);
    } catch (error) {
        logger.error('Error in GetBookingById', {
            bookingId: bookingId,
            error: error.message,
            stack: error.stack,
            service: 'BookingController'
        });
        if (error.name === 'NotFoundError') {
            return res.status(404).json({ message: error.message });
        }
        res.status(500).json({ message: "Có lỗi xảy ra khi lấy thông tin chi tiết đơn đặt vé" });
    }
};

const UpdateBookingStatus = async (req, res) => {
    const bookingId = parseInt(req.params.id, 10);
    const statusUpdateDto = req.body;
    const userIdFromToken = req.user?.id;
    logger.info('UpdateBookingStatus called', {
        bookingId: bookingId,
        userId: userIdFromToken,
        service: 'BookingController'
    });

    if (isNaN(bookingId)) {
        return res.status(400).json({ message: "ID đặt vé không hợp lệ" });
    }
    try {
        if (!bookingService) return res.status(500).json({ message: "BookingService not available" });
        const result = await bookingService.updateBookingStatus(bookingId, statusUpdateDto, userIdFromToken);
        res.status(200).json(result);
    } catch (error) {
        logger.error('Error in UpdateBookingStatus', {
            bookingId: bookingId,
            error: error.message,
            stack: error.stack,
            service: 'BookingController'
        });
        res.status(500).json({ message: "Lỗi khi cập nhật trạng thái đặt vé: " + error.message });
    }
};

const UpdateBookingPayment = async (req, res) => {
    const bookingId = parseInt(req.params.id, 10);
    logger.info('UpdateBookingPayment called', {
        bookingId: bookingId,
        service: 'BookingController'
    });
    const userIdFromToken = req.user?.id;
    if (!userIdFromToken) {
        return res.status(401).json({ message: "Không thể xác định người dùng" });
    }
    if (isNaN(bookingId)) {
        return res.status(400).json({ message: "ID đặt vé không hợp lệ" });
    }
    try {
        if (!bookingService) return res.status(500).json({ message: "BookingService không khả dụng" });

        logger.info(`[DEBUG-CONTROLLER] Gọi bookingService.updateBookingPayment với bookingId=${bookingId}, userId=${userIdFromToken}`);

        // Gọi service để cập nhật thanh toán
        const result = await bookingService.updateBookingPayment(bookingId, userIdFromToken);

        logger.info(`[DEBUG-CONTROLLER] Kết quả từ service: success=${result?.success}, message=${result?.message}`);
        logger.info(`[DEBUG-CONTROLLER] Payment_Method từ service: ${result?.booking?.Payment_Method}`);

        // Kiểm tra kết quả từ service
        if (!result || !result.success) {
            logger.warn(`[DEBUG-CONTROLLER] Kết quả không thành công từ service: ${JSON.stringify(result)}`);
            return res.status(400).json({
                message: result?.message || "Cập nhật thanh toán không thành công"
            });
        }

        // Kiểm tra xem có booking trong kết quả không
        if (!result.booking) {
            logger.error(`[DEBUG-CONTROLLER] Không có booking trong kết quả`);
            return res.status(500).json({
                message: "Không có thông tin đơn đặt vé trong kết quả"
            });
        }

        // Kiểm tra Payment_Method trong kết quả
        if (!result.booking.Payment_Method) {
            logger.warn(`[DEBUG-CONTROLLER] Payment_Method không có trong kết quả, thêm mặc định 'Cash'`);
            result.booking.Payment_Method = 'Cash';
        }

        // Log trước khi gửi response
        logger.info(`[DEBUG-CONTROLLER] Dữ liệu cuối cùng trả về client: ${JSON.stringify({
            success: result.success,
            message: result.message,
            bookingId: result.booking.Booking_ID,
            paymentMethod: result.booking.Payment_Method
        })}`);

        // Trả về kết quả thành công
        res.status(200).json(result);
    } catch (error) {
        logger.error('Error in UpdateBookingPayment', {
            bookingId: bookingId,
            error: error.message || "Không rõ lỗi",
            stack: error.stack,
            service: 'BookingController'
        });

        // Xử lý các loại lỗi cụ thể
        if (error.name === 'NotFoundError') {
            return res.status(404).json({ message: error.message || "Không tìm thấy đơn đặt vé" });
        } else if (error.name === 'UnauthorizedError') {
            return res.status(401).json({ message: error.message || "Không có quyền cập nhật đơn đặt vé" });
        } else if (error.name === 'InvalidOperationError') {
            return res.status(400).json({ message: error.message || "Thao tác không hợp lệ" });
        }

        // Lỗi hệ thống chung
        res.status(500).json({
            message: "Lỗi khi cập nhật thanh toán cho đơn đặt vé",
            error: error.message
        });
    }
};

const CancelBooking = async (req, res) => {
    try {
        // **FIX**: Sử dụng đúng tên parameter từ route
        const bookingId = parseInt(req.params.id, 10); // Không phải req.params.bookingId
        const userId = req.user.userId || req.user.id; // Fallback cho cả 2 trường hợp

        logger.info('CancelBooking called', {
            bookingId: bookingId,
            userId,
            params: req.params, // Debug params
            service: 'BookingController'
        });

        // Validate input
        if (!bookingId || isNaN(bookingId)) {
            return res.status(400).json({
                success: false,
                message: 'ID đơn đặt vé không hợp lệ',
                debug: {
                    receivedId: req.params.id,
                    parsedId: bookingId
                }
            });
        }

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Không thể xác định người dùng',
                debug: {
                    userFromToken: req.user
                }
            });
        }

        // 1. Kiểm tra quyền truy cập booking
        const booking = await TicketBooking.findOne({
            where: { Booking_ID: bookingId },
            attributes: ['Booking_ID', 'User_ID', 'Created_By', 'Status'],
            include: [{
                model: User,
                as: 'User',
                attributes: ['User_ID', 'Full_Name', 'Email']
            }]
        });

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy đơn đặt vé'
            });
        }

        logger.info('Found booking:', {
            bookingId: booking.Booking_ID,
            userId: booking.User_ID,
            status: booking.Status,
            createdBy: booking.Created_By
        });

        // Kiểm tra quyền hủy
        if (booking.User_ID !== userId && booking.Created_By !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Bạn không có quyền hủy đơn đặt vé này',
                debug: {
                    bookingUserId: booking.User_ID,
                    bookingCreatedBy: booking.Created_By,
                    requestUserId: userId
                }
            });
        }

        // Kiểm tra trạng thái booking
        if (booking.Status === 'Cancelled') {
            return res.status(400).json({
                success: false,
                message: 'Đơn đặt vé đã được hủy trước đó'
            });
        }

        if (booking.Status === 'Completed') {
            return res.status(400).json({
                success: false,
                message: 'Không thể hủy đơn đặt vé đã hoàn thành'
            });
        }

        // 2. Kiểm tra và hủy thanh toán PayOS (nếu có)
        let payOSResult = null;
        try {
            // Sử dụng đúng service name
            const paymentStatus = await payOSService.getBookingPaymentStatus(bookingId);
            logger.info('Payment status check result:', {
                found: !!paymentStatus,
                service: 'cinema-booking'
            });

            if (paymentStatus && paymentStatus.found) {
                payOSResult = await payOSService.cancelBookingPayment(bookingId, userId);
                logger.info('PayOS cancellation result:', {
                    bookingId: bookingId,
                    success: payOSResult?.success || false,
                    service: 'BookingController'
                });
            } else {
                payOSResult = {
                    success: true,
                    message: 'Không có giao dịch thanh toán nào cần hủy'
                };
                logger.info('PayOS cancellation successful', {
                    bookingId: bookingId,
                    payOSMessage: payOSResult.message,
                    service: 'BookingController'
                });
            }
        } catch (payOSError) {
            logger.warn('PayOS cancellation failed:', {
                bookingId: bookingId,
                error: payOSError.message,
                service: 'BookingController'
            });
            // Tiếp tục với việc hủy booking ngay cả khi PayOS fail
            payOSResult = {
                success: false,
                message: 'Không thể hủy thanh toán PayOS: ' + payOSError.message
            };
        }

        // 3. Hủy booking trong database
        const cancellationResult = await bookingService.processManualCancellation(
            bookingId,
            userId
        );

        // 4. Trả về kết quả
        return res.status(200).json({
            success: true,
            message: 'Hủy đơn đặt vé thành công',
            data: {
                booking: cancellationResult.data,
                payOS: payOSResult
            }
        });

    } catch (error) {
        logger.error('Error in CancelBooking', {
            bookingId: req.params.id,
            userId: req.user?.userId || req.user?.id,
            error: error.message,
            stack: error.stack,
            service: 'BookingController'
        });

        return res.status(500).json({
            success: false,
            message: error.message || 'Đã xảy ra lỗi trong quá trình hủy đơn đặt vé',
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

const GetBookingsByUserId = async (req, res) => {
    const targetUserId = parseInt(req.params.userId, 10);
    logger.info('GetBookingsByUserId called', {
        targetUserId: targetUserId,
        service: 'BookingController'
    });
    if (isNaN(targetUserId)) {
        return res.status(400).json({ message: "ID người dùng không hợp lệ" });
    }
    try {
        if (!bookingService) return res.status(500).json({ message: "BookingService not available" });
        const bookings = await bookingService.getBookingsByUserId(targetUserId);
        res.status(200).json(bookings);
    } catch (error) {
        logger.error('Error in GetBookingsByUserId', {
            targetUserId: targetUserId,
            error: error.message,
            stack: error.stack,
            service: 'BookingController'
        });
        res.status(500).json({ message: "Lỗi khi lấy đặt vé của người dùng: " + error.message });
    }
};

const GetBookingsByShowtimeId = async (req, res) => {
    const showtimeId = parseInt(req.params.showtimeId, 10);
    logger.info('GetBookingsByShowtimeId called', {
        showtimeId: showtimeId,
        service: 'BookingController'
    });
    if (isNaN(showtimeId)) {
        return res.status(400).json({ message: "ID suất chiếu không hợp lệ" });
    }
    try {
        if (!bookingService) return res.status(500).json({ message: "BookingService not available" });
        const bookings = await bookingService.getBookingsByShowtimeId(showtimeId);
        res.status(200).json(bookings);
    } catch (error) {
        logger.error('Error in GetBookingsByShowtimeId', {
            showtimeId: showtimeId,
            error: error.message,
            stack: error.stack,
            service: 'BookingController'
        });
        res.status(500).json({ message: "Lỗi khi lấy đặt vé theo suất chiếu: " + error.message });
    }
};

const ConfirmPayment = async (req, res) => {
    const bookingId = parseInt(req.params.id, 10);
    const paymentDetails = req.body;
    logger.info('ConfirmPayment called', {
        bookingId: bookingId,
        service: 'BookingController'
    });
    if (isNaN(bookingId)) {
        return res.status(400).json({ message: "ID đặt vé không hợp lệ" });
    }
    try {
        if (!bookingService) return res.status(500).json({ message: "BookingService not available" });
        const result = await bookingService.confirmPayment(bookingId, paymentDetails);
        res.status(200).json(result);
    } catch (error) {
        logger.error('Error in ConfirmPayment', {
            bookingId: bookingId,
            error: error.message,
            stack: error.stack,
            service: 'BookingController'
        });
        res.status(500).json({ message: "Lỗi khi xác nhận thanh toán: " + error.message });
    }
};

async function getFormattedSeatsForBooking(bookingId, localLogger) {
    try {
        const ticketsWithSeats = await Ticket.findAll({
            where: { Booking_ID: bookingId },
            include: [{
                model: Seat,
                as: 'Seat',
                required: true,
                include: [{
                    model: SeatLayout,
                    as: 'SeatLayout',
                    required: true,
                    attributes: ['Row_Label', 'Column_Number']
                }]
            }],
            attributes: []
        });
        return ticketsWithSeats.map(ticket => `${ticket.Seat.SeatLayout.Row_Label}${ticket.Seat.SeatLayout.Column_Number}`);
    } catch (ex) {
        (localLogger || logger).error('Error getting seat info for booking', {
            bookingId: bookingId,
            error: ex.message,
            stack: ex.stack,
            service: 'BookingControllerHelper'
        });
        return [];
    }
}

const SearchBookings = async (req, res) => {
    logger.info('SearchBookings called', { service: 'BookingController' });
    const { customerName, phoneEmail, movieName, showDate, status, paymentMethod } = req.query;
    try {
        const queryOptions = {
            include: [
                { model: User, as: 'User' },
                {
                    model: Showtime, as: 'Showtime', required: true,
                    include: [{ model: Movie, as: 'Movie' }, { model: CinemaRoom, as: 'CinemaRoom' }]
                },
                { model: Payment, as: 'Payments', required: false }
            ],
            where: {}, order: [['Booking_Date', 'DESC']]
        };
        if (customerName) queryOptions.where['$User.Full_Name$'] = { [Op.iLike]: `%${customerName.trim().toLowerCase()}%` };
        if (phoneEmail) {
            const peTerm = `%${phoneEmail.trim().toLowerCase()}%`;
            queryOptions.where[Op.or] = [
                { '$User.Email$': { [Op.iLike]: peTerm } },
                { '$User.Phone_Number$': { [Op.iLike]: peTerm } }
            ];
        }
        if (movieName) queryOptions.where['$Showtime.Movie.Movie_Name$'] = { [Op.iLike]: `%${movieName.trim().toLowerCase()}%` };
        if (showDate) {
            try {
                const parsedDate = new Date(showDate);
                if (!isNaN(parsedDate)) {
                    const startOfDay = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
                    const endOfDay = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate() + 1);
                    queryOptions.where['$Showtime.Show_Date$'] = { [Op.gte]: startOfDay, [Op.lt]: endOfDay };
                }
            } catch (dateError) {
                logger.warn('SearchBookings: Invalid showDate format', {
                    showDate: showDate,
                    error: dateError.message,
                    service: 'BookingController'
                });
            }
        }
        if (status) queryOptions.where.Status = status;

        const bookingsFromDb = await TicketBooking.findAll(queryOptions);
        let results = [];
        for (const b of bookingsFromDb) {
            if (paymentMethod && !b.Payments.some(p => p.Payment_Method === paymentMethod)) continue;
            const formattedSeats = await getFormattedSeatsForBooking(b.Booking_ID, logger);
            results.push({
                Booking_ID: b.Booking_ID,
                CustomerName: b.User?.Full_Name,
                CustomerEmail: b.User?.Email,
                CustomerPhone: b.User?.Phone_Number,
                MovieName: b.Showtime?.Movie?.Movie_Name,
                ShowDate: b.Showtime?.Show_Date,
                StartTime: formatTimeOnly(b.Showtime?.Start_Time),
                RoomName: b.Showtime?.CinemaRoom?.Room_Name,
                Amount: b.Total_Amount,
                Status: b.Status,
                BookingDate: b.Booking_Date,
                PaymentMethod: b.Payments?.sort((p1, p2) => new Date(p2.Transaction_Date) - new Date(p1.Transaction_Date))[0]?.Payment_Method || null,
                Seats: formattedSeats.join(', ')
            });
        }
        res.status(200).json(results);
    } catch (error) {
        logger.error('Error in SearchBookings', {
            error: error.message,
            stack: error.stack,
            service: 'BookingController'
        });
        res.status(500).json({ message: "Lỗi khi tìm kiếm đặt vé: " + error.message });
    }
};

const ExportBookings = async (req, res) => {
    logger.info('ExportBookings called', { service: 'BookingController' });
    try {
        // Simplified query approach, removing potentially problematic options
        const queryOptions = {
            include: [
                {
                    model: User,
                    as: 'User'
                },
                {
                    model: Showtime,
                    as: 'Showtime',
                    include: [
                        { model: Movie, as: 'Movie' },
                        { model: CinemaRoom, as: 'CinemaRoom' }
                    ]
                }
            ],
            order: [['Booking_Date', 'DESC']]
        };

        const bookingsFromDb = await TicketBooking.findAll(queryOptions);
        logger.info(`Found ${bookingsFromDb.length} bookings for export`, { service: 'BookingController' });

        // If there are no bookings, return an empty file
        if (!bookingsFromDb || bookingsFromDb.length === 0) {
            logger.info('No bookings found for export', { service: 'BookingController' });
            return res.status(404).json({ message: "Không có dữ liệu để xuất" });
        }

        // Process bookings for export
        let dataToExport = [];
        for (const booking of bookingsFromDb) {
            try {
                // Get seat information
                let seatInfo = '';
                try {
                    const tickets = await Ticket.findAll({
                        where: { Booking_ID: booking.Booking_ID },
                        include: [
                            {
                                model: Seat,
                                as: 'Seat',
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

                    const seatPositions = tickets
                        .filter(ticket => ticket.Seat?.SeatLayout)
                        .map(ticket => `${ticket.Seat.SeatLayout.Row_Label}${ticket.Seat.SeatLayout.Column_Number}`);

                    seatInfo = seatPositions.join(', ');
                } catch (seatError) {
                    logger.warn(`Error getting seats for booking ${booking.Booking_ID}:`, seatError);
                    seatInfo = 'Seat info unavailable';
                }

                // Convert dates to locale string to avoid issues
                const showDate = booking.Showtime?.Show_Date
                    ? new Date(booking.Showtime.Show_Date).toLocaleDateString()
                    : '';

                // Create data row
                dataToExport.push({
                    Booking_ID: String(booking.Booking_ID || ''),
                    CustomerName: String(booking.User?.Full_Name || ''),
                    CustomerEmail: String(booking.User?.Email || ''),
                    MovieName: String(booking.Showtime?.Movie?.Movie_Name || ''),
                    ShowDate: showDate,
                    Status: String(booking.Status || ''),
                    Seats: seatInfo
                });
            } catch (bookingError) {
                logger.error(`Error processing booking ${booking.Booking_ID} for export:`, bookingError);
                // Continue with next booking
            }
        }

        // Generate CSV
        if (dataToExport.length === 0) {
            return res.status(404).json({ message: "Không thể xuất dữ liệu do lỗi xử lý" });
        }

        // Create CSV header
        const csvHeader = Object.keys(dataToExport[0]).join(',') + '\r\n';

        // Create CSV rows
        const csvBody = dataToExport.map(row =>
            Object.values(row).map(value => {
                const valStr = String(value || ''); // Ensure value is a string
                if (valStr.includes(',') || valStr.includes('"') || valStr.includes('\n')) {
                    return `"${valStr.replace(/"/g, '""')}"`;
                }
                return valStr;
            }).join(',')
        ).join('\r\n');

        // Combine header and body
        const csvContent = csvHeader + csvBody;

        // Set headers and send response
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="bookings_export.csv"');
        res.status(200).send(csvContent);

    } catch (error) {
        logger.error('Error in ExportBookings', {
            error: error.message,
            stack: error.stack,
            service: 'BookingController'
        });
        res.status(500).json({ message: "Lỗi khi xuất dữ liệu đặt vé: " + error.message });
    }
};

const CheckPendingBooking = async (req, res) => {
    logger.info('CheckPendingBooking called', { service: 'BookingController' });
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
    }
    const userIdInt = parseInt(userId, 10);
    if (isNaN(userIdInt)) {
        return res.status(400).json({ message: "User ID không hợp lệ." });
    }
    try {
        if (!bookingService) return res.status(500).json({ message: "BookingService not available" });
        const pendingBooking = await bookingService.checkUserPendingBookings(userIdInt);
        if (pendingBooking) {
            res.status(200).json({ canCreateNewBooking: false, pendingBooking: pendingBooking, message: "Bạn đang có đơn đặt vé chưa thanh toán." });
        } else {
            res.status(200).json({ canCreateNewBooking: true, pendingBooking: null });
        }
    } catch (error) {
        logger.error('Error in CheckPendingBooking', {
            userId: userId,
            error: error.message,
            stack: error.stack,
            service: 'BookingController'
        });
        res.status(500).json({ message: "Lỗi khi kiểm tra đặt vé chờ: " + error.message });
    }
};

const CheckPendingBookingForStaff = async (req, res) => {
    logger.info('CheckPendingBookingForStaff called', { service: 'BookingController' });
    const staffId = req.user?.id;
    const targetUserId = req.query.userId;
    if (!targetUserId) {
        return res.status(400).json({ message: "Vui lòng cung cấp User ID của khách hàng." });
    }
    const targetUserIdInt = parseInt(targetUserId, 10);
    if (isNaN(targetUserIdInt)) {
        return res.status(400).json({ message: "User ID của khách hàng không hợp lệ." });
    }
    try {
        if (!bookingService) return res.status(500).json({ message: "BookingService not available" });
        const pendingBooking = await bookingService.checkPendingBookingForStaff(staffId, targetUserIdInt);
        if (pendingBooking) {
            res.status(200).json({ canCreateNewBooking: false, pendingBooking: pendingBooking, message: "Khách hàng đang có đơn đặt vé chưa hoàn tất." });
        } else {
            res.status(200).json({ canCreateNewBooking: true, pendingBooking: null });
        }
    } catch (error) {
        logger.error('Error in CheckPendingBookingForStaff', {
            staffId: staffId,
            targetUserId: targetUserIdInt,
            error: error.message,
            stack: error.stack,
            service: 'BookingController'
        });
        res.status(500).json({ message: "Lỗi khi kiểm tra đặt vé chờ cho khách hàng: " + error.message });
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