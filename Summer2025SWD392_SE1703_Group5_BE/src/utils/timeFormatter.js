/**
 * Time Formatter Utility
 * Chuẩn hóa cách format thời gian trong toàn bộ project
 */

// Cache cho formatTime để tránh tính toán lặp lại
const formatTimeCache = new Map();

// Biến để kiểm tra debug mode
const DEBUG_FORMAT_TIME = process.env.NODE_ENV === 'development' && process.env.DEBUG_FORMAT_TIME === 'true';

/**
 * Format thời gian thành HH:MM:SS
 * @param {any} timeValue - Giá trị thời gian cần format
 * @returns {string|null} - Thời gian đã format dạng HH:MM:SS hoặc null
 */
const formatTimeToHHMMSS = (timeValue) => {
  // Kiểm tra nếu đầu vào rỗng
  if (!timeValue) return null;

  // Tạo cache key từ giá trị đầu vào
  const cacheKey = typeof timeValue === 'object' 
    ? JSON.stringify(timeValue) 
    : String(timeValue);

  // Kiểm tra cache trước
  if (formatTimeCache.has(cacheKey)) {
    return formatTimeCache.get(cacheKey);
  }

  let formatted = null;

  // Chỉ log khi debug mode được bật
  if (DEBUG_FORMAT_TIME) {
    console.log(`[formatTimeToHHMMSS] Giá trị đầu vào: ${timeValue} (type: ${typeof timeValue})`);
  }

  // Xử lý SQL Server raw time value (thường có dạng { hours, minutes, seconds, nanoseconds })
  if (typeof timeValue === 'object' && timeValue.hours !== undefined) {
    const hours = String(timeValue.hours).padStart(2, '0');
    const minutes = String(timeValue.minutes).padStart(2, '0');
    const seconds = String(timeValue.seconds).padStart(2, '0');
    formatted = `${hours}:${minutes}:${seconds}`;
  }
  // Xử lý đối tượng Date (1970-01-01T...)
  else if (timeValue instanceof Date) {
    // Giữ nguyên giá trị gốc, không cộng offset
    formatted = timeValue.toISOString().substring(11, 19);
  }
  // Xử lý chuỗi định dạng
  else if (typeof timeValue === 'string') {
    // Xử lý chuỗi ISO với tiền tố 1970-01-01T
    if (timeValue.includes('1970-01-01T')) {
      formatted = timeValue.split('T')[1].split('.')[0];
    }
    // Xử lý chuỗi định dạng HH:MM:SS hoặc HH:MM
    else if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(timeValue)) {
      const parts = timeValue.split(':');
      const hours = parts[0].padStart(2, '0');
      const minutes = parts[1].padStart(2, '0');
      const seconds = parts[2] ? parts[2].padStart(2, '0') : '00';
      formatted = `${hours}:${minutes}:${seconds}`;
    }
  }

  // Ghi log cảnh báo nếu không xử lý được (chỉ khi debug mode)
  if (!formatted && DEBUG_FORMAT_TIME) {
    console.warn(`[formatTimeToHHMMSS] Không thể xử lý định dạng thời gian: ${timeValue}`);
  }

  // Lưu vào cache (giới hạn cache size để tránh memory leak)
  if (formatTimeCache.size > 1000) {
    // Xóa 50% cache cũ nhất khi đạt giới hạn
    const keysToDelete = Array.from(formatTimeCache.keys()).slice(0, 500);
    keysToDelete.forEach(key => formatTimeCache.delete(key));
  }
  
  formatTimeCache.set(cacheKey, formatted);
  return formatted;
};

/**
 * Format thời gian thành HH:MM (cho display)
 * @param {any} timeValue - Giá trị thời gian cần format
 * @returns {string|null} - Thời gian đã format dạng HH:MM hoặc null
 */
