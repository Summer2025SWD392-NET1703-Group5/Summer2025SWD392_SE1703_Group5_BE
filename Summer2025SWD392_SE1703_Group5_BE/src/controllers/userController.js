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
     /**
     * Gán Manager cho một rạp phim
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
     async assignManagerToCinema(req, res) {
        try {
            const { managerId, cinemaId } = req.body;


            if (!managerId || !cinemaId) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp cả Manager ID và Cinema ID'
                });
            }


            // Kiểm tra Manager có tồn tại không
            const { User, Cinema } = require('../models');
            const manager = await User.findByPk(managerId);
            if (!manager) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy Manager'
                });
            }


            // Kiểm tra có phải Manager không
            if (manager.Role !== 'Manager') {
                return res.status(400).json({
                    success: false,
                    message: 'Người dùng được chọn không phải là Manager'
                });
            }


            // Kiểm tra rạp phim có tồn tại không
            const cinema = await Cinema.findByPk(cinemaId);
            if (!cinema) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy rạp phim'
                });
            }


            // Cập nhật Cinema_ID cho Manager
            await manager.update({ Cinema_ID: cinemaId });


            // Cập nhật Email và Phone_Number của rạp phim theo thông tin của Manager
            await cinema.update({
                Email: manager.Email,
                Phone_Number: manager.Phone_Number
            });


            res.status(200).json({
                success: true,
                message: `Đã gán Manager ${manager.Full_Name} cho rạp phim ${cinema.Cinema_Name} và cập nhật thông tin liên hệ`,
                data: {
                    User_ID: manager.User_ID,
                    Full_Name: manager.Full_Name,
                    Email: manager.Email,
                    Phone_Number: manager.Phone_Number,
                    Cinema_ID: cinemaId,
                    Cinema_Name: cinema.Cinema_Name
                }
            });
        } catch (error) {
            logger.error('Error in assignManagerToCinema:', error);
            res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi gán Manager cho rạp phim',
                error: error.message
            });
        }
    }


    /**
     * Gán Staff cho một rạp phim
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async assignStaffToCinema(req, res) {
        try {
            const { staffId, cinemaId } = req.body;


            if (!staffId || !cinemaId) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp cả Staff ID và Cinema ID'
                });
            }


            // Kiểm tra Staff có tồn tại không
            const { User, Cinema } = require('../models');
            const staffMember = await User.findByPk(staffId);
            if (!staffMember) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy Staff'
                });
            }


            // Kiểm tra có phải Staff không
            if (staffMember.Role !== 'Staff') {
                return res.status(400).json({
                    success: false,
                    message: 'Người dùng được chọn không phải là Staff'
                });
            }


            // Kiểm tra rạp phim có tồn tại không
            const cinema = await Cinema.findByPk(cinemaId);
            if (!cinema) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy rạp phim'
                });
            }


            // Cập nhật Cinema_ID cho Staff
            await staffMember.update({ Cinema_ID: cinemaId });


            res.status(200).json({
                success: true,
                message: `Đã phân công nhân viên ${staffMember.Full_Name} cho rạp phim ${cinema.Cinema_Name}`,
                data: {
                    User_ID: staffMember.User_ID,
                    Full_Name: staffMember.Full_Name,
                    Email: staffMember.Email,
                    Phone_Number: staffMember.Phone_Number,
                    Cinema_ID: cinemaId,
                    Cinema_Name: cinema.Cinema_Name
                }
            });
        } catch (error) {
            logger.error('Error in assignStaffToCinema:', error);
            res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi phân công Staff cho rạp phim',
                error: error.message
            });
        }
    }




}


module.exports = new UserController();

