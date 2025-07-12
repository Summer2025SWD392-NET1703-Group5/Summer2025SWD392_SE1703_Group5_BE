'use strict';

const { getConnection, sql } = require('../config/database');
const logger = require('../utils/logger');

class UserRepository {
    constructor() {
        this.logger = logger;
    }

    async emailExists(email) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('email', sql.NVarChar, email)
                .query('SELECT COUNT(*) AS count FROM Users WHERE Email = @email');

            return result.recordset[0].count > 0;
        } catch (error) {
            this.logger.error(`Error in emailExists: ${error.message}`);
            throw error;
        }
    }

    async userNameExists(userName) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('userName', sql.NVarChar, userName)
                .query('SELECT COUNT(*) AS count FROM Users WHERE Full_Name = @userName');

            return result.recordset[0].count > 0;
        } catch (error) {
            this.logger.error(`Error in userNameExists: ${error.message}`);
            throw error;
        }
    }

    async getByEmail(email) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('email', sql.NVarChar, email)
                .query('SELECT * FROM Users WHERE Email = @email');

            return result.recordset[0] || null;
        } catch (error) {
            this.logger.error(`Error in getByEmail: ${error.message}`);
            throw error;
        }
    }

    async findByEmail(email) {
        return this.getByEmail(email);
    }

    async getByPhoneNumber(phoneNumber) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('phoneNumber', sql.NVarChar, phoneNumber)
                .query('SELECT * FROM Users WHERE Phone_Number = @phoneNumber');

            return result.recordset[0] || null;
        } catch (error) {
            this.logger.error(`Error in getByPhoneNumber: ${error.message}`);
            throw error;
        }
    }

    async findByPhoneNumber(phoneNumber) {
        try {
            this.logger.info(`[UserRepository.findByPhoneNumber] Searching for user with phone: ${phoneNumber}`);

            const pool = await getConnection();
            const result = await pool.request()
                .input('phoneNumber', sql.NVarChar, phoneNumber)
                .query('SELECT * FROM Users WHERE Phone_Number = @phoneNumber');

            const user = result.recordset[0] || null;
            this.logger.info(`[UserRepository.findByPhoneNumber] Result: ${user ? `Found user ${user.Email}` : 'User not found'}`);

            return user;
        } catch (error) {
            this.logger.error(`[UserRepository.findByPhoneNumber] Error: ${error.message}`);
            throw error;
        }
    }

    async isPhoneNumberExist(phoneNumber, excludeUserId = null) {
        if (!phoneNumber) return false;

        try {
            const pool = await getConnection();
            let query = 'SELECT COUNT(*) AS count FROM Users WHERE Phone_Number = @phoneNumber';
            const request = pool.request().input('phoneNumber', sql.NVarChar, phoneNumber);

            if (excludeUserId) {
                query += ' AND User_ID <> @excludeUserId';
                request.input('excludeUserId', sql.Int, excludeUserId);
            }

            const result = await request.query(query);
            return result.recordset[0].count > 0;
        } catch (error) {
            this.logger.error(`Error in isPhoneNumberExist: ${error.message}`);
            throw error;
        }
    }

    async getByExactEmail(email) {
        try {
            this.logger.info(`Searching for user with exact email: ${email}`);

            const pool = await getConnection();
            const result = await pool.request()
                .input('email', sql.NVarChar, email)
                .query('SELECT * FROM Users WHERE Email = @email');

            const user = result.recordset[0] || null;

            if (!user) {
                this.logger.warn(`No user found with exact email: ${email}`);

                const username = email.split('@')[0];
                const similarResult = await pool.request()
                    .input('username', sql.NVarChar, `%${username}%`)
                    .query('SELECT User_ID, Email FROM Users WHERE Email LIKE @username');

                const similarEmails = similarResult.recordset;

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
        } catch (error) {
            this.logger.error(`Error in getByExactEmail: ${error.message}`);
            throw error;
        }
    }

    async findById(id) {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .input('id', sql.Int, id)
                .query('SELECT * FROM Users WHERE User_ID = @id');

            return result.recordset[0] || null;
        } catch (error) {
            this.logger.error(`Error in findById: ${error.message}`);
            throw error;
        }
    }

    async getById(id) {
        return this.findById(id);
    }

    async getAll() {
        try {
            const pool = await getConnection();
            const result = await pool.request()
                .query('SELECT * FROM Users');

            return result.recordset;
        } catch (error) {
            this.logger.error(`Error in getAll: ${error.message}`);
            throw error;
        }
    }

    async update(userId, updateData) {
        try {
            // Kiểm tra xem user có tồn tại không
            const pool = await getConnection();
            const checkResult = await pool.request()
                .input('userId', sql.Int, userId)
                .query('SELECT COUNT(*) AS count FROM Users WHERE User_ID = @userId');

            if (checkResult.recordset[0].count === 0) {
                return 0;
            }

            // Xây dựng câu lệnh UPDATE động
            const request = pool.request().input('userId', sql.Int, userId);
            const setClauses = [];

            Object.keys(updateData).forEach(key => {
                let paramType;
                switch (key) {
                    case 'User_ID':
                        paramType = sql.Int;
                        break;
                    case 'Birth_Date':
                    case 'Created_At':
                    case 'Updated_At':
                    case 'Last_Login':
                        paramType = sql.DateTime;
                        break;
                    case 'Points':
                        paramType = sql.Int;
                        break;
                    default:
                        paramType = sql.NVarChar;
                }

                request.input(key, paramType, updateData[key]);
                setClauses.push(`${key} = @${key}`);
            });

            // Updated_At field doesn't exist in the User model
            // Removed code that was causing the error

            const query = `UPDATE Users SET ${setClauses.join(', ')} WHERE User_ID = @userId`;
            const result = await request.query(query);

            return result.rowsAffected[0];
        } catch (error) {
            this.logger.error(`Error in update: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new UserRepository();