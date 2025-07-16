// models/ticketbooking.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class TicketBooking extends Model {
    static associate(models) {
      TicketBooking.belongsTo(models.User, { foreignKey: 'User_ID', as: 'User' });
      TicketBooking.belongsTo(models.Showtime, { foreignKey: 'Showtime_ID', as: 'Showtime' });
      TicketBooking.belongsTo(models.Promotion, { foreignKey: 'Promotion_ID', as: 'Promotion' });
      TicketBooking.belongsTo(models.User, { foreignKey: 'Created_By', as: 'CreatedBy' });

      TicketBooking.hasMany(models.Ticket, { foreignKey: 'Booking_ID', as: 'Tickets' });
      TicketBooking.hasMany(models.Payment, { foreignKey: 'Booking_ID', as: 'Payments' });
      TicketBooking.hasMany(models.BookingHistory, { foreignKey: 'Booking_ID', as: 'BookingHistories' });
      TicketBooking.hasMany(models.PromotionUsage, { foreignKey: 'Booking_ID', as: 'PromotionUsages' });
    }
  }
  TicketBooking.init({
    Booking_ID: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    User_ID: { type: DataTypes.INTEGER },
    Showtime_ID: { type: DataTypes.INTEGER, allowNull: false },
    Promotion_ID: { type: DataTypes.INTEGER },
    Booking_Date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    Payment_Deadline: { type: DataTypes.DATE, allowNull: false },
    Total_Amount: { type: DataTypes.DECIMAL, allowNull: false },
    Points_Earned: { type: DataTypes.INTEGER, defaultValue: 0 },
    Points_Used: { type: DataTypes.INTEGER, defaultValue: 0 },
    Status: { type: DataTypes.STRING, defaultValue: 'Pending' },
    Created_By: { type: DataTypes.INTEGER, allowNull: false },
  }, {
    sequelize,
    modelName: 'TicketBooking',
    tableName: 'Ticket_Bookings',
    schema: 'ksf00691_team03',
    timestamps: false,
  });
  return TicketBooking;
};
