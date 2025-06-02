const ShowtimeRepository = require('../repositories/ShowtimeRepository');
//const SeatService = require('./seatService');
const logger = require('../utils/logger'); // Giả định logger
const { Op } = require('sequelize');
const { Showtime, Movie, CinemaRoom, TicketBooking, Seat, SeatLayout, sequelize } = require('../models');


// Helper function to format time strings
const formatTime = (timeString) => {
  if (timeString && typeof timeString === 'string' && timeString.includes('T')) {
    // Extracts HH:mm:ss from 'YYYY-MM-DDTHH:mm:ss.sssZ'
    return timeString.substring(11, 19);
  }
  // If it's already in 'HH:mm:ss' format or null/undefined, return as is
  return timeString;
};


class ShowtimeService {
  async getAllShowtimes() {
    const showtimes = await ShowtimeRepository.getAll();
    return showtimes.map(s => this.mapToShowtimeDto(s));
  }


  async getShowtimeById(id) {
    const showtime = await ShowtimeRepository.getById(id);
    if (!showtime) return null;
    return this.mapToShowtimeDto(showtime);
  }


  async createShowtime(model, userId, transaction = null) {
    if (!model) throw new Error('Dữ liệu không hợp lệ');


    const movie = await Movie.findOne({ where: { Movie_ID: model.Movie_ID } });
    if (!movie) throw new Error(`Không tìm thấy phim có ID ${model.Movie_ID}`);


    const cinemaRoom = await CinemaRoom.findOne({ where: { Cinema_Room_ID: model.Cinema_Room_ID } });
    if (!cinemaRoom) throw new Error(`Không tìm thấy phòng chiếu có ID ${model.Cinema_Room_ID}`);


    if (cinemaRoom.Status !== 'Active') throw new Error('Phòng chiếu không hoạt động');


    const now = new Date();
    const showDateTime = new Date(`${model.Show_Date}T${model.Start_Time}`);
    if (showDateTime < now) throw new Error('Không thể tạo xuất chiếu trong quá khứ');


    const duration = movie.Duration + 15;
    const endTime = new Date(showDateTime.getTime() + duration * 60000).toTimeString().split(' ')[0];
    const closingTime = '23:59:59';
    if (endTime > closingTime) throw new Error(`Không thể tạo xuất chiếu kết thúc sau ${closingTime}`);


    const existingShowtime = await Showtime.findOne({
      where: {
        Movie_ID: model.Movie_ID,
        Cinema_Room_ID: model.Cinema_Room_ID,
        Show_Date: model.Show_Date,
        Start_Time: model.Start_Time,
        Status: { [Op.ne]: 'Hidden' },
      },
    });
    if (existingShowtime) throw new Error('Xuất chiếu đã tồn tại');


    const conflictingShowtimes = await Showtime.findAll({
      where: {
        Cinema_Room_ID: model.Cinema_Room_ID,
        Show_Date: model.Show_Date,
        Status: { [Op.ne]: 'Hidden' },
        [Op.or]: [
          {
            Start_Time: { [Op.lt]: endTime },
            End_Time: { [Op.gt]: model.Start_Time },
          },
        ],
      },
    });
    if (conflictingShowtimes.length) throw new Error('Suất chiếu bị trùng lịch');


    const seatLayoutCount = await SeatLayout.count({ where: { Cinema_Room_ID: model.Cinema_Room_ID, Is_Active: true } });
    if (seatLayoutCount === 0) throw new Error('Phòng chiếu chưa được cấu hình ghế');


    const showtime = {
      Movie_ID: model.Movie_ID,
      Cinema_Room_ID: model.Cinema_Room_ID,
      Show_Date: model.Show_Date,
      Start_Time: model.Start_Time,
      End_Time: endTime,
      Status: 'Scheduled',
      Capacity_Available: seatLayoutCount,
      Created_By: userId,
      Created_At: sequelize.fn('GETDATE'),
      Updated_At: sequelize.fn('GETDATE'),
    };


    const transactionOption = transaction ? { transaction } : {};
    const newShowtime = await Showtime.create(showtime, transactionOption);


    if (movie.Status === 'Coming Soon' && new Date(model.Show_Date) <= new Date()) {
      movie.Status = 'Now Showing';
      await movie.save(transactionOption);
    }


    // Fetch the showtime with CinemaRoom information
    const completeShowtime = await Showtime.findByPk(newShowtime.Showtime_ID, {
      include: [{ model: CinemaRoom, as: 'CinemaRoom' }]
    });


    return this.mapToShowtimeDto(completeShowtime);
  } 
  async updateShowtime(id, showtimeDto, updatedBy) {
    const showtimeInstance = await ShowtimeRepository.getById(id);
    if (!showtimeInstance) {
      const error = new Error(`Không tìm thấy lịch chiếu với ID ${id}`);
      error.statusCode = 404;
      throw error;
    }


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
    const showDateTime = new Date(`${showtimeDto.Show_Date}T${showtimeDto.Start_Time}`);


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
      if (showDateStr === showtimeDto.Show_Date && showtimeDto.Start_Time < now.toTimeString().split(' ')[0]) {
        throw new Error('Không thể cập nhật xuất chiếu vào thời điểm trong quá khứ');
      } else if (showDateStr !== showtimeDto.Show_Date) {
        throw new Error('Không thể cập nhật xuất chiếu vào thời điểm trong quá khứ');
      }
    }


