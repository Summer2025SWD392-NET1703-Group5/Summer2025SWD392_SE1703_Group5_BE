// models/promotion.js
'use strict';
const { DataTypes, Model } = require('sequelize');

// Define constants directly in this file
const PROMOTION_STATUS = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  EXPIRED: 'Expired',
  DELETED: 'Deleted', // Dùng cho xóa mềm nếu khuyến mãi chưa từng được sử dụng
};

const DISCOUNT_TYPE = {
  PERCENTAGE: 'Percentage',
  FIXED: 'Fixed', // Giảm giá theo số tiền cố định
};

const APPLICABLE_FOR = {
  ALL_USERS: 'All Users',
  NEW_USERS: 'New Users',
  VIP_USERS: 'VIP Users'
};

module.exports = (sequelize) => {
  class Promotion extends Model {
    static associate(models) {
      Promotion.belongsTo(models.User, {
        foreignKey: 'Created_By',
        as: 'Creator',
      });
      Promotion.hasMany(models.PromotionUsage, {
        foreignKey: 'Promotion_ID',
        as: 'PromotionUsages',
      });
      // Mối quan hệ với TicketBooking (một Promotion có thể được áp dụng cho nhiều TicketBookings)
      Promotion.hasMany(models.TicketBooking, {
        foreignKey: 'Promotion_ID',
        as: 'AppliedBookings'
      });
    }

    // Instance method to check if the promotion is currently active (based on dates and status)
    isCurrentlyActive() {
      const now = new Date();
      return this.Status === PROMOTION_STATUS.ACTIVE && this.Start_Date <= now && this.End_Date >= now;
    }

    // Instance method to check if the promotion has expired
    hasExpired() {
      return this.End_Date < new Date();
    }
  }

  Promotion.init(
    {
      Promotion_ID: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      Title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      Promotion_Code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      Start_Date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      End_Date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      Discount_Type: {
        type: DataTypes.ENUM(Object.values(DISCOUNT_TYPE)),
        allowNull: false,
      },
      Discount_Value: {
        type: DataTypes.DECIMAL(10, 2), // Cho phép giá trị thập phân, ví dụ: 10.5% hoặc 50000 VND
        allowNull: false,
      },
      Minimum_Purchase: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
        defaultValue: 0.00,
      },
      Maximum_Discount: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: true, // Có thể không có giới hạn giảm tối đa
      },
      Applicable_For: {
        type: DataTypes.STRING(100), // Hoặc ENUM nếu bạn có danh sách cố định
        defaultValue: APPLICABLE_FOR.ALL_USERS, // Ví dụ mặc định
      },
      Usage_Limit: {
        type: DataTypes.INTEGER,
        allowNull: true, // Có thể không giới hạn số lần sử dụng tổng cộng
      },
      Current_Usage: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      Status: {
        type: DataTypes.ENUM(Object.values(PROMOTION_STATUS)),
        allowNull: false,
        defaultValue: PROMOTION_STATUS.INACTIVE,
      },
      Promotion_Detail: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      Created_By: {
        type: DataTypes.INTEGER,
        allowNull: true, // Cho phép null nếu người tạo không xác định hoặc hệ thống tự tạo
        references: {
          model: 'Users', // Tên bảng Users
          key: 'User_ID',
        },
      },
      Created_At: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'Promotion',
      tableName: 'Promotions',
      schema: 'db_ab91f9_gr5',
      timestamps: false,
      hooks: {
        beforeValidate: (promotion, options) => {
          if (promotion.Start_Date && promotion.End_Date && promotion.Start_Date >= promotion.End_Date) {
            throw new Error('Ngày bắt đầu (Start_Date) phải trước ngày kết thúc (End_Date).');
          }
        },
      },
    }
  );

  return Promotion;
};
