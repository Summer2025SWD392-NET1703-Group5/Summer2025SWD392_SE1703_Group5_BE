// File: controllers/cinemaRoomController.js
const cinemaRoomService = require('../services/cinemaRoomService');

exports.getAllCinemaRooms = async (req, res) => {
    try {
        const { filter } = req.query;
        const rooms = await cinemaRoomService.getAllCinemaRooms(filter);
        res.status(200).json(rooms);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Có lỗi xảy ra khi lấy danh sách phòng chiếu' });
    }
};

exports.getCinemaRoom = async (req, res) => {
    try {
        const id = req.params.id;
        const room = await cinemaRoomService.getCinemaRoom(id);
        if (!room) return res.status(404).json({ message: 'Không tìm thấy phòng chiếu' });
        res.json(room);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Có lỗi xảy ra khi lấy thông tin chi tiết phòng chiếu' });
    }
};