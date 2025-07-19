
'use strict';

const { User, TicketBooking } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

// Helper function để kiểm tra user có active bookings không
async function hasActiveBookings(userId) {
    console.log(`[hasActiveBookings] Kiểm tra active bookings cho User ID ${userId}`);
    
    try {
        const activeBookingsCount = await TicketBooking.count({
            where: {
                User_ID: userId,
                Status: { [Op.in]: ['Pending', 'Confirmed'] }
            }
        });
        
        console.log(`[hasActiveBookings] Tìm thấy ${activeBookingsCount} active bookings cho User ID ${userId}`);
        return {
            hasBookings: activeBookingsCount > 0,
            count: activeBookingsCount
        };
    } catch (error) {
        console.error(`[hasActiveBookings] Lỗi khi kiểm tra active bookings:`, error);
        return {
            hasBookings: true, // Default to true để an toàn
            count: 0
        };
    }
}

class UserProfileService {
    async getAllUsers() {
        try {
            const { getConnection } = require('../config/database');
            const pool = await getConnection();

            // Kiểm tra nếu pool là đối tượng lỗi (không phải ConnectionPool)
            if (pool && pool.errorStatus) {
                throw new Error('Lỗi kết nối đến cơ sở dữ liệu: ' + pool.message);
            }

            const users = await User.findAll({
                where: { Account_Status: { [Op.ne]: 'Deleted' } },
            });

            return users.map((u) => ({
                User_ID: u.User_ID,
                Full_Name: u.Full_Name,
                Email: u.Email,
                Phone_Number: u.Phone_Number,
                Address: u.Address,
                Date_Of_Birth: u.Date_Of_Birth,
                Sex: u.Sex,
                Role: u.Role,
                Account_Status: u.Account_Status,
                Last_Login: u.Last_Login,
            }));
        } catch (error) {
            logger.error(`[UserProfileService] Lỗi khi lấy tất cả người dùng: ${error.message}`);
            throw error;
        }
    }

    async getUserProfile(userId) {
        try {
            const { getConnection } = require('../config/database');
            const pool = await getConnection();

            // Kiểm tra nếu pool là đối tượng lỗi (không phải ConnectionPool)
            if (pool && pool.errorStatus) {
                throw new Error('Lỗi kết nối đến cơ sở dữ liệu: ' + pool.message);
            }

            const user = await User.findByPk(userId);
            if (!user) {
                throw new Error(`Không tìm thấy người dùng với ID ${userId}`);
            }

            switch (user.Role.toLowerCase()) {
                case 'customer':
                    return {
                        User_ID: user.User_ID,
                        Full_Name: user.Full_Name,
                        Email: user.Email,
                        Phone_Number: user.Phone_Number,
                        Address: user.Address,
                        Date_Of_Birth: user.Date_Of_Birth,
                        Sex: user.Sex,
                    };
                case 'admin':
                case 'staff':
                case 'manager':
                    return {
                        User_ID: user.User_ID,
                        Full_Name: user.Full_Name,
                        Email: user.Email,
                        Phone_Number: user.Phone_Number,
                        Address: user.Address,
                        Date_Of_Birth: user.Date_Of_Birth,
                        Sex: user.Sex,
                        Role: user.Role,
                        Department: user.Department,
                        Hire_Date: user.Hire_Date,
                        Created_At: user.Created_At,
                        Last_Login: user.Last_Login,
                        Account_Status: user.Account_Status,
                    };
                default:
                    throw new Error('Vai trò người dùng không hợp lệ');
            }
        } catch (error) {
            logger.error(`[UserProfileService] Lỗi khi lấy thông tin người dùng ${userId}: ${error.message}`);
            throw error;
        }
    }

    async restoreUser(id) {
        try {
            const { getConnection } = require('../config/database');
            const pool = await getConnection();

            // Kiểm tra nếu pool là đối tượng lỗi (không phải ConnectionPool)
            if (pool && pool.errorStatus) {
                throw new Error('Lỗi kết nối đến cơ sở dữ liệu: ' + pool.message);
            }

            const user = await User.findByPk(id);
            if (!user) {
                throw new Error('Không tìm thấy người dùng');
            }

            if (user.Account_Status !== 'Deleted') {
                throw new Error('Người dùng chưa bị xóa mềm');
            }

            user.Account_Status = 'Active';
            await user.save();

            logger.info(`[UserProfileService] Đã khôi phục người dùng với ID: ${id}`);
            return true;
        } catch (error) {
            logger.error(`[UserProfileService] Lỗi khi khôi phục người dùng ${id}: ${error.message}`);
            throw error;
        }
    }

    async deleteUser(id) {
        try {
            const { getConnection } = require('../config/database');
            const pool = await getConnection();

            // Kiểm tra nếu pool là đối tượng lỗi (không phải ConnectionPool)
            if (pool && pool.errorStatus) {
                throw new Error('Lỗi kết nối đến cơ sở dữ liệu: ' + pool.message);
            }

            const user = await User.findByPk(id);
            if (!user) {
                throw new Error('Không tìm thấy người dùng');
            }

            // ✅ SECURITY FIX: Kiểm tra active bookings trước khi xóa
            const bookingCheck = await hasActiveBookings(id);
            
            if (bookingCheck.hasBookings) {
                const errorMsg = `Không thể xóa user vì có ${bookingCheck.count} booking đang hoạt động. ` +
                               `Vui lòng chờ khách hàng hoàn thành hoặc hủy booking trước khi xóa user.`;
                logger.warn(`[UserProfileService] ${errorMsg}`);
                throw new Error(errorMsg);
            }

            user.Account_Status = 'Deleted';
            await user.save();

            logger.info(`[UserProfileService] Đã xóa mềm người dùng với ID: ${id} (đã kiểm tra không có active bookings)`);
            return true;
        } catch (error) {
            logger.error(`[UserProfileService] Lỗi khi xóa người dùng ${id}: ${error.message}`);
            throw error;
        }
    }

