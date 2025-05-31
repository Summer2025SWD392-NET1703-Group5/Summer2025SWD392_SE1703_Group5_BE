// models/score.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Score extends Model {
    static associate(models) {
      Score.belongsTo(models.User, { foreignKey: 'User_ID', as: 'User' });
    }
  }
  Score.init({
    Score_ID: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    User_ID: { type: DataTypes.INTEGER, allowNull: false },
    Points_Added: { type: DataTypes.INTEGER, allowNull: false },
    Points_Used: { type: DataTypes.INTEGER, allowNull: false },
    Date: { type: DataTypes.DATE, allowNull: false },
  }, {
    sequelize,
    modelName: 'Score',
    tableName: 'Scores',
    schema: 'db_ab91f9_gr5',
    timestamps: false,
  });
  return Score;
};
