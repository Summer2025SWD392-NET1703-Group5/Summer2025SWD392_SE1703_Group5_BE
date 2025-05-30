'use strict';

const { User } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

class UserRepository {
    constructor() {
        this.logger = logger;
    }

    async emailExists(email) {
        return await User.count({ where: { Email: email } }) > 0;
    }

    async userNameExists(userName) {
        return await User.count({ where: { Full_Name: userName } }) > 0;
    }

    async getByEmail(email) {
        return await User.findOne({ where: { Email: email } });
    }

    async findByEmail(email) {
        return await User.findOne({ where: { Email: email } });
    }

    async getByPhoneNumber(phoneNumber) {
        return await User.findOne({ where: { Phone_Number: phoneNumber } });
    }

    async isPhoneNumberExist(phoneNumber, excludeUserId = null) {
        if (!phoneNumber) return false;

        if (excludeUserId) {
            return await User.count({
                where: {
                    Phone_Number: phoneNumber,
                    User_ID: { [Op.ne]: excludeUserId },
                },
            }) > 0;
        } else {
            return await User.count({ where: { Phone_Number: phoneNumber } }) > 0;
        }
    }

    async getByExactEmail(email) {
        this.logger.info(`Searching for user with exact email: ${email}`);

        const user = await User.findOne({ where: { Email: email } });

        if (!user) {
            this.logger.warn(`No user found with exact email: ${email}`);

            const username = email.split('@')[0];
            const similarEmails = await User.findAll({
                where: { Email: { [Op.like]: `%${username}%` } },
                attributes: ['User_ID', 'Email'],
            });

            if (similarEmails.length > 0) {
                this.logger.warn(`Found ${similarEmails.length} similar emails:`);
                similarEmails.forEach(item => {
                    this.logger.warn(`ID: ${item.User_ID}, Email: ${item.Email}`);
                });
            }
        } else {
            this.logger.info(`Found user with ID: ${user.User_ID}, Email: ${user.Email}`);
        }

        return user;
    }

    async findById(id) {
        return await User.findByPk(id);
    }

    async getById(id) {
        return await User.findByPk(id);
    }

    async getAll() {
        return await User.findAll();
    }

    async update(userId, updateData) {
        const user = await User.findByPk(userId);
        if (!user) return 0;

        await user.update(updateData);
        return 1;
    }
}

module.exports = new UserRepository();