    async changeAccountStatus(id, status) {
        try {
            const { getConnection } = require('../config/database');
            const pool = await getConnection();

            // Kiểm tra nếu pool là đối tượng lỗi (không phải ConnectionPool)
            if (pool && pool.errorStatus) {
                throw new Error('Lỗi kết nối đến cơ sở dữ liệu: ' + pool.message);
            }

            const user = await User.findByPk(id);
            if (!user) {
                throw new Error('Không tìm thấy người dùng');
            }

            // Kiểm tra status có hợp lệ không (chỉ cho phép 3 giá trị)
            const validStatuses = ['Active', 'Inactive', 'Deleted'];
            if (!validStatuses.includes(status)) {
                throw new Error(`Trạng thái không hợp lệ. Chỉ cho phép các giá trị: ${validStatuses.join(', ')}`);
            }

            // ✅ SECURITY FIX: Kiểm tra active bookings khi đổi thành Deleted hoặc Inactive
            if ((status === 'Deleted' || status === 'Inactive') && user.Account_Status !== status) {
                logger.info(`[UserProfileService] Đang thay đổi Account_Status từ '${user.Account_Status}' thành '${status}' - kiểm tra active bookings`);
                
                const bookingCheck = await hasActiveBookings(id);
                
                if (bookingCheck.hasBookings) {
                    const errorMsg = `Không thể đổi trạng thái user thành '${status}' vì có ${bookingCheck.count} booking đang hoạt động. ` +
                                   `Vui lòng chờ khách hàng hoàn thành hoặc hủy booking trước.`;
                    logger.warn(`[UserProfileService] ${errorMsg}`);
                    throw new Error(errorMsg);
                }
            }

            user.Account_Status = status;
            await user.save();

            logger.info(`[UserProfileService] Đã thay đổi trạng thái người dùng ${id} thành: ${status} (đã kiểm tra active bookings nếu cần)`);
            return true;
        } catch (error) {
            logger.error(`[UserProfileService] Lỗi khi thay đổi trạng thái người dùng ${id}: ${error.message}`);
            throw error;
        }
    }

    async updateUserProfile(userId, updateData) {
        try {
            const { getConnection } = require('../config/database');
            const pool = await getConnection();

            // Kiểm tra nếu pool là đối tượng lỗi (không phải ConnectionPool)
            if (pool && pool.errorStatus) {
                throw new Error('Lỗi kết nối đến cơ sở dữ liệu: ' + pool.message);
            }

            const user = await User.findByPk(userId);
            if (!user) {
                throw new Error(`Không tìm thấy người dùng với ID ${userId}`);
            }

            // Chỉ cập nhật các trường được phép
            const allowedFields = ['Phone_Number', 'Address', 'Date_Of_Birth', 'Sex'];
            const fieldsToUpdate = {};

            for (const field of allowedFields) {
                if (updateData[field] !== undefined) {
                    fieldsToUpdate[field] = updateData[field];
                }
            }

            if (Object.keys(fieldsToUpdate).length === 0) {
                throw new Error('Không có dữ liệu hợp lệ để cập nhật');
            }

            // Cập nhật thông tin người dùng
            await user.update(fieldsToUpdate);
            logger.info(`[UserProfileService] Đã cập nhật thông tin người dùng ID ${userId}: ${JSON.stringify(fieldsToUpdate)}`);

            return true;
        } catch (error) {
            logger.error(`[UserProfileService] Lỗi khi cập nhật thông tin người dùng ${userId}: ${error.message}`);
            throw error;
        }
    }

    async getStaffDetailById(staffId) {
        try {
            const { User, Cinema } = require('../models');

            // Find staff by ID
            const staff = await User.findOne({
                where: {
                    User_ID: staffId,
                    Role: 'Staff',
                    Account_Status: { [Op.ne]: 'Deleted' }
                },
                include: [{
                    model: Cinema,
                    as: 'ManagedCinema',
                    attributes: ['Cinema_ID', 'Cinema_Name', 'Address', 'City', 'Phone_Number', 'Email']
                }]
            });

            if (!staff) {
                throw new Error(`Không tìm thấy nhân viên với ID ${staffId}`);
            }

            return staff;
        } catch (error) {
            logger.error(`[UserProfileService] Lỗi khi lấy thông tin chi tiết nhân viên ${staffId}: ${error.message}`);
            throw error;
        }
    }

    async getManagerDetailById(managerId) {
        try {
            const { User, Cinema } = require('../models');

            // Find manager by ID
            const manager = await User.findOne({
                where: {
                    User_ID: managerId,
                    Role: 'Manager',
                    Account_Status: { [Op.ne]: 'Deleted' }
                },
                include: [{
                    model: Cinema,
                    as: 'ManagedCinema',
                    attributes: ['Cinema_ID', 'Cinema_Name', 'Address', 'City', 'Phone_Number', 'Email']
                }]
            });

            if (!manager) {
                throw new Error(`Không tìm thấy quản lý với ID ${managerId}`);
            }

            return manager;
        } catch (error) {
            logger.error(`[UserProfileService] Lỗi khi lấy thông tin chi tiết quản lý ${managerId}: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new UserProfileService();
