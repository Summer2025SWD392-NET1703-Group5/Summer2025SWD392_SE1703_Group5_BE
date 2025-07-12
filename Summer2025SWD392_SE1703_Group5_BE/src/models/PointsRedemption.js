// models/pointsredemption.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class PointsRedemption extends Model {
    static associate(models) {
      PointsRedemption.belongsTo(models.User, { foreignKey: 'User_ID', as: 'User' });
    }
  }
  PointsRedemption.init({
    Redemption_ID: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    User_ID: DataTypes.INTEGER,
    Points_Redeemed: DataTypes.INTEGER,
    Date: DataTypes.DATE,
    Status: DataTypes.STRING,
    Note: DataTypes.STRING,
  }, {
    sequelize,
    modelName: 'PointsRedemption',
    tableName: 'Points_Redemption',
    schema: 'ksf00691_team03',
    timestamps: false,
  });
  return PointsRedemption;
};
