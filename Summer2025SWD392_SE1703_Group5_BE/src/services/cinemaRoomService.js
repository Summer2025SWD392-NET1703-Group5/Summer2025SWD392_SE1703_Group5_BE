const { Op } = require('sequelize');
const { CinemaRoom, Showtime, SeatLayout, Seat, Movie } = require('../models');

// Helper: Build RoomDTO object
function buildRoomDTO(room, hasUpcomingShowtimes = false) {
    return {
        Cinema_Room_ID: room.Cinema_Room_ID,
        Room_Name: room.Room_Name || 'Unknown Room',
        Room_Type: room.Room_Type || '2D',
        Seat_Quantity: room.Seat_Quantity,
        Status: room.Status || 'Active',
        Notes: room.Notes || '',
        HasUpcomingShowtimes: hasUpcomingShowtimes
    };
}

const cinemaRoomService = {
    async getAllCinemaRooms(filter) {
        let where = {};
        if (filter) {
            where = {
                [Op.or]: [
                    { Room_Name: { [Op.iLike]: `%${filter}%` } },
                    { Room_Type: { [Op.iLike]: `%${filter}%` } },
                    { Status: { [Op.iLike]: `%${filter}%` } }
                ]
            };
        }

        const rooms = await CinemaRoom.findAll({
            where,
            order: [['Room_Name', 'ASC']]
        });

        // Check hasUpcomingShowtimes for each room
        const today = new Date();
        return await Promise.all(rooms.map(async room => {
            const hasUpcomingShowtimes = await Showtime.count({
                where: {
                    Cinema_Room_ID: room.Cinema_Room_ID,
                    Show_Date: { [Op.gte]: today }
                }
            }) > 0;
            return buildRoomDTO(room, hasUpcomingShowtimes);
        }));
    },

    async getCinemaRoom(id) {
        const room = await CinemaRoom.findByPk(id, {
            include: [{ model: SeatLayout }]
        });
        if (!room) return null;

        const hasSeats = await SeatLayout.count({ where: { Cinema_Room_ID: id } }) > 0;
        const today = new Date();
        // Upcoming showtimes
        const upcomingShowtimes = await Showtime.findAll({
            where: {
                Cinema_Room_ID: id,
                Show_Date: { [Op.gte]: today }
            },
            include: [{ model: Movie, as: 'Movie' }],
            order: [['Show_Date', 'ASC'], ['Start_Time', 'ASC']]
        });

        // Showtimes DTO
        const upcomingShowtimesDTO = upcomingShowtimes.map(s => ({
            Showtime_ID: s.Showtime_ID,
            Show_Date: s.Show_Date,
            Start_Time: s.Start_Time,
            End_Time: s.End_Time,
            Movie_Name: s.Movie.Movie_Name
        }));

        // Seat type counts
        const seatCounts = await SeatLayout.findAll({
            where: { Cinema_Room_ID: id },
            attributes: ['Seat_Type', [SeatLayout.sequelize.fn('COUNT', SeatLayout.sequelize.col('Seat_Type')), 'Count']],
            group: ['Seat_Type']
        });

        const capacity = await Seat.count({
            include: [{
                model: SeatLayout,
                as: 'SeatLayout',
                where: { Cinema_Room_ID: id }
            }]
        });

        const nowShowingMovies = await cinemaRoomService.getMoviesByRoomId(id);

        return {
            Cinema_Room_ID: room.Cinema_Room_ID,
            Room_Name: room.Room_Name,
            Room_Type: room.Room_Type,
            NowShowingMovies: nowShowingMovies,
            Seat_Quantity: room.Seat_Quantity,
            Status: room.Status,
            Notes: room.Notes,
            HasSeats: hasSeats,
            SeatTypes: seatCounts,
            UpcomingShowtimes: upcomingShowtimesDTO,
            CanDelete: upcomingShowtimes.length === 0
        };
    },

    async createCinemaRoom(data) {
        // Validate required fields
        if (!data.RoomName) {
            throw new Error('Room name is required');
        }

        if (!data.Capacity || data.Capacity <= 0) {
            throw new Error('Valid capacity is required');
        }

        // Kiểm tra Cinema_ID đã được cung cấp chưa
        if (!data.Cinema_ID) {
            throw new Error('Cinema_ID is required');
        }

        // Check duplicate name (map RoomName to Room_Name for database query)
        const existing = await CinemaRoom.findOne({
            where: { Room_Name: data.RoomName }
        });

        if (existing) {
            throw new Error(`Phòng chiếu với tên '${data.RoomName}' đã tồn tại`);
        }

        // Create room with proper field mapping
        const room = await CinemaRoom.create({
            Room_Name: data.RoomName,        // Map RoomName -> Room_Name
            Room_Type: data.RoomType || '2D', // Default to 2D if not provided
            Seat_Quantity: data.Capacity,    // Map Capacity -> Seat_Quantity
            Status: data.Status || 'Active',
            Notes: data.Description || '',   // Map Description -> Notes
            Cinema_ID: data.Cinema_ID        // Sử dụng Cinema_ID được cung cấp
        });

        return buildRoomDTO(room, false);
    },
}

module.exports = cinemaRoomService;