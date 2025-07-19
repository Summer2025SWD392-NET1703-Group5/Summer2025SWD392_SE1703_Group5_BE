// models/showtime.js
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Showtime extends Model {
    static associate(models) {
      Showtime.belongsTo(models.Movie, { foreignKey: 'Movie_ID', as: 'Movie' });
      Showtime.belongsTo(models.CinemaRoom, { foreignKey: 'Cinema_Room_ID', as: 'CinemaRoom' });
      Showtime.belongsTo(models.User, { foreignKey: 'Created_By', as: 'CreatedBy' });
      Showtime.hasMany(models.TicketBooking, { foreignKey: 'Showtime_ID', as: 'TicketBookings' });
      Showtime.hasMany(models.Ticket, { foreignKey: 'Showtime_ID', as: 'Tickets' });
    }
  }

  Showtime.init({
    Showtime_ID: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    Movie_ID: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    Cinema_Room_ID: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    Show_Date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    Start_Time: {
      type: DataTypes.TIME,
      allowNull: false,
      set(value) {
        // Đảm bảo định dạng HH:MM:SS khi lưu
        if (value && typeof value === 'string') {
          const parts = value.split(':');
          if (parts.length === 2) {
            value = `${parts[0]}:${parts[1]}:00`;
          }
        }
        this.setDataValue('Start_Time', value);
      }
    },
    End_Time: {
      type: DataTypes.TIME,
      allowNull: false,
      set(value) {
        // Đảm bảo định dạng HH:MM:SS khi lưu
        if (value && typeof value === 'string') {
          const parts = value.split(':');
          if (parts.length === 2) {
            value = `${parts[0]}:${parts[1]}:00`;
          }
        }
        this.setDataValue('End_Time', value);
      }
    },
    Status: {
      type: DataTypes.STRING,
      defaultValue: 'Scheduled'
    },
    Capacity_Available: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    Created_By: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    Created_At: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    Updated_At: {
      type: DataTypes.DATE
    }
  }, {
    sequelize,
    modelName: 'Showtime',
    tableName: 'Showtimes',
    schema: 'ksf00691_team03',
    timestamps: false,
  });

  return Showtime;
};


