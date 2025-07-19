// src/config/config.js
// Cấu hình Sequelize cho các môi trường khác nhau

const path = require('path');
const envPath = path.resolve(__dirname, '../../.env');
require('dotenv').config({ path: envPath });

module.exports = {
  development: {
    database: process.env.DB_DATABASE,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT) || 1433,
    dialect: 'mssql',
    dialectOptions: {
      options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true
      }
    },
    pool: {
      max: 15,
      min: 5,
      acquire: 60000,
      idle: 60000
    },
    logging: false // Tắt logging SQL để giảm noise
  },
  
  test: {
    database: process.env.DB_DATABASE_TEST || process.env.DB_DATABASE,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT) || 1433,
    dialect: 'mssql',
    dialectOptions: {
      options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true
      }
    },
    pool: {
      max: 5,
      min: 1,
      acquire: 30000,
      idle: 10000
    },
    logging: false
  },
  
  production: {
    database: process.env.DB_DATABASE,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT) || 1433,
    dialect: 'mssql',
    dialectOptions: {
      options: {
        encrypt: true,
        trustServerCertificate: false, // Trong production nên dùng cert hợp lệ
        enableArithAbort: true
      }
    },
    pool: {
      max: 20,
      min: 5,
      acquire: 60000,
      idle: 60000
    },
    logging: false
  }
};
