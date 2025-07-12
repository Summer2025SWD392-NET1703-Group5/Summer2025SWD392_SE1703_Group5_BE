const Bull = require('bull');
const logger = require('../utils/logger');

// Kiểm tra xem có cấu hình Redis không
const hasRedisConfig = process.env.REDIS_HOST || process.env.REDIS_URL;
let emailQueue = null;
let redisAvailable = false;

// Chỉ tạo queue nếu có cấu hình Redis
if (hasRedisConfig) {
  try {
    // Kết nối Redis từ biến môi trường
    const redisConfig = {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined
      }
    };

    // Tạo queue với tên "email-queue"
    emailQueue = new Bull('email-queue', redisConfig);

    // Kiểm tra kết nối Redis
    emailQueue.isReady().then(() => {
      redisAvailable = true;
      logger.info('✅ [EmailQueue] Kết nối Redis thành công, queue sẵn sàng');
      
      // Chỉ đăng ký các handlers nếu Redis khả dụng
      // Xử lý job gửi email vé
      emailQueue.process('send-ticket-email', async (job) => {
        try {
          const { bookingId, email } = job.data;
          logger.info(`[EmailQueue] Bắt đầu xử lý gửi email vé cho booking ${bookingId} đến ${email}`);
          
          const TicketService = require('../services/ticketService');
          const ticketService = new TicketService();
          
          // Thêm log để theo dõi tiến trình
          logger.info(`[EmailQueue] Đang khởi tạo TicketService để xử lý booking ${bookingId}`);
          
          const result = await ticketService.sendTicketByEmailAsync(bookingId, email);
          
          logger.info(`[EmailQueue] Kết quả gửi email cho booking ${bookingId}: ${result ? 'Thành công' : 'Thất bại'}`);
          
          // Ghi log thông tin job đã hoàn thành
          job.progress(100);
          
          return { success: true, bookingId, email };
        } catch (error) {
          logger.error(`[EmailQueue] Lỗi xử lý job gửi email: ${error.message}`);
          throw error; // Ném lỗi để Bull queue có thể thử lại
        }
      });

      // Log các sự kiện từ queue
      emailQueue.on('completed', (job) => {
        logger.info(`[EmailQueue] ✅ Hoàn thành job #${job.id} - Gửi email cho booking ${job.data.bookingId}`);
      });

      emailQueue.on('failed', (job, error) => {
        logger.error(`[EmailQueue] ❌ Job #${job.id} thất bại - Booking ${job.data.bookingId}: ${error.message}`);
      });

      emailQueue.on('error', (error) => {
        logger.error(`[EmailQueue] Lỗi queue: ${error.message}`);
      });
      
    }).catch(error => {
      redisAvailable = false;
      logger.error(`❌ [EmailQueue] Không thể kết nối Redis: ${error.message}`);
    });
  } catch (error) {
    redisAvailable = false;
    logger.error(`❌ [EmailQueue] Lỗi khởi tạo queue: ${error.message}`);
  }
} else {
  logger.info('⚠️ [EmailQueue] Không có cấu hình Redis - sẽ sử dụng phương thức gửi email trực tiếp');
}

// Hàm gửi email trực tiếp (fallback khi không có Redis)
const sendEmailDirectly = async (bookingId, email) => {
  try {
    logger.info(`[EmailDirect] Đang gửi email trực tiếp cho booking ${bookingId} đến ${email}`);
    
    const TicketService = require('../services/ticketService');
    const ticketService = new TicketService();
    
    const result = await ticketService.sendTicketByEmailAsync(bookingId, email);
    
    if (result) {
      logger.info(`[EmailDirect] ✅ Đã gửi email thành công cho booking ${bookingId}`);
      return true;
    } else {
      logger.error(`[EmailDirect] ❌ Không thể gửi email cho booking ${bookingId}`);
      return false;
    }
  } catch (error) {
    logger.error(`[EmailDirect] Lỗi gửi email: ${error.message}`);
    return false;
  }
};

// Hàm thêm job vào queue hoặc gửi trực tiếp nếu không có Redis
const addEmailJob = async (bookingId, email) => {
  try {
    // Kiểm tra nếu Redis khả dụng
    if (redisAvailable && emailQueue) {
      logger.info(`[EmailQueue] Thêm job gửi email cho booking ${bookingId} đến ${email}`);
      
      // Kiểm tra xem job tương tự đã tồn tại chưa để tránh lặp lại
      const existingJobs = await emailQueue.getJobs();
      const duplicate = existingJobs.find(j => 
        j.data.bookingId == bookingId && 
        j.data.email === email && 
        ['active', 'waiting'].includes(j.status)
      );
      
      if (duplicate) {
        logger.info(`[EmailQueue] Job gửi email cho booking ${bookingId} đã tồn tại với ID #${duplicate.id}, bỏ qua`);
        return true;
      }
      
      const job = await emailQueue.add('send-ticket-email', {
        bookingId,
        email,
        addedAt: new Date().toISOString()
      }, {
        attempts: 3, // Số lần thử lại nếu thất bại
        backoff: { 
          type: 'exponential', 
          delay: 10000 // Thời gian chờ giữa các lần thử lại (ms)
        },
        removeOnComplete: 100, // Giữ lại 100 job gần nhất đã hoàn thành
        removeOnFail: false // Giữ lại các job thất bại để kiểm tra
      });
      
      logger.info(`[EmailQueue] Đã thêm job #${job.id} vào queue để gửi email cho booking ${bookingId}`);
      return true;
    } else {
      // Fallback: gửi email trực tiếp nếu không có Redis
      logger.info(`[EmailQueue] Redis không khả dụng, sẽ gửi email trực tiếp cho booking ${bookingId}`);
      
      // Sử dụng process.nextTick để không chặn luồng chính
      process.nextTick(() => {
        sendEmailDirectly(bookingId, email).catch(err => {
          logger.error(`[EmailQueue] Lỗi gửi email trực tiếp: ${err.message}`);
        });
      });
      
      return true;
    }
  } catch (error) {
    logger.error(`[EmailQueue] Lỗi khi thêm job gửi email: ${error.message}`);
    
    // Fallback: gửi email trực tiếp nếu có lỗi với queue
    logger.info(`[EmailQueue] Có lỗi với queue, sẽ gửi email trực tiếp cho booking ${bookingId}`);
    process.nextTick(() => {
      sendEmailDirectly(bookingId, email).catch(err => {
        logger.error(`[EmailQueue] Lỗi gửi email trực tiếp: ${err.message}`);
      });
    });
    
    return true;
  }
};

// Export module
module.exports = {
  emailQueue,
  addEmailJob,
  sendEmailDirectly
}; 