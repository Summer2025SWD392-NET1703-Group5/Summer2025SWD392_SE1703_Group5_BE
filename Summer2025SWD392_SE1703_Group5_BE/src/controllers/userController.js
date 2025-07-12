
'use strict';

const UserProfileService = require('../services/userProfileService');
const AuthService = require('../services/authService');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

class UserController {
    async getAllUsers(req, res) {
        try {
            const users = await UserProfileService.getAllUsers();
            res.status(200).json(users);
        } catch (error) {
            logger.error(`Lỗi khi lấy danh sách người dùng: ${error.message}`);
            res.status(500).json({
                message: 'Không thể lấy danh sách người dùng. Vui lòng thử lại sau.',
                error: error.message
            });
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
            logger.info(`[userController.getUserProfile] START: Request from user ID: ${req.user ? req.user.id : 'unknown'}`);

            // Kiểm tra đầy đủ về thông tin người dùng từ req.user
            if (!req.user) {
                logger.warn(`[userController.getUserProfile] Missing req.user object`);
                return res.status(401).json({ message: 'Người dùng chưa xác thực' });
            }

            // Lấy userId từ nhiều nguồn khả dĩ trong req.user
            let userId = null;
            if (req.user.id) {
                userId = parseInt(req.user.id, 10);
                logger.info(`[userController.getUserProfile] Using req.user.id: ${userId}`);
            } else if (req.user.userId) {
                userId = parseInt(req.user.userId, 10);
                logger.info(`[userController.getUserProfile] Using req.user.userId: ${userId}`);
            } else if (req.user.User_ID) {
                userId = parseInt(req.user.User_ID, 10);
                logger.info(`[userController.getUserProfile] Using req.user.User_ID: ${userId}`);
            }

            if (!userId || isNaN(userId)) {
                logger.warn(`[userController.getUserProfile] Invalid user ID: ${userId}`);
                return res.status(401).json({ message: 'ID người dùng không hợp lệ' });
            }

            logger.info(`[userController.getUserProfile] Retrieving profile for user ID: ${userId}`);
            const profile = await UserProfileService.getUserProfile(userId);

            logger.info(`[userController.getUserProfile] SUCCESS: Retrieved profile for user ID: ${userId}`);
            return res.status(200).json(profile);
        } catch (error) {
            logger.error(`[userController.getUserProfile] ERROR: ${error.message}`);

            if (error.message.includes('Lỗi kết nối đến cơ sở dữ liệu')) {
                return res.status(503).json({
                    message: 'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau.'
                });
            } else if (error.message.includes('không tìm thấy')) {
                return res.status(404).json({
                    message: 'Không tìm thấy thông tin người dùng'
                });
            } else {
                return res.status(500).json({
                    message: 'Đã xảy ra lỗi khi lấy thông tin người dùng',
                    error: error.message
                });
            }
        }
    }

    async updateProfile(req, res) {
        try {
            const userId = parseInt(req.user.id, 10);
            if (!userId) {
                return res.status(401).json({ message: 'Người dùng chưa xác thực' });
            }

            const updateData = req.body;
            await UserProfileService.updateUserProfile(userId, updateData);

            const updatedProfile = await UserProfileService.getUserProfile(userId);
            res.status(200).json({
                message: 'Cập nhật thông tin thành công',
                user: updatedProfile
            });
        } catch (error) {
            logger.error(`Lỗi khi cập nhật hồ sơ người dùng: ${error.message}`);
            res.status(500).json({ message: error.message });
        }
    }

    async registerUserByStaff(req, res) {
        try {
            const model = req.body;
            const staffId = parseInt(req.user.id, 10);

            if (!staffId) {
                return res.status(401).json({ message: 'Không thể xác định thông tin nhân viên' });
            }

            const result = await AuthService.registerUserByStaff(model, staffId);
            res.status(200).json(result);
        } catch (error) {
            logger.error(`Lỗi khi đăng ký người dùng bởi nhân viên: ${error.message}`);
            res.status(400).json({ message: error.message });
        }
    }

