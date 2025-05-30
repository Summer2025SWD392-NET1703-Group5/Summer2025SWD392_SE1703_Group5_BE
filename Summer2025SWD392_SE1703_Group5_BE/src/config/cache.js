// File: src/config/cache.js
// Mô tả: Cấu hình và cung cấp một instance của NodeCache để sử dụng trong ứng dụng (in-memory cache).

const NodeCache = require('node-cache'); // Import thư viện NodeCache.

let cacheInstance = null; // Biến để lưu trữ instance của NodeCache (Singleton pattern).

/**
 * Hàm để lấy (hoặc tạo nếu chưa có) instance của NodeCache.
 * Sử dụng Singleton pattern để đảm bảo chỉ có một instance cache được tạo ra.
 * @returns {NodeCache} Instance của NodeCache.
 */
function getCacheInstance() {
    // Chỉ tạo mới instance cache nếu nó chưa được khởi tạo.
    if (!cacheInstance) {
        console.log('[cache.js] Creating new NodeCache instance...');

        // Cấu hình NodeCache.
        cacheInstance = new NodeCache({
            // stdTTL: Thời gian sống mặc định (Time To Live) cho mỗi cache item, tính bằng giây.
            // Ở đây là 86400 giây = 24 giờ.
            // Nếu một item được thêm vào cache mà không có TTL cụ thể, nó sẽ hết hạn sau khoảng thời gian này.
            stdTTL: 86400, // 24 hours

            // checkperiod: Khoảng thời gian (tính bằng giây) mà cache sẽ tự động kiểm tra và xóa các item đã hết hạn.
            // Ở đây là 600 giây = 10 phút.
            // Việc này giúp giải phóng bộ nhớ và đảm bảo cache không chứa dữ liệu cũ quá lâu.
            checkperiod: 600, // Check for expired items every 10 minutes

            // (Tùy chọn) Các cấu hình khác:
            // useClones: false, // Mặc định là true. Nếu false, cache sẽ trả về tham chiếu trực tiếp đến object đã lưu,
            // giúp tăng tốc độ nhưng có thể gây ra thay đổi không mong muốn nếu object được sửa đổi bên ngoài cache.
            // deleteOnExpire: true, // Mặc định là true. Tự động xóa item khi hết hạn.
        });

        console.log('[cache.js] NodeCache instance created with stdTTL: 24 hours, checkperiod: 10 minutes.');

        // (Tùy chọn) Lắng nghe các sự kiện của cache để log hoặc xử lý.
        // cacheInstance.on('set', (key, value) => {
        //     console.log(`[cache.js] Key set: ${key}` /*, value */ ); // Tránh log value nếu nó quá lớn hoặc nhạy cảm.
        // });
        // cacheInstance.on('expired', (key, value) => {
        //     console.log(`[cache.js] Key expired and deleted: ${key}`);
        // });
        // cacheInstance.on('del', (key, value) => {
        //     console.log(`[cache.js] Key deleted: ${key}`);
        // });
    }
    return cacheInstance; // Trả về instance cache đã có hoặc vừa tạo.
}

// Export hàm getCacheInstance để các module khác có thể lấy instance cache.
// Sử dụng object với key `get` để có thể gọi `require('./cache').get()`.
module.exports = { get: getCacheInstance };