// src/controllers/seatLayoutController.js
const seatLayoutService = require('../services/seatLayoutService');
const logger = require('../utils/logger');

/**
 * Seat Layout Controller - Handles HTTP requests for seat layout management
 * Converted from C# SeatLayoutController
 */
class SeatLayoutController {
    /**
     * Lấy sơ đồ ghế của phòng chiếu
     * @route GET /api/seat-layout/room/{roomId}
     * @access Private (Admin/Staff only)
     */
    async getSeatLayout(req, res) {
        try {
            const { roomId } = req.params;

            logger.info(`GET /api/seat-layout/room/${roomId} - Getting seat layout for room`);

            const result = await seatLayoutService.getSeatLayout(parseInt(roomId));

            res.json({
                success: true,
                message: 'Lấy sơ đồ ghế thành công',
                data: result
            });

        } catch (error) {
            logger.error(`Error in getSeatLayout for room ${req.params.roomId}:`, error);

            if (error.message.includes('Không tìm thấy')) {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi lấy sơ đồ ghế',
                error: error.message
            });
        }
    }

    /**
     * Cấu hình sơ đồ ghế trong phòng chiếu
     * @route POST /api/seat-layouts/{roomId}
     * @access Private (Admin/Staff only)
     */
    async configureSeatLayout(req, res) {
        try {
            const { roomId } = req.params;
            const model = req.body;
            const user = req.user; // Lấy thông tin user từ request

            logger.info(`POST /api/seat-layouts/${roomId} - Configuring seat layout`);

            // Kiểm tra nếu user là manager, phải đảm bảo phòng thuộc rạp mà họ quản lý
            if (user && user.role === 'Manager') {
                // Lấy thông tin manager và phòng chiếu từ database
                const { User, CinemaRoom } = require('../models');

                // Lấy thông tin manager từ database
                const manager = await User.findByPk(user.id);
                if (!manager) {
                    logger.warn(`Manager with ID ${user.id} not found in database`);
                    return res.status(404).json({
                        success: false,
                        message: `Không tìm thấy thông tin người dùng với ID ${user.id}`,
                        error_code: 'USER_NOT_FOUND'
                    });
                }

                // Lấy cinema_id của manager từ database
                const managerCinemaId = manager.Cinema_ID;
                logger.info(`Manager cinema_id from database: ${managerCinemaId}`);

                // Lấy thông tin phòng chiếu
                const room = await CinemaRoom.findByPk(roomId);

                if (!room) {
                    logger.warn(`Room with ID ${roomId} not found`);
                    return res.status(404).json({
                        success: false,
                        message: `Không tìm thấy phòng chiếu với ID ${roomId}`,
                        error_code: 'ROOM_NOT_FOUND'
                    });
                }

                logger.info(`Room info for ID ${roomId}: Cinema_ID=${room.Cinema_ID}, Manager's Cinema_ID=${managerCinemaId}`);

                // Kiểm tra xem manager có quản lý rạp chứa phòng này không
                if (room.Cinema_ID !== managerCinemaId) {
                    logger.warn(`Permission denied: Manager with cinema_id ${managerCinemaId} trying to configure room in cinema ${room.Cinema_ID}`);
                    return res.status(403).json({
                        success: false,
                        message: `Bạn không có quyền cấu hình ghế trong phòng chiếu này. Phòng thuộc rạp ${room.Cinema_ID}, bạn quản lý rạp ${managerCinemaId}`,
                        error_code: 'PERMISSION_DENIED'
                    });
                }
            }

            const result = await seatLayoutService.configureSeatLayout(parseInt(roomId), model);
            res.json({
                success: true,
                message: 'Cấu hình sơ đồ ghế thành công',
                data: result
            });
        } catch (error) {
            logger.error(`Error in configureSeatLayout for room ${req.params.roomId}:`, error);

            if (error.message.includes('Không tìm thấy')) {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            if (error.message.includes('Số lượng ghế') ||
                error.message.includes('layout ghế') ||
                error.message.includes('Không thể cập nhật layout') ||
                error.message.includes('đang chờ thanh toán') ||
                error.message.includes('đã có lịch chiếu')) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi cấu hình sơ đồ ghế',
                error: error.message
            });
        }
    }

    /**
     * Cập nhật loại ghế
     * @route PUT /api/seat-layouts/{layoutId}/seat-type
     * @access Private (Admin/Manager only)
     */
    async updateSeatType(req, res) {
        try {
            const { layoutId } = req.params;
            const model = req.body;
            const user = req.user;

            logger.info(`PUT /api/seat-layouts/${layoutId}/seat-type - Updating seat type to ${model.SeatType}`);

            // Kiểm tra nếu user là manager, phải đảm bảo layout thuộc rạp mà họ quản lý
            if (user && user.role === 'Manager') {
                // Lấy thông tin manager từ database
                const { User, SeatLayout, CinemaRoom } = require('../models');
                const manager = await User.findByPk(user.id);

                if (!manager) {
                    logger.warn(`Manager with ID ${user.id} not found in database`);
                    return res.status(404).json({
                        success: false,
                        message: `Không tìm thấy thông tin người dùng với ID ${user.id}`,
                        error_code: 'USER_NOT_FOUND'
                    });
                }

                // Lấy cinema_id của manager từ database
                const managerCinemaId = manager.Cinema_ID;
                logger.info(`Manager cinema_id from database: ${managerCinemaId}`);

                // Lấy thông tin layout và phòng chiếu
                const layout = await SeatLayout.findByPk(layoutId);

                if (!layout) {
                    logger.warn(`Layout with ID ${layoutId} not found`);
                    return res.status(404).json({
                        success: false,
                        message: `Không tìm thấy layout ghế với ID ${layoutId}`,
                        error_code: 'LAYOUT_NOT_FOUND'
                    });
                }

                // Lấy thông tin phòng chiếu
                const room = await CinemaRoom.findByPk(layout.Cinema_Room_ID);
                if (!room) {
                    logger.warn(`Room with ID ${layout.Cinema_Room_ID} not found`);
                    return res.status(404).json({
                        success: false,
                        message: `Không tìm thấy phòng chiếu liên quan đến layout ghế này`,
                        error_code: 'ROOM_NOT_FOUND'
                    });
                }

                logger.info(`Layout check: Layout ID=${layoutId}, Room ID=${room.Cinema_Room_ID}, Room's Cinema ID=${room.Cinema_ID}, Manager's Cinema ID=${managerCinemaId}`);

                // Kiểm tra xem manager có quản lý rạp chứa phòng này không
                if (room.Cinema_ID !== managerCinemaId) {
                    logger.warn(`Permission denied: Manager with cinema_id ${managerCinemaId} trying to update seat in cinema ${room.Cinema_ID}`);
                    return res.status(403).json({
                        success: false,
                        message: `Bạn không có quyền cập nhật ghế trong rạp này. Ghế thuộc rạp ${room.Cinema_ID}, bạn quản lý rạp ${managerCinemaId}`,
                        error_code: 'PERMISSION_DENIED'
                    });
                }
            }

            const result = await seatLayoutService.updateSeatType(parseInt(layoutId), model);
            res.json({
                success: true,
                message: 'Cập nhật loại ghế thành công',
                data: result
            });
        } catch (error) {
            logger.error(`Error in updateSeatType for layout ${req.params.layoutId}:`, error);

            if (error.message.includes('Không tìm thấy')) {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            if (error.message.includes('đặt vé') || error.message.includes('không thể thay đổi')) {
                return res.status(400).json({
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
     * Cập nhật hàng loạt loại ghế
     * @route PUT /api/seat-layouts/bulk-update-types
     * @access Private (Admin/Manager only)
     */
    async bulkUpdateSeatTypes(req, res) {
        try {
            const model = req.body;
            const user = req.user;

            logger.info(`PUT /api/seat-layouts/bulk-update-types - Bulk updating seat types for ${model.LayoutIds?.length || 0} seats`);

            // Kiểm tra nếu user là manager, phải đảm bảo tất cả layout thuộc rạp mà họ quản lý
            if (user && user.role === 'Manager' && model.LayoutIds && model.LayoutIds.length > 0) {
                // Lấy thông tin manager từ database
                const { sequelize, User, SeatLayout, CinemaRoom } = require('../models');
                const manager = await User.findByPk(user.id);

                if (!manager) {
                    logger.warn(`Manager with ID ${user.id} not found in database`);
                    return res.status(404).json({
                        success: false,
                        message: `Không tìm thấy thông tin người dùng với ID ${user.id}`,
                        error_code: 'USER_NOT_FOUND'
                    });
                }

                // Lấy cinema_id của manager từ database
                const managerCinemaId = manager.Cinema_ID;
                logger.info(`Manager cinema_id from database: ${managerCinemaId}`);

                // Lấy thông tin tất cả layout
                const { Op } = require('sequelize');
                const layouts = await SeatLayout.findAll({
                    where: { Layout_ID: { [Op.in]: model.LayoutIds } },
                    attributes: ['Layout_ID', 'Cinema_Room_ID']
                });

                if (layouts.length === 0) {
                    logger.warn(`No layouts found for IDs: ${model.LayoutIds.join(', ')}`);
                    return res.status(404).json({
                        success: false,
                        message: 'Không tìm thấy layout ghế nào cần cập nhật',
                        error_code: 'LAYOUTS_NOT_FOUND'
                    });
                }

                // Lấy tất cả phòng chiếu liên quan đến các layout
                const roomIds = [...new Set(layouts.map(l => l.Cinema_Room_ID))];
                const rooms = await CinemaRoom.findAll({
                    where: { Cinema_Room_ID: { [Op.in]: roomIds } },
                    attributes: ['Cinema_Room_ID', 'Cinema_ID']
                });

                logger.info(`Found ${rooms.length} rooms for layouts. RoomIDs: ${roomIds.join(', ')}`);

                // Tạo map Cinema_Room_ID -> Cinema_ID
                const roomToCinemaMap = {};
                rooms.forEach(room => {
                    roomToCinemaMap[room.Cinema_Room_ID] = room.Cinema_ID;
                });

                // Kiểm tra xem tất cả layout có thuộc rạp của manager không
                const unauthorizedLayouts = layouts.filter(layout =>
                    roomToCinemaMap[layout.Cinema_Room_ID] !== managerCinemaId
                );

                if (unauthorizedLayouts.length > 0) {
                    const unauthorizedIds = unauthorizedLayouts.map(l => l.Layout_ID);
                    logger.warn(`Permission denied: Manager with cinema_id ${managerCinemaId} trying to update layouts in different cinema. Unauthorized layout IDs: ${unauthorizedIds.join(', ')}`);
                    return res.status(403).json({
                        success: false,
                        message: `Bạn không có quyền cập nhật một số layout ghế được chọn vì chúng không thuộc rạp bạn quản lý (ID: ${managerCinemaId})`,
                        error_code: 'PERMISSION_DENIED',
                        unauthorized_layouts: unauthorizedLayouts.map(l => l.Layout_ID)
                    });
                }
            }

            // Đảm bảo sequelize được import và truyền vào service
            const { sequelize } = require('../models');
            const result = await seatLayoutService.bulkUpdateSeatTypes(model, sequelize);

            if (result.Message) {
                // Kết quả lỗi từ service
                return res.status(400).json({
                    success: false,
                    message: result.Message,
                    used_seats: result.UsedSeats
                });
            }

            res.json({
                success: true,
                message: `Đã cập nhật ${result.UpdatedCount} ghế thành công`,
                data: result
            });
        } catch (error) {
            logger.error('Error in bulkUpdateSeatTypes:', error);

            if (error.message.includes('Không tìm thấy')) {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            if (error.message.includes('đặt vé') || error.message.includes('không thể cập nhật')) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi cập nhật hàng loạt loại ghế',
                error: error.message
            });
        }
    }

    /**
     * Lấy danh sách loại ghế
     * @route GET /api/seat-layout/seat-types
     * @access Private (Admin/Staff only)
     */
    async getSeatTypes(req, res) {
        try {
            logger.info('GET /api/seat-layout/seat-types - Getting seat types');

            const result = await seatLayoutService.getSeatTypes();

            res.json({
                success: true,
                message: 'Lấy danh sách loại ghế thành công',
                data: result
            });

        } catch (error) {
            logger.error('Error in getSeatTypes:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi lấy danh sách loại ghế',
                error: error.message
            });
        }
    }

    /**
     * Cấu hình hàng loạt sơ đồ ghế
     * @route POST /api/seat-layouts/bulk/{roomId}
     * @access Private (Admin/Staff only)
     */
    async bulkConfigureSeatLayout(req, res) {
        try {
            const { roomId } = req.params;
            const model = req.body;
            const user = req.user; // Lấy thông tin user từ request

            logger.info(`POST /api/seat-layouts/bulk/${roomId} - Bulk configuring seat layout with input:`, JSON.stringify(model));

            // Log thông tin user để debug
            logger.info(`User info:`, JSON.stringify({
                userId: user?.id,
                role: user?.role,
                cinema_id: user?.cinema_id
            }));

            // Kiểm tra nếu user là manager, phải đảm bảo phòng thuộc rạp mà họ quản lý
            if (user && user.role === 'Manager') {
                // Lấy thông tin manager từ database để lấy cinema_id
                const { sequelize, User, CinemaRoom } = require('../models');

                // Lấy thông tin manager từ database
                const manager = await User.findByPk(user.id);
                if (!manager) {
                    logger.warn(`Manager with ID ${user.id} not found in database`);
                    return res.status(404).json({
                        success: false,
                        message: `Không tìm thấy thông tin người dùng với ID ${user.id}`,
                        error_code: 'USER_NOT_FOUND'
                    });
                }

                // Lấy cinema_id của manager từ database
                const managerCinemaId = manager.Cinema_ID;
                logger.info(`Manager cinema_id from database: ${managerCinemaId}`);

                // Lấy thông tin phòng chiếu
                const room = await CinemaRoom.findByPk(roomId);

                // Log thông tin phòng chiếu để debug
                logger.info(`Room info for ID ${roomId}: ${room ? JSON.stringify({
                    Cinema_Room_ID: room.Cinema_Room_ID,
                    Room_Name: room.Room_Name,
                    Cinema_ID: room.Cinema_ID
                }) : 'Not found'}`);

                if (!room) {
                    logger.warn(`Room with ID ${roomId} not found`);
                    return res.status(404).json({
                        success: false,
                        message: `Không tìm thấy phòng chiếu với ID ${roomId}`,
                        error_code: 'ROOM_NOT_FOUND'
                    });
                }

                // Kiểm tra xem manager có quản lý rạp chứa phòng này không
                if (room.Cinema_ID !== managerCinemaId) {
                    logger.warn(`Permission denied: Manager with cinema_id ${managerCinemaId} trying to configure room in cinema ${room.Cinema_ID}`);
                    return res.status(403).json({
                        success: false,
                        message: `Bạn không có quyền cấu hình ghế trong phòng chiếu này. Phòng thuộc rạp ${room.Cinema_ID}, bạn quản lý rạp ${managerCinemaId}`,
                        error_code: 'PERMISSION_DENIED'
                    });
                }

                logger.info(`Permission granted: Manager with cinema_id ${managerCinemaId} configuring room in cinema ${room.Cinema_ID}`);
            }

            // Đảm bảo sequelize được import và truyền vào service
            const { sequelize } = require('../models');
            const result = await seatLayoutService.bulkConfigureSeatLayout(roomId, model, sequelize);

            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            logger.error(`Error in bulkConfigureSeatLayout for room ${req.params.roomId}:`, error);
            res.status(500).json({
                success: false,
                message: `Có lỗi xảy ra khi cấu hình ghế: ${error.message}`,
                error_code: 'INTERNAL_ERROR'
            });
        }
    }

    /**
     * Toggle visibility (ẩn/hiện) hàng loạt layout ghế
     * Tái sử dụng endpoint bulk-delete nhưng cho phép set Is_Active = true hoặc false
     * @route DELETE /api/seat-layouts/bulk-delete
     * @access Private (Admin/Manager only)
     */
    async softDeleteSeatLayouts(req, res) {
        try {
            const model = req.body;
            const user = req.user;

            // Nếu không có IsActive trong request, mặc định là false (ẩn ghế)
            if (model.IsActive === undefined || model.IsActive === null) {
                model.IsActive = false;
            }

            const actionText = model.IsActive ? 'hiện' : 'ẩn';
            logger.info(`DELETE /api/seat-layouts/bulk-delete - ${actionText} ${model.LayoutIds?.length || 0} seat layouts`);

            // Kiểm tra nếu user là manager, phải đảm bảo tất cả layout thuộc rạp mà họ quản lý
            if (user && user.role === 'Manager' && model.LayoutIds && model.LayoutIds.length > 0) {
                // Lấy thông tin manager từ database
                const { sequelize, User, SeatLayout, CinemaRoom } = require('../models');
                const { Op } = require('sequelize');
                const manager = await User.findByPk(user.id);

                if (!manager) {
                    logger.warn(`Manager with ID ${user.id} not found in database`);
                    return res.status(404).json({
                    success: false,
                        message: `Không tìm thấy thông tin người dùng với ID ${user.id}`,
                        error_code: 'USER_NOT_FOUND'
                    });
                }

                // Lấy cinema_id của manager từ database
                const managerCinemaId = manager.Cinema_ID;
                logger.info(`Manager cinema_id from database: ${managerCinemaId}`);

                // Lấy thông tin tất cả layout
                const layouts = await SeatLayout.findAll({
                    where: { Layout_ID: { [Op.in]: model.LayoutIds } },
                    attributes: ['Layout_ID', 'Cinema_Room_ID']
                });

                if (layouts.length === 0) {
                    logger.warn(`No layouts found for IDs: ${model.LayoutIds.join(', ')}`);
                    return res.status(404).json({
                        success: false,
                        message: 'Không tìm thấy layout ghế nào cần xóa',
                        error_code: 'LAYOUTS_NOT_FOUND'
                    });
                }

                // Lấy tất cả phòng chiếu liên quan đến các layout
                const roomIds = [...new Set(layouts.map(l => l.Cinema_Room_ID))];
                const rooms = await CinemaRoom.findAll({
                    where: { Cinema_Room_ID: { [Op.in]: roomIds } },
                    attributes: ['Cinema_Room_ID', 'Cinema_ID']
                });

                logger.info(`Found ${rooms.length} rooms for layouts. RoomIDs: ${roomIds.join(', ')}`);

                // Tạo map Cinema_Room_ID -> Cinema_ID
                const roomToCinemaMap = {};
                rooms.forEach(room => {
                    roomToCinemaMap[room.Cinema_Room_ID] = room.Cinema_ID;
                });

                // Kiểm tra xem tất cả layout có thuộc rạp của manager không
                const unauthorizedLayouts = layouts.filter(layout =>
                    roomToCinemaMap[layout.Cinema_Room_ID] !== managerCinemaId
                );

                if (unauthorizedLayouts.length > 0) {
                    const unauthorizedIds = unauthorizedLayouts.map(l => l.Layout_ID);
                    logger.warn(`Permission denied: Manager with cinema_id ${managerCinemaId} trying to delete layouts in different cinema. Unauthorized layout IDs: ${unauthorizedIds.join(', ')}`);
                    return res.status(403).json({
                        success: false,
                        message: `Bạn không có quyền xóa một số layout ghế được chọn vì chúng không thuộc rạp bạn quản lý (ID: ${managerCinemaId})`,
                        error_code: 'PERMISSION_DENIED',
                        unauthorized_layouts: unauthorizedLayouts.map(l => l.Layout_ID)
                    });
                }
            }

            // Đảm bảo sequelize được import và truyền vào service
            const { sequelize } = require('../models');
            const result = await seatLayoutService.toggleSeatLayoutsVisibility(model, sequelize);

            // Nếu lệnh toggle không thành công
            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);

        } catch (error) {
            const actionText = model.IsActive ? 'hiện' : 'ẩn';
            logger.error(`Error in toggleSeatLayoutsVisibility (${actionText}):`, error);

            if (error.message.includes('Không tìm thấy')) {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            if (error.message.includes('đặt vé') || error.message.includes('không thể')) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: `Có lỗi xảy ra khi ${actionText} layout ghế`,
                error: error.message
            });
        }
    }

    /**
     * Tạo phòng chiếu mới với layout có sẵn
     * @route POST /api/seat-layout/create-room-with-layout
     * @access Private (Admin only)
     */
    async createRoomWithExistingLayout(req, res) {
        try {
            const model = req.body;

            if (!model.TemplateRoomId || !model.RoomName || !model.RoomType) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin bắt buộc: TemplateRoomId, RoomName, RoomType'
                });
            }

            logger.info(`POST /api/seat-layout/create-room-with-layout - Creating room with template ${model.TemplateRoomId}`);

            const result = await seatLayoutService.createRoomWithExistingLayout(model);

            res.status(201).json({
                success: true,
                message: 'Tạo phòng chiếu mới với layout có sẵn thành công',
                data: result
            });

        } catch (error) {
            logger.error('Error in createRoomWithExistingLayout:', error);

            if (error.message.includes('Không tìm thấy')) {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            if (error.message.includes('không có layout ghế') ||
                error.message.includes('Số lượng ghế')) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi tạo phòng chiếu mới',
                error: error.message
            });
        }
    }

    /**
     * Lấy thống kê sử dụng ghế theo phòng
     * @route GET /api/seat-layout/room/{roomId}/usage-stats
     * @access Private (Admin/Staff only)
     */
    async getSeatUsageStats(req, res) {
        try {
            const { roomId } = req.params;
            const { period = '30' } = req.query; // Default 30 days

            const days = parseInt(period);
            if (isNaN(days) || days <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Period phải là số ngày hợp lệ (> 0)'
                });
            }

            logger.info(`GET /api/seat-layout/room/${roomId}/usage-stats - Getting seat usage stats for last ${days} days`);

            const result = await seatLayoutService.getSeatUsageStats(parseInt(roomId), days);

            res.json({
                success: true,
                message: 'Lấy thống kê sử dụng ghế thành công',
                data: result
            });

        } catch (error) {
            logger.error(`Error in getSeatUsageStats for room ${req.params.roomId}:`, error);

            if (error.message.includes('Không tìm thấy')) {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi lấy thống kê sử dụng ghế',
                error: error.message
            });
        }
    }

    /**
     * Lấy lịch sử thay đổi layout ghế
     * @route GET /api/seat-layout/room/{roomId}/history
     * @access Private (Admin/Staff only)
     */
    async getSeatLayoutHistory(req, res) {
        try {
            const { roomId } = req.params;
            const { page = 1, limit = 20 } = req.query;

            logger.info(`GET /api/seat-layout/room/${roomId}/history - Getting seat layout history`);

            const result = await seatLayoutService.getSeatLayoutHistory(
                parseInt(roomId),
                parseInt(page),
                parseInt(limit)
            );

            res.json({
                success: true,
                message: 'Lấy lịch sử thay đổi layout ghế thành công',
                data: result.data,
                pagination: {
                    current_page: parseInt(page),
                    total_pages: result.totalPages,
                    total_records: result.totalRecords,
                    limit: parseInt(limit)
                }
            });

        } catch (error) {
            logger.error(`Error in getSeatLayoutHistory for room ${req.params.roomId}:`, error);

            if (error.message.includes('Không tìm thấy')) {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi lấy lịch sử thay đổi layout ghế',
                error: error.message
            });
        }
    }

    /**
     * Validate layout ghế trước khi lưu
     * @route POST /api/seat-layout/validate
     * @access Private (Admin/Staff only)
     */
    async validateSeatLayout(req, res) {
        try {
            const model = req.body;

            logger.info('POST /api/seat-layout/validate - Validating seat layout configuration');

            const result = await seatLayoutService.validateSeatLayoutConfiguration(model);

            res.json({
                success: true,
                message: 'Validation hoàn tất',
                data: {
                    is_valid: result.isValid,
                    warnings: result.warnings || [],
                    errors: result.errors || [],
                    suggestions: result.suggestions || [],
                    estimated_total_seats: result.estimatedTotalSeats,
                    estimated_dimensions: result.estimatedDimensions
                }
            });

        } catch (error) {
            logger.error('Error in validateSeatLayout:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi validate layout ghế',
                error: error.message
            });
        }
    }

    /**
     * Helper method để map error code thành HTTP status code
     */
    getErrorStatusCode(errorCode) {
        const errorCodeMap = {
            'ROOM_NOT_FOUND': 404,
            'PENDING_BOOKINGS': 409,
            'INVALID_SEAT_TYPE': 400,
            'INVALID_ROWS_INPUT': 400,
            'INVALID_COLUMNS_COUNT': 400,
            'INVALID_ROW_RANGE': 400,
            'INVALID_ROW_RANGE_FORMAT': 400,
            'EMPTY_ROW_LIST': 400,
            'INVALID_SEAT_COUNT': 400,
            'ROWS_ALREADY_EXIST': 409,
            'ROOM_HAS_BOOKINGS': 409,
            'NOT_FOUND': 404,
            'INVALID_OPERATION': 400,
            'INTERNAL_ERROR': 500,
            'UNKNOWN_ERROR': 500
        };

        return errorCodeMap[errorCode] || 500;
    }

    /**
     * Convert report data to CSV format (nếu cần export)
     */
    convertToCSV(data) {
        if (!data || !Array.isArray(data) || data.length === 0) {
            return '';
        }

        const headers = Object.keys(data[0]);
        const rows = data.map(item =>
            headers.map(header => {
                const value = item[header];
                return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
            }).join(',')
        );

        return [headers.join(','), ...rows].join('\n');
    }
}

module.exports = new SeatLayoutController();
