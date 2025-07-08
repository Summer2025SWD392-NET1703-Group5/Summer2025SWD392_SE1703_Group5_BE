// src/controllers/seatController.js
const seatService = require('../services/seatService');
const logger = require('../utils/logger');

/**
 * Seat Controller - Chuyển đổi từ C# SeatController
 * Cung cấp các phương thức CRUD cơ bản cho entity Seat - OPTIMIZED VERSION
 */
class SeatController {
    /**
     * Lấy sơ đồ ghế ngồi của một suất chiếu - OPTIMIZED
     * Chuyển đổi từ C# SeatController.GetSeatMapAsync
     */
    async getSeatMap(req, res) {
        const startTime = Date.now();
        
        try {
            const { showtimeId } = req.params;

            // OPTIMIZATION 1: Early validation
            if (!showtimeId || isNaN(parseInt(showtimeId))) {
                logger.warn(`[getSeatMap] Invalid showtime ID provided: ${showtimeId}`);
                return res.status(400).json({
                    success: false,
                    message: 'Mã suất chiếu không hợp lệ',
                    error_code: 'INVALID_SHOWTIME_ID'
                });
            }

            const showtimeIdInt = parseInt(showtimeId);
            logger.info(`[getSeatMap] Bắt đầu lấy sơ đồ ghế cho showtime ID: ${showtimeIdInt}`);

            // OPTIMIZATION 2: Gọi service đã được tối ưu hóa
            const seatMap = await seatService.getSeatMapAsync(showtimeIdInt);

            if (!seatMap || seatMap.Seats.length === 0) {
                logger.warn(`[getSeatMap] Không tìm thấy sơ đồ ghế cho showtime ID: ${showtimeIdInt}`);
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy sơ đồ ghế cho suất chiếu này',
                    error_code: 'SEAT_MAP_NOT_FOUND'
                });
            }

            // OPTIMIZATION 3: Disable caching để luôn lấy dữ liệu mới
            res.set({
                'Cache-Control': 'no-cache, no-store, must-revalidate', // Không cache
                'Pragma': 'no-cache',
                'Expires': '0'
            });

            // OPTIMIZATION 4: Performance monitoring
            const responseTime = Date.now() - startTime;
            logger.info(`[getSeatMap] Hoàn thành trong ${responseTime}ms cho showtime ID: ${showtimeIdInt}`);

