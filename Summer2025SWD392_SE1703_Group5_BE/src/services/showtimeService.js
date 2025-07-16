const ShowtimeRepository = require('../repositories/ShowtimeRepository');
const { Showtime, Movie, CinemaRoom, Ticket, SeatLayout, TicketBooking, sequelize, Sequelize } = require('../models');
const { Op } = require('sequelize');
const { format } = require('date-fns');
const logger = require('../utils/logger');
const { sql } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const SeatRepository = require('../repositories/SeatRepository');
const SeatService = require('./seatService');

// Cache cho formatTime để tránh tính toán lặp lại
const formatTimeCache = new Map();

// Biến để kiểm tra debug mode (có thể set từ environment variable)
const DEBUG_FORMAT_TIME = process.env.NODE_ENV === 'development' && process.env.DEBUG_FORMAT_TIME === 'true';

const formatTime = (timeValue) => {
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
  console.log(`[formatTime] Giá trị đầu vào: ${timeValue} (type: ${typeof timeValue})`);
  }

  // Xử lý SQL Server raw time value (thường có dạng { hours, minutes, seconds, nanoseconds })
  if (typeof timeValue === 'object' && timeValue.hours !== undefined) {
    const hours = String(timeValue.hours).padStart(2, '0');
    const minutes = String(timeValue.minutes).padStart(2, '0');
    const seconds = String(timeValue.seconds).padStart(2, '0');
    formatted = `${hours}:${minutes}:${seconds}`;
    if (DEBUG_FORMAT_TIME) {
    console.log(`[formatTime] Trả về từ SQL Server time object: ${formatted}`);
  }
  }
  // ✅ FIX TIMEZONE: Xử lý đối tượng Date (1970-01-01T...) - sử dụng UTC methods
  else if (timeValue instanceof Date) {
    // Sử dụng UTC methods để tránh timezone conversion
    const hours = timeValue.getUTCHours().toString().padStart(2, '0');
    const minutes = timeValue.getUTCMinutes().toString().padStart(2, '0');
    const seconds = timeValue.getUTCSeconds().toString().padStart(2, '0');
    formatted = `${hours}:${minutes}:${seconds}`;
    if (DEBUG_FORMAT_TIME) {
    console.log(`[formatTime] Trả về từ Date (UTC): ${formatted}`);
  }
  }
  // Xử lý chuỗi định dạng
  else if (typeof timeValue === 'string') {
    // Xử lý chuỗi ISO với tiền tố 1970-01-01T
    if (timeValue.includes('1970-01-01T')) {
      formatted = timeValue.split('T')[1].split('.')[0];
      if (DEBUG_FORMAT_TIME) {
        console.log(`[formatTime] Trích xuất từ chuỗi ISO 1970-01-01T: ${formatted}`);
      }
    }
    // Xử lý chuỗi định dạng HH:MM:SS hoặc HH:MM
    else if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(timeValue)) {
      const parts = timeValue.split(':');
      const hours = parts[0].padStart(2, '0');
      const minutes = parts[1].padStart(2, '0');
      const seconds = parts[2] ? parts[2].padStart(2, '0') : '00';
      formatted = `${hours}:${minutes}:${seconds}`;
      if (DEBUG_FORMAT_TIME) {
      console.log(`[formatTime] Trả về chuỗi đã định dạng: ${formatted}`);
      }
    }
  }

  // Ghi log cảnh báo nếu không xử lý được (chỉ khi debug mode)
  if (!formatted && DEBUG_FORMAT_TIME) {
  console.warn(`[formatTime] Không thể xử lý định dạng thời gian: ${timeValue}`);
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

// Hàm mới để bảo toàn thời gian người dùng nhập khi tạo showtime
const preserveTime = (timeString) => {
  if (!timeString) return null;

  logger.debug(`[preserveTime] Xử lý thời gian: ${timeString} (${typeof timeString})`);

  // Nếu đã là chuỗi định dạng HH:MM:SS, chỉ cần chuẩn hóa
  if (typeof timeString === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(timeString)) {
    const parts = timeString.split(':');
    const hours = parts[0].padStart(2, '0');
    const minutes = parts[1].padStart(2, '0');
    const seconds = parts[2] ? parts[2].padStart(2, '0') : '00';
    const formatted = `${hours}:${minutes}:${seconds}`;
    logger.debug(`[preserveTime] Giữ nguyên chuỗi thời gian: ${formatted}`);
    return formatted;
  }

  // Xử lý SQL Server time object
  if (typeof timeString === 'object' && timeString !== null && timeString.hours !== undefined) {
    const hours = String(timeString.hours).padStart(2, '0');
    const minutes = String(timeString.minutes).padStart(2, '0');
    const seconds = String(timeString.seconds).padStart(2, '0');
    const formatted = `${hours}:${minutes}:${seconds}`;
    logger.debug(`[preserveTime] Chuyển đổi từ SQL time object: ${formatted}`);
    return formatted;
  }

  // Xử lý Date object mà không chuyển đổi múi giờ
  if (timeString instanceof Date) {
    const hours = timeString.getHours().toString().padStart(2, '0');
    const minutes = timeString.getMinutes().toString().padStart(2, '0');
    const seconds = timeString.getSeconds().toString().padStart(2, '0');
    const formatted = `${hours}:${minutes}:${seconds}`;
    logger.debug(`[preserveTime] Chuyển đổi từ Date không đổi múi giờ: ${formatted}`);
    return formatted;
  }

  // Xử lý chuỗi ISO
  if (typeof timeString === 'string' && timeString.includes('T')) {
    const timePart = timeString.split('T')[1].split('.')[0];
    logger.debug(`[preserveTime] Trích xuất từ chuỗi ISO: ${timePart}`);
    return timePart;
  }

  logger.warn(`[preserveTime] Không thể xử lý định dạng thời gian: ${timeString}`);
  return timeString; // Trả về nguyên giá trị nếu không xử lý được
};

// Hàm tính thời gian kết thúc từ thời gian bắt đầu và thời lượng
const calculateEndTime = (startTimeString, durationMinutes) => {
  if (!startTimeString || !durationMinutes) {
    logger.warn(`[calculateEndTime] Thiếu thông tin: startTime=${startTimeString}, duration=${durationMinutes}`);
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
    logger.debug(`[calculateEndTime] Từ ${startTimeString} + ${durationMinutes} phút = ${endTime}`);
    return endTime;
  } catch (error) {
    logger.error(`[calculateEndTime] Lỗi khi tính thời gian kết thúc: ${error.message}`);
    return null;
  }
};

// Hàm phụ trợ để chuyển đổi chuỗi thời gian HH:MM:SS thành số phút
const getMinutesFromTimeString = (timeString) => {
  if (!timeString) return 0;

  const parts = timeString.toString().split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;

  return hours * 60 + minutes;
};

// Hàm mới dành riêng cho việc tạo showtime để tránh chuyển đổi múi giờ
const createShowtimeWithCorrectTime = (model, userId, transaction = null, allowEarlyShowtime = false) => {
  return async function () {
    if (!model) throw new Error('Dữ liệu không hợp lệ');

    const now = new Date();
    const startTime = model.Start_Time;
    const showDate = new Date(model.Show_Date);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    logger.info(`[createShowtimeWithCorrectTime] Tạo lịch chiếu mới với thời gian bắt đầu: ${startTime}`);

    // OPTIMIZATION 1: Chạy song song tất cả validation queries thay vì tuần tự
    const [movie, cinemaRoom, seatLayoutCount, existingShowtime, existingHiddenShowtime] = await Promise.all([
      // Query 1: Lấy thông tin phim (chỉ các field cần thiết)
      Movie.findOne({ 
        where: { Movie_ID: model.Movie_ID },
        attributes: ['Movie_ID', 'Duration', 'Release_Date', 'Premiere_Date', 'Status'],
        transaction
      }),
      
      // Query 2: Lấy thông tin phòng chiếu (chỉ các field cần thiết)
      CinemaRoom.findOne({ 
        where: { Cinema_Room_ID: model.Cinema_Room_ID },
        attributes: ['Cinema_Room_ID', 'Status'],
        transaction
      }),
      
      // Query 3: Đếm số ghế hoạt động
      SeatLayout.count({ 
        where: { 
          Cinema_Room_ID: model.Cinema_Room_ID, 
          Is_Active: true 
        },
        transaction
      }),
      
      // Query 4: Kiểm tra showtime đã tồn tại (không phải Hidden)
      Showtime.findOne({
        where: {
          Movie_ID: model.Movie_ID,
          Cinema_Room_ID: model.Cinema_Room_ID,
          Show_Date: model.Show_Date,
          Start_Time: startTime,
          Status: { [Op.ne]: 'Hidden' },
        },
        attributes: ['Showtime_ID'], // Chỉ cần ID để check existence
        transaction
      }),
      
      // Không cần kiểm tra xuất chiếu đã ẩn nữa, trả về null
      Promise.resolve(null)
    ]);

    // OPTIMIZATION 2: Early validation failures để thoát sớm
    if (!movie) throw new Error(`Không tìm thấy phim có ID ${model.Movie_ID}`);
    if (!cinemaRoom) throw new Error(`Không tìm thấy phòng chiếu có ID ${model.Cinema_Room_ID}`);
    if (cinemaRoom.Status !== 'Active') throw new Error('Phòng chiếu không hoạt động');
    
    // Kiểm tra nếu showtime đã tồn tại - không đề xuất giờ trống
    if (existingShowtime) {
      // Lấy thông tin showtime đã tồn tại
      const existingDetails = await Showtime.findOne({
        where: { Showtime_ID: existingShowtime.Showtime_ID },
        include: [{
          model: Movie,
          as: 'Movie',
          attributes: ['Movie_Name']
        }],
        transaction
      });
      
      const errorMsg = existingDetails && existingDetails.Movie 
        ? `Xuất chiếu phim "${existingDetails.Movie.Movie_Name}" đã tồn tại vào giờ này.` 
        : 'Xuất chiếu đã tồn tại vào giờ này.';
        
      const enhancedError = new Error(errorMsg);
      enhancedError.code = 'DUPLICATE_SHOWTIME';
      throw enhancedError;
    }
    
    if (seatLayoutCount === 0) throw new Error('Phòng chiếu chưa được cấu hình ghế');

    // OPTIMIZATION 3: Kiểm tra thời gian trong quá khứ ngay sau validation cơ bản
    if (showDate < today) {
      throw new Error('Không thể tạo xuất chiếu trong quá khứ');
    } else if (showDate.getTime() === today.getTime()) {
      const [hours, minutes] = startTime.split(':').map(Number);
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      if (hours < currentHour || (hours === currentHour && minutes < currentMinute)) {
        throw new Error('Không thể tạo xuất chiếu trong quá khứ');
      }
    }

    // OPTIMIZATION 4: Kiểm tra premiere date với dữ liệu đã có
    const releaseDate = new Date(movie.Release_Date);
    const premiereDate = movie.Premiere_Date ? new Date(movie.Premiere_Date) : null;

    if (premiereDate && showDate < premiereDate && showDate >= releaseDate && !allowEarlyShowtime) {
      throw new Error('early_premiere_request');
    }

    // OPTIMIZATION 5: Tính toán End_Time và kiểm tra conflict
    const duration = movie.Duration + 15; // Thời lượng phim + 15 phút dọn dẹp
    const [startHours, startMinutes, startSeconds = '00'] = startTime.split(':').map(Number);
    let endHours = startHours;
    let endMinutes = startMinutes + duration;
    let endSeconds = parseInt(startSeconds);

    if (endMinutes >= 60) {
      endHours += Math.floor(endMinutes / 60);
      endMinutes = endMinutes % 60;
    }

    if (endHours >= 24) {
      endHours = endHours % 24;
    }

    const endTime = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}:${String(endSeconds).padStart(2, '0')}`;

          // OPTIMIZATION 6: Kiểm tra conflict với query tối ưu (chỉ lấy field cần thiết)
    // Chỉ kiểm tra conflict với các xuất chiếu đang hoạt động (không ẩn)
    // Theo yêu cầu: Bỏ qua xuất chiếu đã ẩn khi kiểm tra trùng lịch
    const conflictingShowtimes = await Showtime.findAll({
      where: {
        Cinema_Room_ID: model.Cinema_Room_ID,
        Show_Date: model.Show_Date,
        Status: { [Op.ne]: 'Hidden' }, // Bỏ qua xuất chiếu đã ẩn
        [Op.or]: [
          {
            Start_Time: { [Op.lt]: endTime },
            End_Time: { [Op.gt]: startTime },
          },
        ],
      },
      attributes: ['Showtime_ID', 'Status', 'Start_Time', 'End_Time'], // Thêm Status để logging
      transaction
    });

    if (conflictingShowtimes.length) {
      // Lấy thông tin phim đang bị trùng lịch
      const conflictMovies = await Promise.all(conflictingShowtimes.map(async (conflict) => {
        const conflictShowtime = await Showtime.findOne({
          where: { Showtime_ID: conflict.Showtime_ID },
          include: [{
            model: Movie,
            as: 'Movie',
            attributes: ['Movie_ID', 'Movie_Name']
          }],
          transaction
        });
        
        return {
          movie_name: conflictShowtime.Movie.Movie_Name,
          start_time: formatTime(conflict.Start_Time).substring(0, 5),
          end_time: formatTime(conflict.End_Time).substring(0, 5),
          showtime_id: conflict.Showtime_ID,
          status: conflict.Status
        };
      }));
      
      // Lọc chỉ hiển thị các xuất chiếu đang hoạt động (không ẩn)
      const activeConflicts = conflictMovies.filter(item => item.status !== 'Hidden');
      
      // Nếu không có xuất chiếu đang hoạt động nào bị trùng, cho phép tạo mới
      if (activeConflicts.length === 0) {
        logger.debug(`[createShowtimeWithCorrectTime] Chỉ có xuất chiếu đã ẩn bị trùng, cho phép tạo mới`);
      } else {
        // Tạo thông báo chi tiết về các phim đang hoạt động bị trùng lịch
        const conflictDetails = activeConflicts.map(item => 
          `"${item.movie_name}" (${item.start_time} - ${item.end_time})`
        ).join(', ');
        
        logger.debug(`[createShowtimeWithCorrectTime] Chi tiết xuất chiếu đang hoạt động bị trùng: ${conflictDetails}`);
        
        // Chỉ thông báo về phim bị trùng lịch, bỏ gợi ý khung giờ trống
        const enhancedError = new Error(`Xuất chiếu bị trùng lịch với: ${conflictDetails}.`);
        enhancedError.code = 'SCHEDULE_CONFLICT';
        enhancedError.conflictMovies = activeConflicts;
        throw enhancedError;
      }
    }

    logger.debug(`[createShowtimeWithCorrectTime] Thời gian bắt đầu: ${startTime}, Thời lượng phim: ${movie.Duration} phút, Thời gian kết thúc: ${endTime}`);

    // OPTIMIZATION 7: Tạo showtime với dữ liệu đã optimize
    const showtime = {
      Movie_ID: model.Movie_ID,
      Cinema_Room_ID: model.Cinema_Room_ID,
      Show_Date: model.Show_Date,
      Start_Time: startTime,
      End_Time: endTime,
      Status: 'Scheduled',
      Capacity_Available: seatLayoutCount,
      Created_By: userId,
      Created_At: sequelize.literal('GETDATE()'),
      Updated_At: sequelize.literal('GETDATE()'),
    };

    logger.debug(`[createShowtimeWithCorrectTime] Dữ liệu showtime trước khi lưu: Start_Time=${showtime.Start_Time}, End_Time=${showtime.End_Time}`);

    const transactionOption = transaction ? { transaction } : {};
    
    // OPTIMIZATION 8: Chạy song song việc tạo showtime và update movie status
    const [newShowtime] = await Promise.all([
      Showtime.create(showtime, transactionOption),
      // Chỉ update movie status nếu cần thiết
      (movie.Status === 'Coming Soon' && new Date(model.Show_Date) <= new Date()) 
        ? Movie.update(
            { Status: 'Now Showing' }, 
            { 
              where: { Movie_ID: model.Movie_ID },
              ...transactionOption 
            }
          )
        : Promise.resolve()
    ]);

    logger.debug(`[createShowtimeWithCorrectTime] Dữ liệu sau khi lưu vào DB: Start_Time=${newShowtime.Start_Time}, End_Time=${newShowtime.End_Time}`);

    // OPTIMIZATION 9: Fetch thông tin hoàn chỉnh với query tối ưu
    const completeShowtime = await Showtime.findByPk(newShowtime.Showtime_ID, {
      include: [{ 
        model: CinemaRoom, 
        as: 'CinemaRoom',
        attributes: ['Cinema_Room_ID', 'Room_Name', 'Room_Type'] // Chỉ lấy field cần thiết
      }],
      transaction
    });

    return completeShowtime;
  };
};

// Hàm helper để format thông tin ghế
const formatSeatInfo = (bookedSeats, totalSeats) => {
  if (bookedSeats >= totalSeats) {
    return 'Hết ghế';
  }
  return `${bookedSeats}/${totalSeats}`;
};

// Hàm helper để tính số ghế đã đặt cho một showtime
const getBookedSeatsCount = async (showtimeId) => {
  try {
    const bookedSeats = await Ticket.count({
      where: {
        Showtime_ID: showtimeId,
        Status: { [Op.notIn]: ['Cancelled', 'Expired'] }
      }
    });
    return bookedSeats;
  } catch (error) {
    logger.error(`[getBookedSeatsCount] Lỗi khi đếm ghế đã đặt cho showtime ${showtimeId}:`, error);
    return 0;
  }
};

// Hàm helper để tính tổng số ghế cho một phòng chiếu
const getTotalSeatsCount = async (cinemaRoomId) => {
  try {
    const totalSeats = await SeatLayout.count({ 
      where: { 
        Cinema_Room_ID: cinemaRoomId, 
        Is_Active: true 
      } 
    });
    return totalSeats;
  } catch (error) {
    logger.error(`[getTotalSeatsCount] Lỗi khi đếm tổng ghế cho phòng ${cinemaRoomId}:`, error);
    return 0;
  }
};

// OPTIMIZATION: Hàm helper tối ưu để tính toán bulk seat counts cho nhiều showtimes cùng lúc
const getBulkSeatCounts = async (showtimeIds, cinemaRoomIds) => {
  try {
    // Query 1: Lấy số ghế đã đặt cho tất cả showtimes
    const bookedSeatsResults = await Ticket.findAll({
      where: {
        Showtime_ID: { [Op.in]: showtimeIds },
        Status: { [Op.notIn]: ['Cancelled', 'Expired'] }
      },
      attributes: [
        'Showtime_ID',
        [sequelize.fn('COUNT', sequelize.col('Ticket_ID')), 'count']
      ],
      group: ['Showtime_ID'],
      raw: true
    });

    // Query 2: Lấy tổng số ghế cho tất cả phòng chiếu
    const totalSeatsResults = await SeatLayout.findAll({
      where: {
        Cinema_Room_ID: { [Op.in]: cinemaRoomIds },
        Is_Active: true
      },
      attributes: [
        'Cinema_Room_ID',
        [sequelize.fn('COUNT', sequelize.col('Layout_ID')), 'count']
      ],
      group: ['Cinema_Room_ID'],
      raw: true
    });

    // Tạo map để lookup nhanh
    const bookedSeatsMap = new Map();
    bookedSeatsResults.forEach(result => {
      bookedSeatsMap.set(result.Showtime_ID, parseInt(result.count));
    });

    const totalSeatsMap = new Map();
    totalSeatsResults.forEach(result => {
      totalSeatsMap.set(result.Cinema_Room_ID, parseInt(result.count));
    });

    return { bookedSeatsMap, totalSeatsMap };
  } catch (error) {
    logger.error('[getBulkSeatCounts] Lỗi khi tính toán bulk seat counts:', error);
    return { 
      bookedSeatsMap: new Map(), 
      totalSeatsMap: new Map() 
    };
  }
};

class ShowtimeService {
  async getAllShowtimes() {
    try {
      logger.info('[getAllShowtimes] Lấy tất cả xuất chiếu với thông tin rạp phim');

      const showtimes = await Showtime.findAll({
        include: [
          {
            model: Movie,
            as: 'Movie',
            attributes: ['Movie_ID', 'Movie_Name', 'Duration', 'Rating', 'Poster_URL']
          },
          {
            model: CinemaRoom,
            as: 'CinemaRoom',
            attributes: ['Cinema_Room_ID', 'Room_Name', 'Room_Type'],
            include: [{
              model: sequelize.models.Cinema,
              as: 'Cinema',
              attributes: ['Cinema_ID', 'Cinema_Name', 'City', 'Address']
            }]
          }
        ],
        order: [['Show_Date', 'DESC'], ['Start_Time', 'ASC']]
      });

      const results = [];
      for (const showtime of showtimes) {
        const dto = await this.mapToShowtimeDto(showtime);
        results.push(dto);
      }
      return results;
    } catch (error) {
      logger.error('[getAllShowtimes] Lỗi khi lấy tất cả xuất chiếu:', error);
      throw error;
    }
  }

  async getShowtimeById(id) {
    const showtime = await ShowtimeRepository.getById(id);
    if (!showtime) return null;
    return await this.mapToShowtimeDto(showtime);
  }

  async createShowtime(model, userId, transaction = null, allowEarlyShowtime = false) {
    try {
      // Sử dụng phương thức mới để tránh vấn đề múi giờ
      const createWithCorrectTime = createShowtimeWithCorrectTime(model, userId, transaction, allowEarlyShowtime);
      return await createWithCorrectTime();
    } catch (error) {
      // ✅ ENHANCED: Nếu bị conflict, gợi ý giờ trống
      if (error.message === 'Suất chiếu bị trùng lịch') {
        try {
          // Lấy thông tin phim để tính duration
          const movie = await Movie.findByPk(model.Movie_ID);
          if (movie) {
            const totalDuration = movie.Duration + 15; // Phim + cleanup time
            const availableSlots = await this.findAvailableTimeSlots(
              model.Cinema_Room_ID, 
              model.Show_Date, 
              totalDuration
            );

            if (availableSlots.length > 0) {
              const suggestionText = availableSlots
                .slice(0, 5) // Chỉ hiện 5 gợi ý đầu tiên
                .map(slot => `${slot.start_time} - ${slot.end_time}`)
                .join(', ');
              
              const enhancedError = new Error(
                `Suất chiếu bị trùng lịch. Gợi ý khung giờ trống: ${suggestionText}`
              );
              enhancedError.code = 'SCHEDULE_CONFLICT';
              enhancedError.availableSlots = availableSlots;
              throw enhancedError;
            } else {
              const enhancedError = new Error(
                'Suất chiếu bị trùng lịch và không có khung giờ trống nào phù hợp trong ngày.'
              );
              enhancedError.code = 'NO_AVAILABLE_SLOTS';
              throw enhancedError;
            }
          }
        } catch (suggestionError) {
          // Nếu có lỗi khi tìm gợi ý, vẫn throw error gốc có gợi ý
          if (suggestionError.code === 'SCHEDULE_CONFLICT' || suggestionError.code === 'NO_AVAILABLE_SLOTS') {
            throw suggestionError;
          }
        }
      }
      
      // Throw error gốc nếu không phải conflict
      throw error;
    }
  }

  async updateShowtime(id, showtimeDto, updatedBy) {
    const showtimeInstance = await ShowtimeRepository.getById(id);
    if (!showtimeInstance) {
      const error = new Error(`Không tìm thấy lịch chiếu với ID ${id}`);
      error.statusCode = 404;
      throw error;
    }

    // ✅ SECURITY FIX: Kiểm tra active bookings trước khi cho phép cập nhật
    console.log(`[updateShowtime] Kiểm tra active bookings cho showtime ID ${id}...`);
    const activeBookings = await TicketBooking.count({
      where: {
        Showtime_ID: id,
        Status: { [Op.in]: ['Pending', 'Confirmed'] }
      }
    });

    if (activeBookings > 0) {
      const errorMsg = `Không thể cập nhật lịch chiếu vì có ${activeBookings} booking đang hoạt động. ` +
                     `Vui lòng chờ khách hàng hoàn thành hoặc hủy booking trước khi cập nhật.`;
      console.error(`[updateShowtime] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    console.log(`[updateShowtime] An toàn để cập nhật - không có active bookings`);

    const movie = await Movie.findOne({ where: { Movie_ID: showtimeDto.Movie_ID } });
    if (!movie) throw new Error('Phim không tồn tại');

    // Thêm kiểm tra phòng chiếu tồn tại nếu Cinema_Room_ID được cập nhật
    if (showtimeDto.Cinema_Room_ID !== undefined) {
      const cinemaRoom = await CinemaRoom.findOne({ where: { Cinema_Room_ID: showtimeDto.Cinema_Room_ID } });
      if (!cinemaRoom) {
        throw new Error(`Phòng chiếu với ID ${showtimeDto.Cinema_Room_ID} không tồn tại`);
      }
    }

    const now = new Date();

    // Đảm bảo showDateTime được tạo chính xác
    let showDateTime;
    try {
      // Parse ngày và giờ thành các thành phần riêng biệt
      const [year, month, day] = showtimeDto.Show_Date.split('-').map(Number);
      const [hours, minutes, seconds = 0] = showtimeDto.Start_Time.split(':').map(Number);

      // Lưu trữ giờ chính xác như người dùng nhập, không chuyển đổi múi giờ
      const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      // Lưu trữ giờ và ngày riêng biệt để tránh chuyển đổi múi giờ
      showDateTime = new Date(year, month - 1, day, hours, minutes, seconds);

      logger.debug(`[updateShowtime] Tạo showDateTime: ${showDateTime.toISOString()} từ ${dateString} ${timeString}`);
      logger.debug(`[updateShowtime] Giờ đã nhập: ${hours}:${minutes}:${seconds}`);

      if (isNaN(showDateTime.getTime())) {
        throw new Error(`Không thể tạo ngày giờ hợp lệ từ ${showtimeDto.Show_Date} ${showtimeDto.Start_Time}`);
      }
    } catch (error) {
      logger.error(`[updateShowtime] Lỗi khi tạo showDateTime: ${error.message}`);
      throw new Error(`Định dạng ngày giờ không hợp lệ: ${showtimeDto.Show_Date} ${showtimeDto.Start_Time}`);
    }

    // Xử lý Show_Date có thể là chuỗi hoặc đối tượng Date
    let showDateStr;
    if (showtimeInstance.Show_Date instanceof Date) {
      showDateStr = showtimeInstance.Show_Date.toISOString().split('T')[0];
    } else {
      // Nếu Show_Date là chuỗi hoặc kiểu dữ liệu khác, chuyển đổi thành chuỗi ngày
      const dateObj = new Date(showtimeInstance.Show_Date);
      showDateStr = dateObj.toISOString().split('T')[0];
    }

    if (showDateTime < now && showDateStr !== showtimeDto.Show_Date) {
      // Fix timezone issue: Sử dụng UTC methods thay vì toTimeString
      const currentTimeString = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}:${now.getUTCSeconds().toString().padStart(2, '0')}`;
      if (showDateStr === showtimeDto.Show_Date && showtimeDto.Start_Time < currentTimeString) {
        throw new Error('Không thể cập nhật xuất chiếu vào thời điểm trong quá khứ');
      } else if (showDateStr !== showtimeDto.Show_Date) {
        throw new Error('Không thể cập nhật xuất chiếu vào thời điểm trong quá khứ');
      }
    }

    const duration = movie.Duration + 15;

    // Tính toán thời gian kết thúc một cách đáng tin cậy
    const endTimeDate = new Date(showDateTime);
    endTimeDate.setMinutes(endTimeDate.getMinutes() + duration);

    // Đảm bảo endTime luôn là chuỗi thời gian hợp lệ
    let endTime;
    try {
      // Tạo định dạng thời gian hợp lệ từ giờ, phút, giây
      const hours = endTimeDate.getHours().toString().padStart(2, '0');
      const minutes = endTimeDate.getMinutes().toString().padStart(2, '0');
      const seconds = endTimeDate.getSeconds().toString().padStart(2, '0');
      endTime = `${hours}:${minutes}:${seconds}`;

      logger.debug(`[updateShowtime] Thời gian kết thúc được tạo: ${endTime}`);

      // Kiểm tra định dạng thời gian
      if (!/^\d{2}:\d{2}:\d{2}$/.test(endTime)) {
        throw new Error(`Định dạng thời gian kết thúc không hợp lệ: ${endTime}`);
      }
    } catch (error) {
      logger.error(`[updateShowtime] Lỗi khi tạo thời gian kết thúc: ${error.message}`);
      throw new Error('Không thể tạo thời gian kết thúc hợp lệ');
    }

    // Lưu trữ thời gian bắt đầu chính xác như người dùng nhập vào
    const startTime = showtimeDto.Start_Time;

    // Log thông tin thời gian để debug
    logger.debug(`[updateShowtime] Thời gian bắt đầu: ${startTime}, Thời lượng phim: ${movie.Duration} phút, Thời gian kết thúc: ${endTime}`);

    const isRoomAvailable = await this.isShowtimeAvailable(
      showtimeDto.Cinema_Room_ID || showtimeInstance.Cinema_Room_ID,
      showtimeDto.Show_Date || showDateStr,
      startTime || showtimeInstance.Start_Time,
      endTime,
      id
    );
    if (!isRoomAvailable) {
      // ✅ ENHANCED: Gợi ý giờ trống khi update bị conflict
      try {
        const totalDuration = movie.Duration + 15; // Phim + cleanup time
        const availableSlots = await this.findAvailableTimeSlots(
          showtimeDto.Cinema_Room_ID || showtimeInstance.Cinema_Room_ID,
          showtimeDto.Show_Date || showDateStr,
          totalDuration
        );

        if (availableSlots.length > 0) {
          const suggestionText = availableSlots
            .slice(0, 5) // Chỉ hiện 5 gợi ý đầu tiên
            .map(slot => `${slot.start_time} - ${slot.end_time}`)
            .join(', ');
          
          const enhancedError = new Error(
            `Thời gian chiếu trùng với lịch khác. Gợi ý khung giờ trống: ${suggestionText}`
          );
          enhancedError.code = 'SCHEDULE_CONFLICT';
          enhancedError.availableSlots = availableSlots;
          throw enhancedError;
        } else {
          throw new Error('Thời gian chiếu trùng với lịch khác và không có khung giờ trống nào phù hợp trong ngày.');
        }
      } catch (suggestionError) {
        if (suggestionError.code === 'SCHEDULE_CONFLICT') {
          throw suggestionError;
        }
        // Fallback to original error
        throw new Error('Thời gian chiếu trùng với lịch khác');
      }
    }

    const updateData = {};
    if (showtimeDto.Movie_ID !== undefined) updateData.Movie_ID = showtimeDto.Movie_ID;
    if (showtimeDto.Cinema_Room_ID !== undefined) updateData.Cinema_Room_ID = showtimeDto.Cinema_Room_ID;
    if (showtimeDto.Show_Date !== undefined) updateData.Show_Date = showtimeDto.Show_Date;
    if (showtimeDto.Start_Time !== undefined) updateData.Start_Time = startTime;
    updateData.End_Time = endTime;
    if (showtimeDto.Status !== undefined) {
      // Thêm validation cho Status
      const validStatuses = ['Scheduled', 'Cancelled', 'Hidden'];
      if (!validStatuses.includes(showtimeDto.Status)) {
        throw new Error(`Status không hợp lệ. Status phải là một trong: ${validStatuses.join(', ')}`);
      }
      updateData.Status = showtimeDto.Status;
    }

    updateData.Updated_At = sequelize.literal('GETDATE()');

    const updated = await ShowtimeRepository.update(id, updateData);
    if (!updated) {
      throw new Error('Cập nhật lịch chiếu thất bại trong repository');
    }
    return await this.mapToShowtimeDto(await ShowtimeRepository.getById(id));
  }

  async hideShowtime(id, userId) {
    let transaction = null;
    try {
      // Sử dụng trực tiếp model Showtime thay vì ShowtimeRepository
      const showtime = await Showtime.findByPk(id, {
        include: [{ model: Ticket, as: 'Tickets' }]
      });

      if (!showtime) {
        return false;
      }

      // Kiểm tra các đơn đặt vé đang chờ
      const pendingBookings = showtime.Tickets ?
        showtime.Tickets.filter(booking => booking.Status === 'Pending') :
        await Ticket.findAll({
          where: { Showtime_ID: id, Status: 'Pending' },
        });

      if (pendingBookings.length > 0) {
        throw new Error(`Có ${pendingBookings.length} đơn đặt vé đang chờ`);
      }

      // Chỉ bắt đầu transaction khi cần thiết
      transaction = await sequelize.transaction();

      // Cập nhật trạng thái showtime - Sửa lỗi định dạng ngày tháng
      showtime.Status = 'Hidden';
      // Sử dụng new Date() thay vì sequelize.literal
      showtime.Updated_At = sequelize.literal('GETDATE()');
      await showtime.save({ transaction });

      // Commit transaction
      await transaction.commit();

      return true;
    } catch (error) {
      // Chỉ rollback nếu transaction đã được tạo và chưa commit
      if (transaction && !transaction.finished) {
        try {
          await transaction.rollback();
        } catch (rollbackError) {
          console.error('Lỗi khi rollback transaction:', rollbackError);
        }
      }

      throw error;
    }
  }

  async autoHideExpiredShowtimes() {
    let transaction;
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0]; // Lấy ngày hiện tại dạng YYYY-MM-DD
      
      // Lấy giờ hiện tại theo định dạng HH:MM:SS
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

      logger.info(`[autoHideExpiredShowtimes] Bắt đầu ẩn lịch chiếu quá hạn. Thời điểm hiện tại: ${currentTime}`);

      // Helper function để so sánh thời gian (HH:MM:SS format)
      // Trả về true nếu time1 lớn hơn hoặc bằng time2
      const isTimeGreaterThanOrEqual = (time1, time2) => {
        if (!time1 || !time2) return false;
        
        try {
          // Chỉ so sánh chuỗi giờ để tránh vấn đề UTC
          const [h1, m1, s1 = '00'] = time1.split(':').map(Number);
          const [h2, m2, s2 = '00'] = time2.split(':').map(Number);
          
          if (isNaN(h1) || isNaN(m1) || isNaN(s1) || isNaN(h2) || isNaN(m2) || isNaN(s2)) {
            logger.error(`[autoHideExpiredShowtimes] Giá trị thời gian không hợp lệ: ${time1} hoặc ${time2}`);
            return false;
          }
          
          // So sánh thời gian
          if (h1 > h2) return true;
          if (h1 < h2) return false;
          if (m1 > m2) return true;
          if (m1 < m2) return false;
          return s1 >= s2;
        } catch (error) {
          logger.error(`[autoHideExpiredShowtimes] Lỗi khi so sánh thời gian: ${error.message}`);
          return false;
        }
      };
      
      // Helper function để thêm 15 phút vào thời gian kết thúc
      const addBuffer = (endTime) => {
        if (!endTime) return null;
        try {
          // Đảm bảo endTime là chuỗi có định dạng HH:MM:SS
          const timeStr = typeof endTime === 'string' ? endTime : endTime.toString();
          const timeParts = timeStr.split(':');
          if (timeParts.length < 2) return null;
          
          const hours = parseInt(timeParts[0], 10);
          const minutes = parseInt(timeParts[1], 10);
          const seconds = timeParts.length > 2 ? parseInt(timeParts[2], 10) : 0;
          
          if (isNaN(hours) || isNaN(minutes)) return null;
          
          let newMinutes = minutes + 15;
          let newHours = hours;
          
          if (newMinutes >= 60) {
            newHours = (newHours + 1) % 24;
            newMinutes = newMinutes % 60;
          }
          
          return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } catch (error) {
          logger.error(`[autoHideExpiredShowtimes] Lỗi khi xử lý thời gian: ${error.message}`);
          return null;
        }
      };

      // Tìm tất cả lịch chiếu NGÀY HÔM NAY hoặc QUÁ KHỨ và chưa ẩn
      const showtimes = await Showtime.findAll({
        where: {
          Show_Date: { [Op.lte]: today }, // Chỉ lấy các xuất chiếu hôm nay hoặc quá khứ
          Status: { [Op.notIn]: ['Hidden', 'Cancelled'] }
        },
        raw: false
      });

      // Lọc các lịch chiếu đã quá hạn
      const expiredShowtimes = showtimes.filter(showtime => {
        // Nếu ngày chiếu là quá khứ, đánh dấu là hết hạn
        if (showtime.Show_Date < today) {
          return true;
        }
        
        // Nếu là ngày hôm nay, kiểm tra thời gian
        if (showtime.Show_Date === today) {
          // Định dạng lại thời gian kết thúc
          const endTime = formatTime(showtime.End_Time);
          if (!endTime) return false;
          
          // Thêm 15 phút buffer vào thời gian kết thúc
          const bufferedEndTime = addBuffer(endTime);
          if (!bufferedEndTime) return false;
          
          // Log thông tin để debug
          logger.info(`[autoHideExpiredShowtimes] Showtime ID: ${showtime.Showtime_ID}, Giờ kết thúc: ${endTime}, Giờ kết thúc + 15p: ${bufferedEndTime}, Giờ hiện tại: ${currentTime}`);
          
          // Kiểm tra nếu giờ hiện tại đã vượt qua giờ kết thúc + 15 phút
          return isTimeGreaterThanOrEqual(currentTime, bufferedEndTime);
        }
        
        return false;
      });

      if (expiredShowtimes.length === 0) {
        logger.info('[autoHideExpiredShowtimes] Không có suất chiếu nào cần ẩn');
        return 0;
      }

      logger.info(`[autoHideExpiredShowtimes] Tìm thấy ${expiredShowtimes.length} suất chiếu quá hạn cần ẩn`);

      // Log chi tiết các lịch chiếu sẽ bị ẩn để debug
      for (const showtime of expiredShowtimes) {
        // Format thời gian để hiển thị đúng
        const formattedStartTime = formatTime(showtime.Start_Time) || 'Không xác định';
        const formattedEndTime = formatTime(showtime.End_Time) || 'Không xác định';
        
        logger.info(`[autoHideExpiredShowtimes] Sẽ ẩn: ID=${showtime.Showtime_ID}, Ngày=${showtime.Show_Date}, Giờ=${formattedStartTime}-${formattedEndTime}`);
      }

      // Khởi tạo transaction trước khi thực hiện các thao tác cập nhật
      transaction = await sequelize.transaction();

      // Cập nhật trạng thái thành Hidden cho tất cả lịch chiếu quá hạn
      transaction = await sequelize.transaction();
      
      try {
        for (const showtime of expiredShowtimes) {
          showtime.Status = 'Hidden';
          // Sử dụng GETDATE() thay vì new Date() để đảm bảo thời gian chính xác
          showtime.Updated_At = sequelize.literal('GETDATE()');
          await showtime.save({ transaction });
        }

        // Commit transaction sau khi tất cả các cập nhật đã hoàn thành
        await transaction.commit();
        logger.info(`[autoHideExpiredShowtimes] Đã ẩn thành công ${expiredShowtimes.length} suất chiếu hết hạn`);
        return expiredShowtimes.length;
      } catch (error) {
        // Rollback transaction nếu có lỗi
        if (transaction && !transaction.finished) {
          try {
            await transaction.rollback();
            logger.info('[autoHideExpiredShowtimes] Transaction đã được rollback do lỗi');
          } catch (rollbackError) {
            logger.error(`[autoHideExpiredShowtimes] Lỗi khi rollback transaction: ${rollbackError.message}`);
          }
        }
        logger.error(`[autoHideExpiredShowtimes] Lỗi khi ẩn lịch chiếu: ${error.message}`);
        throw error;
      }
    } catch (error) {
      logger.error(`[autoHideExpiredShowtimes] Lỗi chung: ${error.message}`);
      throw error;
    }
  }

  async getShowtimesByMovie(movieId) {
    // OPTIMIZATION: Chạy song song việc validate movie và lấy showtimes
    const [movie, showtimes] = await Promise.all([
      Movie.findOne({ 
        where: { Movie_ID: movieId },
        attributes: ['Movie_ID', 'Movie_Name', 'Duration', 'Rating'] // Chỉ lấy field cần thiết
      }),
      Showtime.findAll({
        where: {
          Movie_ID: movieId,
          Show_Date: { [Op.gte]: new Date().toISOString().split('T')[0] },
          Status: 'Scheduled',
        },
        include: [{ 
          model: CinemaRoom, 
          as: 'CinemaRoom',
          attributes: ['Cinema_Room_ID', 'Room_Name', 'Room_Type'] // Chỉ lấy field cần thiết
        }],
        order: [['Show_Date', 'ASC'], ['Start_Time', 'ASC']],
        attributes: ['Showtime_ID', 'Show_Date', 'Start_Time', 'End_Time', 'Cinema_Room_ID', 'Capacity_Available'] // Chỉ lấy field cần thiết
      })
    ]);

    if (!movie) throw new Error(`Không tìm thấy phim có ID ${movieId}`);

    const today = new Date().toISOString().split('T')[0];
    const result = {};
    
    // OPTIMIZATION: Sử dụng bulk query để tính seat counts cho tất cả showtimes
    const showtimeIds = showtimes.map(s => s.Showtime_ID);
    const cinemaRoomIds = [...new Set(showtimes.map(s => s.Cinema_Room_ID))]; // Remove duplicates
    const { bookedSeatsMap, totalSeatsMap } = await getBulkSeatCounts(showtimeIds, cinemaRoomIds);

    for (const s of showtimes) {
      const date = s.Show_Date;
      if (!result[date]) {
        result[date] = {
          Show_Date: date,
          Day_Name: new Date(date).toLocaleString('en-US', { weekday: 'long' }),
          Is_Today: date === today,
          Showtimes: [],
        };
      }
      
      const bookedSeats = bookedSeatsMap.get(s.Showtime_ID) || 0;
      const totalSeats = totalSeatsMap.get(s.Cinema_Room_ID) || 0;
      
      result[date].Showtimes.push({
        Showtime_ID: s.Showtime_ID,
        Start_Time: formatTime(s.Start_Time) ? formatTime(s.Start_Time).substring(0, 5) : null,
        End_Time: formatTime(s.End_Time) ? formatTime(s.End_Time).substring(0, 5) : null,
        Capacity_Available: s.Capacity_Available,
        BookedSeats: bookedSeats,
        TotalSeats: totalSeats,
        AvailableSeats: totalSeats - bookedSeats,
        SeatStatus: formatSeatInfo(bookedSeats, totalSeats),
        IsSoldOut: bookedSeats >= totalSeats,
        Room: {
          Cinema_Room_ID: s.CinemaRoom.Cinema_Room_ID,
          Room_Name: s.CinemaRoom.Room_Name,
          Room_Type: s.CinemaRoom.Room_Type,
        },
        Is_Almost_Full: (totalSeats - bookedSeats) < (totalSeats * 0.1),
      });
    }

    return {
      movie_id: movieId,
      movie_name: movie.Movie_Name,
      duration: movie.Duration,
      rating: movie.Rating,
      dates: Object.values(result),
    };
  }

  async getShowtimesByRoom(roomId, date) {
    const room = await CinemaRoom.findOne({ where: { Cinema_Room_ID: roomId } });
    if (!room) throw new Error(`Không tìm thấy phòng chiếu có ID ${roomId}`);

    // Validate date format YYYY-MM-DD
    let queryDate;
    if (date) {
      // Kiểm tra định dạng ngày hợp lệ
      const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateFormatRegex.test(date)) {
        throw new Error('Định dạng ngày không hợp lệ. Sử dụng định dạng YYYY-MM-DD');
      }

      // Kiểm tra ngày hợp lệ
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        throw new Error('Ngày không hợp lệ');
      }

      queryDate = date;
    } else {
      queryDate = new Date().toISOString().split('T')[0];
    }

    const showtimes = await Showtime.findAll({
      where: {
        Cinema_Room_ID: roomId,
        Show_Date: queryDate,
      },
      include: [{ model: Movie, as: 'Movie' }, { model: Ticket, as: 'Tickets' }],
      order: [['Start_Time', 'ASC']],
    });

    const operatingHours = { Start: '09:00:00', End: '23:00:00' };
    const freeSlots = [];
    let currentTime = operatingHours.Start;

    // Sửa lỗi localeCompare bằng cách tránh sử dụng sắp xếp lại vì đã sắp xếp trong truy vấn
    // Và đảm bảo Start_Time là chuỗi trước khi so sánh
    const sortedShowtimes = [...showtimes].sort((a, b) => {
      // Đảm bảo Start_Time là chuỗi
      const aTime = String(a.Start_Time);
      const bTime = String(b.Start_Time);
      return aTime.localeCompare(bTime);
    });

    for (const showtime of sortedShowtimes) {
      if (String(showtime.Start_Time) > currentTime) {
        freeSlots.push({
          Start_Time: currentTime,
          End_Time: String(showtime.Start_Time),
          Duration: (new Date(`1970-01-01T${String(showtime.Start_Time)}`) - new Date(`1970-01-01T${currentTime}`)) / 60000,
        });
      }
      currentTime = String(showtime.End_Time);
    }
    if (currentTime < operatingHours.End) {
      freeSlots.push({
        Start_Time: currentTime,
        End_Time: operatingHours.End,
        Duration: (new Date(`1970-01-01T${operatingHours.End}`) - new Date(`1970-01-01T${currentTime}`)) / 60000,
      });
    }

    return {
      room_id: roomId,
      room_name: room.Room_Name,
      room_type: room.Room_Type,
      date: queryDate,
      showtimes_count: showtimes.length,
      showtimes: showtimes.map(s => ({
        Showtime_ID: s.Showtime_ID,
        Start_Time: formatTime(String(s.Start_Time)) ? formatTime(String(s.Start_Time)).substring(0, 5) : null,
        End_Time: formatTime(String(s.End_Time)) ? formatTime(String(s.End_Time)).substring(0, 5) : null,
        Status: s.Status,
        Movie: {
          Movie_ID: s.Movie.Movie_ID,
          Movie_Name: s.Movie.Movie_Name,
          Duration: s.Movie.Duration,
          Poster_URL: s.Movie.Poster_URL,
        },
        Bookings_Count: s.Tickets ? s.Tickets.filter(b => b.Status !== 'Cancelled').length : 0,
      })),
      available_slots: freeSlots,
    };
  }

  async getShowtimeDates(movieId) {
    const today = new Date().toISOString().split('T')[0];
    const showtimes = await Showtime.findAll({
      where: {
        Movie_ID: movieId,
        Show_Date: { [Op.gte]: today },
        Status: 'Scheduled',
      },
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('Show_Date')), 'Show_Date']],
      order: [['Show_Date', 'ASC']],
    });
    return showtimes.map(s => s.Show_Date);
  }

  async getShowtimesByDate(movieId, date) {
    // Validate định dạng ngày
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Định dạng ngày không hợp lệ. Vui lòng sử dụng YYYY-MM-DD');
    }

    const where = {
      Movie_ID: movieId,
      Show_Date: date,
      Status: { [Op.ne]: 'Hidden' },
    };

    logger.info(`[getShowtimesByDate] Tìm lịch chiếu cho phim ID: ${movieId} vào ngày: ${date}`);

    try {
      // OPTIMIZATION: Chạy song song việc validate movie và lấy showtimes
      const [movie, showtimes] = await Promise.all([
        Movie.findOne({ 
          where: { Movie_ID: movieId },
          attributes: ['Movie_ID', 'Movie_Name'] // Chỉ cần để validate
        }),
        Showtime.findAll({
          where,
          include: [
            { 
              model: Movie, 
              as: 'Movie',
              attributes: ['Movie_ID', 'Movie_Name'] // Chỉ lấy field cần thiết
            },
            {
              model: CinemaRoom,
              as: 'CinemaRoom',
              include: [
                { 
                  model: sequelize.models.Cinema, 
                  as: 'Cinema',
                  attributes: ['Cinema_ID', 'Cinema_Name', 'Location'] // Chỉ lấy field cần thiết
                }
              ],
              attributes: ['Cinema_Room_ID', 'Room_Name', 'Room_Type'] // Chỉ lấy field cần thiết
            },
          ],
          order: [['Start_Time', 'ASC']],
          attributes: ['Showtime_ID', 'Start_Time', 'End_Time', 'Price_Tier', 'Base_Price', 'Capacity_Available', 'Cinema_Room_ID'] // Chỉ lấy field cần thiết
        })
      ]);

      if (!movie) {
        throw new Error(`Không tìm thấy phim có ID ${movieId}`);
      }

      logger.info(`[getShowtimesByDate] Tìm thấy ${showtimes.length} lịch chiếu cho phim ID: ${movieId} vào ngày: ${date}`);

      // OPTIMIZATION: Xử lý song song tất cả showtimes
      const result = await Promise.all(showtimes.map(async (showtime) => {
        const formattedShowtime = await this.mapToShowtimeDto(showtime);

        return {
          ...formattedShowtime,
          Price_Tier: showtime.Price_Tier,
          Base_Price: showtime.Base_Price,
          Capacity_Available: showtime.Capacity_Available,
          Cinema: {
            Cinema_ID: showtime.CinemaRoom.Cinema.Cinema_ID,
            Cinema_Name: showtime.CinemaRoom.Cinema.Cinema_Name,
            Location: showtime.CinemaRoom.Cinema.Location
          }
        };
      }));

      return result;
    } catch (error) {
      logger.error(`[getShowtimesByDate] Lỗi khi truy vấn lịch chiếu:`, error);
      throw error;
    }
  }

  async getShowtimesByRequest(request) {
    if (!request) throw new Error('Yêu cầu không hợp lệ');

    const { MovieID, RoomID, Date, StartTime, EndTime, Status, Page, PageSize } = request;

    // Xây dựng where dựa trên request
    const where = {};
    if (MovieID && MovieID !== 0) where.Movie_ID = MovieID;
    if (RoomID && RoomID !== 0) where.Cinema_Room_ID = RoomID;

    // Xử lý date để bao gồm cả thời gian trong ngày
    if (Date) {
      const targetDate = new Date(Date);

      if (!isNaN(targetDate.getTime())) {
        const startDate = new Date(targetDate);
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date(targetDate);
        endDate.setHours(23, 59, 59, 999);

        where.Show_Date = { [Op.between]: [startDate, endDate] };
      } else {
        logger.warn('Invalid date format in request', { Date });
      }
    }

    // Khoảng thời gian
    if (StartTime && EndTime) {
      where[Op.and] = [
        sequelize.where(sequelize.fn('TIME', sequelize.col('Start_Time')), '>=', StartTime),
        sequelize.where(sequelize.fn('TIME', sequelize.col('End_Time')), '<=', EndTime)
      ];
    } else if (StartTime) {
      where[Op.and] = [
        sequelize.where(sequelize.fn('TIME', sequelize.col('Start_Time')), '>=', StartTime)
      ];
    } else if (EndTime) {
      where[Op.and] = [
        sequelize.where(sequelize.fn('TIME', sequelize.col('End_Time')), '<=', EndTime)
      ];
    }

    // Status filter
    if (Status) where.Status = Status;

    // Pagination
    const page = Page || 1;
    const pageSize = PageSize || 10;
    const offset = (page - 1) * pageSize;

    // Query showtimes
    const { count, rows: showtimes } = await Showtime.findAndCountAll({
      where,
      include: [
        { model: Movie, as: 'Movie' },
        { model: CinemaRoom, as: 'CinemaRoom' }
      ],
      order: [['Show_Date', 'DESC'], ['Start_Time', 'ASC']],
      limit: pageSize,
      offset,
      distinct: true
    });

    const result = [];
    for (const showtime of showtimes) {
      const totalSeats = await SeatLayout.count({ where: { Cinema_Room_ID: showtime.Cinema_Room_ID } });
      const bookedSeats = await Ticket.count({
        where: {
          Showtime_ID: showtime.Showtime_ID,
          Status: { [Op.notIn]: ['Cancelled', 'Expired'] }
        }
      });

      // Sử dụng mapToShowtimeDto để định dạng nhất quán
      const formattedShowtime = this.mapToShowtimeDto(showtime);

      result.push({
        ...formattedShowtime,
        AvailableSeats: totalSeats - bookedSeats,
        TotalSeats: totalSeats,
      });
    }
    return result;
  }

  async getRooms() {
    return await CinemaRoom.findAll({
      attributes: ['Cinema_Room_ID', 'Room_Name', 'Room_Type'],
    });
  }

  async getShowtimesByRoomAndDate(roomId, date) {
    // Validate date format YYYY-MM-DD
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Định dạng ngày không hợp lệ. Vui lòng sử dụng YYYY-MM-DD');
    }

    // Kiểm tra phòng chiếu có tồn tại không
    const room = await CinemaRoom.findByPk(roomId);
    if (!room) {
      throw new Error(`Không tìm thấy phòng chiếu với ID: ${roomId}`);
    }

    // Truy vấn các suất chiếu trong ngày của phòng
    const showtimes = await Showtime.findAll({
      where: {
        Cinema_Room_ID: roomId,
        Show_Date: date
      },
      include: [
        { model: Movie, as: 'Movie' },
        { model: CinemaRoom, as: 'CinemaRoom' }
      ],
      order: [['Start_Time', 'ASC']],
    });

    const result = [];
    for (const showtime of showtimes) {
      const totalSeats = await SeatLayout.count({ where: { Cinema_Room_ID: showtime.Cinema_Room_ID } });
      const bookedSeats = await Ticket.count({
        where: {
          Showtime_ID: showtime.Showtime_ID,
          Status: { [Op.notIn]: ['Cancelled', 'Expired'] }
        }
      });

      // Sử dụng mapToShowtimeDto để định dạng nhất quán
      const formattedShowtime = this.mapToShowtimeDto(showtime);

      result.push({
        ...formattedShowtime,
        Movie: {
          Movie_ID: showtime.Movie.Movie_ID,
          Movie_Name: showtime.Movie.Movie_Name,
          Duration: showtime.Movie.Duration,
          Rating: showtime.Movie.Rating,
          Poster_URL: showtime.Movie.Poster_URL,
        }
      });
    }
    return result;
  }

  async getShowtimesByMovieForAdmin(movieId) {
    // Kiểm tra phim có tồn tại không
    const movie = await Movie.findByPk(movieId);
    if (!movie) {
      throw new Error(`Không tìm thấy phim với ID: ${movieId}`);
    }

    const showtimes = await Showtime.findAll({
      where: { Movie_ID: movieId },
      include: [{ model: CinemaRoom, as: 'CinemaRoom' }],
      order: [['Show_Date', 'ASC'], ['Start_Time', 'ASC']],
    });

    const result = [];
    for (const showtime of showtimes) {
      const totalSeats = await SeatLayout.count({ where: { Cinema_Room_ID: showtime.Cinema_Room_ID } });
      const bookedSeats = await Ticket.count({
        where: {
          Showtime_ID: showtime.Showtime_ID,
          Status: { [Op.notIn]: ['Cancelled', 'Expired'] }
        }
      });

      // Sử dụng mapToShowtimeDto để định dạng nhất quán
      const formattedShowtime = this.mapToShowtimeDto(showtime);

      result.push({
        ...formattedShowtime,
        AvailableSeats: totalSeats - bookedSeats,
        TotalSeats: totalSeats,
      });
    }
    return result;
  }

  async autoScheduleShowtimes(request, userId) {
    if (!request.Movies || !request.Movies.length) throw new Error('Dữ liệu yêu cầu không hợp lệ');

    const cinemaRoom = await CinemaRoom.findOne({ where: { Cinema_Room_ID: request.CinemaRoomId } });
    if (!cinemaRoom) throw new Error(`Không tìm thấy phòng chiếu có ID ${request.CinemaRoomId}`);
    if (cinemaRoom.Status !== 'Active') throw new Error('Phòng chiếu không hoạt động');

    const movieIds = request.Movies.map(m => m.MovieId);
    const movies = await Movie.findAll({ where: { Movie_ID: { [Op.in]: movieIds } } });
    if (movies.length < movieIds.length) throw new Error('Một số phim không tồn tại');

    for (const movieInput of request.Movies) {
      if (movieInput.ShowtimeCount <= 0) throw new Error(`Số lượng suất chiếu của phim ${movies.find(m => m.Movie_ID === movieInput.MovieId).Movie_Name} phải lớn hơn 0`);
    }

    const existingShowtimes = await Showtime.findAll({
      where: {
        Cinema_Room_ID: request.CinemaRoomId,
        Show_Date: request.ShowDate,
        Status: { [Op.notIn]: ['Hidden', 'Cancelled'] },
      },
    });

    const allShowtimesToSchedule = request.Movies.reduce((acc, m) => {
      const movie = movies.find(x => x.Movie_ID === m.MovieId);
      for (let i = 0; i < m.ShowtimeCount; i++) {
        acc.push({ MovieId: movie.Movie_ID, Duration: movie.Duration, MovieName: movie.Movie_Name });
      }
      return acc;
    }, []).sort(() => Math.random() - 0.5);

    const defaultOpenTime = '09:00:00';
    const closeTime = '23:59:59';
    const cleanupTime = 15 * 60000;
    let openTime = defaultOpenTime;
    if (new Date(request.ShowDate).toISOString().split('T')[0] === new Date().toISOString().split('T')[0]) {
      // Fix timezone issue: Sử dụng UTC methods thay vì toTimeString
      const currentTime = new Date();
      const now = `${currentTime.getUTCHours().toString().padStart(2, '0')}:${currentTime.getUTCMinutes().toString().padStart(2, '0')}:${currentTime.getUTCSeconds().toString().padStart(2, '0')}`;
      if (now > defaultOpenTime) openTime = now;
    }

    const occupiedTimeSlots = existingShowtimes.map(s => ({ Start: s.Start_Time, End: s.End_Time }));
    const generatedShowtimes = [];
    let currentTime = openTime;

    for (const showtime of allShowtimesToSchedule) {
      let foundSlot = false;
      const movieDuration = showtime.Duration * 60000;
      const requiredSlotDuration = movieDuration + cleanupTime;
      let slotStart = new Date(`1970-01-01T${currentTime}`);

      while (slotStart.getTime() + movieDuration <= new Date(`1970-01-01T${closeTime}`).getTime() && !foundSlot) {
        const slotEnd = new Date(slotStart.getTime() + movieDuration);
        const isConflict = occupiedTimeSlots.some(slot =>
          (slotStart >= new Date(`1970-01-01T${slot.Start}`) && slotStart < new Date(`1970-01-01T${slot.End}`)) ||
          (slotEnd > new Date(`1970-01-01T${slot.Start}`) && slotEnd <= new Date(`1970-01-01T${slot.End}`)) ||
          (slotStart <= new Date(`1970-01-01T${slot.Start}`) && slotEnd >= new Date(`1970-01-01T${slot.End}`))
        );

        if (!isConflict) {
          foundSlot = true;
          // Fix timezone issue: Sử dụng UTC methods thay vì toTimeString
          const startTimeFormatted = `${slotStart.getUTCHours().toString().padStart(2, '0')}:${slotStart.getUTCMinutes().toString().padStart(2, '0')}:${slotStart.getUTCSeconds().toString().padStart(2, '0')}`;
          const endTimeFormatted = `${slotEnd.getUTCHours().toString().padStart(2, '0')}:${slotEnd.getUTCMinutes().toString().padStart(2, '0')}:${slotEnd.getUTCSeconds().toString().padStart(2, '0')}`;
          const nextTimeObj = new Date(slotEnd.getTime() + cleanupTime);
          const nextTimeFormatted = `${nextTimeObj.getUTCHours().toString().padStart(2, '0')}:${nextTimeObj.getUTCMinutes().toString().padStart(2, '0')}:${nextTimeObj.getUTCSeconds().toString().padStart(2, '0')}`;
          
          generatedShowtimes.push({
            MovieId: showtime.MovieId,
            MovieName: showtime.MovieName,
            StartDateTime: new Date(`${request.ShowDate}T${startTimeFormatted}`),
            EndDateTime: new Date(`${request.ShowDate}T${endTimeFormatted}`),
            StartTime: startTimeFormatted,
            EndTime: endTimeFormatted,
          });
          occupiedTimeSlots.push({ Start: startTimeFormatted, End: endTimeFormatted });
          currentTime = nextTimeFormatted;
        } else {
          const nextSlot = occupiedTimeSlots.find(slot => new Date(`1970-01-01T${slot.Start}`) > slotStart);
          slotStart = nextSlot ? new Date(`1970-01-01T${nextSlot.End}`).getTime() + cleanupTime : new Date(slotStart.getTime() + 15 * 60000);
        }
      }
    }

    return {
      Date: request.ShowDate,
      RoomName: cinemaRoom.Room_Name,
      Showtimes: generatedShowtimes.sort((a, b) => a.StartTime.localeCompare(b.StartTime)),
    };
  }

  async hideAllShowtimesForDate(roomId, date, userId) {
    // Validate roomId
    if (!roomId || isNaN(parseInt(roomId)) || parseInt(roomId) <= 0) {
      throw new Error('ID phòng chiếu không hợp lệ. Phải là số nguyên dương.');
    }

    // Validate date format YYYY-MM-DD
    if (!date) {
      throw new Error('Ngày không được để trống');
    }

    // Kiểm tra định dạng ngày hợp lệ
    const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateFormatRegex.test(date)) {
      throw new Error('Định dạng ngày không hợp lệ. Sử dụng định dạng YYYY-MM-DD');
    }

    // Kiểm tra ngày hợp lệ
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      throw new Error('Ngày không hợp lệ');
    }

    // Kiểm tra phòng chiếu có tồn tại không
    const cinemaRoom = await CinemaRoom.findByPk(roomId);
    if (!cinemaRoom) {
      throw new Error(`Không tìm thấy phòng chiếu với ID ${roomId}`);
    }

    const showtimes = await Showtime.findAll({
      where: {
        Cinema_Room_ID: roomId,
        Show_Date: date,
        Status: { [Op.notIn]: ['Hidden', 'Cancelled'] },
      },
    });

    if (showtimes.length === 0) {
      return 0; // Không có suất chiếu nào cần ẩn
    }

    const pendingBookings = await Ticket.findAll({
      where: {
        Showtime_ID: showtimes.map(s => s.Showtime_ID),
        Status: 'Pending',
      },
    });

    if (pendingBookings.length) {
      const bookingInfo = pendingBookings.reduce((acc, b) => {
        const showtime = showtimes.find(s => s.Showtime_ID === b.Showtime_ID);
        acc += `- Xuất chiếu ID ${b.Showtime_ID} (${showtime.Start_Time}): ${acc[b.Showtime_ID] || 0 + 1} đơn đặt vé đang chờ\n`;
        return acc;
      }, 'Không thể ẩn do các đơn đặt vé đang chờ:\n');
      throw new Error(bookingInfo);
    }

    let transaction = null;
    try {
      // Chỉ khởi tạo transaction khi chắc chắn có showtimes cần cập nhật
      transaction = await sequelize.transaction();

      let hiddenCount = 0;
      for (const showtime of showtimes) {
        showtime.Status = 'Hidden';
        // Sử dụng new Date() thay vì sequelize.fn('GETDATE')
        showtime.Updated_At = sequelize.literal('GETDATE()');
        await showtime.save({ transaction });
        hiddenCount++;
      }

      // Commit transaction nếu mọi thứ OK
      await transaction.commit();
      return hiddenCount;
    } catch (error) {
      // Rollback transaction nếu có lỗi và transaction đã được khởi tạo
      if (transaction && !transaction.finished) {
        try {
          await transaction.rollback();
        } catch (rollbackError) {
          console.error('Lỗi khi rollback transaction:', rollbackError);
        }
      }
      throw error;
    }
  }

  async isShowtimeAvailable(cinemaRoomId, date, startTime, endTime, excludeId = null) {
    if (startTime >= endTime) return false;

    // Kiểm tra thời gian trong quá khứ mà không tạo đối tượng Date từ chuỗi ISO
    const now = new Date();
    const [year, month, day] = date.split('-').map(Number);
    const [startHours, startMinutes] = startTime.split(':').map(Number);

    const showDate = new Date(year, month - 1, day);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (showDate < today) return false;
    if (showDate.getTime() === today.getTime()) {
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      if (startHours < currentHours || (startHours === currentHours && startMinutes < currentMinutes)) {
        return false;
      }
    }

    const closingTime = '23:59:59';
    if (endTime > closingTime) return false;

    const showtimes = await Showtime.findAll({
      where: {
        Cinema_Room_ID: cinemaRoomId,
        Show_Date: date,
        Status: { [Op.ne]: 'Hidden' },
        Showtime_ID: { [Op.ne]: excludeId },
      },
    });

    // So sánh thời gian bằng cách phân tích chuỗi thời gian trực tiếp
    const gap = 15; // 15 phút = 15 * 60000 ms

    // Chuyển đổi thời gian thành phút để dễ so sánh
    const startTimeMinutes = startHours * 60 + startMinutes;
    const endTimeMinutes = getMinutesFromTimeString(endTime);

    for (const showtime of showtimes) {
      const existingStartMinutes = getMinutesFromTimeString(showtime.Start_Time);
      const existingEndMinutes = getMinutesFromTimeString(showtime.End_Time);

      // Kiểm tra xem có trùng lịch không
      if (startTimeMinutes < existingEndMinutes && existingStartMinutes < endTimeMinutes) {
        logger.debug(`[isShowtimeAvailable] Trùng lịch: ${startTime}-${endTime} vs ${showtime.Start_Time}-${showtime.End_Time}`);
        return false;
      }

      // Kiểm tra khoảng cách giữa các suất chiếu
      if (startTimeMinutes >= existingEndMinutes && (startTimeMinutes - existingEndMinutes) < gap) {
        logger.debug(`[isShowtimeAvailable] Khoảng cách quá gần sau: ${startTime} sau ${showtime.End_Time}`);
        return false;
      }

      if (endTimeMinutes <= existingStartMinutes && (existingStartMinutes - endTimeMinutes) < gap) {
        logger.debug(`[isShowtimeAvailable] Khoảng cách quá gần trước: ${endTime} trước ${showtime.Start_Time}`);
        return false;
      }
    }
    return true;
  }

  async mapToShowtimeDto(showtime, includeSeatsInfo = true) {
    logger.debug(`[mapToShowtimeDto] Dữ liệu gốc: Start_Time=${JSON.stringify(showtime.Start_Time)}, End_Time=${JSON.stringify(showtime.End_Time)}`);

    // Sử dụng hàm formatTime đã sửa và chuyển về HH:MM cho API response
    const formattedStartTimeFull = formatTime(showtime.Start_Time);
    const formattedEndTimeFull = formatTime(showtime.End_Time);
    
    // Chuyển về format HH:MM cho API response (tương thích với cinemaService)
    const formattedStartTime = formattedStartTimeFull ? formattedStartTimeFull.substring(0, 5) : null;
    const formattedEndTime = formattedEndTimeFull ? formattedEndTimeFull.substring(0, 5) : null;

    logger.debug(`[mapToShowtimeDto] Sau khi định dạng: Start_Time=${formattedStartTime}, End_Time=${formattedEndTime}`);

    // Xử lý Show_Date để loại bỏ phần thời gian
    let formattedDate = showtime.Show_Date;
    if (typeof formattedDate === 'string' && formattedDate.includes('T')) {
      formattedDate = formattedDate.split('T')[0];
    } else if (formattedDate instanceof Date) {
      formattedDate = formattedDate.toISOString().split('T')[0];
    }

    const baseResult = {
      Showtime_ID: showtime.Showtime_ID,
      Movie_ID: showtime.Movie_ID,
      Cinema_Room_ID: showtime.Cinema_Room_ID,
      Room_Name: showtime.CinemaRoom?.Room_Name,
      Show_Date: formattedDate,
      Start_Time: formattedStartTime,
      End_Time: formattedEndTime,
      Status: showtime.Status,
      Movie: showtime.Movie ? {
        Movie_ID: showtime.Movie.Movie_ID,
        Movie_Name: showtime.Movie.Movie_Name,
        Duration: showtime.Movie.Duration,
        Rating: showtime.Movie.Rating,
        Poster_URL: showtime.Movie.Poster_URL
      } : null,
      Room: showtime.CinemaRoom ? {
        Cinema_Room_ID: showtime.CinemaRoom.Cinema_Room_ID,
        Room_Name: showtime.CinemaRoom.Room_Name,
        Room_Type: showtime.CinemaRoom.Room_Type,
      } : null,
      Cinema: showtime.CinemaRoom?.Cinema ? {
        Cinema_ID: showtime.CinemaRoom.Cinema.Cinema_ID,
        Cinema_Name: showtime.CinemaRoom.Cinema.Cinema_Name,
        City: showtime.CinemaRoom.Cinema.City,
        Address: showtime.CinemaRoom.Cinema.Address
      } : null,
    };

    // Thêm thông tin ghế nếu được yêu cầu
    if (includeSeatsInfo) {
      try {
        const bookedSeats = await getBookedSeatsCount(showtime.Showtime_ID);
        const totalSeats = await getTotalSeatsCount(showtime.Cinema_Room_ID);
        
        baseResult.BookedSeats = bookedSeats;
        baseResult.TotalSeats = totalSeats;
        baseResult.AvailableSeats = totalSeats - bookedSeats;
        baseResult.SeatStatus = formatSeatInfo(bookedSeats, totalSeats);
        baseResult.IsSoldOut = bookedSeats >= totalSeats;
      } catch (error) {
        logger.error(`[mapToShowtimeDto] Lỗi khi lấy thông tin ghế:`, error);
        baseResult.BookedSeats = 0;
        baseResult.TotalSeats = 0;
        baseResult.AvailableSeats = 0;
        baseResult.SeatStatus = 'Không xác định';
        baseResult.IsSoldOut = false;
      }
    }

    return baseResult;
  }

  // Check if a movie date is between release date and premiere date
  async checkPremiereConflict(movieId, showDate) {
    const movie = await Movie.findOne({ where: { Movie_ID: movieId } });
    if (!movie) throw new Error(`Không tìm thấy phim có ID ${movieId}`);

    const releaseDate = new Date(movie.Release_Date);
    const premiereDate = movie.Premiere_Date ? new Date(movie.Premiere_Date) : null;
    const selectedDate = new Date(showDate);

    if (premiereDate && selectedDate < premiereDate && selectedDate >= releaseDate) {
      return { conflict: true, movie, releaseDate, premiereDate };
    }

    return { conflict: false, movie };
  }

  /**
   * Lấy tất cả các ngày có lịch chiếu của một phòng chiếu
   * @param {number} roomId - ID của phòng chiếu
   * @returns {Promise<Array>} - Mảng các ngày có lịch chiếu
   */
  async getShowtimeDatesByRoom(roomId) {
    try {
      // Kiểm tra phòng chiếu có tồn tại không
      const room = await CinemaRoom.findOne({ where: { Cinema_Room_ID: roomId } });
      if (!room) {
        throw new Error(`Không tìm thấy phòng chiếu có ID ${roomId}`);
      }

      const today = new Date().toISOString().split('T')[0];

      // Lấy danh sách các ngày có lịch chiếu
      const showtimes = await Showtime.findAll({
        where: {
          Cinema_Room_ID: roomId,
          Show_Date: { [Op.gte]: today },
          Status: 'Scheduled',
        },
        include: [{ model: Movie, as: 'Movie' }, { model: Ticket, as: 'Tickets' }],
        order: [['Show_Date', 'ASC'], ['Start_Time', 'ASC']],
      });

      // Gom nhóm các suất chiếu theo ngày
      const showtimesByDate = {};

      for (const showtime of showtimes) {
        // Xử lý Show_Date để loại bỏ phần thời gian
        let formattedDate = showtime.Show_Date;
        if (typeof formattedDate === 'string' && formattedDate.includes('T')) {
          formattedDate = formattedDate.split('T')[0];
        } else if (formattedDate instanceof Date) {
          formattedDate = formattedDate.toISOString().split('T')[0];
        }

        if (!showtimesByDate[formattedDate]) {
          showtimesByDate[formattedDate] = [];
        }

        // Tính số lượng đặt vé
        const bookingsCount = showtime.Tickets ?
          showtime.Tickets.filter(t => t.Status !== 'Cancelled' && t.Status !== 'Expired').length : 0;

        showtimesByDate[formattedDate].push({
          Showtime_ID: showtime.Showtime_ID,
          Start_Time: formatTime(showtime.Start_Time) ? formatTime(showtime.Start_Time).substring(0, 5) : null,
          End_Time: formatTime(showtime.End_Time) ? formatTime(showtime.End_Time).substring(0, 5) : null,
          Status: showtime.Status,
          Movie: {
            Movie_ID: showtime.Movie.Movie_ID,
            Movie_Name: showtime.Movie.Movie_Name,
            Duration: showtime.Movie.Duration,
            Poster_URL: showtime.Movie.Poster_URL,
          },
          Bookings_Count: bookingsCount
        });
      }

      // Tính các khoảng thời gian trống cho mỗi ngày
      const operatingHours = { Start: '09:00:00', End: '23:00:00' };
      const resultDates = [];

      // Xử lý từng ngày
      for (const date in showtimesByDate) {
        const dailyShowtimes = showtimesByDate[date];

        // Tính các khoảng trống
        const freeSlots = [];
        let currentTime = operatingHours.Start;

        // Sắp xếp suất chiếu theo thời gian bắt đầu
        dailyShowtimes.sort((a, b) => a.Start_Time.localeCompare(b.Start_Time));

        // Tính khoảng trống giữa các suất chiếu
        for (const showtime of dailyShowtimes) {
          if (showtime.Start_Time > currentTime) {
            freeSlots.push({
              Start_Time: currentTime,
              End_Time: showtime.Start_Time,
              Duration: (new Date(`1970-01-01T${showtime.Start_Time}`) - new Date(`1970-01-01T${currentTime}`)) / 60000,
            });
          }
          currentTime = showtime.End_Time;
        }

        // Thêm khoảng trống cuối cùng nếu còn
        if (currentTime < operatingHours.End) {
          freeSlots.push({
            Start_Time: currentTime,
            End_Time: operatingHours.End,
            Duration: (new Date(`1970-01-01T${operatingHours.End}`) - new Date(`1970-01-01T${currentTime}`)) / 60000,
          });
        }

        // Thêm thông tin ngày vào kết quả
        resultDates.push({
          date: date,
          showtimes_count: dailyShowtimes.length,
          showtimes: dailyShowtimes,
          available_slots: freeSlots
        });
      }

      // Sắp xếp các ngày theo thứ tự tăng dần
      resultDates.sort((a, b) => a.date.localeCompare(b.date));

      return {
        room_id: roomId,
        room_name: room.Room_Name,
        room_type: room.Room_Type,
        dates: resultDates
      };
    } catch (error) {
      logger.error('Error in getShowtimeDatesByRoom:', error);
      throw error;
    }
  }

  /**
   * Tìm giờ trống khả dụng cho xuất chiếu mới
   * @param {number} cinemaRoomId - ID phòng chiếu
   * @param {string} date - Ngày chiếu (YYYY-MM-DD)
   * @param {number} durationMinutes - Thời lượng phim + cleanup (phút)
   * @returns {Promise<Array>} - Danh sách khung giờ trống
   */
  async findAvailableTimeSlots(cinemaRoomId, date, durationMinutes) {
    try {
      // Lấy tất cả suất chiếu hiện có trong ngày
      const existingShowtimes = await Showtime.findAll({
        where: {
          Cinema_Room_ID: cinemaRoomId,
          Show_Date: date,
          Status: { [Op.ne]: 'Hidden' }
        },
        order: [['Start_Time', 'ASC']],
        raw: true
      });

      const operatingHours = {
        start: '09:00:00',
        end: '23:00:00'
      };

      // Chuyển đổi thời gian thành phút để dễ tính toán
      const startMinutes = getMinutesFromTimeString(operatingHours.start);
      const endMinutes = getMinutesFromTimeString(operatingHours.end);
      const bufferTime = 15; // 15 phút buffer giữa các suất chiếu

      // Tạo danh sách các khoảng thời gian đã bị chiếm
      const occupiedSlots = existingShowtimes.map(showtime => ({
        start: getMinutesFromTimeString(String(showtime.Start_Time)),
        end: getMinutesFromTimeString(String(showtime.End_Time))
      })).sort((a, b) => a.start - b.start);

      // Tìm các khoảng trống
      const availableSlots = [];
      let currentTime = startMinutes;

      // Kiểm tra khoảng trống trước suất chiếu đầu tiên
      if (occupiedSlots.length === 0) {
        // Nếu không có suất chiếu nào, toàn bộ ngày đều trống
        const maxSlots = Math.floor((endMinutes - startMinutes) / (durationMinutes + bufferTime));
        for (let i = 0; i < maxSlots; i++) {
          const slotStart = startMinutes + i * (durationMinutes + bufferTime);
          const slotEnd = slotStart + durationMinutes;
          
          if (slotEnd <= endMinutes) {
            availableSlots.push({
              start_time: this.minutesToTimeString(slotStart),
              end_time: this.minutesToTimeString(slotEnd),
              duration: durationMinutes
            });
          }
        }
      } else {
        // Kiểm tra khoảng trống giữa các suất chiếu
        for (const slot of occupiedSlots) {
          // Khoảng trống trước suất chiếu hiện tại
          const availableTime = slot.start - currentTime;
          
          if (availableTime >= durationMinutes + bufferTime) {
            // Có thể fit nhiều suất chiếu trong khoảng trống này
            const possibleSlots = Math.floor(availableTime / (durationMinutes + bufferTime));
            
            for (let i = 0; i < possibleSlots; i++) {
              const slotStart = currentTime + i * (durationMinutes + bufferTime);
              const slotEnd = slotStart + durationMinutes;
              
              if (slotEnd + bufferTime <= slot.start) {
                availableSlots.push({
                  start_time: this.minutesToTimeString(slotStart),
                  end_time: this.minutesToTimeString(slotEnd),
                  duration: durationMinutes
                });
              }
            }
          }
          
          currentTime = Math.max(currentTime, slot.end + bufferTime);
        }

        // Kiểm tra khoảng trống sau suất chiếu cuối cùng
        const remainingTime = endMinutes - currentTime;
        if (remainingTime >= durationMinutes) {
          const possibleSlots = Math.floor(remainingTime / (durationMinutes + bufferTime));
          
          for (let i = 0; i < possibleSlots; i++) {
            const slotStart = currentTime + i * (durationMinutes + bufferTime);
            const slotEnd = slotStart + durationMinutes;
            
            if (slotEnd <= endMinutes) {
              availableSlots.push({
                start_time: this.minutesToTimeString(slotStart),
                end_time: this.minutesToTimeString(slotEnd),
                duration: durationMinutes
              });
            }
          }
        }
      }

      logger.info(`[findAvailableTimeSlots] Tìm thấy ${availableSlots.length} khung giờ trống cho phòng ${cinemaRoomId} ngày ${date}`);
      return availableSlots;

    } catch (error) {
      logger.error(`[findAvailableTimeSlots] Lỗi khi tìm giờ trống:`, error);
      return [];
    }
  }

  /**
   * Chuyển đổi số phút thành chuỗi thời gian HH:MM
   * @param {number} minutes - Số phút từ 00:00
   * @returns {string} - Chuỗi thời gian HH:MM
   */
  minutesToTimeString(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  /**
   * Lấy danh sách xuất chiếu thuộc rạp của manager
   * @param {number} userId - ID của manager
   * @returns {Promise<Array>} - Danh sách xuất chiếu
   */
  async getShowtimesByManagerCinema(userId) {
    try {
      logger.info(`[getShowtimesByManagerCinema] Lấy danh sách xuất chiếu cho manager ID: ${userId}`);
      
      // Lấy thông tin rạp mà manager quản lý
      const manager = await sequelize.models.User.findOne({
        where: { User_ID: userId, Role: 'Manager' },
        include: [{
          model: sequelize.models.Cinema,
          as: 'ManagedCinema',
          attributes: ['Cinema_ID', 'Cinema_Name', 'Address', 'Phone_Number', 'Email']
        }],
        attributes: ['User_ID', 'Role', 'Cinema_ID', 'Full_Name']
      });

      if (!manager || !manager.ManagedCinema) {
        throw new Error('Không tìm thấy thông tin rạp bạn quản lý');
      }

      const cinemaId = manager.ManagedCinema.Cinema_ID;
      logger.info(`[getShowtimesByManagerCinema] Manager ${userId} quản lý rạp ID: ${cinemaId}`);

      // Lấy danh sách staff và manager của cinema
      const cinemaStaff = await sequelize.models.User.findAll({
        where: {
          Cinema_ID: cinemaId,
          Role: { [Op.in]: ['Manager', 'Staff'] },
          Account_Status: 'Active'
        },
        attributes: ['User_ID', 'Full_Name', 'Email', 'Phone_Number', 'Role'],
        order: [['Role', 'ASC'], ['Full_Name', 'ASC']]
      });

      // Lấy các phòng chiếu thuộc rạp
      const cinemaRooms = await CinemaRoom.findAll({
        where: { Cinema_ID: cinemaId },
        attributes: ['Cinema_Room_ID']
      });

      const cinemaRoomIds = cinemaRooms.map(room => room.Cinema_Room_ID);
      
      if (cinemaRoomIds.length === 0) {
        logger.warn(`[getShowtimesByManagerCinema] Rạp ${cinemaId} không có phòng chiếu nào`);
        return {
          cinema: {
            ...manager.ManagedCinema.toJSON(),
            staff: cinemaStaff.map(staff => ({
              User_ID: staff.User_ID,
              Full_Name: staff.Full_Name,
              Email: staff.Email,
              Phone_Number: staff.Phone_Number,
              Role: staff.Role
            }))
          },
          total: 0,
          showtimes: []
        };
      }

      // Chỉ lấy các xuất chiếu có trạng thái không phải Hidden 
      // và thuộc các phòng trong rạp của manager
      const showtimes = await Showtime.findAll({
        where: {
          Cinema_Room_ID: { [Op.in]: cinemaRoomIds },
          Status: { [Op.ne]: 'Hidden' }
        },
        include: [
          {
            model: Movie,
            as: 'Movie',
            attributes: ['Movie_ID', 'Movie_Name', 'Duration', 'Rating', 'Poster_URL']
          },
          {
            model: CinemaRoom,
            as: 'CinemaRoom',
            attributes: ['Cinema_Room_ID', 'Room_Name', 'Room_Type']
          }
        ],
        order: [['Show_Date', 'DESC'], ['Start_Time', 'ASC']]
      });

      // Lấy thông tin ghế cho tất cả các xuất chiếu
      const showtimeIds = showtimes.map(s => s.Showtime_ID);
      const cinemaRoomIdsInResults = [...new Set(showtimes.map(s => s.Cinema_Room_ID))];
      const { bookedSeatsMap, totalSeatsMap } = await getBulkSeatCounts(showtimeIds, cinemaRoomIdsInResults);

      // Format kết quả
      const formattedShowtimes = await Promise.all(showtimes.map(async (showtime) => {
        const bookedSeats = bookedSeatsMap.get(showtime.Showtime_ID) || 0;
        const totalSeats = totalSeatsMap.get(showtime.Cinema_Room_ID) || 0;

        return {
          Showtime_ID: showtime.Showtime_ID,
          Movie_ID: showtime.Movie_ID,
          Cinema_Room_ID: showtime.Cinema_Room_ID,
          Show_Date: showtime.Show_Date instanceof Date 
            ? showtime.Show_Date.toISOString().split('T')[0] 
            : String(showtime.Show_Date).split('T')[0],
          Start_Time: formatTime(showtime.Start_Time) ? formatTime(showtime.Start_Time).substring(0, 5) : null,
          End_Time: formatTime(showtime.End_Time) ? formatTime(showtime.End_Time).substring(0, 5) : null,
          Status: showtime.Status,
          BookedSeats: bookedSeats,
          TotalSeats: totalSeats,
          AvailableSeats: totalSeats - bookedSeats,
          SeatStatus: formatSeatInfo(bookedSeats, totalSeats),
          IsSoldOut: bookedSeats >= totalSeats,
          Movie: {
            Movie_ID: showtime.Movie.Movie_ID,
            Movie_Name: showtime.Movie.Movie_Name,
            Duration: showtime.Movie.Duration,
            Rating: showtime.Movie.Rating,
            Poster_URL: showtime.Movie.Poster_URL
          },
          Room: {
            Cinema_Room_ID: showtime.CinemaRoom.Cinema_Room_ID,
            Room_Name: showtime.CinemaRoom.Room_Name,
            Room_Type: showtime.CinemaRoom.Room_Type
          }
        };
      }));

      return {
        cinema: {
          ...manager.ManagedCinema.toJSON(),
          staff: cinemaStaff.map(staff => ({
            User_ID: staff.User_ID,
            Full_Name: staff.Full_Name,
            Email: staff.Email,
            Phone_Number: staff.Phone_Number,
            Role: staff.Role
          }))
        },
        total: formattedShowtimes.length,
        showtimes: formattedShowtimes
      };
    } catch (error) {
      logger.error(`[getShowtimesByManagerCinema] Lỗi khi lấy danh sách xuất chiếu: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new ShowtimeService();