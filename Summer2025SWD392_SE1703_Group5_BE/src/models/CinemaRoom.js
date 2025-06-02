// models/cinemaroom.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class CinemaRoom extends Model {
    static associate(models) {
      CinemaRoom.hasMany(models.SeatLayout, { foreignKey: 'Cinema_Room_ID', as: 'SeatLayouts' });
      CinemaRoom.hasMany(models.Showtime, { foreignKey: 'Cinema_Room_ID', as: 'Showtimes' });
      CinemaRoom.hasMany(models.SeatLayout, {
        foreignKey: 'Cinema_Room_ID'
      });
      CinemaRoom.belongsTo(models.Cinema, { foreignKey: 'Cinema_ID', as: 'Cinema' });
    }
  }
  CinemaRoom.init({
    Cinema_Room_ID: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    Room_Name: DataTypes.STRING,
    Seat_Quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    Room_Type: DataTypes.STRING,
    Status: {
      type: DataTypes.STRING,
      defaultValue: 'Active',
    },
    Notes: DataTypes.STRING,
    Cinema_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Cinemas',
        key: 'Cinema_ID'
      }
    }
  }, {
    sequelize,
    modelName: 'CinemaRoom',
    tableName: 'Cinema_Rooms',
    schema: 'db_ab91f9_gr5',
    timestamps: false,
  });
  return CinemaRoom;
};