            return res.status(200).json({
                success: true,
                data: seatMap,
                _performance: {
                    response_time_ms: responseTime,
                    api_name: 'getSeatMap',
                    optimized: true
                }
            });

        } catch (error) {
            const responseTime = Date.now() - startTime;
            logger.error('[getSeatMap] Lỗi:', error);
            
            return res.status(500).json({
                success: false,
                message: 'Lỗi server nội bộ khi lấy sơ đồ ghế',
                error_code: 'INTERNAL_SERVER_ERROR',
                _performance: {
                    response_time_ms: responseTime,
                    api_name: 'getSeatMap',
                    error: true
                }
            });
        }
    }

    /**
     * Giữ ghế cho người dùng trong 5 phút - OPTIMIZED
     */
    async holdSeats(req, res) {
        const startTime = Date.now();
        
        try {
            const { showtime_id, seat_ids } = req.body;
            const userId = req.user.User_ID;

            // OPTIMIZATION 1: Comprehensive validation
            if (!showtime_id || !seat_ids || !Array.isArray(seat_ids)) {
                logger.warn(`[holdSeats] Invalid request data for user ${userId}`);
                return res.status(400).json({
                    success: false,
                    message: 'Dữ liệu yêu cầu không hợp lệ',
                    error_code: 'INVALID_REQUEST_DATA',
                    details: {
                        showtime_id: !!showtime_id,
                        seat_ids: Array.isArray(seat_ids) ? seat_ids.length : 'not_array'
                    }
                });
            }

            // OPTIMIZATION 2: Seat limit validation
            if (seat_ids.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Phải chọn ít nhất 1 ghế',
                    error_code: 'NO_SEATS_SELECTED'
                });
            }

            if (seat_ids.length > 8) {
                logger.warn(`[holdSeats] User ${userId} attempted to hold ${seat_ids.length} seats`);
                return res.status(400).json({
                    success: false,
                    message: 'Chỉ được phép giữ tối đa 8 ghế',
                    error_code: 'SEAT_LIMIT_EXCEEDED',
                    max_seats: 8,
                    requested_seats: seat_ids.length
                });
            }

            // OPTIMIZATION 3: Validate seat IDs
            const invalidSeatIds = seat_ids.filter(id => !Number.isInteger(id) || id <= 0);
            if (invalidSeatIds.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'ID ghế không hợp lệ',
                    error_code: 'INVALID_SEAT_IDS',
                    invalid_ids: invalidSeatIds
                });
            }

            logger.info(`[holdSeats] User ${userId} đang giữ ${seat_ids.length} ghế cho showtime ${showtime_id}`);

            // OPTIMIZATION 4: Gọi service đã được tối ưu hóa
            const result = await seatService.holdSeatsAsync(userId, showtime_id, seat_ids);

            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    message: result.message,
                    error_code: 'HOLD_SEATS_FAILED'
                });
            }

            const responseTime = Date.now() - startTime;
            logger.info(`[holdSeats] User ${userId} đã giữ thành công ${seat_ids.length} ghế trong ${responseTime}ms`);

            return res.status(200).json({
                success: true,
                data: result.data,
                message: 'Giữ ghế thành công. Vui lòng thanh toán trong vòng 5 phút.',
                _performance: {
                    response_time_ms: responseTime,
                    api_name: 'holdSeats',
                    optimized: true,
                    seats_held: seat_ids.length
                }
            });

        } catch (error) {
            const responseTime = Date.now() - startTime;
            logger.error('[holdSeats] Lỗi:', error);
            
            return res.status(500).json({
                success: false,
                message: 'Lỗi server nội bộ khi giữ ghế',
                error_code: 'INTERNAL_SERVER_ERROR',
                _performance: {
                    response_time_ms: responseTime,
                    api_name: 'holdSeats',
                    error: true
                }
            });
        }
    }

    /**
     * Xác nhận bán ghế đã được giữ - OPTIMIZED
     */
    async sellSeats(req, res) {
        const startTime = Date.now();
        
        try {
            const { booking_id } = req.body;
            const userId = req.user.User_ID;

            // OPTIMIZATION 1: Comprehensive validation
            if (!booking_id) {
                logger.warn(`[sellSeats] Invalid booking ID for user ${userId}`);
                return res.status(400).json({
                    success: false,
                    message: 'Mã đặt vé không hợp lệ',
                    error_code: 'INVALID_BOOKING_ID'
                });
            }

            if (!Number.isInteger(booking_id) || booking_id <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Mã đặt vé phải là số nguyên dương',
                    error_code: 'INVALID_BOOKING_ID_FORMAT'
                });
            }

            logger.info(`[sellSeats] User ${userId} đang xác nhận bán ghế cho booking ${booking_id}`);

            // OPTIMIZATION 2: Gọi service đã được tối ưu hóa
            const result = await seatService.sellSeatsAsync(userId, booking_id);

            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    message: result.message,
                    error_code: 'SELL_SEATS_FAILED'
                });
            }

            const responseTime = Date.now() - startTime;
            logger.info(`[sellSeats] Đã xác nhận bán ghế thành công cho booking ${booking_id} trong ${responseTime}ms`);

            return res.status(200).json({
                success: true,
                data: result.data,
                message: 'Xác nhận bán ghế thành công',
                _performance: {
                    response_time_ms: responseTime,
                    api_name: 'sellSeats',
                    optimized: true,
                    tickets_sold: result.data.tickets?.length || 0
                }
            });

        } catch (error) {
            const responseTime = Date.now() - startTime;
            logger.error('[sellSeats] Lỗi:', error);
            
            return res.status(500).json({
                success: false,
                message: 'Lỗi server nội bộ khi bán ghế',
                error_code: 'INTERNAL_SERVER_ERROR',
                _performance: {
                    response_time_ms: responseTime,
                    api_name: 'sellSeats',
                    error: true
                }
            });
        }
    }

    /**
     * Health check endpoint để monitor performance của seat APIs
     */
    async healthCheck(req, res) {
        const startTime = Date.now();
        
        try {
            // Basic health check
            const healthData = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                service: 'SeatController',
                version: '1.0.0-optimized',
                uptime: process.uptime(),
                memory_usage: process.memoryUsage(),
                response_time_ms: Date.now() - startTime
            };

            return res.status(200).json({
                success: true,
                data: healthData
            });

        } catch (error) {
            logger.error('[healthCheck] Lỗi:', error);
            
            return res.status(500).json({
                success: false,
                message: 'Health check failed',
                error: error.message,
                response_time_ms: Date.now() - startTime
            });
        }
    }
}

module.exports = new SeatController();
