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

exports.getMoviesByRoom = async (req, res) => {
    try {
        const id = req.params.id;
        const movies = await cinemaRoomService.getMoviesByRoomId(id);
        res.json(movies);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Có lỗi xảy ra khi lấy danh sách phim theo phòng chiếu' });
    }
};

exports.createCinemaRoom = async (req, res) => {
    try {
        const model = req.body;

        // Validate required fields
        if (!model || !model.RoomName) {
            return res.status(400).json({ message: 'Room name is required' });
        }

        if (!model.Capacity || model.Capacity <= 0) {
            return res.status(400).json({ message: 'Valid capacity is required' });
        }

        // Kiểm tra user là Manager và tự động thêm Cinema_ID
        if (req.user) {
            console.log(`[createCinemaRoom] User data from token:`, JSON.stringify(req.user));

            // Kiểm tra cả hai trường hợp: req.user.role và req.user.Role
            const userRole = req.user.role || req.user.Role;
            const userId = req.user.id || req.user.userId || req.user.User_ID;

            console.log(`[createCinemaRoom] Detected role: ${userRole}, User ID: ${userId}`);

            // Nếu user là Manager, lấy cinema ID từ thông tin user
            if (userRole === 'Manager') {
                console.log(`[createCinemaRoom] Manager ${userId} đang tạo phòng chiếu, tự động lấy Cinema_ID từ tài khoản`);

                try {
                    // Kiểm tra thông tin Manager trực tiếp từ database
                    const { User } = require('../models');
                    const manager = await User.findByPk(userId);

                    if (!manager) {
                        console.error(`[createCinemaRoom] Không tìm thấy Manager với ID: ${userId}`);
                        return res.status(404).json({
                            message: 'Không tìm thấy thông tin Manager'
                        });
                    }

                    console.log(`[createCinemaRoom] Thông tin Manager:`, {
                        id: manager.User_ID,
                        email: manager.Email,
                        role: manager.Role,
                        cinemaId: manager.Cinema_ID
                    });

                    if (!manager.Cinema_ID) {
                        console.error(`[createCinemaRoom] Manager ${userId} chưa được phân công rạp phim`);
                        return res.status(403).json({
                            message: 'Bạn chưa được phân công quản lý rạp phim nào'
                        });
                    }

                    // Thêm Cinema_ID vào model
                    model.Cinema_ID = manager.Cinema_ID;
                    console.log(`[createCinemaRoom] Tự động thêm Cinema_ID: ${manager.Cinema_ID} vào model`);
                } catch (error) {
                    console.error(`[createCinemaRoom] Lỗi khi truy vấn thông tin Manager:`, error);
                    return res.status(500).json({
                        message: 'Đã xảy ra lỗi khi xác thực thông tin Manager'
                    });
                }
            }
        }

        console.log(`[createCinemaRoom] Creating cinema room with data:`, model);
        const room = await cinemaRoomService.createCinemaRoom(model);
        res.status(201).json(room);
    } catch (err) {
        console.error(`[createCinemaRoom] Error:`, err);
        if (err instanceof Error && err.message) {
            // Check if the error message contains a suggested room name
            if (err.message.includes('đã tồn tại trong rạp này. Bạn có thể sử dụng tên')) {
                return res.status(400).json({
                    message: err.message,
                    type: 'DUPLICATE_NAME_WITH_SUGGESTION'
                });
            }
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: 'Có lỗi xảy ra khi tạo phòng chiếu mới' });
    }
};

exports.updateCinemaRoom = async (req, res) => {
    try {
        const id = req.params.id;
        const model = req.body;
        if (!model) return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
        const room = await cinemaRoomService.updateCinemaRoom(id, model);
        res.json(room);
    } catch (err) {
        if (err instanceof Error && err.message) {
            // Check if the error message contains a suggested room name
            if (err.message.includes('đã tồn tại trong rạp này. Bạn có thể sử dụng tên')) {
                return res.status(400).json({
                    message: err.message,
                    type: 'DUPLICATE_NAME_WITH_SUGGESTION'
                });
            }
            if (err.message.includes('không tồn tại')) return res.status(404).json({ message: err.message });
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: 'Có lỗi xảy ra khi cập nhật phòng chiếu' });
    }
};

exports.deleteCinemaRoom = async (req, res) => {
    try {
        const id = req.params.id;
        const result = await cinemaRoomService.deleteCinemaRoom(id);
        res.json(result);
    } catch (err) {
        if (err instanceof Error && err.message) {
            if (err.message.includes('không tồn tại')) return res.status(404).json({ message: err.message });
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: 'Có lỗi xảy ra khi xóa phòng chiếu' });
    }
};

exports.checkCinemaRoomStatus = async (req, res) => {
    try {
        const id = req.params.id;
        const result = await cinemaRoomService.checkCinemaRoomStatus(id);
        res.json(result);
    } catch (err) {
        if (err instanceof Error && err.message && err.message.includes('không tồn tại')) {
            return res.status(404).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: 'Có lỗi xảy ra khi kiểm tra tình trạng phòng chiếu' });
    }
};

exports.deactivateCinemaRoom = async (req, res) => {
    try {
        const id = req.params.id;
        const result = await cinemaRoomService.deactivateCinemaRoom(id);
        res.json(result);
    } catch (err) {
        if (err instanceof Error && err.message) {
            if (err.message.includes('không tồn tại')) return res.status(404).json({ message: err.message });
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: 'Có lỗi xảy ra khi đánh dấu phòng chiếu không hoạt động' });
    }
};