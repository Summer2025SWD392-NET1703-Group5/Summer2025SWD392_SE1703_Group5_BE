const { Op } = require('sequelize');
const { CinemaRoom, Showtime, SeatLayout, Seat, Movie, Ticket, TicketBooking, sequelize } = require('../models');

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

// Helper: Suggest a new room name based on existing rooms in a cinema
async function suggestRoomName(cinemaId) {
    console.log(`[suggestRoomName] Bắt đầu đề xuất tên phòng mới cho rạp ID ${cinemaId}`);

    // Find all rooms in this cinema
    const allRoomsInCinema = await CinemaRoom.findAll({
        where: { Cinema_ID: cinemaId },
        attributes: ['Room_Name']
    });

    console.log(`[suggestRoomName] Tìm thấy ${allRoomsInCinema.length} phòng trong rạp ID ${cinemaId}`);

    // Extract room numbers from room names that follow the pattern "Phòng XX"
    const roomNumbers = [];
    // Cải thiện regex để bắt nhiều định dạng hơn: "Phòng XX", "phong XX", "Phòng  XX", v.v.
    const roomNameRegex = /ph[oò]ng\s*(\d+)/i;

    allRoomsInCinema.forEach(room => {
        // Chuẩn hóa tên phòng trước khi kiểm tra
        const normalizedRoomName = room.Room_Name.trim().toLowerCase();
        console.log(`[suggestRoomName] Kiểm tra tên phòng: '${room.Room_Name}' (chuẩn hóa: '${normalizedRoomName}')`);

        const match = normalizedRoomName.match(roomNameRegex);
        if (match && match[1]) {
            const roomNumber = parseInt(match[1], 10);
            roomNumbers.push(roomNumber);
            console.log(`[suggestRoomName] Tìm thấy số phòng: ${roomNumber}`);
        } else {
            console.log(`[suggestRoomName] Không tìm thấy số phòng trong tên '${normalizedRoomName}'`);
        }
    });

    // Find the next available room number
    let nextRoomNumber = 1;
    if (roomNumbers.length > 0) {
        // Sort room numbers and find the next available number
        roomNumbers.sort((a, b) => a - b);
        console.log(`[suggestRoomName] Danh sách số phòng đã sắp xếp: [${roomNumbers.join(', ')}]`);

        for (let i = 0; i < roomNumbers.length; i++) {
            if (roomNumbers[i] === nextRoomNumber) {
                console.log(`[suggestRoomName] Số ${nextRoomNumber} đã tồn tại, tăng lên`);
                nextRoomNumber++;
            } else if (roomNumbers[i] > nextRoomNumber) {
                console.log(`[suggestRoomName] Tìm thấy khoảng trống ở số ${nextRoomNumber}`);
                break;
            }
        }
    }

    // Return the suggested room name
    const suggestedName = `Phòng ${nextRoomNumber < 10 ? '0' + nextRoomNumber : nextRoomNumber}`;
    console.log(`[suggestRoomName] Đề xuất tên phòng mới: '${suggestedName}'`);
    return suggestedName;
}

// Helper: Check if room name exists in cinema (case-insensitive)
async function isRoomNameExistsInCinema(roomName, cinemaId, excludeRoomId = null) {
    console.log(`[isRoomNameExistsInCinema] Kiểm tra tên phòng '${roomName}' trong rạp ID ${cinemaId}${excludeRoomId ? `, loại trừ phòng ID ${excludeRoomId}` : ''}`);

    // Lấy tất cả phòng trong rạp
    const allRoomsInCinema = await CinemaRoom.findAll({
        where: { Cinema_ID: cinemaId },
        attributes: ['Cinema_Room_ID', 'Room_Name']
    });

    console.log(`[isRoomNameExistsInCinema] Tìm thấy ${allRoomsInCinema.length} phòng trong rạp ID ${cinemaId}`);

    // Chuẩn hóa tên phòng cần kiểm tra
    const normalizedNewName = roomName.trim().toLowerCase();
    console.log(`[isRoomNameExistsInCinema] Tên phòng sau khi chuẩn hóa: '${normalizedNewName}'`);

    // Kiểm tra trùng lặp
    for (const room of allRoomsInCinema) {
        // Bỏ qua phòng hiện tại nếu đang cập nhật
        if (excludeRoomId && room.Cinema_Room_ID === excludeRoomId) {
            console.log(`[isRoomNameExistsInCinema] Bỏ qua phòng ID ${room.Cinema_Room_ID} (phòng hiện tại)`);
            continue;
        }

        const normalizedExistingName = room.Room_Name.trim().toLowerCase();
        console.log(`[isRoomNameExistsInCinema] So sánh với phòng ID ${room.Cinema_Room_ID}, tên '${room.Room_Name}' (chuẩn hóa: '${normalizedExistingName}')`);

        if (normalizedExistingName === normalizedNewName) {
            console.log(`[isRoomNameExistsInCinema] TÌM THẤY TRÙNG LẶP: '${normalizedNewName}' = '${normalizedExistingName}'`);
            return true;
        }
    }

    console.log(`[isRoomNameExistsInCinema] Không tìm thấy trùng lặp cho tên '${normalizedNewName}'`);
    return false;
}

