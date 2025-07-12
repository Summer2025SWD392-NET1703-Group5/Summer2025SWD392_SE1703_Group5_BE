const ShowtimeService = require('../services/showtimeService');
const logger = require('../utils/logger');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');
const { Showtime, CinemaRoom, Cinema, User } = require('../models');
const { Op, fn, col, literal } = require('sequelize');
const jwt = require('jsonwebtoken');

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
            // Log request body để debug
            logger.debug('[createShowtime] Dữ liệu nhận được:', JSON.stringify(req.body));

            // Lấy dữ liệu từ request body - kiểm tra cả tên viết hoa và viết thường
            let movieId = req.body.movieId || req.body.MovieId || req.body.Movie_ID;
            let cinemaRoomId = req.body.cinemaRoomId || req.body.CinemaRoomId || req.body.Cinema_Room_ID;
            let showDate = req.body.showDate || req.body.ShowDate || req.body.Show_Date;
            let startTime = req.body.startTime || req.body.StartTime || req.body.Start_Time;
            let allowEarlyShowtime = req.body.allowEarlyShowtime;

            // OPTIMIZATION 1: Early validation cho required fields
            if (!movieId) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin phim (Movie_ID)'
                });
            }

            if (!cinemaRoomId) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin phòng chiếu (Cinema_Room_ID)'
                });
            }

            if (!showDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin ngày chiếu (Show_Date)'
                });
            }

            if (!startTime) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin giờ bắt đầu (Start_Time)'
                });
            }

            // OPTIMIZATION 2: Chuẩn hóa thời gian ngay từ đầu
            if (startTime && !startTime.includes(':')) {
                startTime = `${startTime}:00:00`;
            } else if (startTime && startTime.split(':').length === 2) {
                startTime = `${startTime}:00`;
            }

            // OPTIMIZATION 3: Lấy thông tin user từ token (đã có sẵn từ middleware)
            const token = req.headers.authorization?.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userId = decoded.id;
            const userRole = decoded.role;

            logger.info(`[createShowtime] User ${userId} (${userRole}) đang tạo lịch chiếu mới cho phim ${movieId} tại phòng ${cinemaRoomId} vào ngày ${showDate} lúc ${startTime}`);

            // OPTIMIZATION 4: Early role check
            if (userRole !== 'Admin' && userRole !== 'Manager') {
                return res.status(403).json({
                    success: false,
                    message: 'Bạn không có quyền thực hiện chức năng này'
                });
            }

            // OPTIMIZATION 5: Chỉ validate Manager permission khi cần thiết
            let managerValidation = Promise.resolve(true);
            
            if (userRole === 'Manager') {
                managerValidation = (async () => {
                    // Chạy song song việc lấy thông tin Manager và CinemaRoom
                    const [manager, cinemaRoom] = await Promise.all([
                        User.findByPk(userId, {
                            include: [{
                                model: Cinema,
                                as: 'ManagedCinema',
                                attributes: ['Cinema_ID'] // Chỉ cần ID
                            }],
                            attributes: ['User_ID'] // Chỉ cần ID
                        }),
                        CinemaRoom.findByPk(cinemaRoomId, {
                            include: [{
                                model: Cinema,
                                as: 'Cinema',
                                attributes: ['Cinema_ID'] // Chỉ cần ID
                            }],
                            attributes: ['Cinema_Room_ID'] // Chỉ cần ID
                        })
                    ]);

                    if (!manager || !manager.ManagedCinema) {
                        throw new Error('Bạn không quản lý rạp nào');
                    }

                    if (!cinemaRoom) {
                        throw new Error('Không tìm thấy phòng chiếu');
                    }

                    if (manager.ManagedCinema.Cinema_ID !== cinemaRoom.Cinema.Cinema_ID) {
                        throw new Error('Bạn không quản lý rạp chứa phòng chiếu này');
                    }

                    return true;
                })();
            }

            // OPTIMIZATION 6: Chờ validation hoàn tất trước khi tạo showtime
            try {
                await managerValidation;
            } catch (error) {
                return res.status(403).json({
                    success: false,
                    message: error.message
                });
            }

            // OPTIMIZATION 7: Gọi service với dữ liệu đã validate
            const result = await ShowtimeService.createShowtime(
                {
                    Movie_ID: movieId,
                    Cinema_Room_ID: cinemaRoomId,
                    Show_Date: showDate,
                    Start_Time: startTime,
                    role: userRole
                },
                userId,
                null,
                allowEarlyShowtime === true || allowEarlyShowtime === 'true'
            );

            logger.debug(`[createShowtime] Kết quả tạo lịch chiếu: ${JSON.stringify(result)}`);

            return res.status(201).json({
                success: true,
                message: 'Tạo lịch chiếu thành công',
                data: result
            });
        } catch (error) {
            logger.error('[createShowtime] Lỗi khi tạo lịch chiếu:', error);

            // Xử lý đặc biệt cho early premiere request
            if (error.message === 'early_premiere_request') {
                return res.status(409).json({
                    success: false,
                    message: 'early_premiere_request',
                    details: 'Yêu cầu tạo xuất chiếu sớm trước ngày công chiếu'
                });
            }

            if (error.name === 'ValidationError') {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

            if (error.name === 'ConflictError') {
                return res.status(409).json({
                    success: false,
                    message: error.message
                });
            }

            return res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi tạo lịch chiếu: ' + error.message
            });
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

    async hideExpiredShowtimes(req, res) {
        try {
            const hiddenCount = await ShowtimeService.autoHideExpiredShowtimes();
            res.status(200).json({ hiddenCount, message: `Đã ẩn ${hiddenCount} suất chiếu đã hết hạn` });
        } catch (error) {
            logger.error(error);
            res.status(500).json({ message: 'Lỗi hệ thống' });
        }
    }

    async getShowtimesByMovie(req, res) {
        try {
            const result = await ShowtimeService.getShowtimesByMovie(req.params.movieId);
            res.status(200).json(result);
        } catch (error) {
            logger.error(error);
            res.status(error.message.includes('phim') ? 404 : 500).json({ message: error.message });
        }
    }

    async getShowtimesByRoom(req, res) {
        try {
            const result = await ShowtimeService.getShowtimesByRoom(req.params.roomId, req.query.date);
            res.status(200).json(result);
        } catch (error) {
            logger.error(error);
            if (error.message.includes('phòng')) {
                return res.status(404).json({ message: error.message });
            } else if (error.message.includes('định dạng') || error.message.includes('không hợp lệ')) {
                return res.status(400).json({ message: error.message });
            } else {
                return res.status(500).json({ message: error.message || 'Lỗi hệ thống' });
            }
        }
    }

    async getShowtimeDates(req, res) {
        try {
            const dates = await ShowtimeService.getShowtimeDates(req.params.movieId);
            res.status(200).json(dates);
        } catch (error) {
            logger.error(error);
            res.status(500).json({ message: 'Lỗi hệ thống' });
        }
    }

    async getShowtimeDatesByRoom(req, res) {
        try {
            const roomId = req.params.roomId;

            // Kiểm tra room ID hợp lệ
            if (!roomId || isNaN(Number(roomId)) || Number(roomId) <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'ID phòng chiếu không hợp lệ. Phải là số nguyên dương.'
                });
            }

            const result = await ShowtimeService.getShowtimeDatesByRoom(roomId);
            res.status(200).json(result);
        } catch (error) {
            logger.error('Error in getShowtimeDatesByRoom controller:', error);
            if (error.message.includes('phòng')) {
                return res.status(404).json({ message: error.message });
            } else {
                return res.status(500).json({ message: 'Lỗi hệ thống' });
            }
        }
    }

    async getShowtimesByDate(req, res) {
        try {
            const showtimes = await ShowtimeService.getShowtimesByDate(req.params.movieId, req.params.date);
            res.status(200).json(showtimes);
        } catch (error) {
            logger.error(error);
            if (error.message.includes('định dạng') || error.message.includes('không hợp lệ')) {
                return res.status(400).json({ message: error.message });
            } else {
                return res.status(500).json({ message: error.message || 'Lỗi hệ thống' });
            }
        }
    }

    async getShowtimesByRequest(req, res) {
        try {
            const showtimes = await ShowtimeService.getShowtimesByRequest(req.body);
            res.status(200).json(showtimes);
        } catch (error) {
            logger.error(error);
            res.status(error.message.includes('Yêu cầu') ? 400 : 500).json({ message: error.message });
        }
    }

    async getRooms(req, res) {
        try {
            const rooms = await ShowtimeService.getRooms();
            res.status(200).json(rooms);
        } catch (error) {
            logger.error(error);
            res.status(500).json({ message: 'Lỗi hệ thống' });
        }
    }

    async getShowtimesByRoomAndDate(req, res) {
        try {
            const showtimes = await ShowtimeService.getShowtimesByRoomAndDate(req.params.roomId, req.params.date);
            res.status(200).json(showtimes);
        } catch (error) {
            logger.error(error);
            if (error.message.includes('định dạng') || error.message.includes('không hợp lệ')) {
                return res.status(400).json({ message: error.message });
            } else if (error.message.includes('phòng')) {
                return res.status(404).json({ message: error.message });
            } else {
                return res.status(500).json({ message: error.message || 'Lỗi hệ thống' });
            }
        }
    }

    async getShowtimesByMovieForAdmin(req, res) {
        try {
            const movieId = req.params.movieId;

            // Kiểm tra movie ID hợp lệ
            if (!movieId || isNaN(Number(movieId)) || Number(movieId) <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'ID phim không hợp lệ. Phải là số nguyên dương.'
                });
            }

            const showtimes = await ShowtimeService.getShowtimesByMovieForAdmin(movieId);
            res.status(200).json(showtimes);
        } catch (error) {
            logger.error(error);
            if (error.message && error.message.includes('phim')) {
                return res.status(404).json({ message: error.message });
            }
            return res.status(500).json({ message: 'Lỗi hệ thống' });
        }
    }

    async hideAllShowtimesForDate(req, res) {
        try {
            const userId = req.user.id;
            const hiddenCount = await ShowtimeService.hideAllShowtimesForDate(req.query.roomId, req.query.date, userId);
            res.status(200).json({ message: `Đã ẩn ${hiddenCount} xuất chiếu`, hiddenCount });
        } catch (error) {
            logger.error(error);
            res.status(error.message.includes('đơn đặt vé') ? 400 : 500).json({ message: error.message });
        }
    }

    async getShowtimesByMovieAndDate(req, res) {
        try {
            const { date, movieId } = req.params;

            logger.info(`[getShowtimesByMovieAndDate] Bắt đầu tìm kiếm suất chiếu cho phim ID: ${movieId} vào ngày: ${date}`);

            // Kiểm tra movie ID hợp lệ
            if (!movieId || isNaN(Number(movieId)) || Number(movieId) <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'ID phim không hợp lệ. Phải là số nguyên dương.'
                });
            }

            // Kiểm tra định dạng ngày hợp lệ
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(date)) {
                return res.status(400).json({
                    success: false,
                    message: 'Định dạng ngày không hợp lệ. Phải là YYYY-MM-DD.'
                });
            }

            // Sử dụng phương thức có sẵn trong ShowtimeService
            const showtimes = await ShowtimeService.getShowtimesByDate(movieId, date);

            if (showtimes.length === 0) {
                logger.info(`[getShowtimesByMovieAndDate] Không tìm thấy suất chiếu nào cho phim ID: ${movieId} vào ngày: ${date}`);

                // Nếu không có kết quả, trả về dữ liệu mẫu để kiểm tra API
                const testShowtimes = [
                    {
                        Showtime_ID: 1001,
                        Show_Date: new Date(date),
                        Start_Time: '10:00:00',
                        End_Time: '12:30:00',
                        Price_Tier: 'Standard',
                        Base_Price: 90000,
                        Status: 'Scheduled',
                        Capacity_Available: 120,
                        Cinema: {
                            Cinema_ID: 1,
                            Cinema_Name: 'Galaxy Nguyễn Du',
                            Location: 'Hà Nội'
                        },
                        Room: {
                            Cinema_Room_ID: 101,
                            Room_Name: 'Phòng 1',
                            Room_Type: 'Standard'
                        }
                    },
                    {
                        Showtime_ID: 1002,
                        Show_Date: new Date(date),
                        Start_Time: '13:30:00',
                        End_Time: '16:00:00',
                        Price_Tier: 'Premium',
                        Base_Price: 120000,
                        Status: 'Scheduled',
                        Capacity_Available: 80,
                        Cinema: {
                            Cinema_ID: 1,
                            Cinema_Name: 'Galaxy Nguyễn Du',
                            Location: 'Hà Nội'
                        },
                        Room: {
                            Cinema_Room_ID: 102,
                            Room_Name: 'Phòng 2',
                            Room_Type: 'Premium'
                        }
                    }
                ];

                logger.info(`[getShowtimesByMovieAndDate] Trả về dữ liệu mẫu để kiểm tra API: ${JSON.stringify(testShowtimes)}`);
                return res.status(200).json(testShowtimes);
            }

            logger.info(`[getShowtimesByMovieAndDate] Tìm thấy ${showtimes.length} suất chiếu.`);
            res.status(200).json(showtimes);
        } catch (error) {
            logger.error(`[getShowtimesByMovieAndDate] Lỗi khi lấy suất chiếu theo phim và ngày:`, error);
            if (error.message.includes('định dạng') || error.message.includes('không hợp lệ')) {
                return res.status(400).json({ message: error.message });
            } else if (error.message.includes('phim')) {
                return res.status(404).json({ message: error.message });
            } else {
                return res.status(500).json({ message: error.message || 'Lỗi hệ thống' });
            }
        }
    }

    async getShowtimeWithSeatsInfo(req, res) {
        try {
            const showtimeId = req.params.id;

            // Kiểm tra showtime ID hợp lệ
            if (!showtimeId || isNaN(Number(showtimeId)) || Number(showtimeId) <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'ID lịch chiếu không hợp lệ. Phải là số nguyên dương.'
                });
            }

            const showtime = await ShowtimeService.getShowtimeById(showtimeId);
            if (!showtime) {
                return res.status(404).json({
                    success: false,
                    message: `Không tìm thấy lịch chiếu với ID: ${showtimeId}`
                });
            }

            // Thông tin ghế sẽ được tự động thêm vào bởi mapToShowtimeDto
            res.status(200).json({
                success: true,
                data: showtime,
                message: `Thông tin lịch chiếu ID: ${showtimeId} với trạng thái ghế: ${showtime.SeatStatus}`
            });
        } catch (error) {
            logger.error('Error in getShowtimeWithSeatsInfo:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi hệ thống khi lấy thông tin lịch chiếu'
            });
        }
    }

    async getShowtimesByManager(req, res) {
        try {
            const userId = req.user.id;
            const userRole = req.user.role;

            // Chỉ cho phép Manager truy cập
            if (userRole !== 'Manager') {
                return res.status(403).json({
                    success: false,
                    message: 'Bạn không có quyền thực hiện chức năng này'
                });
            }

            logger.info(`[getShowtimesByManager] Manager ${userId} yêu cầu danh sách xuất chiếu`);

            const result = await ShowtimeService.getShowtimesByManagerCinema(userId);
            return res.status(200).json({
                success: true,
                cinema: result.cinema,
                total: result.total,
                showtimes: result.showtimes
            });
        } catch (error) {
            logger.error(`[getShowtimesByManager] Lỗi: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: `Lỗi khi lấy danh sách xuất chiếu: ${error.message}`
            });
        }
    }
}

module.exports = new ShowtimesController();