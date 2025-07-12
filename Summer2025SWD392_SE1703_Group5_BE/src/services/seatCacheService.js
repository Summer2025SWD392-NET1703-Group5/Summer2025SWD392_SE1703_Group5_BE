// src/services/seatCacheService.js
// Service quản lý cache Redis cho trạng thái ghế tạm thời

const Redis = require('redis');

class SeatCacheService {
    constructor() {
        // 🔧 REDIS MODE: Sử dụng Redis cache cho production
        // Để enable Redis: set USE_REDIS=true trong .env

        const useRedis = process.env.USE_REDIS === 'true' || true; // 🔧 FIX: Force enable Redis

        if (useRedis) {
            console.log('🔄 [CACHE] Đang kết nối Redis...');

            // Khởi tạo Redis client (sử dụng redis package v5)
            this.redis = Redis.createClient({
                socket: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: process.env.REDIS_PORT || 6379,
                    connectTimeout: 5000
                },
                password: process.env.REDIS_PASSWORD || undefined,
                database: process.env.REDIS_DB || 0
            });

            this.redis.on('connect', () => {
                console.log('✅ [CACHE] Đã kết nối Redis thành công!');
                this.redisAvailable = true;
            });

            this.redis.on('ready', () => {
                console.log('🚀 [CACHE] Redis sẵn sàng nhận lệnh');
                this.redisAvailable = true;

                // Broadcast lại trạng thái ghế cho tất cả clients khi Redis reconnect
                this.broadcastSeatsStateAfterReconnect();
            });

            this.redis.on('error', (err) => {
                console.error('❌ [CACHE] Lỗi Redis:', err.message || err.code || 'Unknown error');
                this.redisAvailable = false;
            });

            this.redis.on('end', () => {
                console.log('⚠️ [CACHE] Kết nối Redis đã đóng');
                this.redisAvailable = false;
            });

            // Thử kết nối Redis và đợi kết nối thành công
            this.connectRedis();
        } else {
            console.log('🔧 [CACHE] Chế độ development: Chỉ sử dụng memory cache');
            this.redis = null;
        }

        // Memory cache cho development hoặc fallback
        this.memoryCache = new Map(); // { showtimeId: { seatId: seatData } }
        this.userSeats = new Map(); // { userId: Set<seatKey> }
        this.redisAvailable = false; // Mặc định false, chỉ true khi Redis connect thành công

        // Timeout cho việc giữ ghế (5 phút)
        this.SEAT_HOLD_TIMEOUT = 5 * 60; // 5 minutes in seconds

