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
     * Xóa mềm hàng loạt layout ghế
     * @route DELETE /api/seat-layouts/bulk-delete
     * @access Private (Admin/Manager only)
     */
     async softDeleteSeatLayouts(req, res) {
        try {
            const model = req.body;
            const user = req.user;


            logger.info(`DELETE /api/seat-layouts/bulk-delete - Soft deleting ${model.LayoutIds?.length || 0} seat layouts`);


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
            const result = await seatLayoutService.softDeleteSeatLayouts(model, sequelize);


            // Nếu lệnh xóa không thành công
            if (!result.success) {
                return res.status(400).json(result);
            }


            res.json(result);


        } catch (error) {
            logger.error('Error in softDeleteSeatLayouts:', error);


            if (error.message.includes('Không tìm thấy')) {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }


            if (error.message.includes('đặt vé') || error.message.includes('không thể xóa')) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }


            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi xóa layout ghế',
                error: error.message
            });
        }
    }

}

module.exports = new SeatLayoutController();
