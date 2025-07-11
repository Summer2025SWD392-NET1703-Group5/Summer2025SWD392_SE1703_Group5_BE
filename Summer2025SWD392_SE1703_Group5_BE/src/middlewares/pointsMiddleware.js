const pointsService = require('../services/pointsService');
const logger = require('../utils/logger');

/**
 * Middleware để kiểm tra điểm của user trước khi áp dụng giảm giá
 */
const validatePointsUsage = async (req, res, next) => {
    try {
        // Tương thích với authMiddleware
        const userId = req.user.userId || req.user.id;
        const { points_to_use } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Không tìm thấy thông tin người dùng trong token'
            });
        }

        if (!points_to_use || points_to_use <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Số điểm sử dụng phải lớn hơn 0'
            });
        }

        // Lấy điểm hiện tại của user
        const userPoints = await pointsService.getUserPoints(userId);

        if (userPoints.Current_Points < points_to_use) {
            return res.status(400).json({
                success: false,
                message: `Không đủ điểm. Bạn có ${userPoints.Current_Points} điểm, cần ${points_to_use} điểm`
            });
        }

        // Thêm thông tin điểm vào request để sử dụng ở controller
        req.userPoints = userPoints;
        next();

    } catch (error) {
        logger.error('Lỗi trong middleware validatePointsUsage:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi kiểm tra điểm',
            error: error.message
        });
    }
};

/**
 * Middleware để kiểm tra quyền truy cập points của user khác (dành cho staff/admin)
 */
const validatePointsAccess = (req, res, next) => {
    try {
        const requestUserId = req.user.userId || req.user.id;
        const targetUserId = req.params.userId || req.body.user_id;
        const userRole = req.user.role;

        // Nếu không có target user ID, cho phép (truy cập điểm của chính mình)
        if (!targetUserId) {
            return next();
        }

        // Nếu truy cập điểm của chính mình
        if (parseInt(targetUserId) === parseInt(requestUserId)) {
            return next();
        }

        // Chỉ staff/admin mới được truy cập điểm của user khác
        if (userRole === 'Staff' || userRole === 'Admin') {
            return next();
        }

        return res.status(403).json({
            success: false,
            message: 'Bạn không có quyền truy cập thông tin điểm của user khác'
        });

    } catch (error) {
        logger.error('Lỗi trong middleware validatePointsAccess:', error);
        res.status(500).json({
            success: false,
            message: 'Có lỗi xảy ra khi kiểm tra quyền truy cập',
            error: error.message
        });
    }
};

module.exports = {
    validatePointsUsage,
    validatePointsAccess
};
