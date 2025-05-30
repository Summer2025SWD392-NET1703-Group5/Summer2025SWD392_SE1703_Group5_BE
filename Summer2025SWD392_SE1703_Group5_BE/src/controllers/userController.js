'use strict';


const UserProfileService = require('../services/userProfileService');
const AuthService = require('../services/authService');
const logger = require('../utils/logger');


class UserController {
    async getAllUsers(req, res) {
        try {
            const users = await UserProfileService.getAllUsers();
            res.status(200).json(users);
        } catch (error) {
            logger.error(`Lỗi khi lấy danh sách người dùng: ${error.message}`);
            res.status(400).json({ message: error.message });
        }
    }


    async getUserById(req, res) {
        try {
            const { userId } = req.params;
            const parsedUserId = parseInt(userId, 10);


            if (isNaN(parsedUserId) || parsedUserId <= 0) {
                return res.status(400).json({ message: 'ID người dùng không hợp lệ' });
            }


            const currentUserId = parseInt(req.user.id, 10);
            const currentUserRole = req.user.role;


            if (currentUserId !== parsedUserId && !['Admin', 'Staff'].includes(currentUserRole)) {
                return res.status(403).json({ message: 'Không có quyền truy cập' });
            }


            const profile = await UserProfileService.getUserProfile(parsedUserId);
            res.status(200).json(profile);
        } catch (error) {
            logger.error(`Lỗi khi lấy thông tin người dùng ${req.params.userId}: ${error.message}`);
            res.status(error.message.includes('không tìm thấy') ? 404 : 500).json({ message: error.message });
        }
    }


    async restoreUser(req, res) {
        try {
            const { id } = req.params;
            const parsedId = parseInt(id, 10);


            if (isNaN(parsedId) || parsedId <= 0) {
                return res.status(400).json({ message: 'ID người dùng không hợp lệ' });
            }


            await UserProfileService.restoreUser(parsedId);
            res.status(200).json({ message: 'Khôi phục người dùng thành công' });
        } catch (error) {
            logger.error(`Lỗi khi khôi phục người dùng ${req.params.id}: ${error.message}`);
            res.status(error.message.includes('không tìm thấy') ? 404 : 400).json({ message: error.message });
        }
    }


    async registerUserWithAutoPassword(req, res) {
        try {
            const model = req.body;
            const adminId = parseInt(req.user.id, 10);


            if (!adminId) {
                return res.status(401).json({ message: 'Không thể xác định thông tin admin' });
            }


            const result = await AuthService.registerUserByAdmin(model, adminId);
            res.status(200).json(result);
        } catch (error) {
            logger.error(`Lỗi khi đăng ký người dùng: ${error.message}`);
            res.status(400).json({ message: error.message });
        }
    }


    async deleteUser(req, res) {
        try {
            const { id } = req.params;
            const parsedId = parseInt(id, 10);
            const currentUserId = parseInt(req.user.id, 10);


            if (isNaN(parsedId) || parsedId <= 0) {
                return res.status(400).json({ message: 'ID người dùng không hợp lệ' });
            }


            if (currentUserId === parsedId) {
                return res.status(400).json({ message: 'Không thể xóa tài khoản của chính mình' });
            }


            await UserProfileService.deleteUser(parsedId);
            res.status(200).json({ message: 'Xóa người dùng thành công' });
        } catch (error) {
            logger.error(`Lỗi khi xóa người dùng ${req.params.id}: ${error.message}`);
            res.status(400).json({ message: error.message });
        }
    }


    async changeUserStatus(req, res) {
        try {
            const { id } = req.params;
            const parsedId = parseInt(id, 10);
            const { Status } = req.body;


            if (isNaN(parsedId) || parsedId <= 0) {
                return res.status(400).json({ message: 'ID người dùng không hợp lệ' });
            }


            await UserProfileService.changeAccountStatus(parsedId, Status);
            res.status(200).json({ message: 'Thay đổi trạng thái tài khoản thành công' });
        } catch (error) {
            logger.error(`Lỗi khi thay đổi trạng thái tài khoản ${req.params.id}: ${error.message}`);
            res.status(400).json({ message: error.message });
        }
    }


    async resetPassword(req, res) {
        try {
            const { id } = req.params;
            const parsedId = parseInt(id, 10);


            if (isNaN(parsedId) || parsedId <= 0) {
                return res.status(400).json({ message: 'ID người dùng không hợp lệ' });
            }


            const result = await AuthService.resetPassword(parsedId);
            res.status(200).json(result);
        } catch (error) {
            logger.error(`Lỗi khi đặt lại mật khẩu cho người dùng ${req.params.id}: ${error.message}`);
            res.status(400).json({ message: error.message });
        }
    }


    async getUserProfile(req, res) {
        try {
            const userId = parseInt(req.user.id, 10);
            if (!userId) {
                return res.status(401).json({ message: 'Người dùng chưa xác thực' });
            }


            const profile = await UserProfileService.getUserProfile(userId);
            res.status(200).json(profile);
        } catch (error) {
            logger.error(`Lỗi khi lấy hồ sơ người dùng: ${error.message}`);
            res.status(error.message.includes('không tìm thấy') ? 404 : 400).json({ message: error.message });
        }
    }
    
}


module.exports = new UserController();

