// models/userpoints.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class UserPoints extends Model {
    static associate(models) {
      UserPoints.belongsTo(models.User, { foreignKey: 'User_ID', as: 'User' });
    }
  }
  UserPoints.init({
    UserPoints_ID: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'UserPoints_ID'
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'User_ID'
    },
    total_points: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'Total_Points'
    },
    last_updated: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'Last_Updated'
    }
  }, {
    sequelize,
    modelName: 'UserPoints',
    tableName: 'User_Points',
    schema: 'db_ab91f9_gr5',
    timestamps: false,
  });
  return UserPoints;
};
