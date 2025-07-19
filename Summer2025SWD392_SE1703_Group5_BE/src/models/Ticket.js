// models/ticket.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Ticket extends Model {
    static associate(models) {
      Ticket.belongsTo(models.TicketBooking, { foreignKey: 'Booking_ID', as: 'TicketBooking' });
      Ticket.belongsTo(models.Seat, { foreignKey: 'Seat_ID', as: 'Seat' });
      Ticket.belongsTo(models.Showtime, { foreignKey: 'Showtime_ID', as: 'Showtime' });
    }
  }
  Ticket.init({
    Ticket_ID: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    Booking_ID: { type: DataTypes.INTEGER, allowNull: false },
    Seat_ID: { type: DataTypes.INTEGER, allowNull: false },
    Showtime_ID: { type: DataTypes.INTEGER, allowNull: false },
    Base_Price: { type: DataTypes.DECIMAL, allowNull: false },
    Discount_Amount: { type: DataTypes.DECIMAL, defaultValue: 0 },
    Final_Price: { type: DataTypes.DECIMAL, allowNull: false },
    Ticket_Code: { type: DataTypes.STRING, allowNull: false },
    Is_Checked_In: { type: DataTypes.BOOLEAN, defaultValue: false },
    Check_In_Time: { type: DataTypes.DATE },
    Status: { type: DataTypes.STRING },
  }, {
    sequelize,
    modelName: 'Ticket',
    tableName: 'Tickets',
    schema: 'ksf00691_team03',
    timestamps: false,
  });
  return Ticket;
};
