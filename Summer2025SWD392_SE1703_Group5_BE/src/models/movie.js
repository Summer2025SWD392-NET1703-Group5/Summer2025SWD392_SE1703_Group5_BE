// models/movie.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Movie extends Model {
    static associate(models) {
      Movie.belongsTo(models.User, { foreignKey: 'Created_By', as: 'CreatedBy' });
    //   Movie.hasMany(models.Showtime, { foreignKey: 'Movie_ID', as: 'Showtimes' });
    //   Movie.hasMany(models.MovieRating, { foreignKey: 'Movie_ID', as: 'MovieRatings' });
    }
  }
  Movie.init({
    Movie_ID: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    Movie_Name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    Release_Date: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    End_Date: DataTypes.DATE,
    Production_Company: DataTypes.STRING,
    Director: DataTypes.STRING,
    Cast: DataTypes.STRING,
    Duration: DataTypes.INTEGER,
    Genre: DataTypes.STRING,
    Rating: DataTypes.STRING,
    Language: DataTypes.STRING,
    Country: DataTypes.STRING,
    Synopsis: DataTypes.STRING,
    Poster_URL: DataTypes.STRING,
    Trailer_Link: DataTypes.STRING,
    Status: {
      type: DataTypes.STRING,
      defaultValue: 'Coming Soon',
    },
    Created_By: DataTypes.INTEGER,
    Created_At: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    Updated_At: DataTypes.DATE,
  }, {
    sequelize,
    modelName: 'Movie',
    tableName: 'Movies',
    schema: 'db_ab91f9_gr5',
    timestamps: false,
  });
  return Movie;
};