// Helper: Kiểm tra có bookings hoạt động trong phòng chiếu hay không
async function hasActiveBookingsInRoom(roomId) {
    console.log(`[hasActiveBookingsInRoom] Kiểm tra bookings hoạt động cho phòng ID ${roomId}`);
    
    const today = new Date();
    
    // Lấy tất cả upcoming showtimes trong phòng
    const upcomingShowtimes = await Showtime.findAll({
        where: {
            Cinema_Room_ID: roomId,
            Show_Date: { [Op.gte]: today },
            Status: { [Op.notIn]: ['Hidden', 'Cancelled'] }
        },
        attributes: ['Showtime_ID']
    });
    
    if (upcomingShowtimes.length === 0) {
        console.log(`[hasActiveBookingsInRoom] Không có upcoming showtimes, phòng an toàn để thao tác`);
        return { hasBookings: false, bookingsCount: 0, showtimesCount: 0 };
    }
    
    const showtimeIds = upcomingShowtimes.map(s => s.Showtime_ID);
    console.log(`[hasActiveBookingsInRoom] Tìm thấy ${showtimeIds.length} upcoming showtimes: [${showtimeIds.join(', ')}]`);
    
    // Kiểm tra bookings trong những showtimes này
    const activeBookings = await TicketBooking.count({
        where: {
            Showtime_ID: { [Op.in]: showtimeIds },
            Status: { [Op.in]: ['Pending', 'Confirmed'] } // Bookings đang chờ hoặc đã xác nhận
        }
    });
    
    // Kiểm tra thêm tickets đã được phát hành
    const activeTickets = await Ticket.count({
        where: {
            Showtime_ID: { [Op.in]: showtimeIds },
            Status: { [Op.notIn]: ['Cancelled', 'Expired', 'Used'] }
        }
    });
    
    const totalActiveBookings = activeBookings + activeTickets;
    
    console.log(`[hasActiveBookingsInRoom] Kết quả: ${activeBookings} bookings + ${activeTickets} tickets = ${totalActiveBookings} total`);
    
    return {
        hasBookings: totalActiveBookings > 0,
        bookingsCount: activeBookings,
        ticketsCount: activeTickets,
        totalCount: totalActiveBookings,
        showtimesCount: showtimeIds.length,
        showtimeIds: showtimeIds
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

    async getMoviesByRoomId(id) {
        const today = new Date();
        const showtimes = await Showtime.findAll({
            where: {
                Cinema_Room_ID: id,
                Show_Date: { [Op.gte]: today },
                Status: 'Scheduled'
            },
            include: [{ model: Movie, as: 'Movie' }]
        });
        const movies = [];
        const movieIds = new Set();
        showtimes.forEach(st => {
            if (!movieIds.has(st.Movie.Movie_ID)) {
                movies.push({
                    Movie_ID: st.Movie.Movie_ID,
                    Movie_Name: st.Movie.Movie_Name,
                    Genre: st.Movie.Genre,
                    Duration: st.Movie.Duration,
                    Rating: st.Movie.Rating,
                    Poster_URL: st.Movie.Poster_URL,
                    Synopsis: st.Movie.Synopsis
                });
                movieIds.add(st.Movie.Movie_ID);
            }
        });
        return movies;
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

        // Kiểm tra trùng lặp tên phòng trong cùng rạp
        const isDuplicate = await isRoomNameExistsInCinema(data.RoomName, data.Cinema_ID);

        if (isDuplicate) {
            // Đề xuất tên phòng mới
            const suggestedName = await suggestRoomName(data.Cinema_ID);
            throw new Error(`Phòng chiếu với tên '${data.RoomName}' đã tồn tại trong rạp này. Bạn có thể sử dụng tên '${suggestedName}' thay thế.`);
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

    async updateCinemaRoom(id, data) {
        console.log(`[updateCinemaRoom] Bắt đầu cập nhật phòng chiếu ID ${id}`, data);
        
        const room = await CinemaRoom.findByPk(id);
        if (!room) throw new Error(`Không tìm thấy phòng chiếu có ID ${id}`);
        
        console.log(`[updateCinemaRoom] Tìm thấy phòng: ${room.Room_Name}, Status hiện tại: ${room.Status}`);

        // ✅ SECURITY FIX: Kiểm tra active bookings cho tất cả thay đổi quan trọng
        const criticalFields = ['Room_Name', 'Capacity', 'Room_Type', 'Cinema_ID', 'Status'];
        const hasCriticalChanges = criticalFields.some(field => {
            const dataField = field === 'Room_Name' ? data.RoomName : data[field];
            return dataField !== undefined && dataField !== room[field];
        });

        if (hasCriticalChanges) {
            console.log(`[updateCinemaRoom] Phát hiện thay đổi thông tin quan trọng cho phòng ID ${id}, kiểm tra active bookings...`);

            const bookingStatus = await hasActiveBookingsInRoom(id);

            if (bookingStatus.hasBookings) {
                const errorMsg = `Không thể cập nhật thông tin phòng chiếu quan trọng vì có ${bookingStatus.totalCount} booking/vé đang hoạt động ` +
                               `(${bookingStatus.bookingsCount} bookings, ${bookingStatus.ticketsCount} tickets) ` +
                               `trong ${bookingStatus.showtimesCount} suất chiếu sắp tới. ` +
                               `Việc này sẽ ảnh hưởng đến khách hàng đã đặt vé. ` +
                               `Vui lòng chờ khách hàng hoàn thành hoặc hủy booking trước khi cập nhật.`;

                console.log(`[updateCinemaRoom] KHÔNG THỂ CẬP NHẬT: ${errorMsg}`);
                throw new Error(errorMsg);
            }

            console.log(`[updateCinemaRoom] An toàn để cập nhật - không có active bookings`);
        }

        // ✅ ENHANCED: Kiểm tra active bookings nếu đang thay đổi Status thành Inactive (giữ lại logic cũ để tương thích)
        if (data.Status && data.Status === 'Inactive' && room.Status !== 'Inactive') {
            console.log(`[updateCinemaRoom] Đang thay đổi Status từ '${room.Status}' thành 'Inactive' - kiểm tra bookings`);
            
            const bookingStatus = await hasActiveBookingsInRoom(id);
            
            if (bookingStatus.hasBookings) {
                const errorMsg = `Không thể thay đổi trạng thái phòng chiếu thành 'Không hoạt động' vì có ${bookingStatus.totalCount} booking/vé đang hoạt động ` +
                               `(${bookingStatus.bookingsCount} bookings, ${bookingStatus.ticketsCount} tickets) ` +
                               `trong ${bookingStatus.showtimesCount} suất chiếu sắp tới. ` +
                               `Việc này sẽ ảnh hưởng đến khách hàng đã đặt vé. ` +
                               `Vui lòng chờ khách hàng hoàn thành hoặc hủy booking trước khi thay đổi trạng thái.`;
                
                console.log(`[updateCinemaRoom] KHÔNG THỂ THAY ĐỔI STATUS: ${errorMsg}`);
                throw new Error(errorMsg);
            }
            
            console.log(`[updateCinemaRoom] An toàn để thay đổi Status thành Inactive - không có active bookings`);
        }

        // Check for duplicate room name if RoomName is provided and different
        if (data.RoomName && data.RoomName.trim().toLowerCase() !== room.Room_Name.trim().toLowerCase()) {
            console.log(`[updateCinemaRoom] Kiểm tra trùng lặp tên phòng: '${data.RoomName}'`);
            
            // Kiểm tra trùng lặp tên phòng trong cùng rạp
            const isDuplicate = await isRoomNameExistsInCinema(data.RoomName, room.Cinema_ID, id);

            if (isDuplicate) {
                // Đề xuất tên phòng mới
                const suggestedName = await suggestRoomName(room.Cinema_ID);
                throw new Error(`Phòng chiếu với tên '${data.RoomName}' đã tồn tại trong rạp này. Bạn có thể sử dụng tên '${suggestedName}' thay thế.`);
            }
            room.Room_Name = data.RoomName;
            console.log(`[updateCinemaRoom] Đã cập nhật tên phòng thành: '${data.RoomName}'`);
        }

        // Update fields if they are provided in the data object
        const changes = [];
        
        if (data.RoomType !== undefined && data.RoomType !== room.Room_Type) {
            changes.push(`Room_Type: '${room.Room_Type}' -> '${data.RoomType}'`);
            room.Room_Type = data.RoomType;
        }
        if (data.Capacity !== undefined && data.Capacity !== room.Seat_Quantity) {
            changes.push(`Seat_Quantity: ${room.Seat_Quantity} -> ${data.Capacity}`);
            room.Seat_Quantity = data.Capacity;
        }
        if (data.Status !== undefined && data.Status !== room.Status) {
            changes.push(`Status: '${room.Status}' -> '${data.Status}'`);
            room.Status = data.Status;
        }
        if (data.Description !== undefined && data.Description !== room.Notes) {
            changes.push(`Notes: '${room.Notes}' -> '${data.Description}'`);
            room.Notes = data.Description;
        }

        if (changes.length > 0) {
            console.log(`[updateCinemaRoom] Các thay đổi: ${changes.join(', ')}`);
        } else {
            console.log(`[updateCinemaRoom] Không có thay đổi nào được áp dụng`);
        }

        await room.save();

        const hasUpcomingShowtimes = await Showtime.count({
            where: {
                Cinema_Room_ID: id,
                Show_Date: { [Op.gte]: new Date() }
            }
        }) > 0;

        console.log(`[updateCinemaRoom] Cập nhật phòng ${room.Room_Name} thành công`);

        return buildRoomDTO(room, hasUpcomingShowtimes);
    },

    async deleteCinemaRoom(id) {
        console.log(`[deleteCinemaRoom] Bắt đầu xóa mềm phòng chiếu ID ${id}`);
        
        const room = await CinemaRoom.findByPk(id);
        if (!room) throw new Error(`Không tìm thấy phòng chiếu có ID ${id}`);
        
        console.log(`[deleteCinemaRoom] Tìm thấy phòng: ${room.Room_Name}, Status: ${room.Status}`);
        
        // ✅ ENHANCED: Kiểm tra active bookings trước khi xóa
        const bookingStatus = await hasActiveBookingsInRoom(id);
        
        if (bookingStatus.hasBookings) {
            const errorMsg = `Không thể xóa phòng chiếu vì có ${bookingStatus.totalCount} booking/vé đang hoạt động ` +
                           `(${bookingStatus.bookingsCount} bookings, ${bookingStatus.ticketsCount} tickets) ` +
                           `trong ${bookingStatus.showtimesCount} suất chiếu sắp tới. ` +
                           `Vui lòng chờ khách hàng hoàn thành hoặc hủy booking trước khi xóa phòng.`;
            
            console.log(`[deleteCinemaRoom] KHÔNG THỂ XÓA: ${errorMsg}`);
            throw new Error(errorMsg);
        }
        
        // Kiểm tra upcoming showtimes (giữ lại check này để double-check)
        const hasUpcoming = await Showtime.count({
            where: { 
                Cinema_Room_ID: id, 
                Show_Date: { [Op.gte]: new Date() },
                Status: { [Op.notIn]: ['Hidden', 'Cancelled'] }
            }
        }) > 0;
        
        if (hasUpcoming) {
            console.log(`[deleteCinemaRoom] Tìm thấy upcoming showtimes nhưng không có bookings`);
            throw new Error('Không thể xóa phòng chiếu vì còn có suất chiếu đã được lên lịch. Vui lòng hủy hoặc ẩn các suất chiếu trước.');
        }
        
        console.log(`[deleteCinemaRoom] An toàn để xóa mềm phòng - không có bookings và showtimes`);
        
        // Thực hiện xóa mềm
        room.Status = 'Inactive';
        await room.save();
        
        // Soft delete related seat layouts
        await SeatLayout.update({ Is_Active: false }, { where: { Cinema_Room_ID: id } });
        
        console.log(`[deleteCinemaRoom] Đã xóa mềm phòng ${room.Room_Name} thành công`);
        
        return { 
            message: 'Phòng chiếu đã được đánh dấu là đã xóa',
            Cinema_Room_ID: id,
            Room_Name: room.Room_Name,
            Previous_Status: 'Active',
            New_Status: 'Inactive'
        };
    },

    async checkCinemaRoomStatus(id) {
        const room = await CinemaRoom.findByPk(id);
        if (!room) throw new Error(`Không tìm thấy phòng chiếu có ID ${id}`);
        const today = new Date();

        const upcomingShowtimes = await Showtime.findAll({
            where: {
                Cinema_Room_ID: id,
                Show_Date: { [Op.gte]: today }
            },
            include: [{ model: Movie, as: 'Movie' }],
            order: [['Show_Date', 'ASC'], ['Start_Time', 'ASC']]
        });
        const upcomingShowtimesDTO = upcomingShowtimes.map(s => ({
            Showtime_ID: s.Showtime_ID,
            Show_Date: s.Show_Date,
            Start_Time: s.Start_Time,
            End_Time: s.End_Time,
            Movie_Name: s.Movie.Movie_Name
        }));

        const seatLayouts = await SeatLayout.findAll({
            where: { Cinema_Room_ID: id },
            attributes: ['Seat_Type', [SeatLayout.sequelize.fn('COUNT', SeatLayout.sequelize.col('Seat_Type')), 'Count']],
            group: ['Seat_Type']
        });

        return {
            Cinema_Room_ID: room.Cinema_Room_ID,
            Room_Name: room.Room_Name,
            Room_Type: room.Room_Type,
            Status: room.Status,
            IsBusy: upcomingShowtimes.length > 0,
            UpcomingShowtimes: upcomingShowtimesDTO,
            HasSeats: seatLayouts.length > 0,
            SeatConfiguration: seatLayouts,
            CanModify: upcomingShowtimes.length === 0
        };
    },

    async deactivateCinemaRoom(id) {
        console.log(`[deactivateCinemaRoom] Bắt đầu vô hiệu hóa phòng chiếu ID ${id}`);
        
        const room = await CinemaRoom.findByPk(id);
        if (!room) throw new Error(`Không tìm thấy phòng chiếu có ID ${id}`);
        
        console.log(`[deactivateCinemaRoom] Tìm thấy phòng: ${room.Room_Name}, Status hiện tại: ${room.Status}`);
        
        if (room.Status === 'Inactive') {
            throw new Error('Phòng chiếu đã ở trạng thái không hoạt động');
        }
        
        // ✅ ENHANCED: Kiểm tra active bookings trước khi vô hiệu hóa
        const bookingStatus = await hasActiveBookingsInRoom(id);
        
        if (bookingStatus.hasBookings) {
            const errorMsg = `Không thể vô hiệu hóa phòng chiếu vì có ${bookingStatus.totalCount} booking/vé đang hoạt động ` +
                           `(${bookingStatus.bookingsCount} bookings, ${bookingStatus.ticketsCount} tickets) ` +
                           `trong ${bookingStatus.showtimesCount} suất chiếu sắp tới. ` +
                           `Việc vô hiệu hóa phòng sẽ ảnh hưởng đến khách hàng đã đặt vé. ` +
                           `Vui lòng chờ khách hàng hoàn thành hoặc hủy booking trước khi vô hiệu hóa.`;
            
            console.log(`[deactivateCinemaRoom] KHÔNG THỂ VÔ HIỆU HÓA: ${errorMsg}`);
            throw new Error(errorMsg);
        }
        
        console.log(`[deactivateCinemaRoom] An toàn để vô hiệu hóa phòng - không có active bookings`);
        
        // Thực hiện vô hiệu hóa
        const previousStatus = room.Status;
        room.Status = 'Inactive';
        await room.save();
        
        console.log(`[deactivateCinemaRoom] Đã vô hiệu hóa phòng ${room.Room_Name} thành công: ${previousStatus} -> Inactive`);
        
        return {
            Cinema_Room_ID: room.Cinema_Room_ID,
            Room_Name: room.Room_Name,
            Previous_Status: previousStatus,
            Status: room.Status,
            message: 'Phòng chiếu đã được đánh dấu là không hoạt động thành công'
        };
    }
};

module.exports = cinemaRoomService;
