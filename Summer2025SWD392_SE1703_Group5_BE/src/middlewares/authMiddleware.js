// src/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');


function authMiddleware(req, res, next) {
    // Kiểm tra an toàn req và req.headers
    if (!req || !req.headers) {
        console.error('[authMiddleware] Request or headers is undefined');
        return res.status(400).json({
            message: 'Yêu cầu không hợp lệ.'
        });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            message: 'Token không được cung cấp. Vui lòng đăng nhập.'
        });
    }

    let token;

    if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    } else {
        token = authHeader;
    }

    if (!token || token.trim() === '') {
        return res.status(401).json({
            message: 'Token không hợp lệ.'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // FIX: Kiểm tra payload có đầy đủ thông tin không
        if (!decoded.id && !decoded.userId) {
            console.error('[authMiddleware] Token missing user ID fields');
            return res.status(401).json({
                message: 'Token không chứa thông tin người dùng hợp lệ.'
            });
        }

        // Thêm thông tin user vào request
        req.user = decoded;
        return next();

    } catch (err) {
        console.error(`[authMiddleware] ${err.name}: ${err.message}`);

        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                message: 'Token đã hết hạn. Vui lòng đăng nhập lại.'
            });
        }

        if (err.name === 'JsonWebTokenError') {
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
        if (!req.user) {
            console.error('[authorizeRoles] req.user is missing');
            return res.status(401).json({
                message: 'Token không hợp lệ hoặc người dùng chưa xác thực.'
            });
        }

        // Get role from any possible location in the req.user object
        const userRole = req.user.role || req.user.Role;

        if (!userRole) {
            console.error('[authorizeRoles] User role is missing');
            return res.status(401).json({
                message: 'Token không chứa thông tin về vai trò người dùng.'
            });
        }

        if (allowedRoles.includes(userRole)) {
            return next();
        }

        console.warn(`[authorizeRoles] Access denied. Required: [${allowedRoles.join(', ')}], Current: '${userRole}'`);
        return res.status(403).json({
            message: `Truy cập bị từ chối. Yêu cầu quyền: ${allowedRoles.join(', ')}.`
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