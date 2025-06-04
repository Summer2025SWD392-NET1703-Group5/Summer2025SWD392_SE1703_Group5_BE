// src/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');

/**
 * Middleware xác thực JWT token
 * HỖ TRỢ CẢ HAI FORMAT:
 * 1. "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." (format cũ)
 * 2. "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." (format mới - trực tiếp)
 */
// Thay thế authMiddleware trong src/middlewares/authMiddleware.js

function authMiddleware(req, res, next) {
    console.log('[authMiddleware] === AUTH MIDDLEWARE START ===');

    const authHeader = req.headers.authorization;
    console.log('[authMiddleware] Authorization header:', authHeader ? `${authHeader.substring(0, 50)}...` : 'NOT PROVIDED');

    if (!authHeader) {
        console.log('[authMiddleware] No authorization header');
        return res.status(401).json({
            message: 'Token không được cung cấp. Vui lòng đăng nhập.'
        });
    }

    let token;

    if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
        console.log('[authMiddleware] Detected Bearer token format');
    } else {
        token = authHeader;
        console.log('[authMiddleware] Detected direct token format');
    }

    console.log('[authMiddleware] Extracted token length:', token?.length);
    console.log('[authMiddleware] Token preview:', token ? `${token.substring(0, 30)}...` : 'EMPTY');

    if (!token || token.trim() === '') {
        console.log('[authMiddleware] Token is empty or invalid');
        return res.status(401).json({
            message: 'Token không hợp lệ.'
        });
    }

    try {
        console.log('[authMiddleware] Attempting to verify token...');
        console.log('[authMiddleware] JWT_SECRET defined:', !!process.env.JWT_SECRET);

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('[authMiddleware] Token decoded successfully:', decoded);

        // FIX: Kiểm tra payload có đầy đủ thông tin không
        if (!decoded.id && !decoded.userId) {
            console.error('[authMiddleware] Token missing user ID fields:', decoded);
            return res.status(401).json({
                message: 'Token không chứa thông tin người dùng hợp lệ.'
            });
        }

        if (!decoded.email) {
            console.warn('[authMiddleware] Token missing email field');
        }

        if (!decoded.role) {
            console.warn('[authMiddleware] Token missing role field');
        }

        console.log('[authMiddleware] Token verified successfully for user:', decoded.email || decoded.userId || decoded.id);

        // Thêm thông tin user vào request
        req.user = decoded;
        console.log('[authMiddleware] req.user set:', {
            id: req.user.id,
            userId: req.user.userId,
            email: req.user.email,
            role: req.user.role
        });

        console.log('[authMiddleware] === AUTH MIDDLEWARE SUCCESS ===');
        return next();

    } catch (err) {
        console.error('[authMiddleware] === AUTH MIDDLEWARE ERROR ===');
        console.error('[authMiddleware] Error name:', err.name);
        console.error('[authMiddleware] Error message:', err.message);
        console.error('[authMiddleware] Full error:', err);

        if (err.name === 'TokenExpiredError') {
            console.error('[authMiddleware] Token expired at:', new Date(err.expiredAt));
            return res.status(401).json({
                message: 'Token đã hết hạn. Vui lòng đăng nhập lại.'
            });
        }

        if (err.name === 'JsonWebTokenError') {
            console.error('[authMiddleware] Invalid JWT token');
            return res.status(401).json({
                message: 'Token không hợp lệ.'
            });
        }

        return res.status(401).json({
            message: 'Lỗi xác thực token.'
        });
    }
}

/**
 * Middleware kiểm tra vai trò user.
 * Sử dụng: authorizeRoles('Admin'), authorizeRoles('Admin', 'Staff')
 */
function authorizeRoles(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            console.error('[authorizeRoles] Error: req.user or req.user.role is missing.');
            console.log('[authorizeRoles] req.user:', req.user);
            return res.status(401).json({
                message: 'Token không hợp lệ hoặc người dùng chưa xác thực.'
            });
        }

        const userRole = req.user.role;
        console.log(`[authorizeRoles] Checking access...`);
        console.log(`[authorizeRoles] User Role: '${userRole}' (Type: ${typeof userRole}, Length: ${userRole.length})`);
        console.log(`[authorizeRoles] Allowed Roles: ${JSON.stringify(allowedRoles)}`);
        allowedRoles.forEach((role, index) => {
            console.log(`[authorizeRoles] Allowed Role [${index}]: '${role}' (Type: ${typeof role}, Length: ${role.length})`);
        });

        if (allowedRoles.includes(userRole)) {
            console.log(`[authorizeRoles] Access GRANTED for role: '${userRole}'`);
            return next();
        }

        console.log(`[authorizeRoles] Access DENIED. Required: [${allowedRoles.join(', ')}], Current: '${userRole}'`);
        return res.status(403).json({
            message: `Truy cập bị từ chối. Yêu cầu quyền: ${allowedRoles.join(', ')}. Vai trò hiện tại: ${userRole}.`
        });
    };
}

