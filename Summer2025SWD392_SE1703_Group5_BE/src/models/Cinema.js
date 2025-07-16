'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
    class Cinema extends Model {
        static associate(models) {
            // Định nghĩa mối quan hệ với các model khác
            Cinema.hasMany(models.CinemaRoom, { foreignKey: 'Cinema_ID', as: 'CinemaRooms' });
            // Thêm mối quan hệ với User (Manager)
            Cinema.hasMany(models.User, { foreignKey: 'Cinema_ID', as: 'Managers' });
        }
    }
    Cinema.init({
        Cinema_ID: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        Cinema_Name: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        Address: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        City: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        Phone_Number: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        Email: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        Description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        Status: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'Active',
        },
        Created_At: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
        Updated_At: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    }, {
        sequelize,
        modelName: 'Cinema',
        tableName: 'Cinemas',
        schema: 'ksf00691_team03',
        timestamps: false,
    });
    return Cinema;
}; 