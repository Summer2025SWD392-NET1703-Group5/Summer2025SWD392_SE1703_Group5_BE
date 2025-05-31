'use strict';


const { User } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');


class UserProfileService {
    async getAllUsers() {
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
    }


    async getUserProfile(userId) {
        const user = await User.findByPk(userId);
        if (!user) {
            throw new Error(`Không tìm thấy người dùng với ID ${userId}`);
        }


        switch (user.Role.toLowerCase()) {
            case 'customer':
                return {
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
    }


    async restoreUser(id) {
        const user = await User.findByPk(id);
        if (!user) {
            throw new Error('Không tìm thấy người dùng');
        }


        if (user.Account_Status !== 'Deleted') {
            throw new Error('Người dùng chưa bị xóa mềm');
        }


        user.Account_Status = 'Active';
        await user.save();
    }


    async deleteUser(id) {
        const user = await User.findByPk(id);
        if (!user) {
            throw new Error('Không tìm thấy người dùng');
        }


        user.Account_Status = 'Deleted';
        await user.save();
    }


    async changeAccountStatus(id, status) {
        const user = await User.findByPk(id);
        if (!user) {
            throw new Error('Không tìm thấy người dùng');
        }


        user.Account_Status = status;
        await user.save();
    }
}


module.exports = new UserProfileService();

