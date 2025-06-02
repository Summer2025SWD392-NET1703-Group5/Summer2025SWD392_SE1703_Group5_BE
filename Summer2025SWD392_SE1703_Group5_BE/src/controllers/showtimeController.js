const ShowtimeService = require('../services/showtimeService');
const logger = require('../utils/logger');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');


class ShowtimesController {
    async getShowtimes(req, res) {
        try {
            const showtimes = await ShowtimeService.getAllShowtimes();
            res.status(200).json(showtimes);
        } catch (error) {
            logger.error(error);
            res.status(500).json({ message: 'Lỗi hệ thống' });
        }
    }


    async getShowtime(req, res) {
        try {
            const showtime = await ShowtimeService.getShowtimeById(req.params.id);
            if (!showtime) return res.status(404).json({ message: `Không tìm thấy lịch chiếu ID: ${req.params.id}` });
            res.status(200).json(showtime);
        } catch (error) {
            logger.error(error);
            res.status(500).json({ message: 'Lỗi hệ thống' });
        }
    }


    async createShowtime(req, res) {
        try {
            if (!req.body) return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });


            // Log chi tiết thông tin user từ token
            logger.info(`[createShowtime] User data from token:`, JSON.stringify(req.user));


            // Kiểm tra cả hai trường hợp: req.user.role và req.user.Role
            const userRole = req.user.role || req.user.Role;
            const userId = req.user.id || req.user.userId || req.user.User_ID;


            logger.info(`[createShowtime] Detected role: ${userRole}, User ID: ${userId}`);


            // Nếu user là Manager, kiểm tra phòng chiếu có thuộc rạp phim họ quản lý không
            if (userRole === 'Manager') {
                try {
                    // Lấy thông tin Manager trực tiếp từ database
                    const { User } = require('../models');
                    const manager = await User.findByPk(userId);


                    if (!manager) {
                        logger.error(`[createShowtime] Không tìm thấy Manager với ID: ${userId}`);
                        return res.status(404).json({
                            message: 'Không tìm thấy thông tin Manager'
                        });
                    }


                    logger.info(`[createShowtime] Thông tin Manager:`, {
                        id: manager.User_ID,
                        email: manager.Email,
                        role: manager.Role,
                        cinemaId: manager.Cinema_ID
                    });


                    if (!manager.Cinema_ID) {
                        logger.error(`[createShowtime] Manager ${userId} chưa được phân công rạp phim`);
                        return res.status(403).json({
                            message: 'Bạn chưa được phân công quản lý rạp phim nào'
                        });
                    }


                    // Lấy thông tin phòng chiếu từ request
                    const { Cinema_Room_ID } = req.body;
                    if (!Cinema_Room_ID) {
                        return res.status(400).json({
                            message: 'ID phòng chiếu không được cung cấp'
                        });
                    }


                    // Kiểm tra phòng chiếu có thuộc rạp phim Manager quản lý không
                    const { CinemaRoom } = require('../models');
                    const cinemaRoom = await CinemaRoom.findByPk(Cinema_Room_ID);


                    if (!cinemaRoom) {
                        logger.error(`[createShowtime] Không tìm thấy phòng chiếu ID: ${Cinema_Room_ID}`);
                        return res.status(404).json({
                            message: 'Không tìm thấy phòng chiếu'
                        });
                    }


                    logger.info(`[createShowtime] Phòng chiếu:`, {
                        roomId: cinemaRoom.Cinema_Room_ID,
                        roomName: cinemaRoom.Room_Name,
                        cinemaId: cinemaRoom.Cinema_ID
                    });


                    if (cinemaRoom.Cinema_ID !== manager.Cinema_ID) {
                        logger.error(`[createShowtime] Phòng ${Cinema_Room_ID} thuộc rạp ${cinemaRoom.Cinema_ID}, không phải rạp ${manager.Cinema_ID} mà Manager quản lý`);
                        return res.status(403).json({
                            message: 'Bạn không có quyền quản lý phòng chiếu này'
                        });
                    }


                    logger.info(`[createShowtime] Manager ${userId} tạo lịch chiếu cho phòng ${Cinema_Room_ID} thuộc rạp ${manager.Cinema_ID}`);
                } catch (error) {
                    logger.error(`[createShowtime] Lỗi khi kiểm tra quyền Manager:`, error);
                    return res.status(500).json({
                        message: 'Đã xảy ra lỗi khi xác thực quyền Manager'
                    });
                }
            }


            const id = await ShowtimeService.createShowtime(req.body, userId);
            res.status(201).json({ id });
        } catch (error) {
            logger.error(error);
            res.status(error.message.includes('xuất chiếu') ? 400 : 500).json({ message: error.message });
        }
    }

    async updateShowtime(req, res) {
        try {
            if (!req.body) return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
            const userId = req.user.id;
            const result = await ShowtimeService.updateShowtime(req.params.id, req.body, userId);
            if (!result) return res.status(404).json({ message: `Không tìm thấy lịch chiếu ID: ${req.params.id}` });
            res.status(200).json(req.body);
        } catch (error) {
            logger.error(error);
            res.status(error.message.includes('xuất chiếu') ? 400 : 500).json({ message: error.message });
        }
    }


    async hideShowtime(req, res) {
        try {
            const userId = req.user.id;
            const result = await ShowtimeService.hideShowtime(req.params.id, userId);
            if (!result) return res.status(404).json({ message: `Không tìm thấy lịch chiếu ID: ${req.params.id}` });
            res.status(200).json({ message: `Lịch chiếu ID: ${req.params.id} đã được ẩn thành công` });
        } catch (error) {
            logger.error(error);
            res.status(error.message.includes('đơn đặt vé') ? 400 : 500).json({ message: error.message });
        }
    }

}
module.exports = new ShowtimesController();


