// File: src/config/cache.js
// Mô tả: Cấu hình cache thống nhất - hỗ trợ cả Redis và Memory Cache

const NodeCache = require('node-cache'); // Import thư viện NodeCache.
const { getRedisInstance } = require('./redisCache'); // Import Redis cache

let cacheInstance = null; // Biến để lưu trữ instance cache (Singleton pattern).
let useRedis = false; // Flag để xác định sử dụng Redis hay Memory Cache

/**
 * Khởi tạo cache service - Redis hoặc Memory Cache
 */
async function initializeCache() {
    const shouldUseRedis = process.env.USE_REDIS === 'true';

    if (shouldUseRedis) {
        console.log('[cache.js] 🔄 Đang khởi tạo Redis cache...');
        const redisInstance = getRedisInstance();
        const connected = await redisInstance.connect();

        if (connected) {
            console.log('[cache.js] ✅ Sử dụng Redis cache');
            cacheInstance = redisInstance;
            useRedis = true;
            return cacheInstance;
        } else {
            console.log('[cache.js] ⚠️ Redis kết nối thất bại, fallback sang Memory cache');
        }
    }

    // Fallback hoặc sử dụng Memory Cache
    console.log('[cache.js] 🔄 Đang khởi tạo Memory cache...');
    cacheInstance = new NodeCache({
        stdTTL: 86400, // 24 hours
        checkperiod: 600, // Check for expired items every 10 minutes
    });
    useRedis = false;
    console.log('[cache.js] ✅ Sử dụng Memory cache (NodeCache)');
    return cacheInstance;
}

/**
 * Lấy instance cache (Redis hoặc Memory)
 */
async function getCacheInstance() {
    if (!cacheInstance) {
        await initializeCache();
    }
    return cacheInstance;
}

/**
 * Wrapper methods để thống nhất API giữa Redis và Memory Cache
 */
const CacheService = {
    async get(key) {
        const cache = await getCacheInstance();
        if (useRedis) {
            return await cache.get(key);
        } else {
            return cache.get(key) || null;
        }
    },

    async set(key, value, ttl = 86400) {
        const cache = await getCacheInstance();
        if (useRedis) {
            return await cache.set(key, value, ttl);
        } else {
            return cache.set(key, value, ttl);
        }
    },

    async del(key) {
        const cache = await getCacheInstance();
        if (useRedis) {
            return await cache.del(key);
        } else {
            return cache.del(key);
        }
    },

    async flushAll() {
        const cache = await getCacheInstance();
        if (useRedis) {
            return await cache.flushAll();
        } else {
            cache.flushAll();
            return true;
        }
    },

    async exists(key) {
        const cache = await getCacheInstance();
        if (useRedis) {
            return await cache.exists(key);
        } else {
            return cache.has(key);
        }
    },

    isRedis() {
        return useRedis;
    },

    async getStats() {
        const cache = await getCacheInstance();
        if (useRedis) {
            return await cache.getInfo();
        } else {
            return {
                connected: true,
                type: 'memory',
                keys: cache.keys().length,
                stats: cache.getStats()
            };
        }
    },

    // Thêm method để lấy cache instance trực tiếp
    async getCacheInstance() {
        return await getCacheInstance();
    }
};

// Export các functions và CacheService
module.exports = {
    get: getCacheInstance,
    CacheService,
    initializeCache
};