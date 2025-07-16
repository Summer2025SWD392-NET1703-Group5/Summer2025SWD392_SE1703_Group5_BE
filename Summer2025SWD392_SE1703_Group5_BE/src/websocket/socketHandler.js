// src/websocket/socketHandler.js
// WebSocket event handlers cho real-time seat selection

const seatSelectionService = require('../services/seatSelectionService');
const jwt = require('jsonwebtoken');

// Biến global để lưu trữ Socket.IO instance
let io;

/**
 * Middleware xác thực JWT cho WebSocket
 */
const authenticateSocket = (socket, next) => {
    try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            console.log('❌ WebSocket connection rejected: No token provided');
            return next(new Error('Authentication error: No token provided'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = {
            id: decoded.userId,
            role: decoded.role
        };
        console.log(`✅ WebSocket authenticated: User ${decoded.userId} (${decoded.role})`);
        next();
    } catch (error) {
        console.log('❌ WebSocket connection rejected: Invalid token');
        next(new Error('Authentication error: Invalid token'));
    }
};

/**
 * Đảm bảo showtimeId là số
 */
const ensureNumericShowtimeId = (showtimeId) => {
    if (!showtimeId) {
        console.warn('⚠️ showtimeId là null hoặc undefined');
        return null;
    }
    
    if (typeof showtimeId === 'object') {
        console.log('⚠️ showtimeId là object, chuyển đổi thành chuỗi');
        // Thử các thuộc tính phổ biến có thể chứa ID
        const possibleIds = [
            showtimeId.showtimeId, 
            showtimeId.id, 
            showtimeId.showtime_id, 
            showtimeId.Showtime_ID
        ];
        
        // Lấy giá trị đầu tiên không null/undefined
        for (const id of possibleIds) {
            if (id !== null && id !== undefined) {
                // Chuyển đổi thành số nếu có thể
                const numericId = Number(id);
                return isNaN(numericId) ? String(id) : numericId;
            }
        }
        
        // Nếu không tìm thấy ID hợp lệ, chuyển đổi toàn bộ object thành string
        return String(showtimeId);
    }
    
    // Chuyển đổi thành số nếu là chuỗi
    const numericId = Number(showtimeId);
    return isNaN(numericId) ? showtimeId : numericId;
};

/**
 * Khởi tạo WebSocket handlers
 */
const initSocketHandlers = (io) => {
    console.log('🔄 Đang khởi tạo WebSocket handlers...');

    // Áp dụng middleware xác thực cho tất cả connections
    io.use(authenticateSocket);

    // Khởi động cleanup timer cho expired seats
    try {
        seatSelectionService.startCleanupTimer(io);
        console.log('✅ Cleanup timer đã được khởi động thành công');
    } catch (error) {
        console.error('❌ Lỗi khi khởi động cleanup timer:', error);
    }

    io.on('connection', (socket) => {
        const userId = socket.user?.id;
        console.log(`🔌 User ${userId} connected (Socket: ${socket.id})`);

        // Xử lý khi client ngắt kết nối
        socket.on('disconnect', (reason) => {
            console.log(`🔌 User ${userId} disconnected (${reason})`);

            // 🔧 FIX: Delay release để tránh conflict với booking process
            // Nếu user đang trong quá trình booking, delay 3 giây để booking hoàn thành
            setTimeout(() => {
                console.log(`🔄 [DELAYED_RELEASE] Checking if should release seats for user ${userId} after disconnect`);

                // Giải phóng ghế đang chọn khi người dùng ngắt kết nối
                seatSelectionService.releaseUserSeats(userId, socket.id)
                    .then(releasedCount => {
                        console.log(`✅ Released ${releasedCount} seats for disconnected user ${userId}`);
                    })
                    .catch(error => {
                        console.error(`❌ Error releasing seats for user ${userId}:`, error);
                    });
            }, 3000); // Delay 3 giây
        });

        // Tham gia vào room của một suất chiếu
        socket.on('join-showtime', async (data) => {
            try {
                // Chuyển đổi showtimeId thành số
                const showtimeId = ensureNumericShowtimeId(data.showtimeId || data);
                
                if (!showtimeId) {
                    throw new Error('ID suất chiếu không hợp lệ');
                }
                
                console.log(`🔄 User ${userId} joining showtime ${showtimeId}`);
                
                // Rời khỏi tất cả rooms hiện tại
                Object.keys(socket.rooms).forEach(room => {
                    if (room !== socket.id) {
                        socket.leave(room);
                    }
                });

                // Tham gia vào room mới
                const roomName = `showtime-${showtimeId}`;
                socket.join(roomName);

                // 🔧 DEBUG: Kiểm tra room membership
                const roomClients = io.sockets.adapter.rooms.get(roomName);
                const clientCount = roomClients ? roomClients.size : 0;
                console.log(`✅ User ${userId} (Socket: ${socket.id}) joined ${roomName}`);
                console.log(`📊 Room ${roomName} hiện có ${clientCount} clients:`, roomClients ? Array.from(roomClients) : []);

                // 🔧 REMOVED: Auto-clear seats when joining room
                // This was causing cross-tab sync issues where joining a room would clear all user seats
                // Users should manually clear seats if needed

                // Gửi trạng thái ghế hiện tại
                try {
                    const seats = await seatSelectionService.getShowtimeSeats(showtimeId);

                    // Đảm bảo seats là một mảng
                    const validSeats = Array.isArray(seats) ? seats : [];

                    console.log(`📡 [JOIN_SHOWTIME] Sending ${validSeats.length} seats to user ${userId}`);

                    socket.emit('seats-state', validSeats);
                } catch (seatsError) {
                    console.error(`❌ Error getting seats for showtime ${showtimeId}:`, seatsError);
                    socket.emit('error', { message: `Không thể lấy thông tin ghế: ${seatsError.message}` });
                    socket.emit('seats-state', []); // Gửi mảng rỗng để client không bị lỗi
                }
            } catch (error) {
                console.error(`❌ Error handling join-showtime:`, error);
                socket.emit('error', { message: `Không thể tham gia suất chiếu: ${error.message}` });
            }
        });

        // Chọn ghế
        socket.on('select-seat', async (data) => {
            console.log(`🔧 [DEBUG] Backend nhận event select-seat:`, data);
            console.log(`🔧 [DEBUG] Socket ID: ${socket.id}, User ID: ${userId}`);
            console.log(`🔧 [DEBUG] data.seatId type: ${typeof data.seatId}, value: "${data.seatId}"`);
            try {
                let { showtimeId, seatId } = data;

                // Chuyển đổi showtimeId thành số
                showtimeId = ensureNumericShowtimeId(showtimeId || data.showtimeId);

                // ✅ Validation: Kiểm tra dữ liệu đầu vào
                if (!showtimeId || !seatId) {
                    throw new Error('Thiếu thông tin showtimeId hoặc seatId');
                }

                // ✅ Validation: Kiểm tra seatId hợp lệ
                if (seatId === 'undefined' || seatId === 'undefinedundefined' || typeof seatId !== 'string' || seatId.trim() === '') {
                    console.error(`❌ [WEBSOCKET] seatId không hợp lệ từ client:`, seatId);
                    socket.emit('error', { message: 'ID ghế không hợp lệ. Vui lòng thử lại.' });
                    return;
                }

                // Kiểm tra xung đột với database
                try {
                    const hasConflict = await seatSelectionService.checkSeatConflictInDatabase(showtimeId, seatId);
                    if (hasConflict) {
                        socket.emit('seat-conflict', { seatId, message: 'Ghế này đã được đặt' });
                        
                        // Gửi lại trạng thái ghế mới nhất
                        const seats = await seatSelectionService.getShowtimeSeats(showtimeId);
                        const validSeats = Array.isArray(seats) ? seats : [];
                        socket.emit('seats-state', validSeats);
                        return;
                    }
                } catch (conflictError) {
                    console.error(`❌ Error checking seat conflict: ${conflictError.message}`);
                    socket.emit('error', { message: `Không thể kiểm tra trạng thái ghế: ${conflictError.message}` });
                    return;
                }

                // Thực hiện chọn ghế
                try {
                    const result = await seatSelectionService.selectSeat(showtimeId, seatId, userId, socket.id);
                    
                    if (!result.success) {
                        socket.emit('error', { message: result.message || 'Không thể chọn ghế' });
                        return;
                    }
                } catch (selectError) {
                    console.error(`❌ Error selecting seat: ${selectError.message}`);
                    socket.emit('error', { message: `Không thể chọn ghế: ${selectError.message}` });
                    return;
                }

                // Broadcast trạng thái ghế mới cho tất cả người dùng trong room
                try {
                    const roomName = `showtime-${showtimeId}`;

                    // 🔧 DEBUG: Kiểm tra số lượng clients trong room
                    const roomClients = io.sockets.adapter.rooms.get(roomName);
                    const clientCount = roomClients ? roomClients.size : 0;
                    console.log(`📡 [BROADCAST] Room ${roomName} có ${clientCount} clients`);
                    console.log(`📡 [BROADCAST] Clients trong room:`, roomClients ? Array.from(roomClients) : []);

                    const seats = await seatSelectionService.getShowtimeSeats(showtimeId);
                    const validSeats = Array.isArray(seats) ? seats : [];

                    console.log(`📡 [BROADCAST] Gửi seats-state đến ${clientCount} clients trong room ${roomName}`);
                    io.to(roomName).emit('seats-state', validSeats);

                    // 🔄 QUAN TRỌNG: Broadcast seat-selected cho tất cả users để cross-tab sync
                    const seatSelectedData = {
                        seatId,
                        userId,
                        status: 'selected',
                        success: true
                    };
                    console.log(`📡 [BROADCAST] Gửi seat-selected đến ${clientCount} clients:`, seatSelectedData);
                    io.to(roomName).emit('seat-selected', seatSelectedData);
                } catch (broadcastError) {
                    console.error(`❌ Error broadcasting seat state: ${broadcastError.message}`);
                    console.error(`❌ Full error:`, broadcastError);
                    socket.emit('error', { message: `Ghế đã được chọn nhưng không thể cập nhật giao diện: ${broadcastError.message}` });
                }
            } catch (error) {
                console.error(`❌ Error handling select-seat:`, error);
                socket.emit('error', { message: `Không thể chọn ghế: ${error.message}` });
            }
        });

        // Bỏ chọn ghế
        socket.on('deselect-seat', async (data) => {
            try {
                let { showtimeId, seatId } = data;

                // Chuyển đổi showtimeId thành số
                showtimeId = ensureNumericShowtimeId(showtimeId || data.showtimeId);

                // ✅ Validation: Kiểm tra dữ liệu đầu vào
                if (!showtimeId || !seatId) {
                    throw new Error('Thiếu thông tin showtimeId hoặc seatId');
                }

                // ✅ Validation: Kiểm tra seatId hợp lệ
                if (seatId === 'undefined' || seatId === 'undefinedundefined' || typeof seatId !== 'string' || seatId.trim() === '') {
                    console.error(`❌ [WEBSOCKET] seatId không hợp lệ trong deselect-seat:`, seatId);
                    socket.emit('error', { message: 'ID ghế không hợp lệ. Vui lòng thử lại.' });
                    return;
                }

                // Thực hiện bỏ chọn ghế
                try {
                    const result = await seatSelectionService.deselectSeat(showtimeId, seatId, userId);
                    
                    if (!result.success) {
                        socket.emit('error', { message: result.message || 'Không thể bỏ chọn ghế' });
                        return;
                    }
                } catch (deselectError) {
                    console.error(`❌ Error deselecting seat: ${deselectError.message}`);
                    socket.emit('error', { message: `Không thể bỏ chọn ghế: ${deselectError.message}` });
                    return;
                }

                // Broadcast trạng thái ghế mới cho tất cả người dùng trong room
                try {
                    const roomName = `showtime-${showtimeId}`;
                    const seats = await seatSelectionService.getShowtimeSeats(showtimeId);
                    const validSeats = Array.isArray(seats) ? seats : [];
                    io.to(roomName).emit('seats-state', validSeats);

                    // 🔄 QUAN TRỌNG: Broadcast seat-deselected cho tất cả users để cross-tab sync
                    io.to(roomName).emit('seat-deselected', {
                        seatId,
                        userId,
                        status: 'available',
                        success: true
                    });
                } catch (broadcastError) {
                    console.error(`❌ Error broadcasting seat state: ${broadcastError.message}`);
                    socket.emit('error', { message: `Ghế đã được bỏ chọn nhưng không thể cập nhật giao diện: ${broadcastError.message}` });
                }
            } catch (error) {
                console.error(`❌ Error handling deselect-seat:`, error);
                socket.emit('error', { message: `Không thể bỏ chọn ghế: ${error.message}` });
            }
        });

        // Xóa tất cả ghế đang chọn của user
        socket.on('clear-all-seats', async (data) => {
            try {
                // Chuyển đổi showtimeId thành số
                const showtimeId = ensureNumericShowtimeId(data.showtimeId || data);
                
                if (!showtimeId) {
                    throw new Error('ID suất chiếu không hợp lệ');
                }
                
                console.log(`🧹 [CLEAR_ALL_USER_SEATS] Clearing all seats for user ${userId} in showtime ${showtimeId}`);

                // Thực hiện xóa tất cả ghế
                try {
                    const result = await seatSelectionService.clearAllUserSeats(showtimeId, userId);
                    
                    if (!result.success) {
                        socket.emit('error', { message: result.message || 'Không thể xóa ghế' });
                        return;
                    }
                    
                    console.log(`✅ All seats cleared for user ${userId} in showtime ${showtimeId}`);
                } catch (clearError) {
                    console.error(`❌ Error clearing seats: ${clearError.message}`);
                    socket.emit('error', { message: `Không thể xóa ghế: ${clearError.message}` });
                    return;
                }

                // Broadcast trạng thái ghế mới cho tất cả người dùng trong room
                try {
                const roomName = `showtime-${showtimeId}`;
                    const seats = await seatSelectionService.getShowtimeSeats(showtimeId);
                    const validSeats = Array.isArray(seats) ? seats : [];
                    io.to(roomName).emit('seats-state', validSeats);
                    
                    // Gửi thông báo thành công cho người dùng
                    socket.emit('seats-cleared', { success: true });
                } catch (broadcastError) {
                    console.error(`❌ Error broadcasting seat state: ${broadcastError.message}`);
                    socket.emit('error', { message: `Ghế đã được xóa nhưng không thể cập nhật giao diện: ${broadcastError.message}` });
                }
            } catch (error) {
                console.error(`❌ Error handling clear-all-seats:`, error);
                socket.emit('error', { message: `Không thể xóa ghế: ${error.message}` });
            }
        });

        // Xác nhận đặt ghế
        socket.on('confirm-booking', async (data) => {
            try {
                let { showtimeId, seatIds, totalAmount } = data;

                // Chuyển đổi showtimeId thành số
                showtimeId = ensureNumericShowtimeId(showtimeId || data.showtimeId);
                
                if (!showtimeId || !seatIds || !Array.isArray(seatIds)) {
                    throw new Error('Invalid booking data');
                }

                // Thực hiện xác nhận đặt ghế
                const result = await seatSelectionService.confirmSeatBooking(showtimeId, seatIds, userId, totalAmount);

                // Broadcast trạng thái ghế mới cho tất cả người dùng trong room
                    const roomName = `showtime-${showtimeId}`;
                const seats = await seatSelectionService.getShowtimeSeats(showtimeId);
                io.to(roomName).emit('seats-state', seats);

                // Gửi thông báo thành công cho người dùng
                    socket.emit('booking-confirmed', {
                    success: true,
                    bookingId: result.bookingId,
                    message: `Đã đặt ${seatIds.length} ghế thành công`
                });
            } catch (error) {
                console.error(`❌ Error handling confirm-booking:`, error);
                socket.emit('error', { message: `Không thể xác nhận đặt ghế: ${error.message}` });
            }
        });

        // Lấy trạng thái ghế hiện tại
        socket.on('get-seats-state', async (data) => {
            try {
                // Chuyển đổi showtimeId thành số
                const showtimeId = ensureNumericShowtimeId(data.showtimeId || data);
                
                if (!showtimeId) {
                    throw new Error('Invalid showtime ID format');
                }
                
                const seats = await seatSelectionService.getShowtimeSeats(showtimeId);
                socket.emit('seats-state', seats);
            } catch (error) {
                console.error(`❌ Error handling get-seats-state:`, error);
                socket.emit('error', { message: `Không thể lấy trạng thái ghế: ${error.message}` });
            }
        });

        // Gia hạn thời gian giữ ghế
        socket.on('extend-seat-hold', async (data) => {
            try {
                let { showtimeId, seatId } = data;

                // Chuyển đổi showtimeId thành số
                showtimeId = ensureNumericShowtimeId(showtimeId || data.showtimeId);

                if (!showtimeId || !seatId) {
                    throw new Error('Missing or invalid showtimeId or seatId');
                }

                // Thực hiện gia hạn
                const result = await seatSelectionService.extendSeatHold(showtimeId, seatId, userId);

                // Gửi thông báo thành công cho người dùng
                socket.emit('seat-hold-extended', {
                    seatId,
                    success: true,
                    newExpiration: result.newExpiration
                });
            } catch (error) {
                console.error(`❌ Error handling extend-seat-hold:`, error);
                socket.emit('error', { message: `Không thể gia hạn thời gian giữ ghế: ${error.message}` });
            }
        });

        // Lấy thống kê ghế
        socket.on('get-seat-statistics', async () => {
            try {
                const statistics = await seatSelectionService.getSeatStatistics();
                socket.emit('seat-statistics', statistics);
            } catch (error) {
                console.error(`❌ Error handling get-seat-statistics:`, error);
                socket.emit('error', { message: `Không thể lấy thống kê ghế: ${error.message}` });
            }
        });
    });
};

// Export getIO function để sử dụng ở nơi khác
const getIO = () => {
    if (!io) {
        throw new Error('Socket.IO chưa được khởi tạo. Hãy gọi initSocketHandlers trước.');
    }
    return io;
};

module.exports = {
    initSocketHandlers,
    getIO
};