/**
 * Filesrc/config/redisCache.js
 */
/**
 * Mô tảCấu hình Redis cache cho hệ thống
 */

const redis = require('redis');

class RedisCache {
    constructor() {
        this.client = null;
        this.isConnected = false;
        console.log('[RedisCache] Khởi tạo Redis cache service...');
    }

    /**
     * Kết nối đến Redis server
     */
    async connect() {
        try {
            const redisConfig = {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT) || 6379,
                password: process.env.REDIS_PASSWORD || undefined,
                retry_strategy: (options) => {
                    if (options.error && options.error.code === 'ECONNREFUSED') {
                        console.error('[RedisCache] Redis server từ chối kết nối');
                        return new Error('Redis server từ chối kết nối');
                    }
                    if (options.total_retry_time > 1000 * 60 * 60) {
                        console.error('[RedisCache] Retry time exhausted');
                        return new Error('Retry time exhausted');
                    }
                    if (options.attempt > 10) {
                        console.error('[RedisCache] Quá nhiều lần thử kết nối');
                        return undefined;
                    }
                    return Math.min(options.attempt * 100, 3000);
                }
            };

            console.log(`[RedisCache] Đang kết nối đến Redis${redisConfig.host}:${redisConfig.port}`);
            
            this.client = redis.createClient(redisConfig);
            
            this.client.on('error', (err) => {
                console.error('[RedisCache] Redis Client Error:', err);
                this.isConnected = false;
            });

            this.client.on('connect', () => {
                console.log('[RedisCache] ✅ Kết nối Redis thành công');
                this.isConnected = true;
            });

            this.client.on('ready', () => {
                console.log('[RedisCache] ✅ Redis client sẵn sàng');
                this.isConnected = true;
            });

            this.client.on('end', () => {
                console.log('[RedisCache] ⚠️ Kết nối Redis đã đóng');
                this.isConnected = false;
            });

            await this.client.connect();
            return true;
        } catch (error) {
            console.error('[RedisCache] ❌ Lỗi kết nối Redis:', error.message);
            this.isConnected = false;
            return false;
        }
    }

    /**
     * Lưu dữ liệu vào cache
     * @param {string} key - Key để lưu
     * @param {any} value - Giá trị cần lưu
     * @param {number} ttl - Thời gian sống (giây), mặc định 24h
     */
    async set(key, value, ttl = 86400) {
        try {
            if (!this.isConnected) {
                console.warn('[RedisCache] Redis chưa kết nối, bỏ qua set');
                return false;
            }

            const serializedValue = JSON.stringify(value);
            await this.client.setEx(key, ttl, serializedValue);
            console.log(`[RedisCache] ✅ Đã lưu key: ${key} (TTL: ${ttl}s)`);
            return true;
        } catch (error) {
            console.error(`[RedisCache] ❌ Lỗi khi set key ${key}:`, error.message);
            return false;
        }
    }

    /**
     * Lấy dữ liệu từ cache
     * @param {string} key - Key cần lấy
     * @returns {any|null} Dữ liệu hoặc null nếu không tìm thấy
     */
    async get(key) {
        try {
            if (!this.isConnected) {
                console.warn('[RedisCache] Redis chưa kết nối, trả về null');
                return null;
            }

            const value = await this.client.get(key);
            if (value === null) {
                console.log(`[RedisCache] Cache miss cho key: ${key}`);
                return null;
            }

            console.log(`[RedisCache] ✅ Cache hit cho key: ${key}`);
            return JSON.parse(value);
        } catch (error) {
            console.error(`[RedisCache] ❌ Lỗi khi get key ${key}:`, error.message);
            return null;
        }
    }

    /**
     * Xóa key khỏi cache
     * @param {string} key - Key cần xóa
     */
    async del(key) {
        try {
            if (!this.isConnected) {
                console.warn('[RedisCache] Redis chưa kết nối, bỏ qua delete');
                return false;
            }

            const result = await this.client.del(key);
            console.log(`[RedisCache] ✅ Đã xóa key: ${key} (result: ${result})`);
            return result > 0;
        } catch (error) {
            console.error(`[RedisCache] ❌ Lỗi khi delete key ${key}:`, error.message);
            return false;
        }
    }

    /**
     * Xóa tất cả cache
     */
    async flushAll() {
        try {
            if (!this.isConnected) {
                console.warn('[RedisCache] Redis chưa kết nối, bỏ qua flush');
                return false;
            }

            await this.client.flushAll();
            console.log('[RedisCache] ✅ Đã xóa tất cả cache');
            return true;
        } catch (error) {
            console.error('[RedisCache] ❌ Lỗi khi flush cache:', error.message);
            return false;
        }
    }

    /**
     * Kiểm tra key có tồn tại không
     * @param {string} key - Key cần kiểm tra
     */
    async exists(key) {
        try {
            if (!this.isConnected) {
                return false;
            }

            const result = await this.client.exists(key);
            return result === 1;
        } catch (error) {
            console.error(`[RedisCache] ❌ Lỗi khi check exists key ${key}:`, error.message);
            return false;
        }
    }

    /**
     * Đóng kết nối Redis
     */
    async disconnect() {
        try {
            if (this.client) {
                await this.client.quit();
                console.log('[RedisCache] ✅ Đã đóng kết nối Redis');
            }
        } catch (error) {
            console.error('[RedisCache] ❌ Lỗi khi đóng kết nối Redis:', error.message);
        }
    }

    /**
     * Lấy thông tin Redis
     */
    async getInfo() {
        try {
            if (!this.isConnected) {
                return { connected: false };
            }

            const info = await this.client.info();
            return {
                connected: true,
                info: info
            };
        } catch (error) {
            console.error('[RedisCache] ❌ Lỗi khi lấy info Redis:', error.message);
            return { connected: false, error: error.message };
        }
    }
}

let redisInstance = null;

function getRedisInstance() {
    if (!redisInstance) {
        redisInstance = new RedisCache();
    }
    return redisInstance;
}

module.exports = {
    RedisCache,
    getRedisInstance
};