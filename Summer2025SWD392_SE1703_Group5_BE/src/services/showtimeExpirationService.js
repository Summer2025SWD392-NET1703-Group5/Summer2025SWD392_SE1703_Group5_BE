// src/services/showtimeExpirationService.js
const logger = require('../utils/logger');
const ShowtimeService = require('./showtimeService');

/**
 * Background Service để tự động ẩn các suất chiếu đã hết hạn
 * Chuyển đổi từ C# ShowtimeExpirationService
 */
class ShowtimeExpirationService {
    constructor() {
        this.logger = logger;
        this.showtimeService = ShowtimeService;
        // Khoảng thời gian chạy (mặc định là 1 giờ một lần)
        this.checkInterval = 60 * 1000; // 1 phút = 60000ms

        // Biến để lưu trữ interval ID
        this.intervalId = null;

        // Biến để kiểm soát việc dừng service
        this.isRunning = false;
    }

    /**
     * Bắt đầu background service
     * Chuyển đổi từ C# ExecuteAsync method
     */
    async start() {
        if (this.isRunning) {
            this.logger.warn('ShowtimeExpirationService đã đang chạy');
            return;
        }

        this.logger.info('ShowtimeExpirationService đã bắt đầu.');
        this.isRunning = true;

        // Chạy ngay lần đầu
        await this.executeCheck();

        // Thiết lập interval để chạy định kỳ
        this.intervalId = setInterval(async () => {
            if (this.isRunning) {
                await this.executeCheck();
            }
        }, this.checkInterval);
    }

    /**
     * Dừng background service
     */
    stop() {
        if (!this.isRunning) {
            this.logger.warn('ShowtimeExpirationService không đang chạy');
            return;
        }

        this.logger.info('Đang dừng ShowtimeExpirationService...');
        this.isRunning = false;

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.logger.info('ShowtimeExpirationService đã dừng.');
    }

    /**
     * Thực hiện kiểm tra và ẩn suất chiếu hết hạn
     * Chuyển đổi từ C# ExecuteAsync logic
     */
    async executeCheck() {
        try {
            this.logger.info(`Đang kiểm tra các suất chiếu đã hết hạn tại ${new Date().toISOString()}`);

            // Gọi service để tự động ẩn suất chiếu hết hạn
            const hiddenCount = await this.showtimeService.autoHideExpiredShowtimes();
            if (hiddenCount > 0) {
                this.logger.info(`Đã ẩn ${hiddenCount} suất chiếu đã hết hạn`);
            } else {
                this.logger.info('Không có suất chiếu nào cần ẩn');
            }

        } catch (error) {
            this.logger.error('Lỗi trong ShowtimeExpirationService:', error);

            // Đợi một khoảng thời gian ngắn trước khi thử lại nếu có lỗi
            // Tương đương với Task.Delay(TimeSpan.FromMinutes(5)) trong C#
            await this.delay(5 * 60 * 1000); // 5 phút
        }
    }

    /**
     * Utility method để tạo delay
     * Tương đương với Task.Delay trong C#
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Thiết lập khoảng thời gian kiểm tra mới
     */
    setCheckInterval(minutes) {
        const newInterval = minutes * 60 * 1000;

        if (newInterval !== this.checkInterval) {
            this.checkInterval = newInterval;
            this.logger.info(`Đã cập nhật khoảng thời gian kiểm tra thành ${minutes} phút`);

            // Nếu service đang chạy, restart với interval mới
            if (this.isRunning) {
                this.stop();
                setTimeout(() => this.start(), 1000);
            }
        }
    }

    /**
     * Lấy trạng thái hiện tại của service
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            checkIntervalMinutes: this.checkInterval / (60 * 1000),
            nextCheckTime: this.isRunning ?
                new Date(Date.now() + this.checkInterval).toISOString() : null
        };
    }
}

// Export singleton instance
module.exports = new ShowtimeExpirationService();