/**
 * Middleware kiểm tra quyền Manager trong rạp phim cụ thể
 * @param {string} paramName - Tên tham số chứa cinema ID trong request params (mặc định là 'cinemaId')
 */
function authorizeManager(paramName = 'cinemaId') {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    message: 'Người dùng chưa xác thực.'
                });
            }

            // Nếu là Admin, cho phép truy cập tất cả
            if (req.user.role === 'Admin') {
                return next();
            }

            // Kiểm tra xem user có phải là Manager không
            if (req.user.role !== 'Manager') {
                return res.status(403).json({
                    message: 'Bạn không có quyền truy cập tài nguyên này.'
                });
            }

            // Lấy cinema ID từ route params
            const cinemaId = req.params[paramName];
            if (!cinemaId) {
                return res.status(400).json({
                    message: 'ID rạp phim không được cung cấp.'
                });
            }

            // Kiểm tra xem Manager có được phân công cho rạp phim này không
            const { User } = require('../models');
            const manager = await User.findByPk(req.user.id);

            if (!manager || !manager.Cinema_ID || manager.Cinema_ID !== parseInt(cinemaId, 10)) {
                return res.status(403).json({
                    message: 'Bạn không có quyền quản lý rạp phim này.'
                });
            }

            next();
        } catch (error) {
            console.error('[authorizeManager] Error:', error);
            res.status(500).json({
                message: 'Đã xảy ra lỗi khi kiểm tra quyền truy cập.'
            });
        }
    };
}

/**
 * Middleware để xác thực quyền quản lý rạp phim cụ thể
 * Manager chỉ có quyền quản lý rạp phim được phân công
 * Admin có quyền quản lý tất cả rạp phim
 */
const authorizeCinemaManager = () => {
    return async (req, res, next) => {
        try {
            console.log("[authorizeCinemaManager] Checking cinema authorization...");

            // Admin có tất cả quyền
            if (req.user.role === 'Admin') {
                console.log("[authorizeCinemaManager] User is Admin, granting full access");
                return next();
            }

            // Chỉ Manager mới cần kiểm tra thêm
            if (req.user.role !== 'Manager') {
                console.log("[authorizeCinemaManager] User is not Manager, denying access");
                return res.status(403).json({
                    success: false,
                    message: 'Bạn không có quyền thực hiện thao tác này'
                });
            }

            const cinemaId = parseInt(req.params.id);
            if (isNaN(cinemaId)) {
                console.log("[authorizeCinemaManager] Invalid cinema ID format");
                return res.status(400).json({
                    success: false,
                    message: 'ID rạp phim không hợp lệ'
                });
            }

            // Lấy thông tin Manager từ database để kiểm tra Cinema_ID
            const { User } = require('../models');
            const manager = await User.findByPk(req.user.id);

            if (!manager) {
                console.log("[authorizeCinemaManager] Manager not found in database");
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy thông tin người dùng'
                });
            }

            console.log(`[authorizeCinemaManager] Manager Cinema_ID: ${manager.Cinema_ID}, Requested Cinema ID: ${cinemaId}`);

            // Kiểm tra xem Manager có được phân công quản lý rạp phim này không
            if (manager.Cinema_ID !== cinemaId) {
                console.log("[authorizeCinemaManager] Manager not assigned to this cinema, denying access");
                return res.status(403).json({
                    success: false,
                    message: 'Bạn chỉ được phép quản lý rạp phim được phân công'
                });
            }

            console.log("[authorizeCinemaManager] Access granted for cinema management");
            next();
        } catch (error) {
            console.error("[authorizeCinemaManager] Error:", error);
            res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi xác thực quyền quản lý rạp phim'
            });
        }
    };
};

// Export the middleware
module.exports = {
    authMiddleware,
    authorizeRoles,
    authorizeManager,
    authorizeCinemaManager
};