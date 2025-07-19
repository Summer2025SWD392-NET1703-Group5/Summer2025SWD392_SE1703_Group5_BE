// src/routes/showtimeExpirationRoutes.js
const express = require('express');
const router = express.Router();
const showtimeExpirationService = require('../services/showtimeExpirationService');
// console.log('showtimeExpirationService in routes:', typeof showtimeExpirationService, showtimeExpirationService);
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');

const adminMiddleware = authorizeRoles('Admin');

/**
 * @swagger
 * components:
 *   schemas:
 *     ExpirationStatus:
 *       type: object
 *       properties:
 *         isRunning:
 *           type: boolean
 *           description: Trạng thái chạy của service
 *         checkIntervalMinutes:
 *           type: number
 *           description: Khoảng thời gian kiểm tra (phút)
 *         nextCheckTime:
 *           type: string
 *           format: date-time
 *           description: Thời gian kiểm tra tiếp theo
 *         lastCheckTime:
 *           type: string
 *           format: date-time
 *           description: Thời gian kiểm tra cuối cùng
 *           nullable: true
 *         totalProcessed:
 *           type: integer
 *           description: Tổng số suất chiếu đã xử lý từ khi khởi động service
 *           nullable: true
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           nullable: true
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *         error:
 *           type: string
 *           nullable: true
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *       description: JWT token authentication
 */

/**
 * @swagger
 * tags:
 *   name: Showtime Expiration
 *   description: API quản lý tự động ẩn suất chiếu hết hạn
 */

/**
 * @swagger
 * /api/showtime-expiration/status:
 *   get:
 *     summary: Lấy trạng thái của Showtime Expiration Service
 *     tags: [Showtime Expiration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Trạng thái service
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ExpirationStatus'
 *       '401':
 *         description: Unauthorized (Token không hợp lệ hoặc thiếu)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '403':
 *         description: Forbidden (Không có quyền Admin)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Lỗi máy chủ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/status', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const status = showtimeExpirationService.getStatus();
        res.json({
            success: true,
            message: 'Lấy trạng thái service thành công.',
            data: status
        });
    } catch (error) {
        console.error('[ROUTE_ERROR] /api/showtime-expiration/status:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy trạng thái service.',
            error: error.message
        });
    }
});

/**
 * @swagger
 * /api/showtime-expiration/start:
 *   post:
 *     summary: Khởi động Showtime Expiration Service
 *     tags: [Showtime Expiration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Service đã được khởi động
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       '400':
 *         description: Service đã đang chạy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '401':
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '403':
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Lỗi máy chủ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/start', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await showtimeExpirationService.start();
        res.json({
            success: true,
            message: 'Showtime Expiration Service đã được khởi động.'
        });
    } catch (error) {
        console.error('[ROUTE_ERROR] /api/showtime-expiration/start:', error);
        if (error.message && error.message.includes('already running')) {
            return res.status(400).json({
                success: false,
                message: 'Service đã đang chạy.'
            });
        }
        res.status(500).json({
            success: false,
            message: 'Lỗi khi khởi động service.',
            error: error.message
        });
    }
});

/**
 * @swagger
 * /api/showtime-expiration/stop:
 *   post:
 *     summary: Dừng Showtime Expiration Service
 *     tags: [Showtime Expiration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Service đã được dừng
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       '400':
 *         description: Service chưa chạy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '401':
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '403':
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Lỗi máy chủ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/stop', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const result = showtimeExpirationService.stop();
        if (!result && showtimeExpirationService.getStatus && !showtimeExpirationService.getStatus().isRunning) {
            return res.status(400).json({
                success: false,
                message: 'Service chưa được khởi động hoặc đã dừng rồi.'
            });
        }
        res.json({
            success: true,
            message: 'Showtime Expiration Service đã được dừng.'
        });
    } catch (error) {
        console.error('[ROUTE_ERROR] /api/showtime-expiration/stop:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi dừng service.',
            error: error.message
        });
    }
});

/**
 * @swagger
 * /api/showtime-expiration/check-now:
 *   post:
 *     summary: Thực hiện kiểm tra suất chiếu hết hạn ngay lập tức
 *     tags: [Showtime Expiration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Đã thực hiện kiểm tra
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         processedCount:
 *                           type: integer
 *                           description: Số lượng suất chiếu đã xử lý
 *                         hiddenCount:
 *                           type: integer
 *                           description: Số lượng suất chiếu đã ẩn
 *       '401':
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '403':
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Lỗi máy chủ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/check-now', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const result = await showtimeExpirationService.executeCheck();
        res.json({
            success: true,
            message: 'Đã thực hiện kiểm tra suất chiếu hết hạn.',
            data: result
        });
    } catch (error) {
        console.error('[ROUTE_ERROR] /api/showtime-expiration/check-now:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi thực hiện kiểm tra.',
            error: error.message
        });
    }
});

module.exports = router;