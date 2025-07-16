// models/seat.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Seat extends Model {
    static associate(models) {
      Seat.belongsTo(models.SeatLayout, { foreignKey: 'Layout_ID', as: 'SeatLayout' });
      Seat.hasMany(models.Ticket, { foreignKey: 'Seat_ID', as: 'Tickets' });
    }
  }
  Seat.init({
    Seat_ID: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    Layout_ID: { type: DataTypes.INTEGER, allowNull: false },
    Seat_Number: { type: DataTypes.STRING, allowNull: false },
    Is_Active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize,
    modelName: 'Seat',
    tableName: 'Seats',
    schema: 'ksf00691_team03',
    timestamps: false,
  });
  return Seat;
};
