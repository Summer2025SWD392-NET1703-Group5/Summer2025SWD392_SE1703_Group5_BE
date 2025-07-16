'use strict';

const cinemaService = require('../services/cinemaService');
const logger = require('../utils/logger');
const CinemaRepository = require('../repositories/CinemaRepository');
const { User } = require('../models');

class CinemaController {
    /**
     * Tạo rạp phim mới
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async createCinema(req, res) {
        try {
            logger.info(`CinemaController.createCinema called with data:`, req.body);

            
            const { Cinema_ID, Phone_Number, Email, ...validCinemaData } = req.body;

            
            if (Phone_Number || Email) {
                logger.info(`CinemaController.createCinema: Bỏ qua Phone_Number và Email vì sẽ được cập nhật khi gán Manager`);
            }

            
            const result = await cinemaService.createCinema(validCinemaData);
            res.status(201).json(result);
        } catch (error) {
            logger.error(`Lỗi trong CinemaController.createCinema:`, error);
            res.status(500).json({
                success: false,
                message: error.message || 'Đã xảy ra lỗi khi tạo rạp phim'
            });
        }
    }

    /**
     * Lấy thông tin rạp phim theo ID
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async getCinemaById(req, res) {
        try {
            const { id } = req.params;
            const cinemaId = parseInt(id, 10);

            if (isNaN(cinemaId) || cinemaId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'ID rạp phim không hợp lệ'
                });
            }

            logger.info(`CinemaController.getCinemaById called with ID: ${cinemaId}`);
            const result = await cinemaService.getCinemaById(cinemaId);
            res.status(200).json(result);
        } catch (error) {
            logger.error(`Lỗi trong CinemaController.getCinemaById:`, error);

            if (error.message === 'Không tìm thấy rạp phim') {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: error.message || 'Đã xảy ra lỗi khi lấy thông tin rạp phim'
            });
        }
    }

    /**
     * Lấy danh sách tất cả các rạp phim
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async getAllCinemas(req, res) {
        try {
            logger.info('CinemaController.getAllCinemas called');
            const result = await cinemaService.getAllCinemas();

            
            if (!result.data || result.data.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy rạp phim nào trong hệ thống'
                });
            }

            res.status(200).json(result);
        } catch (error) {
            logger.error('Lỗi trong CinemaController.getAllCinemas:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Đã xảy ra lỗi khi lấy danh sách rạp phim'
            });
        }
    }

    /**
     * Lấy danh sách các rạp phim đang hoạt động
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async getActiveCinemas(req, res) {
        try {
            logger.info('CinemaController.getActiveCinemas called');
            const result = await cinemaService.getActiveCinemas();

            
            if (!result.data || result.data.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy rạp phim nào đang hoạt động'
                });
            }

            res.status(200).json(result);
        } catch (error) {
            logger.error('Lỗi trong CinemaController.getActiveCinemas:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Đã xảy ra lỗi khi lấy danh sách rạp phim đang hoạt động'
            });
        }
    }

    /**
     * Cập nhật thông tin rạp phim
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async updateCinema(req, res) {
        try {
            const { id } = req.params;
            const cinemaId = parseInt(id, 10);

            if (isNaN(cinemaId) || cinemaId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'ID rạp phim không hợp lệ'
                });
            }

           
            logger.info(`CinemaController.updateCinema called for ID: ${cinemaId} by role: ${req.user.role} with body:`, req.body);

            
            if (req.user.role === 'Manager' && req.body.Email !== undefined) {
                
                const cinema = await CinemaRepository.findById(cinemaId);
                if (cinema && req.body.Email.toLowerCase() !== cinema.Email.toLowerCase()) {
                    return res.status(403).json({
                        success: false,
                        message: 'Managers không có quyền thay đổi email của rạp phim.'
                    });
                }
            }

            const result = await cinemaService.updateCinema(cinemaId, req.body, req.user);
            res.status(200).json(result);
        } catch (error) {
            logger.error(`Lỗi trong CinemaController.updateCinema:`, error);

            if (error.message === 'Không tìm thấy rạp phim') {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: error.message || 'Đã xảy ra lỗi khi cập nhật rạp phim'
            });
        }
    }

    /**
     * Xóa mềm rạp phim
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async deleteCinema(req, res) {
        try {
            const { id } = req.params;
            const cinemaId = parseInt(id, 10);

            if (isNaN(cinemaId) || cinemaId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'ID rạp phim không hợp lệ'
                });
            }

            logger.info(`CinemaController.deleteCinema (soft delete) called for ID: ${cinemaId}`);
            const result = await cinemaService.deleteCinema(cinemaId);
            res.status(200).json(result);
        } catch (error) {
            logger.error(`Lỗi trong CinemaController.deleteCinema:`, error);

            if (error.message === 'Không tìm thấy rạp phim' || error.message === 'Rạp phim đã được xóa') {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            
            if (error.message.includes('nhân viên đang được phân công')) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

            if (error.message.includes('Không thể xóa rạp phim có phòng chiếu')) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: error.message || 'Đã xảy ra lỗi khi xóa rạp phim'
            });
        }
    }

    /**
     * Lấy danh sách rạp phim theo thành phố
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async getCinemasByCity(req, res) {
        try {
            const { city } = req.params;

            if (!city) {
                return res.status(400).json({
                    success: false,
                    message: 'Thành phố không được để trống'
                });
            }

            
            if (city === '0' || /^\d+$/.test(city)) {
                return res.status(400).json({
                    success: false,
                    message: 'Tên thành phố không hợp lệ'
                });
            }

            
            if (city.length < 2) {
                return res.status(400).json({
                    success: false,
                    message: 'Tên thành phố phải có ít nhất 2 ký tự'
                });
            }

            logger.info(`CinemaController.getCinemasByCity called for city: ${city}`);
            const result = await cinemaService.getCinemasByCity(city);

            
            if (!result.data || result.data.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: `Không tìm thấy rạp phim nào tại thành phố ${city}`
                });
            }

            res.status(200).json(result);
        } catch (error) {
            logger.error(`Lỗi trong CinemaController.getCinemasByCity:`, error);
            res.status(500).json({
                success: false,
                message: error.message || 'Đã xảy ra lỗi khi lấy danh sách rạp phim theo thành phố'
            });
        }
    }

    /**
     * Lấy danh sách các thành phố có rạp phim
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async getAllCities(req, res) {
        try {
            logger.info('CinemaController.getAllCities called');
            const result = await cinemaService.getAllCities();

            
            if (!result.data || result.data.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy thành phố nào có rạp phim'
                });
            }

            res.status(200).json(result);
        } catch (error) {
            logger.error('Lỗi trong CinemaController.getAllCities:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Đã xảy ra lỗi khi lấy danh sách thành phố'
            });
        }
    }

    /**
     * Tạo phòng chiếu mới cho rạp phim
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async createCinemaRoom(req, res) {
        try {
           
            let parsedCinemaId;
            const userRole = req.user.role || req.user.Role;
            const userId = req.user.id || req.user.userId || req.user.User_ID;

            logger.info(`[createCinemaRoom] Detected role: ${userRole}, User ID: ${userId}`);

            if (userRole === 'Manager') {
                
                const { User } = require('../models');
                const manager = await User.findByPk(userId);

                if (!manager || !manager.Cinema_ID) {
                    logger.warn(`[createCinemaRoom] Manager ${userId} chưa được phân công rạp phim`);
                    return res.status(403).json({
                        success: false,
                        message: 'Bạn chưa được phân công quản lý rạp phim nào'
                    });
                }

                
                const requestedCinemaId = parseInt(req.params.cinemaId, 10);
                if (!isNaN(requestedCinemaId) && requestedCinemaId !== manager.Cinema_ID) {
                    logger.warn(`[createCinemaRoom] Manager ${userId} cố tạo phòng cho rạp ${requestedCinemaId} nhưng chỉ quản lý rạp ${manager.Cinema_ID}`);
                    return res.status(403).json({
                        success: false,
                        message: `Bạn chỉ có thể tạo phòng chiếu cho rạp mà bạn quản lý (ID: ${manager.Cinema_ID})`
                    });
                }

                parsedCinemaId = manager.Cinema_ID;
                logger.info(`[createCinemaRoom] Manager ${userId} tạo phòng cho rạp ID: ${parsedCinemaId}`);
            } else {
               
                parsedCinemaId = parseInt(req.params.cinemaId, 10);

                if (isNaN(parsedCinemaId) || parsedCinemaId <= 0) {
                    logger.error(`[createCinemaRoom] ID rạp phim không hợp lệ: ${req.params.cinemaId}`);
                    return res.status(400).json({
                        success: false,
                        message: 'ID rạp phim không hợp lệ'
                    });
                }

                logger.info(`[createCinemaRoom] Admin ${userId} tạo phòng cho rạp ID: ${parsedCinemaId}`);
            }

            logger.info(`CinemaController.createCinemaRoom called for cinema ID: ${parsedCinemaId} with body:`, req.body);
            const result = await cinemaService.createCinemaRoom(parsedCinemaId, req.body);
            res.status(201).json(result);
        } catch (error) {
            logger.error(`Lỗi trong CinemaController.createCinemaRoom:`, error);

            if (error.message === 'Không tìm thấy rạp phim') {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            
            if (error.message && error.message.includes('đã tồn tại trong rạp này')) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(400).json({
                success: false,
                message: error.message || 'Đã xảy ra lỗi khi tạo phòng chiếu'
            });
        }
    }

    /**
     * Lấy danh sách phòng chiếu của rạp phim
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async getCinemaRooms(req, res) {
        try {
            const { cinemaId } = req.params;
            const parsedCinemaId = parseInt(cinemaId, 10);

            if (isNaN(parsedCinemaId) || parsedCinemaId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'ID rạp phim không hợp lệ'
                });
            }

            logger.info(`CinemaController.getCinemaRooms called for cinema ID: ${parsedCinemaId}`);
            const result = await cinemaService.getCinemaRooms(parsedCinemaId);

            
            if (!result.data || result.data.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Rạp phim này chưa có phòng chiếu nào'
                });
            }

            res.status(200).json(result);
        } catch (error) {
            logger.error(`Lỗi trong CinemaController.getCinemaRooms:`, error);

            if (error.message === 'Không tìm thấy rạp phim') {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: error.message || 'Đã xảy ra lỗi khi lấy danh sách phòng chiếu'
            });
        }
    }

    /**
     * Lấy thông tin rạp phim mà Manager đang quản lý
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async getManagerCinema(req, res) {
        try {
            
            const userId = req.user.id;

            logger.info(`CinemaController.getManagerCinema called for user ID: ${userId}`);
            const result = await cinemaService.getManagerCinema(userId);
            res.status(200).json(result);
        } catch (error) {
            logger.error(`Lỗi trong CinemaController.getManagerCinema:`, error);

            if (error.message === 'Người dùng không phải là Manager' ||
                error.message === 'Manager chưa được phân công rạp phim') {
                return res.status(403).json({
                    success: false,
                    message: error.message
                });
            }

            if (error.message === 'Không tìm thấy rạp phim') {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: error.message || 'Đã xảy ra lỗi khi lấy thông tin rạp phim'
            });
        }
    }

    /**
     * Lấy danh sách phim đang chiếu theo rạp phim
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async getMoviesByCinema(req, res) {
        try {
            const { cinemaId } = req.params;
            const parsedCinemaId = parseInt(cinemaId, 10);

            if (isNaN(parsedCinemaId) || parsedCinemaId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'ID rạp phim không hợp lệ'
                });
            }

            logger.info(`CinemaController.getMoviesByCinema called for cinema ID: ${parsedCinemaId}`);

           
            const cinema = await CinemaRepository.findById(parsedCinemaId);
            if (!cinema) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy rạp phim'
                });
            }

            
            const { CinemaRoom, Showtime, Movie, sequelize } = require('../models');
            const { Op } = require('sequelize');

            const today = new Date();

            
            const movies = await Movie.findAll({
                include: [{
                    model: Showtime,
                    as: 'Showtimes',
                    required: true,
                    where: {
                        Show_Date: { [Op.gte]: today },
                        Status: 'Scheduled'
                    },
                    include: [{
                        model: CinemaRoom,
                        as: 'CinemaRoom',
                        required: true,
                        where: {
                            Cinema_ID: parsedCinemaId
                        }
                    }]
                }],
                distinct: true,
                order: [['Release_Date', 'DESC']]
            });

            
            const movieList = movies.map(movie => ({
                Movie_ID: movie.Movie_ID,
                Movie_Name: movie.Movie_Name,
                Release_Date: movie.Release_Date,
                Duration: movie.Duration,
                Genre: movie.Genre,
                Rating: movie.Rating,
                Poster_URL: movie.Poster_URL,
                Status: movie.Status
            }));

            
            if (!movieList || movieList.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Rạp phim này hiện không có phim nào đang chiếu'
                });
            }

            res.status(200).json({
                success: true,
                data: movieList
            });
        } catch (error) {
            logger.error(`Lỗi trong CinemaController.getMoviesByCinema:`, error);
            res.status(500).json({
                success: false,
                message: error.message || 'Đã xảy ra lỗi khi lấy danh sách phim theo rạp phim'
            });
        }
    }

    /**
     * Lấy danh sách suất chiếu của một rạp phim theo ngày
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async getCinemaShowtimes(req, res) {
        try {
            const { id } = req.params;
            const { date } = req.query;

            
            const parsedCinemaId = parseInt(id, 10);
            if (isNaN(parsedCinemaId) || parsedCinemaId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'ID rạp phim không hợp lệ'
                });
            }

            logger.info(`CinemaController.getCinemaShowtimes called with cinemaId: ${parsedCinemaId}, date: ${date}`);
            const result = await cinemaService.getCinemaShowtimes(parsedCinemaId, date);

            
            if (!result.data || !result.data.movies || result.data.movies.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: `Không tìm thấy suất chiếu nào cho rạp phim này vào ngày ${date || 'hôm nay'}`
                });
            }

            res.status(200).json(result);
        } catch (error) {
            logger.error(`Lỗi trong CinemaController.getCinemaShowtimes:`, error);

            if (error.message === 'Không tìm thấy rạp phim') {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            if (error.message.includes('Định dạng ngày không hợp lệ') || error.message.includes('Ngày không hợp lệ')) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: error.message || 'Đã xảy ra lỗi khi lấy danh sách suất chiếu của rạp phim'
            });
        }
    }

    /**
     * Lấy thông tin chi tiết của một rạp phim bao gồm thống kê số liệu về phòng chiếu
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async getCinemaDetails(req, res) {
        try {
            const { id } = req.params;
            const cinemaId = parseInt(id, 10);

            if (isNaN(cinemaId) || cinemaId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'ID rạp phim không hợp lệ'
                });
            }

            logger.info(`CinemaController.getCinemaDetails called with ID: ${cinemaId}`);
            const result = await cinemaService.getCinemaDetails(cinemaId);
            res.status(200).json(result);
        } catch (error) {
            logger.error(`Lỗi trong CinemaController.getCinemaDetails:`, error);

            if (error.message.includes('Không tìm thấy rạp phim')) {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: error.message || 'Đã xảy ra lỗi khi lấy thông tin chi tiết của rạp phim'
            });
        }
    }

    /**
     * Lấy danh sách phòng chiếu mà Manager đang quản lý
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async getManagerCinemaRooms(req, res) {
        try {
            
            const userId = req.user.id;

            logger.info(`CinemaController.getManagerCinemaRooms called for user ID: ${userId}`);

            
            const result = await cinemaService.getManagerCinemaRooms(userId);
            res.status(200).json(result);
        } catch (error) {
            logger.error(`Lỗi trong CinemaController.getManagerCinemaRooms:`, error);

            if (error.message === 'Không tìm thấy người dùng') {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            if (error.message === 'Người dùng không phải là Manager' ||
                error.message === 'Manager chưa được phân công rạp phim') {
                return res.status(403).json({
                    success: false,
                    message: error.message
                });
            }

            if (error.message === 'Không tìm thấy rạp phim' ||
                error.message.includes('Rạp phim này chưa có phòng chiếu')) {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: error.message || 'Đã xảy ra lỗi khi lấy danh sách phòng chiếu'
            });
        }
    }

    /**
     * Lấy danh sách phòng chiếu hoạt động của rạp phim
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async getActiveCinemaRooms(req, res) {
        try {
            const { cinemaId } = req.params;
            const parsedCinemaId = parseInt(cinemaId, 10);

            if (isNaN(parsedCinemaId) || parsedCinemaId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'ID rạp phim không hợp lệ'
                });
            }

            logger.info(`CinemaController.getActiveCinemaRooms called for cinema ID: ${parsedCinemaId}`);
            const result = await cinemaService.getActiveCinemaRooms(parsedCinemaId);

            
            if (!result.data || result.data.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Rạp phim này chưa có phòng chiếu hoạt động nào'
                });
            }

            res.status(200).json(result);
        } catch (error) {
            logger.error(`Lỗi trong CinemaController.getActiveCinemaRooms:`, error);

            if (error.message === 'Không tìm thấy rạp phim') {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: error.message || 'Đã xảy ra lỗi khi lấy danh sách phòng chiếu hoạt động'
            });
        }
    }
}

module.exports = new CinemaController(); 