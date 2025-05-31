// models/seat.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Seat extends Model {
    static associate(models) {
      Seat.belongsTo(models.SeatLayout, { foreignKey: 'Layout_ID', as: 'SeatLayout' });
      Seat.belongsTo(models.TicketBooking, { foreignKey: 'Booking_ID', as: 'TicketBooking' });
      Seat.belongsTo(models.Showtime, { foreignKey: 'Showtime_ID', as: 'Showtime' });
      Seat.hasMany(models.Ticket, { foreignKey: 'Seat_ID', as: 'Tickets' });
    }
  }
  Seat.init({
    Seat_ID: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    Layout_ID: { type: DataTypes.INTEGER, allowNull: false },
    Booking_ID: { type: DataTypes.INTEGER },
    Seat_Status: { type: DataTypes.STRING, defaultValue: 'Available' },
    Last_Updated: {
      type: DataTypes.DATE,
      defaultValue: sequelize.literal('GETDATE()'),  // SQL Server specific
      allowNull: true
    },
    Showtime_ID: { type: DataTypes.INTEGER, allowNull: false }
  }, {
    sequelize,
    modelName: 'Seat',
    tableName: 'Seats',
    schema: 'db_ab91f9_gr5',
    timestamps: false,
  });
  return Seat;
};
