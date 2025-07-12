// src/controllers/seatSelectionController.js
// Controller cho real-time seat selection API

// Tạm thời comment service import để tránh lỗi models
// const seatSelectionService = require('../services/seatSelectionService');
const { validationResult } = require('express-validator');

class SeatSelectionController {

    /**
     * Lấy trạng thái ghế cho suất chiếu
     * GET /api/seat-selection/showtime/:showtimeId
     */
    async getShowtimeSeats(req, res) {
        try {
            console.log(`📋 API: Lấy trạng thái ghế cho suất chiếu ${req.params.showtimeId}`);

            const { showtimeId } = req.params;

            if (!showtimeId) {
                return res.status(400).json({
                    success: false,
                    message: 'Showtime ID is required'
                });
            }


            res.json({
                success: true,
                data: {
                    showtimeId: parseInt(showtimeId),
                    seats: seats,
                    totalSeats: seats.length,
                    availableSeats: seats.filter(s => s.status === 'available').length,
                    selectingSeats: seats.filter(s => s.status === 'selecting').length,
                    bookedSeats: seats.filter(s => s.status === 'booked').length
                },
                message: 'Lấy trạng thái ghế thành công'
            });

            console.log(`✅ API: Đã trả về ${seats.length} ghế cho suất chiếu ${showtimeId}`);

        } catch (error) {
            console.error(`❌ API Error getting showtime seats:`, error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy trạng thái ghế',
                error: error.message
            });
        }
    }

    /**
     * Chọn ghế (REST API backup cho WebSocket)
     * POST /api/seat-selection/select
     */
    async selectSeat(req, res) {
        try {
            console.log(`🎯 API: User ${req.user.userId} chọn ghế`);

            // Validate input
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Dữ liệu đầu vào không hợp lệ',
                    errors: errors.array()
                });
            }

            const { showtimeId, seatId } = req.body;
            const userId = req.user.userId;

            // Mock response cho testing
            const result = {
                success: true,
                seatId: seatId,
                status: 'selected',
                userId: userId,
                message: 'Seat selected successfully (mock)'
            };

            if (result.success) {
                res.json({
                    success: true,
                    data: result,
                    message: 'Chọn ghế thành công'
                });
            } else {
                res.status(409).json({
                    success: false,
                    message: result.message,
                    conflictUserId: result.conflictUserId
                });
            }

            console.log(`✅ API: Seat selection result for user ${userId}: ${result.success}`);

        } catch (error) {
            console.error(`❌ API Error selecting seat:`, error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi chọn ghế',
                error: error.message
            });
        }
    }

    /**
     * Bỏ chọn ghế (REST API backup cho WebSocket)
     * POST /api/seat-selection/deselect
     */
    async deselectSeat(req, res) {
        try {
            console.log(`🔄 API: User ${req.user.userId} bỏ chọn ghế`);

            // Validate input
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Dữ liệu đầu vào không hợp lệ',
                    errors: errors.array()
                });
            }

            const { showtimeId, seatId } = req.body;
            const userId = req.user.userId;

            // Mock response cho testing
            const result = {
                success: true,
                seatId: seatId,
                status: 'available',
                message: 'Seat deselected successfully (mock)'
            };

            if (result.success) {
                res.json({
                    success: true,
                    data: result,
                    message: 'Bỏ chọn ghế thành công'
                });
            } else {
                res.status(403).json({
                    success: false,
                    message: result.message
                });
            }

            console.log(`✅ API: Seat deselection result for user ${userId}: ${result.success}`);

        } catch (error) {
            console.error(`❌ API Error deselecting seat:`, error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi bỏ chọn ghế',
                error: error.message
            });
        }
    }

    /**
     * Lấy thống kê real-time (chỉ dành cho admin)
     * GET /api/seat-selection/statistics
     */
    async getStatistics(req, res) {
        try {
            console.log(`📊 API: Admin ${req.user.userId} lấy thống kê real-time`);

            // Kiểm tra quyền admin
            if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
                return res.status(403).json({
                    success: false,
                    message: 'Không có quyền truy cập'
                });
            }

            // Mock statistics cho testing
            const stats = {
                totalConnections: 5,
                totalSelectedSeats: 12,
                totalExpiredSeats: 3,
                activeShowtimes: 8,
                peakConcurrentUsers: 25
            };

            res.json({
                success: true,
                data: stats,
                message: 'Lấy thống kê thành công'
            });

            console.log(`✅ API: Đã trả về thống kê cho admin ${req.user.userId}`);

        } catch (error) {
            console.error(`❌ API Error getting statistics:`, error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thống kê',
                error: error.message
            });
        }
    }

    /**
     * Giải phóng ghế của user (dành cho admin hoặc cleanup)
     * POST /api/seat-selection/release-user-seats
     */
    async releaseUserSeats(req, res) {
        try {
            console.log(`🔄 API: Giải phóng ghế của user`);

            // Kiểm tra quyền
            if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
                return res.status(403).json({
                    success: false,
                    message: 'Không có quyền truy cập'
                });
            }

            const { userId } = req.body;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'User ID is required'
                });
            }

            res.json({
                success: true,
                data: {
                    releasedSeats: releasedSeats,
                    count: releasedSeats.length
                },
                message: `Đã giải phóng ${releasedSeats.length} ghế của user ${userId}`
            });

            console.log(`✅ API: Đã giải phóng ${releasedSeats.length} ghế cho user ${userId}`);

        } catch (error) {
            console.error(`❌ API Error releasing user seats:`, error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi giải phóng ghế',
                error: error.message
            });
        }
    }

    /**
     * Cleanup ghế timeout (dành cho admin)
     * POST /api/seat-selection/cleanup
     */
    async cleanupExpiredSeats(req, res) {
        try {

            // Kiểm tra quyền admin
            if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
                return res.status(403).json({
                    success: false,
                    message: 'Không có quyền truy cập'
                });
            }

            // Mock cleanup result cho testing
            const result = {
                cleanedCount: 5,
                cleanedSeats: ['B2', 'C3', 'D4', 'E5', 'F6']
            };

            res.json({
                success: true,
                data: result,
                message: `Đã cleanup ${result.cleanedCount} ghế timeout`
            });



        } catch (error) {
            console.error(`❌ API Error during cleanup:`, error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cleanup ghế',
                error: error.message
            });
        }
    }

    /**
     * Lấy danh sách ghế sắp hết hạn (dành cho admin)
     * GET /api/seat-selection/expiring-seats
     */
    async getExpiringSeats(req, res) {
        try {

            // Kiểm tra quyền admin
            if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
                return res.status(403).json({
                    success: false,
                    message: 'Không có quyền truy cập'
                });
            }

            // Mock expiring seats cho testing
            const expiringSeats = [
                { seatId: 'B2', showtimeId: 1, expiresAt: new Date(Date.now() + 120000) },
                { seatId: 'C3', showtimeId: 2, expiresAt: new Date(Date.now() + 180000) }
            ];

            res.json({
                success: true,
                data: {
                    expiringSeats: expiringSeats,
                    count: expiringSeats.length
                },
                message: `Tìm thấy ${expiringSeats.length} ghế sắp hết hạn`
            });

            console.log(`✅ API: Đã trả về ${expiringSeats.length} ghế sắp hết hạn`);

        } catch (error) {
            console.error(`❌ API Error getting expiring seats:`, error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách ghế sắp hết hạn',
                error: error.message
            });
        }
    }

    /**
     * Gia hạn thời gian giữ ghế
     * POST /api/seat-selection/extend-hold
     */
    async extendSeatHold(req, res) {
        try {
            console.log(`⏰ API: User ${req.user.userId} gia hạn ghế`);

            const { showtimeId, seatId } = req.body;

            if (!showtimeId || !seatId) {
                return res.status(400).json({
                    success: false,
                    message: 'Showtime ID and Seat ID are required'
                });
            }

            // Mock extend seat hold cho testing
            const result = {
                success: true,
                seatId: seatId,
                newExpiresAt: new Date(Date.now() + 900000), // +15 minutes
                message: 'Seat hold extended successfully (mock)'
            };

            if (result.success) {
                res.json({
                    success: true,
                    data: result,
                    message: result.message
                });
            } else {
                res.status(403).json({
                    success: false,
                    message: result.message
                });
            }

            console.log(`✅ API: Extend seat hold result for user ${req.user.userId}: ${result.success}`);

        } catch (error) {
            console.error(`❌ API Error extending seat hold:`, error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi gia hạn ghế',
                error: error.message
            });
        }
    }

    /**
     * Health check cho WebSocket service
     * GET /api/seat-selection/health
     */
    async healthCheck(req, res) {
        try {
            // Mock health check stats cho testing
            const stats = {
                totalConnections: 3,
                totalSelectedSeats: 8,
                totalExpiredSeats: 1,
                uptime: process.uptime(),
                memory: process.memoryUsage()
            };
            
            res.json({
                success: true,
                data: {
                    status: 'healthy',
                    uptime: process.uptime(),
                    timestamp: new Date().toISOString(),
                    stats: stats
                },
                message: 'Seat selection service is running'
            });

        } catch (error) {
            console.error(`❌ Health check failed:`, error);
            res.status(500).json({
                success: false,
                message: 'Service health check failed',
                error: error.message
            });
        }
    }
}

module.exports = new SeatSelectionController();