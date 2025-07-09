// src/controllers/seatTypeController.js
const SeatTypeService = require('../services/seatTypeService');
const logger = require('../utils/logger');

/**
 * Controller xử lý các API liên quan đến loại ghế
 * Chuyển đổi từ C# SeatTypeController
 */
class SeatTypeController {
    constructor() {
        this.seatTypeService = new SeatTypeService();
        this.logger = logger;
    }

    /**
     * Lấy tất cả loại ghế
     * GET /api/seat-types
     */
    async getAllSeatTypes(req, res) {
        try {
            this.logger.info('Getting all seat types');

            const seatTypes = await this.seatTypeService.getAllSeatTypesAsync();

            res.json({
                success: true,
                message: 'Lấy danh sách loại ghế thành công',
                data: seatTypes
            });

        } catch (error) {
            this.logger.error('Error getting all seat types:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi lấy danh sách loại ghế',
                error: error.message
            });
        }
    }

    /**
     * Lấy loại ghế theo ID
     * GET /api/seat-types/:id
     */
    async getSeatTypeById(req, res) {
        try {
            const { id } = req.params;
            this.logger.info(`Getting seat type with ID: ${id}`);

            const seatType = await this.seatTypeService.getSeatTypeByIdAsync(parseInt(id));

            if (!seatType) {
                return res.status(404).json({
                    success: false,
                    message: `Không tìm thấy loại ghế với ID ${id}`
                });
            }

            res.json({
                success: true,
                message: 'Lấy thông tin loại ghế thành công',
                data: seatType
            });

        } catch (error) {
            this.logger.error(`Error getting seat type with ID ${req.params.id}:`, error);

            if (error.name === 'KeyNotFoundError') {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi lấy thông tin loại ghế',
                error: error.message
            });
        }
    }

    /**
     * Tạo loại ghế mới
     * POST /api/seat-types
     */
    async createSeatType(req, res) {
        try {
            this.logger.info('Creating new seat type:', req.body);

            const newSeatType = await this.seatTypeService.createSeatTypeAsync(req.body);

            res.status(201).json({
                success: true,
                message: 'Tạo loại ghế mới thành công',
                data: newSeatType
            });

        } catch (error) {
            this.logger.error('Error creating seat type:', error);

            if (error.name === 'ValidationError') {
                return res.status(400).json({
                    success: false,
                    message: 'Dữ liệu không hợp lệ',
                    errors: error.details
                });
            }

            if (error.name === 'DuplicateError') {
                return res.status(409).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi tạo loại ghế',
                error: error.message
            });
        }
    }

    /**
     * Cập nhật loại ghế
     * PUT /api/seat-types/:id
     */
    async updateSeatType(req, res) {
        try {
            const { id } = req.params;
            this.logger.info(`Updating seat type with ID: ${id}`, req.body);

            const updatedSeatType = await this.seatTypeService.updateSeatTypeAsync(parseInt(id), req.body);

            res.json({
                success: true,
                message: 'Cập nhật loại ghế thành công',
                data: updatedSeatType
            });

        } catch (error) {
            this.logger.error(`Error updating seat type with ID ${req.params.id}:`, error);

            if (error.name === 'KeyNotFoundError') {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            if (error.name === 'ValidationError') {
                return res.status(400).json({
                    success: false,
                    message: 'Dữ liệu không hợp lệ',
                    errors: error.details
                });
            }

            if (error.name === 'DuplicateError') {
                return res.status(409).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi cập nhật loại ghế',
                error: error.message
            });
        }
    }

    /**
     * Xóa loại ghế
     * DELETE /api/seat-types/:id
     */
    async deleteSeatType(req, res) {
        try {
            const { id } = req.params;
            this.logger.info(`Deleting seat type with ID: ${id}`);

            await this.seatTypeService.deleteSeatTypeAsync(parseInt(id));

            res.json({
                success: true,
                message: 'Xóa loại ghế thành công'
            });

        } catch (error) {
            this.logger.error(`Error deleting seat type with ID ${req.params.id}:`, error);

            if (error.name === 'KeyNotFoundError') {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            if (error.name === 'InvalidOperationError') {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi xóa loại ghế',
                error: error.message
            });
        }
    }
}

module.exports = new SeatTypeController();
