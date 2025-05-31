// models/seatlayout.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class SeatLayout extends Model {
    static associate(models) {
      SeatLayout.belongsTo(models.CinemaRoom, { foreignKey: 'Cinema_Room_ID', as: 'CinemaRoom' });
      SeatLayout.hasMany(models.Seat, { foreignKey: 'Layout_ID', as: 'Seats' });
    }
  }
  SeatLayout.init({
    Layout_ID: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    Cinema_Room_ID: { type: DataTypes.INTEGER, allowNull: false },
    Row_Label: { type: DataTypes.STRING, allowNull: false },
    Column_Number: { type: DataTypes.INTEGER, allowNull: false },
    Seat_Type: { type: DataTypes.STRING, defaultValue: 'Regular' },
    Is_Active: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    sequelize,
    modelName: 'SeatLayout',
    tableName: 'Seat_Layout',
    schema: 'db_ab91f9_gr5',
    timestamps: false,
  });
  return SeatLayout;
};
