// models/pointsearning.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class PointsEarning extends Model {
    static associate(models) {
      PointsEarning.belongsTo(models.User, { foreignKey: 'User_ID', as: 'User' });
      PointsEarning.belongsTo(models.TicketBooking, { foreignKey: 'Booking_ID', as: 'TicketBooking' });
    }
  }
  PointsEarning.init({
    Earning_ID: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    User_ID: DataTypes.INTEGER,
    Booking_ID: DataTypes.INTEGER,
    Actual_Amount: DataTypes.DECIMAL,
    Points_Earned: DataTypes.INTEGER,
    Date: DataTypes.DATE,
  }, {
    sequelize,
    modelName: 'PointsEarning',
    tableName: 'Points_Earning',
    schema: 'db_ab91f9_gr5',
    timestamps: false,
  });
  return PointsEarning;
};
