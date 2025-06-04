'use strict';

const CinemaRepository = require('../repositories/CinemaRepository');
// const CinemaRoomRepository = require('../repositories/CinemaRoomRepository');
const logger = require('../utils/logger');
const { User } = require('../models');

/**
 * Service xử lý logic nghiệp vụ liên quan đến rạp phim
 */
class CinemaService {
    /**
     * Tạo một rạp phim mới
     * @param {Object} cinemaData - Thông tin rạp phim
     * @returns {Promise<Object>} - Kết quả sau khi tạo rạp phim
     */
    async createCinema(cinemaData) {
        try {
            logger.info(`CinemaService.createCinema called with data:`, cinemaData);

            // Đảm bảo loại bỏ Cinema_ID nếu có (ID sẽ do DB tự tạo)
            const { Cinema_ID, ...validCinemaData } = cinemaData;

            // Thêm các giá trị mặc định nếu không được cung cấp
            if (!validCinemaData.Status) {
                validCinemaData.Status = 'Active';
            }

            const newCinema = await CinemaRepository.create(validCinemaData);
            if (!newCinema) {
                throw new Error('Không thể tạo rạp phim');
            }

            return {
                success: true,
                message: 'Tạo rạp phim thành công',
                data: newCinema
            };
        } catch (error) {
            logger.error(`Lỗi trong CinemaService.createCinema:`, error);
            throw error;
        }
    }

    /**
     * Lấy thông tin rạp phim theo ID
     * @param {number} cinemaId - ID của rạp phim
     * @returns {Promise<Object>} - Thông tin chi tiết của rạp phim
     */
    async getCinemaById(cinemaId) {
        try {
            logger.info(`CinemaService.getCinemaById called with ID: ${cinemaId}`);

            const cinema = await CinemaRepository.findById(cinemaId);
            if (!cinema) {
                throw new Error('Không tìm thấy rạp phim');
            }

            // Lấy thêm danh sách phòng chiếu của rạp
            const rooms = await CinemaRepository.getRoomsByCinemaId(cinemaId);

            return {
                success: true,
                data: {
                    ...cinema,
                    rooms: rooms || []
                }
            };
        } catch (error) {
            logger.error(`Lỗi trong CinemaService.getCinemaById cho ID ${cinemaId}:`, error);
            throw error;
        }
    }

    /**
     * Lấy danh sách tất cả các rạp phim
     * @returns {Promise<Object>} - Danh sách rạp phim
     */
    async getAllCinemas() {
        try {
            logger.info('CinemaService.getAllCinemas called');

            const cinemas = await CinemaRepository.getAll();
            return {
                success: true,
                data: cinemas || []
            };
        } catch (error) {
            logger.error('Lỗi trong CinemaService.getAllCinemas:', error);
            throw error;
        }

    }
    async updateCinema(cinemaId, updateData) {
        try {
            logger.info(`CinemaService.updateCinema called for ID: ${cinemaId} with data:`, updateData);

            // Kiểm tra rạp phim tồn tại
            const cinema = await CinemaRepository.findById(cinemaId);
            if (!cinema) {
                throw new Error('Không tìm thấy rạp phim');
            }

            // Cập nhật rạp phim
            const updated = await CinemaRepository.update(cinemaId, updateData);
            if (!updated) {
                throw new Error('Cập nhật rạp phim thất bại');
            }

            // Lấy thông tin rạp phim sau khi cập nhật
            const updatedCinema = await CinemaRepository.findById(cinemaId);

            return {
                success: true,
                message: 'Cập nhật rạp phim thành công',
                data: updatedCinema
            };
        } catch (error) {
            logger.error(`Lỗi trong CinemaService.updateCinema cho ID ${cinemaId}:`, error);
            throw error;
        }
    }

}

module.exports = new CinemaService(); 