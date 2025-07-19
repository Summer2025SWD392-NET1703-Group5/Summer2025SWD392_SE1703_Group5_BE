const logger = require('../utils/logger');
const { Movie, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * Background Service để tự động cập nhật trạng thái phim dựa trên ngày
 * - Coming Soon: Từ ngày phát hành (Release_Date) đến trước ngày công chiếu (Premiere_Date)
 * - Now Showing: Từ ngày công chiếu (Premiere_Date) đến trước ngày kết thúc (End_Date)
 * - Ended: Sau ngày kết thúc (End_Date)
 */
class MovieStatusService {
    constructor() {
        this.logger = logger;
        // Khoảng thời gian chạy (mặc định là 24 giờ một lần)
        this.checkInterval = 24 * 60 * 60 * 1000; // 24 giờ = 86400000ms

        // Biến để lưu trữ interval ID
        this.intervalId = null;

        // Biến để lưu trữ timeout ID cho lần chạy đầu tiên vào nửa đêm
        this.timeoutId = null;

        // Biến để kiểm soát việc dừng service
        this.isRunning = false;

        // Trạng thái phim: 1 - Coming Soon, 2 - Now Showing, 3 - Ended
        this.STATUS = {
            COMING_SOON: 1,
            NOW_SHOWING: 2,
            ENDED: 3
        };

        // Tính toán thời gian đến 00:00 tiếp theo
        this.calculateTimeToNextMidnight = () => {
            const now = new Date();
            const nextMidnight = new Date();
            nextMidnight.setHours(24, 0, 0, 0); // Set to next midnight (00:00)
            return nextMidnight - now;
        };

        // Tính toán thời gian đến 00:00 tiếp theo
        this.nextCheckTime = null;
    }

    /**
     * Bắt đầu background service
     */
    async start() {
        if (this.isRunning) {
            this.logger.warn('MovieStatusService đã đang chạy');
            return;
        }

        this.logger.info('MovieStatusService đã bắt đầu.');
        this.isRunning = true;

        // Chạy ngay lập tức khi khởi động server
        this.logger.info('Đang chạy kiểm tra trạng thái phim ngay khi khởi động server...');
        await this.executeCheck();

        // Tính toán thời gian đến 00:00 ngày hôm sau
        const now = new Date();
        const nextMidnight = new Date(now);
        nextMidnight.setDate(now.getDate() + 1);
        nextMidnight.setHours(0, 0, 0, 0);
        const timeUntilMidnight = nextMidnight - now;

        this.logger.info(`MovieStatusService sẽ chạy lần tiếp theo vào lúc 00:00 (sau ${Math.floor(timeUntilMidnight / 1000 / 60)} phút)`);

        // Thiết lập timeout để chạy vào 00:00 ngày hôm sau
        this.timeoutId = setTimeout(() => {
            // Chạy kiểm tra vào lúc 00:00
            this.executeCheck();

            // Sau đó thiết lập interval để chạy mỗi 12 giờ
            this.intervalId = setInterval(() => {
                if (this.isRunning) {
                    this.executeCheck();
                }
            }, 12 * 60 * 60 * 1000); // Chạy mỗi 12 giờ thay vì checkInterval

            this.logger.info(`MovieStatusService đã được thiết lập để chạy mỗi 12 giờ vào lúc 00:00 và 12:00`);
        }, timeUntilMidnight);
    }

    /**
     * Dừng background service
     */
    stop() {
        if (!this.isRunning) {
            this.logger.warn('MovieStatusService không đang chạy');
            return;
        }

        this.logger.info('Đang dừng MovieStatusService...');
        this.isRunning = false;

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }

        this.logger.info('MovieStatusService đã dừng.');
    }

    /**
     * Thực hiện kiểm tra và cập nhật trạng thái phim
     */
    async executeCheck() {
        try {
            // Lấy ngày hiện tại theo múi giờ UTC+7 (Việt Nam)
            const now = new Date();
            const today = new Date(now);
            today.setHours(0, 0, 0, 0);

            this.logger.info(`[MovieStatusService] Bắt đầu kiểm tra trạng thái phim - ${today.toISOString().split('T')[0]}`);

            // 0. Lấy tất cả phim để kiểm tra (bỏ qua phim Inactive)
            const allMovies = await Movie.findAll({
                attributes: ['Movie_ID', 'Movie_Name', 'Status', 'Release_Date', 'Premiere_Date', 'End_Date'],
                where: {
                    Status: {
                        [Op.ne]: 'Inactive' // Không lấy phim có trạng thái Inactive
                    }
                }
            });

            this.logger.info(`[MovieStatusService] Tìm thấy ${allMovies.length} phim để kiểm tra (bỏ qua phim Inactive)`);

            // Kiểm tra và cập nhật trạng thái phim một cách hợp lý
            const moviesToUpdate = [];

            for (const movie of allMovies) {
                let newStatus = null;
                let reason = '';

                // Chuyển đổi các ngày thành đối tượng Date để so sánh chính xác
                const releaseDate = this.normalizeDate(movie.Release_Date);
                const premiereDate = this.normalizeDate(movie.Premiere_Date);
                const endDate = movie.End_Date ? this.normalizeDate(movie.End_Date) : null;

                // So sánh các ngày với today
                const isAfterReleaseDate = releaseDate > today;
                const isAfterPremiereDate = premiereDate > today;
                const isBeforeEndDate = endDate === null || endDate > today;

                // Phim chưa phát hành -> Coming Soon
                if (isAfterReleaseDate) {
                    newStatus = 'Coming Soon';
                    reason = `Chưa đến ngày phát hành ${movie.Release_Date}`;
                }
                // Phim đã phát hành nhưng chưa đến ngày công chiếu -> Coming Soon
                else if (releaseDate <= today && isAfterPremiereDate) {
                    newStatus = 'Coming Soon';
                    reason = `Đã phát hành nhưng chưa đến ngày công chiếu ${movie.Premiere_Date}`;
                }
                // Phim đã đến ngày công chiếu và chưa kết thúc -> Now Showing
                else if (premiereDate <= today && isBeforeEndDate) {
                    newStatus = 'Now Showing';
                    reason = `Đã đến ngày công chiếu ${movie.Premiere_Date} và chưa kết thúc`;
                }
                // Phim đã qua ngày kết thúc -> Ended
                else if (endDate !== null && endDate <= today) {
                    newStatus = 'Ended';
                    reason = `Đã qua ngày kết thúc ${movie.End_Date}`;
                }

                // Chỉ cập nhật nếu trạng thái mới khác trạng thái hiện tại
                if (newStatus !== null && movie.Status !== newStatus) {
                    moviesToUpdate.push({
                        id: movie.Movie_ID,
                        name: movie.Movie_Name,
                        oldStatus: movie.Status,
                        newStatus,
                        reason
                    });
                }
            }

            // Cập nhật trạng thái cho từng nhóm phim
            const comingSoonMovies = moviesToUpdate.filter(m => m.newStatus === 'Coming Soon').map(m => m.id);
            const nowShowingMovies = moviesToUpdate.filter(m => m.newStatus === 'Now Showing').map(m => m.id);
            const endedMovies = moviesToUpdate.filter(m => m.newStatus === 'Ended').map(m => m.id);

            // Cập nhật Coming Soon
            if (comingSoonMovies.length > 0) {
                await Movie.update(
                    {
                        Status: 'Coming Soon',
                        Updated_At: sequelize.fn('GETDATE')
                    },
                    {
                        where: {
                            Movie_ID: { [Op.in]: comingSoonMovies }
                        }
                    }
                );
                this.logger.info(`[MovieStatusService] Cập nhật ${comingSoonMovies.length} phim thành Coming Soon`);
            }

            // Cập nhật Now Showing
            if (nowShowingMovies.length > 0) {
                await Movie.update(
                    {
                        Status: 'Now Showing',
                        Updated_At: sequelize.fn('GETDATE')
                    },
                    {
                        where: {
                            Movie_ID: { [Op.in]: nowShowingMovies }
                        }
                    }
                );
                this.logger.info(`[MovieStatusService] Cập nhật ${nowShowingMovies.length} phim thành Now Showing`);
            }

            // Cập nhật Ended
            if (endedMovies.length > 0) {
                await Movie.update(
                    {
                        Status: 'Ended',
                        Updated_At: sequelize.fn('GETDATE')
                    },
                    {
                        where: {
                            Movie_ID: { [Op.in]: endedMovies }
                        }
                    }
                );
                this.logger.info(`[MovieStatusService] Cập nhật ${endedMovies.length} phim thành Ended`);
            }

            // Tổng kết
            const totalUpdated = moviesToUpdate.length;
            if (totalUpdated > 0) {
                this.logger.info(`[MovieStatusService] ✅ Hoàn thành: ${totalUpdated}/${allMovies.length} phim được cập nhật`);
                // Chỉ log chi tiết khi có thay đổi
                moviesToUpdate.forEach(movie => {
                    this.logger.info(`  - "${movie.name}" (${movie.oldStatus} → ${movie.newStatus})`);
                });
            } else {
                this.logger.info(`[MovieStatusService] ✅ Hoàn thành: Không có phim nào cần cập nhật`);
            }

        } catch (error) {
            this.logger.error('[MovieStatusService] Lỗi:', error.message);
            // Đợi một khoảng thời gian ngắn trước khi thử lại nếu có lỗi
            await this.delay(5 * 60 * 1000); // 5 phút
        }
    }

    /**
     * Chuẩn hóa ngày tháng để so sánh
     * @param {Date|string} dateInput - Ngày cần chuẩn hóa
     * @returns {Date} Ngày đã chuẩn hóa (chỉ giữ phần ngày)
     */
    normalizeDate(dateInput) {
        let date;
        if (dateInput instanceof Date) {
            date = new Date(dateInput);
        } else if (typeof dateInput === 'string') {
            // Chuyển đổi chuỗi ngày thành đối tượng Date
            date = new Date(dateInput);
        } else {
            // Nếu không phải Date hoặc string, trả về ngày hiện tại
            date = new Date();
            this.logger.warn(`Giá trị ngày không hợp lệ: ${dateInput}, sử dụng ngày hiện tại thay thế`);
        }

        // Đặt giờ, phút, giây, mili giây về 0 để chỉ so sánh phần ngày
        date.setHours(0, 0, 0, 0);
        return date;
    }

    /**
     * Utility method để tạo delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Thiết lập khoảng thời gian kiểm tra mới
     */
    setCheckInterval(hours) {
        const newInterval = hours * 60 * 60 * 1000;

        if (newInterval !== this.checkInterval) {
            this.checkInterval = newInterval;
            this.logger.info(`Đã cập nhật khoảng thời gian kiểm tra thành ${hours} giờ`);

            // Nếu service đang chạy, restart với interval mới
            if (this.isRunning) {
                this.stop();
                setTimeout(() => this.start(), 1000);
            }
        }
    }

    /**
     * Chạy kiểm tra ngay lập tức (thủ công)
     */
    async runCheckNow() {
        this.logger.info('Đang chạy kiểm tra trạng thái phim thủ công...');
        await this.executeCheck();
        return true;
    }

    /**
     * Lấy trạng thái hiện tại của service
     */
    getStatus() {
        // Tính toán thời gian kiểm tra tiếp theo
        let nextCheckTime = null;
        if (this.isRunning) {
            if (this.timeoutId) {
                // Nếu đang chờ timeout đầu tiên, tính thời gian đến nửa đêm
                const now = new Date();
                const nextMidnight = new Date(now);
                nextMidnight.setDate(now.getDate() + 1);
                nextMidnight.setHours(0, 0, 0, 0);
                nextCheckTime = nextMidnight.toISOString();
            } else if (this.intervalId) {
                // Nếu đã thiết lập interval, tính thời gian kiểm tra tiếp theo (mỗi 12 giờ)
                const now = new Date();
                const nextCheck = new Date(now);

                // Kiểm tra xem thời điểm tiếp theo là 00:00 hay 12:00
                if (now.getHours() < 12) {
                    // Nếu hiện tại chưa đến 12:00, thì thời điểm tiếp theo là 12:00 hôm nay
                    nextCheck.setHours(12, 0, 0, 0);
                } else {
                    // Nếu hiện tại đã qua 12:00, thì thời điểm tiếp theo là 00:00 ngày mai
                    nextCheck.setDate(now.getDate() + 1);
                    nextCheck.setHours(0, 0, 0, 0);
                }

                nextCheckTime = nextCheck.toISOString();
            }
        }

        return {
            isRunning: this.isRunning,
            checkIntervalHours: 12, // Cố định là 12 giờ
            nextCheckTime: nextCheckTime
        };
    }
}

// Export singleton instance
module.exports = new MovieStatusService(); 