const formatTimeToHHMM = (timeValue) => {
  if (!timeValue) return null;
  
  // Debug log (có thể disable trong production)
  const DEBUG = process.env.NODE_ENV === 'development';
  if (DEBUG) {
    console.log(`[formatTimeToHHMM] Input: ${timeValue} (type: ${typeof timeValue})`);
  }
  
  // ✅ FIX TIMEZONE: Nếu là Date object từ Sequelize 
  if (timeValue instanceof Date) {
    // Sequelize tạo Date với ngày 1970-01-01 và apply timezone
    // Cần sử dụng UTC methods để lấy time gốc
    const hours = timeValue.getUTCHours().toString().padStart(2, '0');
    const minutes = timeValue.getUTCMinutes().toString().padStart(2, '0');
    const result = `${hours}:${minutes}`;
    
    if (DEBUG) {
      console.log(`[formatTimeToHHMM] Date object -> UTC: ${result}`);
      console.log(`[formatTimeToHHMM] Local would be: ${timeValue.getHours()}:${timeValue.getMinutes()}`);
    }
    return result;
  }
  
  // ✅ Nếu là ISO string (1970-01-01T00:40:00.000Z)
  if (typeof timeValue === 'string' && timeValue.includes('T')) {
    try {
      const date = new Date(timeValue);
      const hours = date.getUTCHours().toString().padStart(2, '0');
      const minutes = date.getUTCMinutes().toString().padStart(2, '0');
      const result = `${hours}:${minutes}`;
      
      if (DEBUG) {
        console.log(`[formatTimeToHHMM] ISO string -> UTC: ${result}`);
      }
      return result;
    } catch (error) {
      console.error(`[formatTimeToHHMM] Error parsing ISO string:`, error);
      return null;
    }
  }
  
  // ✅ Nếu là chuỗi HH:MM:SS hoặc HH:MM (từ raw SQL)
  if (typeof timeValue === 'string' && /^\d{1,2}:\d{2}/.test(timeValue)) {
    const result = timeValue.substring(0, 5);
    if (DEBUG) {
      console.log(`[formatTimeToHHMM] String time: ${result}`);
    }
    return result;
  }
  
  // ✅ SQL Server TIME object từ raw SQL {hours, minutes, seconds, nanoseconds}
  if (typeof timeValue === 'object' && timeValue.hours !== undefined) {
    const hours = String(timeValue.hours).padStart(2, '0');
    const minutes = String(timeValue.minutes).padStart(2, '0');
    const result = `${hours}:${minutes}`;
    
    if (DEBUG) {
      console.log(`[formatTimeToHHMM] SQL TIME object: ${result}`);
    }
    return result;
  }
  
  // ✅ Fallback: trả về nguyên giá trị nếu không xử lý được
  if (DEBUG) {
    console.warn(`[formatTimeToHHMM] Unhandled time format: ${timeValue}`);
  }
  return String(timeValue);
};

/**
 * Tính thời gian kết thúc từ thời gian bắt đầu và thời lượng
 * @param {string} startTimeString - Thời gian bắt đầu (HH:MM:SS hoặc HH:MM)
 * @param {number} durationMinutes - Thời lượng tính bằng phút
 * @returns {string|null} - Thời gian kết thúc dạng HH:MM:SS hoặc null
 */
