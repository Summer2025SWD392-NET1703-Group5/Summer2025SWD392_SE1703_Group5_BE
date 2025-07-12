// src/routes/ticketCancellationRoutes.js
const express = require('express');
const router = express.Router();
const ticketCancellationService = require('../services/ticketCancellationService');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');
const logger = require('../utils/logger');

/**
 * @route GET /api/ticket-cancellation/status
 * @desc Lấy trạng thái của Ticket Cancellation Service
 * @access Private (Admin/Staff only)
 */
router.get('/status', authMiddleware, authorizeRoles('Admin', 'Staff'), async (req, res) => {
    try {
        const stats = ticketCancellationService.getStats();
        
        res.json({
            success: true,
            message: 'Trạng thái Ticket Cancellation Service',
            data: stats
        });
    } catch (error) {
        logger.error('Error getting ticket cancellation service status:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi lấy trạng thái service',
            error: error.message
        });
    }
});

/**
 * @route POST /api/ticket-cancellation/start
 * @desc Khởi động Ticket Cancellation Service
 * @access Private (Admin only)
 */
router.post('/start', authMiddleware, authorizeRoles('Admin'), async (req, res) => {
    try {
        await ticketCancellationService.start();
        
        res.json({
            success: true,
            message: 'Ticket Cancellation Service đã được khởi động',
            data: ticketCancellationService.getStats()
        });
    } catch (error) {
        logger.error('Error starting ticket cancellation service:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi khởi động service',
            error: error.message
        });
    }
});

/**
 * @route POST /api/ticket-cancellation/stop
 * @desc Dừng Ticket Cancellation Service
 * @access Private (Admin only)
 */
router.post('/stop', authMiddleware, authorizeRoles('Admin'), async (req, res) => {
    try {
        ticketCancellationService.stop();
        
        res.json({
            success: true,
            message: 'Ticket Cancellation Service đã được dừng',
            data: ticketCancellationService.getStats()
        });
    } catch (error) {
        logger.error('Error stopping ticket cancellation service:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi dừng service',
            error: error.message
        });
    }
});

/**
 * @route POST /api/ticket-cancellation/check
 * @desc Thực hiện kiểm tra thủ công
 * @access Private (Admin/Staff only)
 */
router.post('/check', authMiddleware, authorizeRoles('Admin', 'Staff'), async (req, res) => {
    try {
        const result = await ticketCancellationService.executeCheck();
        
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
 * @route POST /api/ticket-cancellation/force-check/:ticketId
 * @desc Force check một vé cụ thể
 * @access Private (Admin/Staff only)
 */
router.post('/force-check/:ticketId', authMiddleware, authorizeRoles('Admin', 'Staff'), async (req, res) => {
    try {
        const { ticketId } = req.params;
        
        if (!ticketId || isNaN(ticketId)) {
            return res.status(400).json({
                success: false,
                message: 'Ticket ID không hợp lệ'
            });
        }

        const result = await ticketCancellationService.forceCheckTicket(parseInt(ticketId));
        
        res.json({
            success: result.success,
            message: result.message,
            data: result
        });
    } catch (error) {
        logger.error(`Error force checking ticket ${req.params.ticketId}:`, error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi kiểm tra vé',
            error: error.message
        });
    }
});

module.exports = router;