        console.log('✅ SeatCacheService đã được khởi tạo với Memory cache');
    }

    /**
     * Kết nối Redis với retry logic
     */
    async connectRedis() {
        if (!this.redis) return;

        try {
            console.log('🔄 [CACHE] Đang kết nối Redis...');
            await this.redis.connect();
            console.log('✅ [CACHE] Redis đã kết nối thành công!');
            this.redisAvailable = true;
        } catch (err) {
            console.error('❌ [CACHE] Không thể kết nối Redis:', err.message);
            console.log('🔧 [CACHE] Sẽ sử dụng memory cache thay thế');
            this.redisAvailable = false;

            // Retry sau 5 giây
            setTimeout(() => {
                if (!this.redisAvailable) {
                    console.log('🔄 [CACHE] Thử kết nối lại Redis...');
                    this.connectRedis();
                }
            }, 5000);
        }
    }

    /**
     * Broadcast lại trạng thái ghế sau khi Redis reconnect
     */
    async broadcastSeatsStateAfterReconnect() {
        try {
            // Lấy danh sách tất cả các showtime đang có ghế được chọn
            const pattern = 'seat:*';
            const keys = await this.redis.keys(pattern);

            if (keys.length > 0) {
                console.log(`🔄 [CACHE] Redis reconnect - Broadcasting lại trạng thái ${keys.length} ghế`);

                // Lấy danh sách showtimes unique
                const showtimes = new Set();
                keys.forEach(key => {
                    const parts = key.split(':');
                    if (parts.length >= 2) {
                        showtimes.add(parts[1]); // showtimeId
                    }
                });

                // Broadcast cho từng showtime (nếu có WebSocket instance)
                if (global.io) {
                    for (const showtimeId of showtimes) {
                        const roomName = `showtime-${showtimeId}`;
                        console.log(`📡 [CACHE] Broadcasting seats-state cho room ${roomName}`);

                        // Trigger refresh cho room này
                        global.io.to(roomName).emit('redis-reconnected', {
                            message: 'Redis đã kết nối lại, đang cập nhật trạng thái ghế...'
                        });
                    }
                }
            }
        } catch (error) {
            console.error('❌ [CACHE] Lỗi khi broadcast sau Redis reconnect:', error);
        }
    }

    /**
     * Tạo key cho ghế trong Redis
     */
    getSeatKey(showtimeId, seatId) {
        return `seat:${showtimeId}:${seatId}`;
    }

    /**
     * Tạo key cho danh sách ghế của user
     */
    getUserSeatsKey(userId) {
        return `user_seats:${userId}`;
    }

    /**
     * Memory fallback methods
     */
    memorySelectSeat(showtimeId, seatId, userId, socketId) {
        if (!this.memoryCache.has(showtimeId)) {
            this.memoryCache.set(showtimeId, new Map());
        }

        const showtimeSeats = this.memoryCache.get(showtimeId);

        // Kiểm tra conflict
        if (showtimeSeats.has(seatId)) {
            const existingSeat = showtimeSeats.get(seatId);
            if (existingSeat.userId !== userId) {
                return {
                    success: false,
                    message: 'Ghế đang được chọn bởi người dùng khác',
                    conflictUserId: existingSeat.userId
                };
            }
        }

        const seatData = {
            showtimeId: showtimeId,
            seatId: seatId,
            userId: userId,
            socketId: socketId,
            timestamp: Date.now(),
            status: 'selecting'
        };

        // Lưu vào memory
        showtimeSeats.set(seatId, seatData);

        // Lưu vào user seats
        const seatKey = this.getSeatKey(showtimeId, seatId);
        if (!this.userSeats.has(userId)) {
            this.userSeats.set(userId, new Set());
        }
        this.userSeats.get(userId).add(seatKey);

        // console.log(`✅ Memory fallback: Đã lưu ghế ${seatId} cho user ${userId}`);
        return {
            success: true,
            seatId: seatId,
            status: 'selecting',
            userId: userId,
            timestamp: seatData.timestamp,
            expiresAt: Date.now() + (this.SEAT_HOLD_TIMEOUT * 1000)
        };
    }

    memoryDeselectSeat(showtimeId, seatId, userId) {
        if (!this.memoryCache.has(showtimeId)) {
            return { success: false, message: 'Showtime không tồn tại' };
        }

        const showtimeSeats = this.memoryCache.get(showtimeId);

        if (!showtimeSeats.has(seatId)) {
            return { success: false, message: 'Ghế không tồn tại' };
        }

        const seatData = showtimeSeats.get(seatId);
        if (seatData.userId !== userId) {
            return { success: false, message: 'Bạn không có quyền bỏ chọn ghế này' };
        }

        // Xóa khỏi memory
        showtimeSeats.delete(seatId);

        // Xóa khỏi user seats
        const seatKey = this.getSeatKey(showtimeId, seatId);
        if (this.userSeats.has(userId)) {
            this.userSeats.get(userId).delete(seatKey);
            if (this.userSeats.get(userId).size === 0) {
                this.userSeats.delete(userId);
            }
        }

        return {
            success: true,
            seatId: seatId,
            status: 'available'
        };
    }

    memoryReleaseUserSelectingSeats(userId) {
        if (!this.userSeats.has(userId)) {
            return [];
        }

        const userSeatKeys = this.userSeats.get(userId);
        const releasedSeats = [];
        const remainingSeats = [];

        userSeatKeys.forEach(seatKey => {
            const [, showtimeId, seatId] = seatKey.split(':');

            if (this.memoryCache.has(showtimeId)) {
                const showtimeSeats = this.memoryCache.get(showtimeId);
                if (showtimeSeats.has(seatId)) {
                    const seatData = showtimeSeats.get(seatId);

                    // ✅ CHỈ giải phóng ghế đang selecting
                    if (seatData.status === 'selecting') {
                        releasedSeats.push({
                            showtimeId: showtimeId,
                            seatId: seatId,
                            userId: seatData.userId,
                            reason: 'user_disconnect_selecting_only'
                        });
                        showtimeSeats.delete(seatId);
                        console.log(`🔄 Memory: Giải phóng ghế selecting: ${seatId}`);
                    } else {
                        remainingSeats.push(seatKey);
                        console.log(`🔒 Memory: Giữ nguyên ghế đã booked: ${seatId} (status: ${seatData.status})`);
                    }
                }
            }
        });

        // Cập nhật lại danh sách ghế của user (chỉ giữ lại ghế đã booked)
        if (remainingSeats.length > 0) {
            this.userSeats.set(userId, remainingSeats);
        } else {
            this.userSeats.delete(userId);
        }

        return releasedSeats;
    }

    memoryReleaseUserSeats(userId) {
        if (!this.userSeats.has(userId)) {
            return [];
        }

        const userSeatKeys = this.userSeats.get(userId);
        const releasedSeats = [];

        userSeatKeys.forEach(seatKey => {
            const [, showtimeId, seatId] = seatKey.split(':');

            if (this.memoryCache.has(showtimeId)) {
                const showtimeSeats = this.memoryCache.get(showtimeId);
                if (showtimeSeats.has(seatId)) {
                    const seatData = showtimeSeats.get(seatId);
                    releasedSeats.push({
                        showtimeId: showtimeId,
                        seatId: seatId,
                        userId: seatData.userId,
                        reason: 'user_disconnect'
                    });
                    showtimeSeats.delete(seatId);
                }
            }
        });

        // Xóa user seats
        this.userSeats.delete(userId);

        // console.log(`Memory fallback: Đã giải phóng ${releasedSeats.length} ghế cho user ${userId}`);
        return releasedSeats;
    }

    memoryMarkSeatAsBooked(showtimeId, seatId, userId) {
        // console.log(`🔒 Memory fallback: Đánh dấu ghế ${seatId} là booked cho user ${userId}`);

        if (!this.memoryCache.has(showtimeId)) {
            // console.log(`⚠️ Memory: Showtime ${showtimeId} không tồn tại`);
            return { success: false, message: 'Showtime not found' };
        }

        const showtimeSeats = this.memoryCache.get(showtimeId);
        if (!showtimeSeats.has(seatId)) {
            // console.log(`⚠️ Memory: Ghế ${seatId} không tồn tại`);
            return { success: false, message: 'Seat not found' };
        }

        const seatData = showtimeSeats.get(seatId);

        // Kiểm tra ownership
        if (seatData.userId !== userId) {
            console.log(`❌ Memory: User ${userId} không có quyền mark ghế ${seatId} (owner: ${seatData.userId})`);
            return { success: false, message: 'Not seat owner' };
        }

        // Cập nhật status thành 'booked'
        const updatedSeatData = {
            ...seatData,
            status: 'booked',
            bookedAt: Date.now()
        };

        showtimeSeats.set(seatId, updatedSeatData);

        console.log(`✅ Memory: Đã đánh dấu ghế ${seatId} là booked cho user ${userId}`);
        return { success: true, seatId, status: 'booked', userId };
    }

    /**
     * Memory fallback để lấy trạng thái ghế từ memory cache
     */
    memoryGetShowtimeSeats(showtimeId) {
        if (!this.memoryCache.has(showtimeId)) {
            return {};
        }

        const showtimeSeats = this.memoryCache.get(showtimeId);
        const result = {};

        // Convert Map to object
        showtimeSeats.forEach((value, key) => {
            result[key] = value;
            
            // Đảm bảo các thuộc tính isBooked và isAvailable được thiết lập đúng
            if (value.status === 'booked') {
                result[key].isBooked = true;
                result[key].isAvailable = false;
            } else if (value.status === 'selecting') {
                result[key].isSelecting = true;
                result[key].isAvailable = false;
            } else {
                result[key].isAvailable = true;
                result[key].isBooked = false;
                result[key].isSelecting = false;
            }
        });

        return result;
    }

    /**
     * Chọn ghế - lưu vào Redis với TTL
     */
    async selectSeat(showtimeId, seatId, userId, socketId) {
        // Kiểm tra Redis có khả dụng không
        if (!this.redisAvailable) {
            return this.memorySelectSeat(showtimeId, seatId, userId, socketId);
        }

        try {
            console.log(`🎯 User ${userId} chọn ghế ${seatId} trong suất chiếu ${showtimeId} (Redis)`);

            const seatKey = this.getSeatKey(showtimeId, seatId);
            const userSeatsKey = this.getUserSeatsKey(userId);

            // Kiểm tra ghế đã được chọn chưa
            const existingSeat = await this.redis.get(seatKey);
            if (existingSeat) {
                const seatData = JSON.parse(existingSeat);
                if (seatData.userId !== userId) {
                    return {
                        success: false,
                        message: 'Ghế đang được chọn bởi người dùng khác',
                        conflictUserId: seatData.userId
                    };
                }
            }

            // Lưu thông tin ghế với TTL
            const seatData = {
                status: 'selecting',
                userId: userId,
                socketId: socketId,
                timestamp: Date.now(),
                showtimeId: showtimeId,
                seatId: seatId
            };

            // Sử dụng các lệnh riêng lẻ (Redis package v5 API)
            await this.redis.setEx(seatKey, this.SEAT_HOLD_TIMEOUT, JSON.stringify(seatData));
            await this.redis.sAdd(userSeatsKey, seatKey);
            await this.redis.expire(userSeatsKey, this.SEAT_HOLD_TIMEOUT);

            console.log(`✅ Ghế ${seatId} đã được lưu vào Redis với TTL ${this.SEAT_HOLD_TIMEOUT}s`);
            return {
                success: true,
                seatId: seatId,
                status: 'selecting',
                userId: userId,
                timestamp: seatData.timestamp,
                expiresAt: Date.now() + (this.SEAT_HOLD_TIMEOUT * 1000)
            };

        } catch (error) {
            console.error(`❌ Lỗi khi chọn ghế trong Redis:`, error);
            // console.log('Redis không khả dụng, sử dụng memory fallback để chọn ghế');
            this.redisAvailable = false;
            return this.memorySelectSeat(showtimeId, seatId, userId, socketId);
        }
    }

    /**
     * Bỏ chọn ghế - xóa khỏi Redis
     */
    async deselectSeat(showtimeId, seatId, userId) {
        // Kiểm tra Redis có khả dụng không
        if (!this.redisAvailable) {
            return this.memoryDeselectSeat(showtimeId, seatId, userId);
        }

        try {
            console.log(`🔄 User ${userId} bỏ chọn ghế ${seatId} trong suất chiếu ${showtimeId} (Redis)`);

            const seatKey = this.getSeatKey(showtimeId, seatId);
            const userSeatsKey = this.getUserSeatsKey(userId);

            // Kiểm tra quyền sở hữu ghế
            const existingSeat = await this.redis.get(seatKey);
            if (!existingSeat) {
                return {
                    success: true,
                    message: 'Ghế không trong trạng thái được chọn'
                };
            }

            const seatData = JSON.parse(existingSeat);
            
            // FIX: Cho phép force deselect khi cần thiết
            const isAdmin = userId === 'admin' || userId === 'system';
            if (seatData.userId !== userId && !isAdmin) {
                console.log(`⚠️ Từ chối bỏ chọn: User ${userId} không sở hữu ghế ${seatId} (sở hữu bởi ${seatData.userId})`);
                return {
                    success: false,
                    message: 'Bạn không có quyền bỏ chọn ghế này'
                };
            }

            // Xóa ghế khỏi Redis (sử dụng các lệnh riêng lẻ)
            await this.redis.del(seatKey);

            // Nếu là chính chủ ghế, xóa khỏi danh sách của họ
            if (seatData.userId === userId) {
                await this.redis.sRem(userSeatsKey, seatKey);
            } else if (isAdmin) {
                // Nếu là admin/system force deselect, xóa khỏi danh sách của chủ ghế
                const ownerSeatsKey = this.getUserSeatsKey(seatData.userId);
                await this.redis.sRem(ownerSeatsKey, seatKey);
                console.log(`🔄 Admin/system force deselect ghế ${seatId} của user ${seatData.userId}`);
            }

            console.log(`✅ Ghế ${seatId} đã được xóa khỏi Redis`);
            return {
                success: true,
                seatId: seatId,
                status: 'available'
            };

        } catch (error) {
            console.error(`❌ Lỗi khi bỏ chọn ghế trong Redis:`, error);
            // console.log('Redis không khả dụng, sử dụng memory fallback để bỏ chọn ghế');
            this.redisAvailable = false;
            return this.memoryDeselectSeat(showtimeId, seatId, userId);
        }
    }

    /**
     * Đánh dấu ghế là đã booked (sau khi booking thành công)
     */
    async markSeatAsBooked(showtimeId, seatId, userId) {
        // Kiểm tra Redis có khả dụng không
        if (!this.redisAvailable) {
            // console.log('Redis không khả dụng, sử dụng memory fallback để mark seat as booked');
            return this.memoryMarkSeatAsBooked(showtimeId, seatId, userId);
        }

        try {
            console.log(`🔒 Đánh dấu ghế ${seatId} là đã booked cho user ${userId}`);

            const seatKey = this.getSeatKey(showtimeId, seatId);
            const userSeatsKey = this.getUserSeatsKey(userId);

            // Lấy thông tin ghế hiện tại
            const existingSeat = await this.redis.get(seatKey);
            if (!existingSeat) {
                console.log(`⚠️ Ghế ${seatId} không tồn tại trong Redis`);
                return { success: false, message: 'Seat not found' };
            }

            const seatData = JSON.parse(existingSeat);

            // Kiểm tra ownership
            if (seatData.userId !== userId) {
                console.log(`❌ User ${userId} không có quyền mark ghế ${seatId} (owner: ${seatData.userId})`);
                return { success: false, message: 'Not seat owner' };
            }

            // Cập nhật status thành 'booked' và remove TTL (ghế booked không expire)
            const updatedSeatData = {
                ...seatData,
                status: 'booked',
                bookedAt: Date.now()
            };

            // Sử dụng các lệnh riêng lẻ để cập nhật
            // Lưu ghế với status 'booked' KHÔNG có TTL (persist forever)
            await this.redis.set(seatKey, JSON.stringify(updatedSeatData));

            // Ghế booked vẫn thuộc về user nhưng không expire
            await this.redis.persist(userSeatsKey);

            console.log(`✅ Đã đánh dấu ghế ${seatId} là booked cho user ${userId}`);
            return { success: true, seatId, status: 'booked', userId };

        } catch (error) {
            console.error(`❌ Lỗi khi mark seat as booked trong Redis:`, error);
            // console.log('Redis không khả dụng, sử dụng memory fallback để mark seat as booked');
            this.redisAvailable = false;
            return this.memoryMarkSeatAsBooked(showtimeId, seatId, userId);
        }
    }

    /**
     * Lấy trạng thái ghế từ cache Redis
     * @param {string} showtimeId - ID của suất chiếu
     * @returns {Object} - Đối tượng chứa thông tin ghế đang được chọn
     */
    async getShowtimeSeats(showtimeId) {
        try {
            console.log(`🔄 [CACHE] Lấy trạng thái ghế cho showtime ${showtimeId}`);

            // Nếu Redis không khả dụng, dùng memory cache
            if (!this.redisAvailable) {
                console.log(`🔧 [CACHE] Sử dụng memory cache`);
                return this.memoryGetShowtimeSeats(showtimeId);
            }

            // Lấy tất cả ghế của showtime từ Redis
            const pattern = `seat:${showtimeId}:*`;
            console.log(`🔧 [CACHE] Đang tìm keys với pattern: ${pattern}`);
            const keys = await this.redis.keys(pattern);
            console.log(`🔧 [CACHE] Tìm thấy ${keys ? keys.length : 0} keys`);

            // Nếu không có ghế nào trong Redis, kiểm tra database
            if (!keys || keys.length === 0) {
                console.log(`⚠️ [CACHE] Không có ghế nào trong Redis cho showtime ${showtimeId}, kiểm tra database...`);
                
                // ✅ SỬA: Sử dụng mssql connection trực tiếp thay vì Sequelize
                try {
                    console.log(`🔧 [CACHE] Truy vấn database cho showtime ${showtimeId}...`);
                    const { getConnection } = require('../config/database');

                    // Sử dụng mssql connection trực tiếp
                    const pool = await getConnection();
                    const request = pool.request();
                    request.input('showtimeId', showtimeId);

                    // ✅ SỬA: Query từ bảng Tickets thay vì Seats vì Seats không có User_ID, Status, Showtime_ID
                    const result = await request.query(`
                        SELECT
                            t.Ticket_ID,
                            t.Seat_ID,
                            s.Layout_ID,
                            s.Seat_Number,
                            tb.Status,
                            tb.User_ID,
                            sl.Row_Label,
                            sl.Column_Number
                        FROM [ksf00691_team03].[Tickets] t
                        INNER JOIN [ksf00691_team03].[Ticket_Bookings] tb ON t.Booking_ID = tb.Booking_ID
                        INNER JOIN [ksf00691_team03].[Seats] s ON t.Seat_ID = s.Seat_ID
                        LEFT JOIN [ksf00691_team03].[Seat_Layout] sl ON s.Layout_ID = sl.Layout_ID
                        WHERE t.Showtime_ID = @showtimeId
                        AND tb.Status IN ('Confirmed', 'Pending')
                    `);

                    const bookedSeats = result.recordset;
                    console.log(`✅ [CACHE] Database query thành công, tìm thấy ${bookedSeats.length} ghế đã đặt`);
                    
                    // Tạo đối tượng lưu trữ ghế đã đặt
                    const databaseSeats = {};
                    
                    // Thêm ghế từ database vào đối tượng kết quả
                    bookedSeats.forEach(seat => {
                        if (seat.Row_Label && seat.Column_Number) {
                            const seatId = `${seat.Row_Label}${seat.Column_Number}`;
                            const status = seat.Status === 'Pending' ? 'pending' : 'booked';

                            console.log(`✅ [CACHE] Ghế ${seatId} có trạng thái ${status} trong database`);

                            databaseSeats[seatId] = {
                                status: status,
                                userId: seat.User_ID || 'system',
                                timestamp: Date.now(),
                                isBooked: status === 'booked',
                                isPending: status === 'pending',
                                isAvailable: false
                            };
                        }
                    });
                    
                    // Lưu kết quả vào Redis để sử dụng lần sau
                    if (Object.keys(databaseSeats).length > 0) {
                        await this.redis.setEx(`showtime:${showtimeId}:seats`, 300, JSON.stringify(databaseSeats)); // Cache 5 phút
                        console.log(`💾 [CACHE] Đã lưu ${Object.keys(databaseSeats).length} ghế vào Redis`);
                    }
                    
                    return databaseSeats;
                } catch (dbError) {
                    console.error(`❌ [CACHE] Lỗi khi truy vấn database:`, {
                        message: dbError.message,
                        name: dbError.name,
                        sql: dbError.sql,
                        stack: dbError.stack
                    });
                    console.log(`🔧 [CACHE] Fallback: Trả về empty object cho showtime ${showtimeId}`);
                    // Trả về empty object thay vì throw error để không làm crash app
                    return {};
                }
            }

            // Lấy dữ liệu của tất cả ghế
            const seatData = await Promise.all(keys.map(async (key) => {
                try {
                    const result = await this.redis.get(key);
                    if (result) {
                        const data = JSON.parse(result);
                        return { key, data };
                    } else {
                        return { key, data: null };
                    }
                } catch (e) {
                    return { key, data: null };
                }
            }));

            // Tạo object kết quả
            const result = {};
            seatData.forEach(({ key, data }) => {
                if (data) {
                    const seatId = key.split(':')[2]; // Lấy seatId từ key
                    
                    result[seatId] = data;
                    
                    // Đảm bảo các thuộc tính isBooked và isAvailable được thiết lập đúng
                    if (data.status === 'booked') {
                        result[seatId].isBooked = true;
                        result[seatId].isAvailable = false;
                    } else if (data.status === 'pending') {
                        result[seatId].isPending = true;
                        result[seatId].isAvailable = false;
                    } else if (data.status === 'selecting') {
                        result[seatId].isSelecting = true;
                        result[seatId].isAvailable = false;
                    } else {
                        result[seatId].isAvailable = true;
                        result[seatId].isBooked = false;
                        result[seatId].isSelecting = false;
                        result[seatId].isPending = false;
                    }
                }
            });

            return result;

        } catch (error) {
            console.error(`❌ [CACHE] Lỗi khi lấy trạng thái ghế:`, error);
            
            // Fallback về memory cache nếu Redis lỗi
            console.warn(`⚠️ [CACHE] Fallback về memory cache`);
            return this.memoryGetShowtimeSeats(showtimeId);
        }
    }

    /**
     * Giải phóng CHỈ ghế đang selecting của user (KHÔNG giải phóng ghế đã booked)
     */
    async releaseUserSelectingSeats(userId) {
        // Kiểm tra Redis có khả dụng không
        if (!this.redisAvailable) {
            // console.log('Redis không khả dụng, sử dụng memory fallback để giải phóng ghế selecting');
            return this.memoryReleaseUserSelectingSeats(userId);
        }

        try {
            console.log(`🔄 Redis: Giải phóng CHỈ ghế đang selecting của user ${userId}`);

            // Lấy danh sách ghế của user
            const userSeatsKey = `user_seats:${userId}`;
            const seatIds = await this.redis.sMembers(userSeatsKey);

            if (seatIds.length === 0) {
                console.log(`📝 User ${userId} không có ghế nào đang selecting`);
                return [];
            }

            console.log(`📝 User ${userId} có ${seatIds.length} ghế: ${seatIds.join(', ')}`);

            // Tạo keys cho tất cả ghế
            const seatKeys = seatIds.map(seatId => `seat:${seatId}`);

            // Lấy thông tin ghế trước khi xóa
            const seatDataArray = await this.redis.mGet(seatKeys);
            const releasedSeats = [];

            // CHỈ xóa ghế có status = 'selecting', KHÔNG xóa ghế 'booked'
            for (let index = 0; index < seatKeys.length; index++) {
                const seatKey = seatKeys[index];
                if (seatDataArray[index]) {
                    try {
                        const seatData = JSON.parse(seatDataArray[index]);

                        // ✅ CHỈ giải phóng ghế đang selecting
                        if (seatData.status === 'selecting') {
                            await this.redis.del(seatKey);
                            await this.redis.sRem(userSeatsKey, seatIds[index]);

                            releasedSeats.push({
                                showtimeId: seatData.showtimeId,
                                seatId: seatData.seatId,
                                userId: seatData.userId,
                                reason: 'user_disconnect_selecting_only'
                            });

                            console.log(`🔄 Giải phóng ghế selecting: ${seatData.seatId}`);
                        } else {
                            console.log(`🔒 Giữ nguyên ghế đã booked: ${seatData.seatId} (status: ${seatData.status})`);
                        }
                    } catch (parseError) {
                        console.error(`❌ Lỗi parse dữ liệu ghế ${seatKey}:`, parseError);
                    }
                }
            }

            console.log(`✅ Đã giải phóng ${releasedSeats.length} ghế selecting cho user ${userId} từ Redis`);
            return releasedSeats;

        } catch (error) {
            console.error(`❌ Lỗi khi giải phóng ghế selecting từ Redis:`, error);
            console.log('Redis không khả dụng, sử dụng memory fallback để giải phóng ghế selecting');
            this.redisAvailable = false;
            return this.memoryReleaseUserSelectingSeats(userId);
        }
    }

    /**
     * Giải phóng tất cả ghế của một user (bao gồm cả booked - CHỈ dùng cho admin)
     */
    async releaseUserSeats(userId) {
        // Kiểm tra Redis có khả dụng không
        if (!this.redisAvailable) {
            console.log('Redis không khả dụng, sử dụng memory fallback để giải phóng ghế user');
            return this.memoryReleaseUserSeats(userId);
        }

        try {
            console.log(`🔄 Giải phóng tất cả ghế của user ${userId} từ Redis`);

            const userSeatsKey = this.getUserSeatsKey(userId);

            // Lấy danh sách tất cả ghế của user
            const seatKeys = await this.redis.sMembers(userSeatsKey);

            if (seatKeys.length === 0) {
                console.log(`ℹ️ User ${userId} không có ghế nào để giải phóng`);
                return [];
            }

            // Lấy thông tin ghế trước khi xóa
            const seatDataArray = await this.redis.mGet(seatKeys);
            const releasedSeats = [];

            // Xóa tất cả ghế (sử dụng các lệnh riêng lẻ)
            for (let index = 0; index < seatKeys.length; index++) {
                const seatKey = seatKeys[index];
                await this.redis.del(seatKey);

                if (seatDataArray[index]) {
                    try {
                        const seatData = JSON.parse(seatDataArray[index]);
                        releasedSeats.push({
                            showtimeId: seatData.showtimeId,
                            seatId: seatData.seatId,
                            userId: seatData.userId,
                            reason: 'user_disconnect'
                        });
                    } catch (parseError) {
                        console.error(`❌ Lỗi parse dữ liệu ghế ${seatKey}:`, parseError);
                    }
                }
            }

            // Xóa danh sách ghế của user
            await this.redis.del(userSeatsKey);

            console.log(`✅ Đã giải phóng ${releasedSeats.length} ghế cho user ${userId} từ Redis`);
            return releasedSeats;

        } catch (error) {
            console.error(`❌ Lỗi khi giải phóng ghế user từ Redis:`, error);
            console.log('Redis không khả dụng, sử dụng memory fallback để giải phóng ghế user');
            this.redisAvailable = false;
            return this.memoryReleaseUserSeats(userId);
        }
    }

    /**
     * Xóa ghế booked khỏi cache (dùng khi hủy booking)
     * @param {string} showtimeId - ID của suất chiếu
     * @param {string} seatId - ID của ghế
     * @param {string} userId - ID của user
     * @returns {Object} - Kết quả xóa ghế
     */
    async removeBookedSeat(showtimeId, seatId, userId) {
        try {
            console.log(`🗑️ [CACHE] Xóa ghế booked ${seatId} của user ${userId} từ showtime ${showtimeId}`);

            // Nếu Redis không khả dụng, dùng memory cache
            if (!this.redisAvailable) {
                return this.memoryRemoveBookedSeat(showtimeId, seatId, userId);
            }

            const seatKey = `seat:${showtimeId}:${seatId}`;
            const userSeatsKey = `user_seats:${userId}`;

            // Kiểm tra ghế có tồn tại và thuộc về user không
            const seatData = await this.redis.get(seatKey);
            if (!seatData) {
                console.log(`⚠️ [CACHE] Ghế ${seatId} không tồn tại trong cache`);
                return { success: false, reason: 'seat_not_found' };
            }

            const parsedSeatData = JSON.parse(seatData);
            if (parsedSeatData.userId !== userId) {
                console.log(`⚠️ [CACHE] Ghế ${seatId} không thuộc về user ${userId}`);
                return { success: false, reason: 'not_owner' };
            }

            // Xóa ghế khỏi Redis
            await this.redis.del(seatKey);
            await this.redis.sRem(userSeatsKey, `seat:${showtimeId}:${seatId}`);

            console.log(`✅ [CACHE] Đã xóa ghế booked ${seatId} khỏi Redis`);
            return {
                success: true,
                seatId: seatId,
                userId: userId,
                showtimeId: showtimeId,
                status: 'removed'
            };

        } catch (error) {
            console.error(`❌ [CACHE] Lỗi khi xóa ghế booked từ Redis:`, error);
            this.redisAvailable = false;
            return this.memoryRemoveBookedSeat(showtimeId, seatId, userId);
        }
    }

    /**
     * Memory fallback: Xóa ghế booked khỏi memory cache
     */
    memoryRemoveBookedSeat(showtimeId, seatId, userId) {
        try {
            console.log(`🗑️ [MEMORY] Xóa ghế booked ${seatId} của user ${userId} từ showtime ${showtimeId}`);

            if (!this.memoryCache.has(showtimeId)) {
                return { success: false, reason: 'showtime_not_found' };
            }

            const showtimeSeats = this.memoryCache.get(showtimeId);
            if (!showtimeSeats.has(seatId)) {
                return { success: false, reason: 'seat_not_found' };
            }

            const seatData = showtimeSeats.get(seatId);
            if (seatData.userId !== userId) {
                return { success: false, reason: 'not_owner' };
            }

            // Xóa ghế khỏi memory
            showtimeSeats.delete(seatId);

            // Xóa khỏi user seats
            if (this.userSeats.has(userId)) {
                const userSeatKeys = this.userSeats.get(userId);
                const seatKey = `seat:${showtimeId}:${seatId}`;
                const updatedUserSeats = userSeatKeys.filter(key => key !== seatKey);

                if (updatedUserSeats.length > 0) {
                    this.userSeats.set(userId, updatedUserSeats);
                } else {
                    this.userSeats.delete(userId);
                }
            }

            console.log(`✅ [MEMORY] Đã xóa ghế booked ${seatId} khỏi memory`);
            return {
                success: true,
                seatId: seatId,
                userId: userId,
                showtimeId: showtimeId,
                status: 'removed'
            };

        } catch (error) {
            console.error(`❌ [MEMORY] Lỗi khi xóa ghế booked từ memory:`, error);
            return { success: false, reason: 'memory_error' };
        }
    }

    /**
     * Extend thời gian giữ ghế
     */
    async extendSeatHold(showtimeId, seatId, userId, extensionSeconds = 300) {
        try {
            const seatKey = this.getSeatKey(showtimeId, seatId);
            const userSeatsKey = this.getUserSeatsKey(userId);
            
            // Kiểm tra ghế tồn tại và quyền sở hữu
            const existingSeat = await this.redis.get(seatKey);
            if (!existingSeat) {
                return {
                    success: false,
                    message: 'Ghế không tồn tại hoặc đã hết hạn'
                };
            }

            const seatData = JSON.parse(existingSeat);
            if (seatData.userId !== userId) {
                return {
                    success: false,
                    message: 'Bạn không có quyền extend ghế này'
                };
            }

            // Extend TTL (sử dụng các lệnh riêng lẻ)
            await this.redis.expire(seatKey, this.SEAT_HOLD_TIMEOUT + extensionSeconds);
            await this.redis.expire(userSeatsKey, this.SEAT_HOLD_TIMEOUT + extensionSeconds);

            console.log(`⏰ Extended seat hold: User ${userId}, Seat ${seatId}, Extension: ${extensionSeconds}s`);
            return {
                success: true,
                newExpiryTime: Date.now() + ((this.SEAT_HOLD_TIMEOUT + extensionSeconds) * 1000),
                message: `Đã gia hạn ghế thêm ${extensionSeconds/60} phút`
            };

        } catch (error) {
            console.error(`❌ Lỗi khi extend seat hold trong Redis:`, error);
            return {
                success: false,
                message: 'Lỗi khi gia hạn ghế'
            };
        }
    }

    /**
     * Lấy thống kê Redis
     */
    async getStatistics() {
        try {
            const seatKeys = await this.redis.keys('seat:*');
            const userKeys = await this.redis.keys('user_seats:*');
            
            return {
                totalSeatsInCache: seatKeys.length,
                totalUsersWithSeats: userKeys.length,
                redisMemoryUsage: await this.redis.memory('usage'),
                cacheTimeout: this.SEAT_HOLD_TIMEOUT
            };
        } catch (error) {
            console.error(`❌ Lỗi khi lấy thống kê Redis:`, error);
            return {
                totalSeatsInCache: 0,
                totalUsersWithSeats: 0,
                error: error.message
            };
        }
    }

    /**
     * Đóng kết nối Redis
     */
    async disconnect() {
        try {
            await this.redis.quit();
            console.log('✅ Đã đóng kết nối Redis');
        } catch (error) {
            console.error('❌ Lỗi khi đóng kết nối Redis:', error);
        }
    }
}

// Export singleton instance
module.exports = new SeatCacheService();