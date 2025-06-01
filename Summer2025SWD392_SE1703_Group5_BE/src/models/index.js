'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const process = require('process');
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';
// Cần đảm bảo rằng file config này export đúng cấu hình cho Sequelize
// Dựa trên cấu trúc dự án, có thể cần điều chỉnh đường dẫn này.
// Giả sử src/config/config.json hoặc tương tự chứa các thông tin kết nối DB cho Sequelize
// Nếu bạn dùng src/config/database.js để lấy config, logic ở đây cần thay đổi.
let config;
try {
    // Ưu tiên file config.js nếu có, nó linh hoạt hơn JSON.
    config = require(path.join(__dirname, '..', 'config', 'config.js'))[env];
    if (!config) {
        // Nếu không có config.js hoặc không có key cho env hiện tại, thử config.json
        const configJson = require(path.join(__dirname, '..', 'config', 'config.json'));
        config = configJson[env];
    }
} catch (error) {
    console.warn('[models/index.js] Không tìm thấy src/config/config.js hoặc src/config/config.json. Sẽ thử sử dụng các biến môi trường trực tiếp.');
}

// Fallback: Nếu không có file config, thử tạo config từ biến môi trường (phù hợp với database.js hiện tại)
if (!config) {
    console.log('[models/index.js] Tạo Sequelize config từ biến môi trường do không tìm thấy file config.js/json cho env: ' + env);
    if (!process.env.DB_DATABASE || !process.env.DB_USER || !process.env.DB_SERVER) {
        console.error('[models/index.js] Thiếu các biến môi trường DB_DATABASE, DB_USER, DB_SERVER để cấu hình Sequelize.');
        // process.exit(1); // Cân nhắc việc thoát nếu không thể cấu hình
    } else {
        config = {
            database: process.env.DB_DATABASE,
            username: process.env.DB_USER,
            password: process.env.DB_PASSWORD || null, // Mật khẩu có thể null
            host: process.env.DB_SERVER,
            port: parseInt(process.env.DB_PORT) || 1433,
            dialect: 'mssql', // Dựa trên database.js, có vẻ là mssql
            dialectOptions: {
                options: {
                    encrypt: process.env.DB_ENCRYPT === 'true' || true, // Mặc định là true nếu không có
                    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' || true, // Mặc định là true nếu không có
                    enableArithAbort: true
                }
            },
            pool: {
                max: parseInt(process.env.DB_POOL_MAX) || 10,
                min: parseInt(process.env.DB_POOL_MIN) || 0,
                acquire: parseInt(process.env.DB_POOL_ACQUIRE) || 30000,
                idle: parseInt(process.env.DB_POOL_IDLE) || 10000
            },
            logging: process.env.SEQUELIZE_LOGGING === 'false' ? false : console.log, // Log SQL queries, hoặc tắt nếu SEQUELIZE_LOGGING=false
        };
    }
}


const db = {};

let sequelize;
if (config && config.use_env_variable) {
    sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else if (config) {
    sequelize = new Sequelize(config.database, config.username, config.password, config);
} else {
    console.error('[models/index.js] Không thể khởi tạo Sequelize: thiếu thông tin cấu hình.');
    // Để tránh crash ở các bước sau, gán một đối tượng rỗng hoặc xử lý khác
    // process.exit(1); // Hoặc thoát ứng dụng
    sequelize = new Sequelize(); // Khởi tạo rỗng để tránh lỗi ở các bước import model, nhưng sẽ không hoạt động
}

fs
    .readdirSync(__dirname)
    .filter(file => {
        return (
            file.indexOf('.') !== 0 &&
            file !== basename &&
            file.slice(-3) === '.js' &&
            file.indexOf('.test.js') === -1
        );
    })
    .forEach(file => {
        // Thay vì require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes)
        // Sử dụng importModel, một phương thức được giới thiệu trong Sequelize v5+
        // Hoặc cách cũ nếu các model của bạn được viết theo kiểu cũ
        // const model = sequelize['import'](path.join(__dirname, file)); // Cách cũ cho Sequelize v4/v5
        const modelDefiner = require(path.join(__dirname, file));
        // Kiểm tra xem modelDefiner có phải là hàm không (chuẩn của Sequelize CLI)
        // hoặc là một đối tượng model đã được khởi tạo (nếu bạn tự định nghĩa không theo chuẩn CLI)
        let model;
        if (typeof modelDefiner === 'function') {
            model = modelDefiner(sequelize, Sequelize.DataTypes);
        } else if (modelDefiner && modelDefiner.init && typeof modelDefiner.init === 'function') {
            // Nếu model export một class kế thừa từ Sequelize.Model
            model = modelDefiner.init(sequelize, Sequelize.DataTypes);
        } else {
            // Trường hợp model export trực tiếp một đối tượng model đã cấu hình (ít phổ biến hơn với CLI)
            // Cần đảm bảo model này có thuộc tính `name`
            model = modelDefiner;
            if (!model.name) {
                console.warn(`[models/index.js] Model file ${file} không export function hoặc class có init, và không có thuộc tính name. Skipping.`)
                return;
            }
        }
        db[model.name] = model;
    });

// Thiết lập associations
Object.keys(db).forEach(modelName => {
    if (db[modelName].associate) {
        db[modelName].associate(db);
    }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

console.log('[models/index.js] Sequelize models initialized and associated.');

// Đồng bộ hóa models với database
if (process.env.NODE_ENV !== 'production') {
    console.log('[models/index.js] Syncing database models in non-production environment...');
    sequelize.sync({ alter: true })
        .then(() => {
            console.log('[models/index.js] Database synchronized successfully.');
        })
        .catch(err => {
            console.error('[models/index.js] Error synchronizing database:', err);
        });
}

module.exports = db; 