'use strict';

const cinemaService = require('../services/cinemaService');
const logger = require('../utils/logger');
const CinemaRepository = require('../repositories/CinemaRepository');

/**
 * Controller xử lý các yêu cầu liên quan đến rạp phim
 */
class CinemaController {
    /**
     * Tạo rạp phim mới
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async createCinema(req, res) {
        try {
            logger.info(`CinemaController.createCinema called with data:`, req.body);

            // Kiểm tra dữ liệu đầu vào
            const { Cinema_ID, ...validCinemaData } = req.body;

            // Kiểm tra các trường bắt buộc
            if (!validCinemaData.Cinema_Name || !validCinemaData.Address || !validCinemaData.City || !validCinemaData.Province) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp đầy đủ thông tin rạp phim: Tên, Địa chỉ, Thành phố, Tỉnh/Thành phố'
                });
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
            res.status(200).json(result);
        } catch (error) {
            logger.error('Lỗi trong CinemaController.getAllCinemas:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Đã xảy ra lỗi khi lấy danh sách rạp phim'
            });
        }
    }
}

module.exports = new CinemaController(); 