const calculateEndTime = (startTimeString, durationMinutes) => {
  if (!startTimeString || !durationMinutes) {
    console.warn(`[calculateEndTime] Thiếu thông tin: startTime=${startTimeString}, duration=${durationMinutes}`);
    return null;
  }

  try {
    // Parse thời gian bắt đầu
    const [startHours, startMinutes, startSeconds = '00'] = startTimeString.split(':').map(Number);

    // Tính toán thời gian kết thúc
    let endHours = startHours;
    let endMinutes = startMinutes + durationMinutes;
    let endSeconds = parseInt(startSeconds);

    // Điều chỉnh giờ và phút
    if (endMinutes >= 60) {
      endHours += Math.floor(endMinutes / 60);
      endMinutes = endMinutes % 60;
    }

    // Xử lý trường hợp qua ngày mới
    if (endHours >= 24) {
      endHours = endHours % 24;
    }

    // Định dạng thời gian kết thúc
    const endTime = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}:${String(endSeconds).padStart(2, '0')}`;
    
    if (DEBUG_FORMAT_TIME) {
      console.log(`[calculateEndTime] Từ ${startTimeString} + ${durationMinutes} phút = ${endTime}`);
    }
    
    return endTime;
  } catch (error) {
    console.error(`[calculateEndTime] Lỗi khi tính thời gian kết thúc: ${error.message}`);
    return null;
  }
};

/**
 * Chuyển đổi chuỗi thời gian HH:MM:SS thành số phút
 * @param {string} timeString - Chuỗi thời gian
 * @returns {number} - Số phút
 */
const getMinutesFromTimeString = (timeString) => {
  if (!timeString) return 0;

  const parts = timeString.toString().split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;

  return hours * 60 + minutes;
};

/**
 * Bảo toàn thời gian người dùng nhập khi tạo showtime
 * @param {any} timeString - Thời gian cần xử lý
 * @returns {string|null} - Thời gian đã chuẩn hóa
 */
const preserveTime = (timeString) => {
  if (!timeString) return null;

  if (DEBUG_FORMAT_TIME) {
    console.log(`[preserveTime] Xử lý thời gian: ${timeString} (${typeof timeString})`);
  }

  // Nếu đã là chuỗi định dạng HH:MM:SS, chỉ cần chuẩn hóa
  if (typeof timeString === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(timeString)) {
    const parts = timeString.split(':');
    const hours = parts[0].padStart(2, '0');
    const minutes = parts[1].padStart(2, '0');
    const seconds = parts[2] ? parts[2].padStart(2, '0') : '00';
    const formatted = `${hours}:${minutes}:${seconds}`;
    
    if (DEBUG_FORMAT_TIME) {
      console.log(`[preserveTime] Giữ nguyên chuỗi thời gian: ${formatted}`);
    }
    return formatted;
  }

  // Xử lý SQL Server time object
  if (typeof timeString === 'object' && timeString !== null && timeString.hours !== undefined) {
    const hours = String(timeString.hours).padStart(2, '0');
    const minutes = String(timeString.minutes).padStart(2, '0');
    const seconds = String(timeString.seconds).padStart(2, '0');
    const formatted = `${hours}:${minutes}:${seconds}`;
    
    if (DEBUG_FORMAT_TIME) {
      console.log(`[preserveTime] Chuyển đổi từ SQL time object: ${formatted}`);
    }
    return formatted;
  }

  // Xử lý Date object mà không chuyển đổi múi giờ
  if (timeString instanceof Date) {
    const hours = timeString.getHours().toString().padStart(2, '0');
    const minutes = timeString.getMinutes().toString().padStart(2, '0');
    const seconds = timeString.getSeconds().toString().padStart(2, '0');
    const formatted = `${hours}:${minutes}:${seconds}`;
    
    if (DEBUG_FORMAT_TIME) {
      console.log(`[preserveTime] Chuyển đổi từ Date không đổi múi giờ: ${formatted}`);
    }
    return formatted;
  }

  // Xử lý chuỗi ISO
  if (typeof timeString === 'string' && timeString.includes('T')) {
    const timePart = timeString.split('T')[1].split('.')[0];
    if (DEBUG_FORMAT_TIME) {
      console.log(`[preserveTime] Trích xuất từ chuỗi ISO: ${timePart}`);
    }
    return timePart;
  }

  console.warn(`[preserveTime] Không thể xử lý định dạng thời gian: ${timeString}`);
  return timeString; // Trả về nguyên giá trị nếu không xử lý được
};

/**
 * Kiểm tra xem có phải là thời gian hợp lệ không
 * @param {any} timeValue - Giá trị cần kiểm tra
 * @returns {boolean} - true nếu là thời gian hợp lệ
 */
const isValidTime = (timeValue) => {
  const formatted = formatTimeToHHMM(timeValue);
  return formatted !== null && /^\d{2}:\d{2}$/.test(formatted);
};

module.exports = {
  formatTimeToHHMMSS,
  formatTimeToHHMM,
  calculateEndTime,
  getMinutesFromTimeString,
  preserveTime,
  
  // Alias để tương thích với code cũ
  formatTime: formatTimeToHHMM, // Mặc định trả về HH:MM cho display
  formatTimeFull: formatTimeToHHMMSS, // Trả về HH:MM:SS đầy đủ
  isValidTime
}; 