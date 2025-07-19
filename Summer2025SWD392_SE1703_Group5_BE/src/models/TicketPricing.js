// models/ticketpricing.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class TicketPricing extends Model { }
  TicketPricing.init({
    Price_ID: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    Room_Type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    Seat_Type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    Base_Price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    Status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Active'
    },
    Created_Date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    Last_Updated: { type: DataTypes.DATE }
  }, {
    sequelize,
    modelName: 'TicketPricing',
    tableName: 'Ticket_Pricing',
    schema: 'ksf00691_team03',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['Room_Type', 'Seat_Type']
      }
    ]
  });
  return TicketPricing;
};
