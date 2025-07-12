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
    connectionTimeout: 60000,              // Tăng thời gian timeout kết nối lên 60 giây (từ 30s)
    requestTimeout: 120000,                // Tăng thời gian timeout cho các câu truy vấn lên 120 giây (từ 60s)
    options: {
        encrypt: true, // Sử dụng mã hóa cho kết nối (true nếu dùng Azure SQL hoặc SQL Server có SSL).
        trustServerCertificate: true, // Tin tưởng chứng chỉ server (true cho local dev, false cho production với cert hợp lệ).
        enableArithAbort: true, // Bắt buộc cho một số truy vấn, nên để true.
        connectTimeout: 60000    // Tăng timeout kết nối cấp TCP lên 60 giây (từ 30s)
    },
    pool: { // Cấu hình connection pool.
        max: 15, // Tăng số lượng kết nối tối đa trong pool lên 15 (từ 10)
        min: 5,  // Tăng số lượng kết nối tối thiểu lên 5 (từ 2) để luôn có kết nối sẵn sàng
        idleTimeoutMillis: 60000, // Tăng thời gian (ms) một kết nối có thể không hoạt động lên 60 giây (từ 30s)
        acquireTimeoutMillis: 60000, // Tăng thời gian tối đa để lấy kết nối từ pool lên 60 giây (từ 30s)
        createTimeoutMillis: 60000, // Tăng thời gian tối đa để tạo kết nối mới lên 60 giây (từ 30s)
        destroyTimeoutMillis: 10000, // Tăng thời gian tối đa để đóng kết nối lên 10 giây (từ 5s)
        reapIntervalMillis: 2000,   // Tăng tần suất kiểm tra các kết nối không hoạt động lên 2 giây (từ 1s)
        createRetryIntervalMillis: 500 // Tăng khoảng thời gian giữa các lần thử tạo kết nối mới lên 500ms (từ 200ms)
    }
};

let pool; // Biến để lưu trữ instance của connection pool.

/**
 * Hàm bất đồng bộ để thiết lập và trả về một connection pool đến SQL Server.
 * Nếu pool đã được khởi tạo, hàm sẽ trả về pool hiện có.
 * @returns {Promise<sql.ConnectionPool>} Một promise giải quyết với instance của ConnectionPool.
 * @throws {Error} Ném lỗi nếu không thể kết nối đến CSDL sau số lần thử tối đa.
 */
async function getConnection() {
    // DEBUG: Removed để tăng tốc API

    // Tham số retry
    const maxRetries = 5; // Tăng số lần retry lên 5 (từ 3)
    const retryDelay = 8000; // Tăng thời gian delay giữa các lần retry lên 8 giây (từ 5s)

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Kiểm tra xem pool có tồn tại, có được kết nối và không bị đóng
            if (!pool || pool.closed || !pool.connected) {
                // Nếu pool tồn tại nhưng bị đóng, thử đóng nó một cách an toàn
                if (pool) {
                    try {
                        console.log('[database.js] Closing existing pool before creating a new one');
                        await pool.close();
                    } catch (closeErr) {
                        console.error('[database.js] Error when closing existing pool:', closeErr.message);
                        // Tiếp tục ngay cả khi có lỗi khi đóng
                    }
                }

                console.log(`[database.js] Creating new connection pool... (attempt ${attempt}/${maxRetries})`);
                pool = await sql.connect(config); // Thực hiện kết nối và tạo pool.
                console.log('✅ Kết nối database thành công và pool đã được tạo.');

                // Bắt sự kiện lỗi trên pool để theo dõi các vấn đề kết nối có thể xảy ra sau này.
                pool.on('error', err => {
                    console.error('[database.js] Lỗi từ SQL Server Connection Pool:', err);
                    // Xử lý lỗi kết nối, có thể đánh dấu pool để khởi tạo lại vào lần gọi tiếp theo
                    if (pool) {
                        try {
                            pool.close();
                        } catch (closeErr) {
                            console.error('[database.js] Error closing pool after error:', closeErr);
                        }
                        pool = null;
                    }
                });
            } else {
                // Kiểm tra pool có thực sự hoạt động không bằng cách gửi query đơn giản
                try {
                    // Test pool with simple query
                    await pool.request().query('SELECT 1');
                    // Pool is working correctly
                } catch (testErr) {
                    console.error('[database.js] Existing pool failed test query:', testErr.message);
                    // Nếu test query thất bại, đóng pool và tạo mới
                    try {
                        await pool.close();
                    } catch (closeErr) {
                        console.error('[database.js] Error closing pool after test failure:', closeErr);
                    }
                    pool = null;
                    // Tiếp tục vòng lặp để tạo pool mới
                    continue;
                }
            }
            return pool; // Trả về pool đã được khởi tạo.
        } catch (error) {
            console.error(`❌ Lỗi kết nối database (attempt ${attempt}/${maxRetries}):`, error);

            // Nếu đã thử tối đa số lần, ném lỗi
            if (attempt === maxRetries) {
                console.error(`Đã thử kết nối ${maxRetries} lần không thành công. Dừng cố gắng kết nối.`);
                // Trả về một đối tượng lỗi thay vì ném lỗi để tránh crash
                return {
                    errorStatus: true,
                    error: error,
                    message: `Không thể kết nối đến cơ sở dữ liệu sau ${maxRetries} lần thử`
                };
            }

            // Nếu chưa đạt số lần thử tối đa, chờ một khoảng thời gian và thử lại
            console.log(`Sẽ thử kết nối lại sau ${retryDelay / 1000} giây...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));

            // Đảm bảo pool cũ được đóng trước khi thử lại
            if (pool) {
                try {
                    await pool.close();
                } catch (closeErr) {
                    console.error('[database.js] Error closing pool before retry:', closeErr);
                }
                pool = null;
            }
        }
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