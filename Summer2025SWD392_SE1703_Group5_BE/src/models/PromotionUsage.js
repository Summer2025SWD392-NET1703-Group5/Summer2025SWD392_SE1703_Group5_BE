// models/promotionusage.js
'use strict';
const { DataTypes, Model } = require('sequelize');

module.exports = (sequelize) => {
  class PromotionUsage extends Model {
    static associate(models) {
      PromotionUsage.belongsTo(models.User, {
        foreignKey: 'User_ID',
        as: 'User',
        allowNull: false,
      });
      PromotionUsage.belongsTo(models.Promotion, {
        foreignKey: 'Promotion_ID',
        as: 'Promotion',
        allowNull: false,
      });
      PromotionUsage.belongsTo(models.TicketBooking, {
        foreignKey: 'Booking_ID',
        as: 'TicketBooking',
        allowNull: false,
      });
    }
  }

  PromotionUsage.init(
    {
      Usage_ID: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      User_ID: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'User_ID',
        },
      },
      Promotion_ID: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'Promotions',
          key: 'Promotion_ID',
        },
      },
      Booking_ID: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'TicketBookings',
          key: 'Booking_ID',
        },
      },
      Discount_Amount: {
        type: DataTypes.DECIMAL(18, 2),
        allowNull: false,
      },
      Applied_Date: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      HasUsed: { // Để theo dõi trạng thái sử dụng, hữu ích khi gỡ bỏ khuyến mãi khỏi đơn hàng
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: 'PromotionUsage',
      tableName: 'Promotion_Usage',
      schema: 'ksf00691_team03',
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ['User_ID', 'Promotion_ID', 'Booking_ID'],
          name: 'unique_user_promotion_booking'
        },
      ]
    }
  );
  return PromotionUsage;
};
