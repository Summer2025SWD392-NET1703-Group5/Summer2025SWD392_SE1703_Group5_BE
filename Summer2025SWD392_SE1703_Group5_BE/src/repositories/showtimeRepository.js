const { Op } = require('sequelize');
const { Showtime, Movie, CinemaRoom, TicketBooking, Seat, SeatLayout, Payment, PromotionUsage, BookingHistory, sequelize } = require('../models');


class ShowtimeRepository {
    async getAll() {
        return await Showtime.findAll({
            include: [
                { model: Movie, as: 'Movie' },
                { model: CinemaRoom, as: 'CinemaRoom' }
            ],
        });
    }


    async getAllByStatus(status) {
        return await Showtime.findAll({
            where: { Status: status },
            include: [
                { model: Movie, as: 'Movie' },
                { model: CinemaRoom, as: 'CinemaRoom' }
            ],
        });
    }


    async getAllActive() {
        return await Showtime.findAll({
            where: {
                Status: { [Op.notIn]: ['Hidden', 'Deleted'] },
            },
            include: [
                { model: Movie, as: 'Movie' },
                { model: CinemaRoom, as: 'CinemaRoom' }
            ],
        });
    }


    async create(showtime) {
        const created = await Showtime.create(showtime);
        return created.Showtime_ID;
    }


    async getById(id) {
        return await Showtime.findOne({
            where: { Showtime_ID: id },
            include: [{ model: CinemaRoom, as: 'CinemaRoom' }],
        });
    }
}
module.exports = new ShowtimeRepository();



