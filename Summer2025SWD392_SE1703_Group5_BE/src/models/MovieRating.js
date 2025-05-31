// models/movierating.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class MovieRating extends Model {
    static associate(models) {
      MovieRating.belongsTo(models.Movie, { foreignKey: 'Movie_ID', as: 'Movie' });
      MovieRating.belongsTo(models.User, { foreignKey: 'User_ID', as: 'User' });
    }
  }
  MovieRating.init({
    Rating_ID: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    Movie_ID: DataTypes.INTEGER,
    User_ID: DataTypes.INTEGER,
    Rating: DataTypes.INTEGER,
    Comment: DataTypes.STRING,
    Rating_Date: DataTypes.DATE,
    Is_Verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  }, {
    sequelize,
    modelName: 'MovieRating',
    tableName: 'Movie_Ratings',
    schema: 'db_ab91f9_gr5',
    timestamps: false,
  });
  return MovieRating;
};
