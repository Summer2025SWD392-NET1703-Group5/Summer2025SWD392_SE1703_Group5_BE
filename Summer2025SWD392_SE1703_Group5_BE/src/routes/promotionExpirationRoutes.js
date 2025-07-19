// src/routes/promotionExpirationRoutes.js
const express = require('express');
const router = express.Router();
const promotionExpirationService = require('../services/promotionExpirationService');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');
const logger = require('../utils/logger');

/**
 * @route GET /api/promotion-expiration/status
 * @desc Lấy trạng thái của Promotion Expiration Service
 * @access Private (Admin/Staff only)
 */
router.get('/status', authMiddleware, authorizeRoles('Admin', 'Staff'), async (req, res) => {
    try {
        const stats = promotionExpirationService.getStats();

        res.json({
            success: true,
            message: 'Trạng thái Promotion Expiration Service',
            data: stats
        });
    } catch (error) {
        logger.error('Error getting promotion expiration service status:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi lấy trạng thái service',
            error: error.message
        });
    }
});

/**
 * @route POST /api/promotion-expiration/start
 * @desc Khởi động Promotion Expiration Service
 * @access Private (Admin only)
 */
router.post('/start', authMiddleware, authorizeRoles('Admin'), async (req, res) => {
    try {
        await promotionExpirationService.start();

        res.json({
            success: true,
            message: 'Promotion Expiration Service đã được khởi động',
            data: promotionExpirationService.getStats()
        });
    } catch (error) {
        logger.error('Error starting promotion expiration service:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi khởi động service',
            error: error.message
        });
    }
});

/**
 * @route POST /api/promotion-expiration/stop
 * @desc Dừng Promotion Expiration Service
 * @access Private (Admin only)
 */
router.post('/stop', authMiddleware, authorizeRoles('Admin'), async (req, res) => {
    try {
        promotionExpirationService.stop();

        res.json({
            success: true,
            message: 'Promotion Expiration Service đã được dừng',
            data: promotionExpirationService.getStats()
        });
    } catch (error) {
        logger.error('Error stopping promotion expiration service:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi dừng service',
            error: error.message
        });
    }
});

/**
 * @route POST /api/promotion-expiration/check
 * @desc Thực hiện kiểm tra thủ công
 * @access Private (Admin/Staff only)
 */
router.post('/check', authMiddleware, authorizeRoles('Admin', 'Staff'), async (req, res) => {
    try {
        const result = await promotionExpirationService.executeCheck();

        res.json({
            success: true,
            message: 'Đã thực hiện kiểm tra thủ công',
            data: result
        });
    } catch (error) {
        logger.error('Error executing manual check:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi thực hiện kiểm tra',
            error: error.message
        });
    }
});

/**
 * @route POST /api/promotion-expiration/force-check/:promotionId
 * @desc Force check một promotion cụ thể
 * @access Private (Admin/Staff only)
 */
router.post('/force-check/:promotionId', authMiddleware, authorizeRoles('Admin', 'Staff'), async (req, res) => {
    try {
        const { promotionId } = req.params;

        if (!promotionId || isNaN(promotionId)) {
            return res.status(400).json({
                success: false,
                message: 'Promotion ID không hợp lệ'
            });
        }

        const result = await promotionExpirationService.forceCheckPromotion(parseInt(promotionId));

        res.json({
            success: result.success,
            message: result.message,
            data: result
        });
    } catch (error) {
        logger.error(`Error force checking promotion ${req.params.promotionId}:`, error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi kiểm tra promotion',
            error: error.message
        });
    }
});

/**
 * @route GET /api/promotion-expiration/near-expiration
 * @desc Lấy danh sách promotion sắp hết hạn
 * @access Private (Admin/Staff only)
 */
router.get('/near-expiration', authMiddleware, authorizeRoles('Admin', 'Staff'), async (req, res) => {
    try {
        const { days = 7 } = req.query;
        const daysAhead = parseInt(days) || 7;
        
        if (daysAhead < 1 || daysAhead > 30) {
            return res.status(400).json({
                success: false,
                message: 'Số ngày phải từ 1 đến 30'
            });
        }

        const promotions = await promotionExpirationService.getPromotionsNearExpiration(daysAhead);
        
        res.json({
            success: true,
            message: `Danh sách promotion sắp hết hạn trong ${daysAhead} ngày tới`,
            data: {
                promotions,
                count: promotions.length,
                daysAhead
            }
        });
    } catch (error) {
        logger.error('Error getting promotions near expiration:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi lấy danh sách promotion',
            error: error.message
        });
    }
});

module.exports = router;