    /**
     * Lấy danh sách tất cả Manager hiện có
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async getAllManagers(req, res) {
        try {
            // Check authentication
            if (!req.user || (!req.user.id && !req.user.userId)) {
                logger.error('Error in getAllManagers: Missing user authentication information');
                return res.status(401).json({
                    success: false,
                    message: 'Người dùng chưa xác thực'
                });
            }

            const { User, Cinema } = require('../models');
            const managers = await User.findAll({
                where: { Role: 'Manager', Account_Status: { [Op.ne]: 'Deleted' } },
                include: [{ model: Cinema, as: 'ManagedCinema' }]
            });

            const managersData = managers.map(manager => ({
                User_ID: manager.User_ID,
                Full_Name: manager.Full_Name,
                Email: manager.Email,
                Phone_Number: manager.Phone_Number,
                Cinema_ID: manager.Cinema_ID,
                Cinema_Name: manager.ManagedCinema ? manager.ManagedCinema.Cinema_Name : null
            }));

            res.status(200).json({
                success: true,
                data: managersData
            });
        } catch (error) {
            logger.error('Error in getAllManagers:', error);
            res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi lấy danh sách Manager',
                error: error.message
            });
        }
    }

    /**
     * Lấy danh sách tất cả Staff hiện có
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async getAllStaff(req, res) {
        try {
            // Check authentication
            if (!req.user || (!req.user.id && !req.user.userId)) {
                logger.error('Error in getAllStaff: Missing user authentication information');
                return res.status(401).json({
                    success: false,
                    message: 'Người dùng chưa xác thực'
                });
            }

            const { User, Cinema } = require('../models');
            const staff = await User.findAll({
                where: { Role: 'Staff', Account_Status: { [Op.ne]: 'Deleted' } },
                include: [{ model: Cinema, as: 'ManagedCinema' }]
            });

            const staffData = staff.map(staffMember => ({
                User_ID: staffMember.User_ID,
                Full_Name: staffMember.Full_Name,
                Email: staffMember.Email,
                Phone_Number: staffMember.Phone_Number,
                Cinema_ID: staffMember.Cinema_ID,
                Cinema_Name: staffMember.ManagedCinema ? staffMember.ManagedCinema.Cinema_Name : null
            }));

            res.status(200).json({
                success: true,
                data: staffData
            });
        } catch (error) {
            logger.error('Error in getAllStaff:', error);
            res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi lấy danh sách Staff',
                error: error.message
            });
        }
    }

    /**
     * Phân công người dùng (Staff/Manager) vào rạp phim
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async assignUserToCinema(req, res) {
        try {
            const { userId, role, cinemaId } = req.body;

            // Validate input
            if (!userId || !role || !cinemaId) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp đầy đủ userId, role và cinemaId'
                });
            }

            // Validate role
            if (!['Manager', 'Staff'].includes(role)) {
                return res.status(400).json({
                    success: false,
                    message: 'Role phải là Manager hoặc Staff'
                });
            }

            // Kiểm tra user có tồn tại và có đúng role không
            const { User, Cinema } = require('../models');
            const user = await User.findByPk(userId);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy người dùng'
                });
            }

            // Kiểm tra role của user có khớp với role được truyền vào không
            if (user.Role !== role) {
                return res.status(400).json({
                    success: false,
                    message: `Người dùng này có vai trò ${user.Role}, không phải ${role}`
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

            // Xử lý logic riêng cho Manager
            if (role === 'Manager') {
                // Kiểm tra xem rạp đã có manager chưa
                const existingManager = await User.findOne({
                    where: {
                        Cinema_ID: cinemaId,
                        Role: 'Manager',
                        User_ID: { [Op.ne]: userId } // Loại trừ chính manager đang được gán
                    }
                });

                if (existingManager) {
                    return res.status(400).json({
                        success: false,
                        message: `Rạp phim ${cinema.Cinema_Name} đã có quản lý là ${existingManager.Full_Name}. Mỗi rạp chỉ được phép có 1 quản lý.`
                    });
                }

                // Cập nhật Cinema_ID cho Manager
                await user.update({ Cinema_ID: cinemaId });

                // Cập nhật Email và Phone_Number của rạp phim theo thông tin của Manager
                await cinema.update({
                    Email: user.Email,
                    Phone_Number: user.Phone_Number
                });

                logger.info(`Assigned Manager ${user.Full_Name} to cinema ${cinema.Cinema_Name} and updated contact info`);

                return res.status(200).json({
                    success: true,
                    message: `Đã phân công quản lý ${user.Full_Name} cho rạp phim ${cinema.Cinema_Name} và cập nhật thông tin liên hệ`,
                    data: {
                        User_ID: user.User_ID,
                        Full_Name: user.Full_Name,
                        Email: user.Email,
                        Phone_Number: user.Phone_Number,
                        Role: user.Role,
                        Cinema_ID: cinemaId,
                        Cinema_Name: cinema.Cinema_Name,
                        Cinema_Contact_Updated: true
                    }
                });
            }

            // Xử lý cho Staff
            if (role === 'Staff') {
                // 🔧 FIX: Kiểm tra staff đã được phân công cho rạp khác chưa
                if (user.Cinema_ID && user.Cinema_ID !== cinemaId) {
                    // Lấy thông tin rạp hiện tại của staff
                    const currentCinema = await Cinema.findByPk(user.Cinema_ID);
                    return res.status(400).json({
                        success: false,
                        message: `Nhân viên ${user.Full_Name} đã được phân công cho rạp ${currentCinema ? currentCinema.Cinema_Name : 'khác'}. Vui lòng hủy phân công hiện tại trước khi gán cho rạp mới.`,
                        current_assignment: {
                            Cinema_ID: user.Cinema_ID,
                            Cinema_Name: currentCinema ? currentCinema.Cinema_Name : 'Không xác định'
                        }
                    });
                }

                // Kiểm tra staff đã được gán cho rạp này chưa
                if (user.Cinema_ID === cinemaId) {
                    return res.status(400).json({
                        success: false,
                        message: `Nhân viên ${user.Full_Name} đã được phân công cho rạp ${cinema.Cinema_Name} rồi.`
                    });
                }

                // Cập nhật Cinema_ID cho Staff
                await user.update({ Cinema_ID: cinemaId });

                logger.info(`Assigned Staff ${user.Full_Name} to cinema ${cinema.Cinema_Name}`);

                return res.status(200).json({
                    success: true,
                    message: `Đã phân công nhân viên ${user.Full_Name} cho rạp phim ${cinema.Cinema_Name}`,
                    data: {
                        User_ID: user.User_ID,
                        Full_Name: user.Full_Name,
                        Email: user.Email,
                        Phone_Number: user.Phone_Number,
                        Role: user.Role,
                        Cinema_ID: cinemaId,
                        Cinema_Name: cinema.Cinema_Name
                    }
                });
            }

        } catch (error) {
            logger.error('Error in assignUserToCinema:', error);
            res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi phân công người dùng cho rạp phim',
                error: error.message
            });
        }
    }

    /**
     * Gán Manager cho một rạp phim
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     * @deprecated Sử dụng assignUserToCinema thay thế
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

            // 🔧 FIX: Kiểm tra staff đã được phân công cho rạp khác chưa
            if (staffMember.Cinema_ID && staffMember.Cinema_ID !== cinemaId) {
                // Lấy thông tin rạp hiện tại của staff
                const currentCinema = await Cinema.findByPk(staffMember.Cinema_ID);
                return res.status(400).json({
                    success: false,
                    message: `Nhân viên ${staffMember.Full_Name} đã được phân công cho rạp ${currentCinema ? currentCinema.Cinema_Name : 'khác'}. Vui lòng hủy phân công hiện tại trước khi gán cho rạp mới.`,
                    current_assignment: {
                        Cinema_ID: staffMember.Cinema_ID,
                        Cinema_Name: currentCinema ? currentCinema.Cinema_Name : 'Không xác định'
                    }
                });
            }

            // Kiểm tra staff đã được gán cho rạp này chưa
            if (staffMember.Cinema_ID === cinemaId) {
                return res.status(400).json({
                    success: false,
                    message: `Nhân viên ${staffMember.Full_Name} đã được phân công cho rạp ${cinema.Cinema_Name} rồi.`
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

    /**
     * Xóa gán Manager khỏi rạp phim
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async removeManagerFromCinema(req, res) {
        try {
            const { managerId } = req.params;

            if (!managerId) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp Manager ID'
                });
            }

            // Kiểm tra Manager có tồn tại không
            const { User } = require('../models');
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

            // Kiểm tra Manager có được gán cho rạp phim nào không
            if (!manager.Cinema_ID) {
                return res.status(400).json({
                    success: false,
                    message: 'Manager này chưa được gán cho rạp phim nào'
                });
            }

            // Cập nhật Cinema_ID cho Manager thành null
            await manager.update({ Cinema_ID: null });

            res.status(200).json({
                success: true,
                message: `Đã xóa gán Manager ${manager.Full_Name} khỏi rạp phim`,
                data: {
                    User_ID: manager.User_ID,
                    Full_Name: manager.Full_Name,
                    Email: manager.Email
                }
            });
        } catch (error) {
            logger.error('Error in removeManagerFromCinema:', error);
            res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi xóa gán Manager khỏi rạp phim',
                error: error.message
            });
        }
    }

    /**
     * Xóa gán Staff khỏi rạp phim
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async removeStaffFromCinema(req, res) {
        try {
            const { staffId } = req.params;

            if (!staffId) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp Staff ID'
                });
            }

            // Kiểm tra Staff có tồn tại không
            const { User } = require('../models');
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

            // Kiểm tra Staff có được gán cho rạp phim nào không
            if (!staffMember.Cinema_ID) {
                return res.status(400).json({
                    success: false,
                    message: 'Staff này chưa được gán cho rạp phim nào'
                });
            }

            // Cập nhật Cinema_ID cho Staff thành null
            await staffMember.update({ Cinema_ID: null });

            res.status(200).json({
                success: true,
                message: `Đã xóa phân công nhân viên ${staffMember.Full_Name} khỏi rạp phim`,
                data: {
                    User_ID: staffMember.User_ID,
                    Full_Name: staffMember.Full_Name,
                    Email: staffMember.Email
                }
            });
        } catch (error) {
            logger.error('Error in removeStaffFromCinema:', error);
            res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi xóa phân công Staff khỏi rạp phim',
                error: error.message
            });
        }
    }

    /**
     * Lấy thông tin chi tiết của Staff theo ID
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async getStaffDetailById(req, res) {
        try {
            const { id } = req.params;
            const staffId = parseInt(id, 10);

            if (isNaN(staffId) || staffId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'ID không hợp lệ'
                });
            }

            const staff = await UserProfileService.getStaffDetailById(staffId);

            res.status(200).json({
                success: true,
                data: staff
            });
        } catch (error) {
            logger.error(`Error in getStaffDetailById: ${error.message}`, error);
            res.status(error.message.includes('Không tìm thấy') ? 404 : 500).json({
                success: false,
                message: error.message.includes('Không tìm thấy')
                    ? error.message
                    : 'Đã xảy ra lỗi khi lấy thông tin nhân viên',
                error: error.message
            });
        }
    }

    /**
     * Lấy thông tin chi tiết của Manager theo ID
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async getManagerDetailById(req, res) {
        try {
            const { id } = req.params;
            const managerId = parseInt(id, 10);

            if (isNaN(managerId) || managerId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'ID không hợp lệ'
                });
            }

            const manager = await UserProfileService.getManagerDetailById(managerId);

            res.status(200).json({
                success: true,
                data: manager
            });
        } catch (error) {
            logger.error(`Error in getManagerDetailById: ${error.message}`, error);
            res.status(error.message.includes('Không tìm thấy') ? 404 : 500).json({
                success: false,
                message: error.message.includes('Không tìm thấy')
                    ? error.message
                    : 'Đã xảy ra lỗi khi lấy thông tin quản lý',
                error: error.message
            });
        }
    }

    /**
     * Kiểm tra staff assignments và tìm staff được assign cho nhiều rạp
     * @route GET /api/user/check-staff-assignments
     * @access Admin
     */
    async checkStaffAssignments(req, res) {
        try {
            logger.info('Controller: Checking staff assignments for duplicates');

            const { User, Cinema } = require('../models');

            // Lấy tất cả staff có Cinema_ID
            const staffWithAssignments = await User.findAll({
                where: {
                    Role: 'Staff',
                    Cinema_ID: { [require('sequelize').Op.ne]: null }
                },
                include: [{
                    model: Cinema,
                    as: 'ManagedCinema',
                    attributes: ['Cinema_ID', 'Cinema_Name', 'City']
                }],
                attributes: ['User_ID', 'Full_Name', 'Email', 'Cinema_ID', 'Role'],
                order: [['Cinema_ID', 'ASC'], ['Full_Name', 'ASC']]
            });

            // Nhóm theo Cinema_ID để kiểm tra
            const assignmentsByCinema = {};
            const staffAssignments = [];

            staffWithAssignments.forEach(staff => {
                const cinemaId = staff.Cinema_ID;
                if (!assignmentsByCinema[cinemaId]) {
                    assignmentsByCinema[cinemaId] = [];
                }
                assignmentsByCinema[cinemaId].push(staff);

                staffAssignments.push({
                    User_ID: staff.User_ID,
                    Full_Name: staff.Full_Name,
                    Email: staff.Email,
                    Cinema_ID: staff.Cinema_ID,
                    Cinema_Name: staff.ManagedCinema ? staff.ManagedCinema.Cinema_Name : 'Không xác định',
                    Cinema_City: staff.ManagedCinema ? staff.ManagedCinema.City : 'Không xác định'
                });
            });

            // Thống kê
            const totalStaffAssigned = staffWithAssignments.length;
            const totalCinemasWithStaff = Object.keys(assignmentsByCinema).length;
            const cinemasWithMultipleStaff = Object.entries(assignmentsByCinema)
                .filter(([cinemaId, staffList]) => staffList.length > 1)
                .map(([cinemaId, staffList]) => ({
                    Cinema_ID: parseInt(cinemaId),
                    Cinema_Name: staffList[0].ManagedCinema ? staffList[0].ManagedCinema.Cinema_Name : 'Không xác định',
                    Staff_Count: staffList.length,
                    Staff_List: staffList.map(s => ({
                        User_ID: s.User_ID,
                        Full_Name: s.Full_Name,
                        Email: s.Email
                    }))
                }));

            res.status(200).json({
                success: true,
                message: 'Đã kiểm tra staff assignments thành công',
                summary: {
                    total_staff_assigned: totalStaffAssigned,
                    total_cinemas_with_staff: totalCinemasWithStaff,
                    cinemas_with_multiple_staff: cinemasWithMultipleStaff.length
                },
                staff_assignments: staffAssignments,
                potential_issues: cinemasWithMultipleStaff
            });

        } catch (error) {
            logger.error('Error in checkStaffAssignments:', error);
            res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi kiểm tra staff assignments',
                error: error.message
            });
        }
    }

    /**
     * Reassign staff từ rạp cũ sang rạp mới
     * @route PUT /api/user/reassign-staff
     * @access Admin
     */
    async reassignStaff(req, res) {
        try {
            const { staffId, newCinemaId, force = false } = req.body;

            if (!staffId || !newCinemaId) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp staffId và newCinemaId'
                });
            }

            const { User, Cinema } = require('../models');

            // Kiểm tra staff có tồn tại không
            const staff = await User.findByPk(staffId);
            if (!staff) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy staff'
                });
            }

            if (staff.Role !== 'Staff') {
                return res.status(400).json({
                    success: false,
                    message: 'Người dùng được chọn không phải là Staff'
                });
            }

            // Kiểm tra rạp mới có tồn tại không
            const newCinema = await Cinema.findByPk(newCinemaId);
            if (!newCinema) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy rạp phim mới'
                });
            }

            // Lấy thông tin rạp cũ nếu có
            let oldCinema = null;
            if (staff.Cinema_ID) {
                oldCinema = await Cinema.findByPk(staff.Cinema_ID);
            }

            // Nếu staff đã ở rạp này rồi
            if (staff.Cinema_ID === newCinemaId) {
                return res.status(400).json({
                    success: false,
                    message: `Staff ${staff.Full_Name} đã được phân công cho rạp ${newCinema.Cinema_Name} rồi`
                });
            }

            // Cập nhật Cinema_ID
            await staff.update({ Cinema_ID: newCinemaId });

            logger.info(`Reassigned Staff ${staff.Full_Name} from cinema ${oldCinema ? oldCinema.Cinema_Name : 'None'} to ${newCinema.Cinema_Name}`);

            res.status(200).json({
                success: true,
                message: `Đã chuyển nhân viên ${staff.Full_Name} ${oldCinema ? `từ rạp ${oldCinema.Cinema_Name} ` : ''}sang rạp ${newCinema.Cinema_Name}`,
                data: {
                    User_ID: staff.User_ID,
                    Full_Name: staff.Full_Name,
                    Email: staff.Email,
                    old_cinema: oldCinema ? {
                        Cinema_ID: oldCinema.Cinema_ID,
                        Cinema_Name: oldCinema.Cinema_Name
                    } : null,
                    new_cinema: {
                        Cinema_ID: newCinema.Cinema_ID,
                        Cinema_Name: newCinema.Cinema_Name
                    }
                }
            });

        } catch (error) {
            logger.error('Error in reassignStaff:', error);
            res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi chuyển staff sang rạp mới',
                error: error.message
            });
        }
    }
}

module.exports = new UserController();
