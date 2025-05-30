// File: src/config/database.js
// Mô tả: Cấu hình và quản lý kết nối đến cơ sở dữ liệu Microsoft SQL Server.

console.log('[database.js] Bắt đầu thực thi...'); // Log khi module bắt đầu được nạp.
const sql = require('mssql'); // Import thư viện mssql để tương tác với SQL Server.
console.log('[database.js] mssql required.'); // Log xác nhận thư viện mssql đã được import.

const path = require('path'); // Import module path để làm việc với đường dẫn file.
// Xác định đường dẫn tuyệt đối đến file .env ở thư mục gốc của dự án.
const envPath = path.resolve(__dirname, '../../.env');
// Nạp các biến môi trường từ file .env.
const dotenvResult = require('dotenv').config({ path: envPath });

// Kiểm tra và log kết quả của việc nạp file .env.
if (dotenvResult.error) {
    console.error('[database.js] Lỗi khi load .env:', dotenvResult.error);
} else {
    console.log('[database.js] .env loaded successfully from:', envPath);
    // (Tùy chọn) Log nội dung đã parse từ .env để debug, cẩn thận với thông tin nhạy cảm.
    // console.log('[database.js] Parsed .env content by dotenv:', dotenvResult.parsed);
}

// Log các biến môi trường liên quan đến CSDL để kiểm tra.
// Điều này giúp đảm bảo rằng các biến từ .env được nạp đúng cách.
console.log('[database.js] DB_SERVER after dotenv (from process.env):', process.env.DB_SERVER);
console.log('[database.js] DB_DATABASE after dotenv:', process.env.DB_DATABASE);
console.log('[database.js] DB_USER after dotenv:', process.env.DB_USER);
// Lưu ý: Không nên log DB_PASSWORD ở đây vì lý do bảo mật.

// Đối tượng cấu hình kết nối đến SQL Server.
// Các giá trị được lấy từ biến môi trường đã nạp từ file .env.
const config = {
    server: process.env.DB_SERVER,         // Địa chỉ server CSDL.
    database: process.env.DB_DATABASE,   // Tên cơ sở dữ liệu.
    user: process.env.DB_USER,             // Tên người dùng để kết nối CSDL.
    password: process.env.DB_PASSWORD,     // Mật khẩu của người dùng.
    port: parseInt(process.env.DB_PORT) || 1433, // Cổng kết nối, mặc định là 1433 cho SQL Server.
    options: {
        encrypt: true, // Sử dụng mã hóa cho kết nối (true nếu dùng Azure SQL hoặc SQL Server có SSL).
        trustServerCertificate: true, // Tin tưởng chứng chỉ server (true cho local dev, false cho production với cert hợp lệ).
        enableArithAbort: true // Bắt buộc cho một số truy vấn, nên để true.
    },
    pool: { // Cấu hình connection pool.
        max: 10, // Số lượng kết nối tối đa trong pool.
        min: 0,  // Số lượng kết nối tối thiểu trong pool.
        idleTimeoutMillis: 30000 // Thời gian (ms) một kết nối có thể không hoạt động trước khi bị đóng.
    }
};

let pool; // Biến để lưu trữ instance của connection pool.

/**
 * Hàm bất đồng bộ để thiết lập và trả về một connection pool đến SQL Server.
 * Nếu pool đã được khởi tạo, hàm sẽ trả về pool hiện có.
 * @returns {Promise<sql.ConnectionPool>} Một promise giải quyết với instance của ConnectionPool.
 * @throws {Error} Ném lỗi nếu không thể kết nối đến CSDL.
 */
async function getConnection() {
    console.log('[database.js] getConnection function called.'); // Log khi hàm được gọi.
    try {
        // Chỉ tạo pool mới nếu nó chưa tồn tại.
        if (!pool) {
            console.log('[database.js] Creating new connection pool...');
            pool = await sql.connect(config); // Thực hiện kết nối và tạo pool.
            console.log('✅ Kết nối database thành công và pool đã được tạo.');

            // (Tùy chọn) Bắt sự kiện lỗi trên pool để theo dõi các vấn đề kết nối có thể xảy ra sau này.
            pool.on('error', err => {
                console.error('[database.js] Lỗi từ SQL Server Connection Pool:', err);
                // Có thể cần xử lý thêm ở đây, ví dụ: thử kết nối lại hoặc thông báo.
            });
        }
        return pool; // Trả về pool đã được khởi tạo.
    } catch (error) {
        console.error('❌ Lỗi kết nối database:', error);
        // Ném lại lỗi để hàm gọi có thể xử lý.
        // Quan trọng: Việc ném lỗi ở đây sẽ khiến ứng dụng có thể bị crash nếu không được bắt ở nơi gọi.
        // Cân nhắc việc xử lý lỗi một cách nhẹ nhàng hơn hoặc đảm bảo lỗi được bắt.
        throw error;
    }
}

/**
 * Test kết nối database
 * @returns {Promise<boolean>} True nếu kết nối thành công, false nếu thất bại
 */
async function testConnection() {
    console.log('[database.js] testConnection function called.');
    try {
        const connection = await getConnection();

        // Thực hiện một query đơn giản để test kết nối
        const result = await connection.request().query('SELECT 1 as test');

        if (result && result.recordset && result.recordset.length > 0) {
            console.log('✅ Database connection test successful');
            return true;
        } else {
            console.log('❌ Database connection test failed - no result');
            return false;
        }
    } catch (error) {
        console.error('❌ Database connection test failed:', error.message);
        return false;
    }
}

/**
 * Hàm để đóng connection pool khi ứng dụng dừng.
 */
async function closePool() {
    try {
        if (pool) {
            await pool.close();
            pool = null; // Reset biến pool
            console.log('[database.js] Connection pool closed.');
        }
    } catch (error) {
        console.error('[database.js] Error closing the connection pool:', error);
    }
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
    console.log('🔄 Graceful shutdown: Closing database connections...');
    await closePool();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🔄 Graceful shutdown: Closing database connections...');
    await closePool();
    process.exit(0);
});

// Export các thành phần cần thiết: hàm getConnection và đối tượng sql (nếu cần dùng trực tiếp).
module.exports = {
    getConnection,
    testConnection, // ⭐ Thêm function testConnection vào export
    closePool,
    sql // Export sql để có thể sử dụng các kiểu dữ liệu của mssql (ví dụ: sql.Int, sql.VarChar)
};

console.log('[database.js] Module exported. typeof getConnection:', typeof getConnection); // Log xác nhận module đã được export.
console.log('[database.js] Module exported. typeof testConnection:', typeof testConnection); // Log xác nhận testConnection đã được export.
