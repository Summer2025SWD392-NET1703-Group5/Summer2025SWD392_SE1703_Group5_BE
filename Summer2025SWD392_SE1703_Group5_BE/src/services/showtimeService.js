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
}
module.exports = new ShowtimeService();

