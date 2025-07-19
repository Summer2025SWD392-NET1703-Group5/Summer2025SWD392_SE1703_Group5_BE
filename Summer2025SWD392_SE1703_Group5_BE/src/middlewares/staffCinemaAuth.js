/**
 * Middleware kiểm tra quyền truy cập rạp phim cho Staff
 * Staff chỉ được thao tác với dữ liệu của rạp mình được phân công
 */


const { User, Cinema } = require('../models');
const logger = require('../utils/logger');


/**
 * Middleware kiểm tra Staff chỉ được truy cập vé của rạp được phân công
 * Sử dụng cho các API liên quan đến ticket scanning
 */
const authorizeStaffCinema = () => {
    return async (req, res, next) => {
        try {
            console.log("[authorizeStaffCinema] Checking staff cinema authorization...");


            // Admin có tất cả quyền
            if (req.user.role === 'Admin') {
                console.log("[authorizeStaffCinema] User is Admin, granting full access");
                return next();
            }


            // Manager có quyền truy cập rạp được phân công
            if (req.user.role === 'Manager') {
                const manager = await User.findByPk(req.user.id);
                if (manager && manager.Cinema_ID) {
                    req.staffCinemaId = manager.Cinema_ID;
                    console.log(`[authorizeStaffCinema] Manager authorized for cinema: ${manager.Cinema_ID}`);
                    return next();
                }
            }


            // Chỉ Staff mới cần kiểm tra thêm
            if (req.user.role !== 'Staff') {
                console.log("[authorizeStaffCinema] User is not Staff/Manager/Admin, denying access");
                return res.status(403).json({
                    success: false,
                    message: 'Bạn không có quyền thực hiện thao tác này'
                });
            }


            // Lấy thông tin Staff từ database để kiểm tra Cinema_ID
            const staff = await User.findByPk(req.user.id);


            if (!staff) {
                console.log("[authorizeStaffCinema] Staff not found in database");
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy thông tin nhân viên'
                });
            }


            // Kiểm tra Staff có được phân công rạp không
            if (!staff.Cinema_ID) {
                console.log("[authorizeStaffCinema] Staff not assigned to any cinema");
                return res.status(403).json({
                    success: false,
                    message: 'Bạn chưa được phân công làm việc tại rạp nào. Vui lòng liên hệ Quản lý.'
                });
            }


            // Lưu Cinema_ID của staff vào request để sử dụng trong controller/service
            req.staffCinemaId = staff.Cinema_ID;
           
            console.log(`[authorizeStaffCinema] Staff authorized for cinema: ${staff.Cinema_ID}`);
            next();


        } catch (error) {
            console.error("[authorizeStaffCinema] Error:", error);
            logger.error(`[authorizeStaffCinema] Error: ${error.message}`, { error });
            res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi xác thực quyền truy cập rạp phim'
            });
        }
    };
};


/**
 * Middleware kiểm tra ticket có thuộc rạp của staff không
 * Sử dụng cho API scan ticket cụ thể
 */
const validateTicketCinema = () => {
    return async (req, res, next) => {
        try {
            // Admin có tất cả quyền
            if (req.user.role === 'Admin') {
                return next();
            }


            // Nếu không có staffCinemaId (từ middleware trước), skip validation
            if (!req.staffCinemaId) {
                return next();
            }


            const { ticketCode } = req.params;
            if (!ticketCode) {
                return res.status(400).json({
                    success: false,
                    message: 'Mã vé không được cung cấp'
                });
            }


            // Kiểm tra vé có thuộc rạp của staff không
            const { Ticket, TicketBooking, Showtime, CinemaRoom, Cinema } = require('../models');
           
            const ticket = await Ticket.findOne({
                where: { Ticket_Code: ticketCode },
                include: [{
                    model: TicketBooking,
                    as: 'TicketBooking',
                    include: [{
                        model: Showtime,
                        as: 'Showtime',
                        include: [{
                            model: CinemaRoom,
                            as: 'CinemaRoom',
                            include: [{
                                model: Cinema,
                                as: 'Cinema'
                            }]
                        }]
                    }]
                }]
            });


            if (!ticket) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy vé'
                });
            }


            const ticketCinemaId = ticket.TicketBooking?.Showtime?.CinemaRoom?.Cinema?.Cinema_ID;
           
            if (!ticketCinemaId) {
                console.error("[validateTicketCinema] Cannot determine ticket cinema ID");
                return res.status(500).json({
                    success: false,
                    message: 'Không thể xác định rạp phim của vé'
                });
            }


            // Kiểm tra vé có thuộc rạp của staff không
            if (ticketCinemaId !== req.staffCinemaId) {
                console.log(`[validateTicketCinema] Access denied: Staff cinema ${req.staffCinemaId}, Ticket cinema ${ticketCinemaId}`);
                return res.status(403).json({
                    success: false,
                    message: 'Bạn chỉ được phép quét vé của rạp mình được phân công'
                });
            }


            console.log(`[validateTicketCinema] Ticket validation passed for cinema: ${ticketCinemaId}`);
            next();


        } catch (error) {
            console.error("[validateTicketCinema] Error:", error);
            logger.error(`[validateTicketCinema] Error: ${error.message}`, { error });
            res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi kiểm tra quyền truy cập vé'
            });
        }
    };
};


module.exports = {
    authorizeStaffCinema,
    validateTicketCinema
};