    const duration = movie.Duration + 15;
    const endTime = new Date(showDateTime.getTime() + duration * 60000).toTimeString().split(' ')[0];
    const closingTime = '23:59:59';
    if (endTime > closingTime) throw new Error(`Không thể cập nhật xuất chiếu kết thúc sau ${closingTime}`);


    const isRoomAvailable = await this.isShowtimeAvailable(
      showtimeDto.Cinema_Room_ID || showtimeInstance.Cinema_Room_ID,
      showtimeDto.Show_Date || showDateStr,
      showtimeDto.Start_Time || showtimeInstance.Start_Time,
      endTime,
      id
    );
    if (!isRoomAvailable) throw new Error('Thời gian chiếu trùng với lịch khác');


    const updateData = {};
    if (showtimeDto.Movie_ID !== undefined) updateData.Movie_ID = showtimeDto.Movie_ID;
    if (showtimeDto.Cinema_Room_ID !== undefined) updateData.Cinema_Room_ID = showtimeDto.Cinema_Room_ID;
    if (showtimeDto.Show_Date !== undefined) updateData.Show_Date = showtimeDto.Show_Date;
    if (showtimeDto.Start_Time !== undefined) updateData.Start_Time = showtimeDto.Start_Time;
    updateData.End_Time = endTime;
    if (showtimeDto.Status !== undefined) {
      // Thêm validation cho Status
      const validStatuses = ['Scheduled', 'Cancelled', 'Hidden'];
      if (!validStatuses.includes(showtimeDto.Status)) {
        throw new Error(`Status không hợp lệ. Status phải là một trong: ${validStatuses.join(', ')}`);
      }
      updateData.Status = showtimeDto.Status;
    }


    updateData.Updated_At = sequelize.fn('GETDATE');


    const updated = await ShowtimeRepository.update(id, updateData);
    if (!updated) {
      throw new Error('Cập nhật lịch chiếu thất bại trong repository');
    }
    return this.mapToShowtimeDto(await ShowtimeRepository.getById(id));
  }


  async hideShowtime(id, userId) {
    let transaction = null;
    try {
      // Sử dụng trực tiếp model Showtime thay vì ShowtimeRepository
      const showtime = await Showtime.findByPk(id, {
        include: [{ model: TicketBooking, as: 'TicketBookings' }]
      });


      if (!showtime) {
        return false;
      }


      // Kiểm tra các đơn đặt vé đang chờ
      const pendingBookings = showtime.TicketBookings ?
        showtime.TicketBookings.filter(booking => booking.Status === 'Pending') :
        await TicketBooking.findAll({
          where: { Showtime_ID: id, Status: 'Pending' },
        });


      if (pendingBookings.length > 0) {
        throw new Error(`Có ${pendingBookings.length} đơn đặt vé đang chờ`);
      }


      // Chỉ bắt đầu transaction khi cần thiết
      transaction = await sequelize.transaction();


      // Cập nhật trạng thái showtime - Sửa lỗi định dạng ngày tháng
      showtime.Status = 'Hidden';
      // Sử dụng sequelize.fn thay vì đối tượng Date trực tiếp
      showtime.Updated_At = sequelize.fn('GETDATE');
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

}
module.exports = new ShowtimeService();

