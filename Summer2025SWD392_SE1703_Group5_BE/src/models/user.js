'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      User.hasMany(models.TicketBooking, { foreignKey: 'User_ID', as: 'TicketBookings' });
      User.hasMany(models.Movie, { foreignKey: 'Created_By', as: 'Movies' });
      User.hasMany(models.Promotion, { foreignKey: 'Created_By', as: 'Promotions' });
      User.hasMany(models.MovieRating, { foreignKey: 'User_ID', as: 'MovieRatings' });
      User.hasMany(models.Score, { foreignKey: 'User_ID', as: 'Scores' });
      User.hasMany(models.PointsRedemption, { foreignKey: 'User_ID', as: 'PointsRedemptions' });
      User.hasMany(models.PromotionUsage, { foreignKey: 'User_ID', as: 'PromotionUsages' });
      User.hasMany(models.Payment, { foreignKey: 'Processed_By', as: 'ProcessedPayments' });
      User.belongsTo(models.Cinema, { foreignKey: 'Cinema_ID', as: 'ManagedCinema' });
    }

    // ===== THÊM CÁC STATIC METHODS =====

    /**
     * Tìm user theo ID
     * @param {number} userId - ID của user
     * @returns {Promise<User|null>} User object hoặc null
     */
    static async findById(userId) {
      try {
        console.log(`[User.findById] Searching for user with ID: ${userId}`);
        const user = await this.findByPk(userId);
        console.log(`[User.findById] Result:`, user ? `Found user ${user.Email}` : 'User not found');
        return user;
      } catch (error) {
        console.error(`[User.findById] Error finding user by ID ${userId}:`, error);
        throw error;
      }
    }

    /**
     * Tìm user theo email
     * @param {string} email - Email của user
     * @returns {Promise<User|null>} User object hoặc null
     */
    static async findByEmail(email) {
      try {
        console.log(`[User.findByEmail] Searching for user with email: ${email}`);
        const user = await this.findOne({ where: { Email: email } });
        console.log(`[User.findByEmail] Result:`, user ? `Found user ID ${user.User_ID}` : 'User not found');
        return user;
      } catch (error) {
        console.error(`[User.findByEmail] Error finding user by email ${email}:`, error);
        throw error;
      }
    }

    /**
     * Cập nhật trạng thái tài khoản
     * @param {number} userId - ID của user
     * @param {string} status - Trạng thái mới (Active, Pending_Verification, Locked, etc.)
     * @returns {Promise<boolean>} True nếu cập nhật thành công
     */
    static async updateStatus(userId, status) {
      try {
        console.log(`[User.updateStatus] Updating user ${userId} status to: ${status}`);
        const [updatedRows] = await this.update(
          { Account_Status: status },
          { where: { User_ID: userId } }
        );
        console.log(`[User.updateStatus] Updated ${updatedRows} rows`);
        return updatedRows > 0;
      } catch (error) {
        console.error(`[User.updateStatus] Error updating user ${userId} status to ${status}:`, error);
        throw error;
      }
    }

    /**
     * Tìm user theo phone number
     * @param {string} phoneNumber - Số điện thoại
     * @returns {Promise<User|null>} User object hoặc null
     */
    static async findByPhone(phoneNumber) {
      try {
        console.log(`[User.findByPhone] Searching for user with phone: ${phoneNumber}`);
        const user = await this.findOne({ where: { Phone_Number: phoneNumber } });
        console.log(`[User.findByPhone] Result:`, user ? `Found user ${user.Email}` : 'User not found');
        return user;
      } catch (error) {
        console.error(`[User.findByPhone] Error finding user by phone ${phoneNumber}:`, error);
        throw error;
      }
    }

    /**
     * Cập nhật last login time
     * @param {number} userId - ID của user
     * @returns {Promise<boolean>} True nếu cập nhật thành công
     */
    static async updateLastLogin(userId) {
      try {
        console.log(`[User.updateLastLogin] Updating last login for user: ${userId}`);
        const [updatedRows] = await this.update(
          { Last_Login: new Date() },
          { where: { User_ID: userId } }
        );
        return updatedRows > 0;
      } catch (error) {
        console.error(`[User.updateLastLogin] Error updating last login for user ${userId}:`, error);
        throw error;
      }
    }
  }

  User.init({
    User_ID: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    Full_Name: {
      type: DataTypes.STRING(100),  // nvarchar(100)
      allowNull: false
    },
    Email: {
      type: DataTypes.STRING(100),  // nvarchar(100)
      allowNull: false,
    },
    Password: {
      type: DataTypes.STRING(100),  // nvarchar(100) - GIỚI HẠN 100 KÝ TỰ!
      allowNull: false
    },
    Role: {
      type: DataTypes.STRING(20),   // nvarchar(20)
      allowNull: false,
      defaultValue: 'Customer'
    },
    Department: {
      type: DataTypes.STRING,
      // nvarchar(NULL)
      allowNull: true
    },
    Hire_Date: {
      type: DataTypes.DATEONLY,     // date
      allowNull: true
    },
    Date_Of_Birth: {
      type: DataTypes.DATEONLY,     // date - Chỉ ngày: YYYY-MM-DD
      allowNull: true
    },
    Sex: {
      type: DataTypes.STRING(10),   // nvarchar(10)
      allowNull: true
    },
    Phone_Number: {
      type: DataTypes.STRING(20),   // nvarchar(20)
      allowNull: true
    },
    Address: {
      type: DataTypes.STRING(200),  // nvarchar(200)
      allowNull: true
    },
    Account_Status: {
      type: DataTypes.STRING(20),   // nvarchar(20)
      allowNull: false,
      defaultValue: 'Active'        // Default trong DB là 'Active'
    },
    Created_At: {
      type: DataTypes.DATE,         // datetime
      allowNull: true
    },
    Last_Login: {
      type: DataTypes.DATE,         // datetime
      allowNull: true
    },
    Cinema_ID: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Cinemas',
        key: 'Cinema_ID'
      }
    }
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'Users',
    schema: 'db_ab91f9_gr5',
    timestamps: false,
  });

  return User;
};