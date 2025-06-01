// models/payment.js
'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Payment extends Model {
    static associate(models) {
      Payment.belongsTo(models.TicketBooking, { foreignKey: 'Booking_ID', as: 'TicketBooking' });
      Payment.belongsTo(models.User, { foreignKey: 'Processed_By', as: 'ProcessedBy' });
    }
  }
  Payment.init({
    Payment_ID: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    Booking_ID: DataTypes.INTEGER,
    Amount: DataTypes.DECIMAL,
    Payment_Method: DataTypes.STRING,
    Payment_Reference: DataTypes.STRING,
    Transaction_Date: DataTypes.DATE,
    Payment_Status: DataTypes.STRING,
    Processor_Response: DataTypes.STRING,
    Refund_Amount: {
      type: DataTypes.DECIMAL,
      defaultValue: 0,
    },
    Refund_Date: DataTypes.DATE,
    Refund_Reason: DataTypes.STRING,
    Processed_By: DataTypes.INTEGER,
  }, {
    sequelize,
    modelName: 'Payment',
    tableName: 'Payments',
    schema: 'db_ab91f9_gr5',
    timestamps: false,
  });
  return Payment;
};
