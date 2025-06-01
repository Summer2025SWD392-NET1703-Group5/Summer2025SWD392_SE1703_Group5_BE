// models/bookinghistory.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class BookingHistory extends Model {
    static associate(models) {
      // FK: Booking_ID -> TicketBooking
      BookingHistory.belongsTo(models.TicketBooking, {
        foreignKey: 'Booking_ID',
        as: 'TicketBooking'
      });
    }
  }
  BookingHistory.init({
    Booking_History_ID: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    Booking_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    Date: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    Date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: sequelize.literal('GETDATE()')  // ← THÊM DÒNG NÀY
    },
    Notes: {
      type: DataTypes.STRING,
    },
    IsRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  }, {
    sequelize,
    modelName: 'BookingHistory',
    tableName: 'Booking_History',
    schema: 'db_ab91f9_gr5',
    timestamps: false,
  });
  return BookingHistory;
};
