// src/services/seatSelectionService.js
// Service quản lý trạng thái ghế real-time cho hệ thống đặt vé

const { SeatLayout, Showtime, TicketBooking, Ticket } = require('../models');
const { Op } = require('sequelize');
const pricingService = require('./pricingService');

class SeatSelectionService {
    constructor() {
        // In-memory storage cho trạng thái ghế real-time
        // Cấu trúc: { showtimeId: { seatId: { status, userId, timestamp, socketId } } }
        this.seatStates = new Map();
        
        // Timeout cho việc giữ ghế (15 phút)
        this.SEAT_HOLD_TIMEOUT = 15 * 60 * 1000; // 15 minutes
        
        // Cleanup interval (mỗi 30 giây)
        this.CLEANUP_INTERVAL = 30 * 1000; // 30 seconds

        // Cleanup timer sẽ được start từ WebSocket handler với io instance
        this.cleanupTimer = null;

        // Khởi tạo dữ liệu từ database khi service được tạo
        this.initializeFromDatabase();
    }

    /**
     * Đảm bảo showtimeId là số
     * @param {*} showtimeId - ID suất chiếu (có thể là số, chuỗi, hoặc object)
     * @returns {number|string} - ID suất chiếu đã được chuyển đổi thành số hoặc chuỗi
     */
    ensureNumericShowtimeId(showtimeId) {
        if (!showtimeId) {
            console.warn(`⚠️ showtimeId là null hoặc undefined`);
            return null;
        }
        
        if (typeof showtimeId === 'object') {
            console.log(`⚠️ showtimeId là object, chuyển đổi thành chuỗi`);
            
            try {
                // Thử các thuộc tính phổ biến có thể chứa ID
                const possibleIds = [
                    showtimeId.showtimeId, 
                    showtimeId.id, 
                    showtimeId.showtime_id, 
                    showtimeId.Showtime_ID,
                    showtimeId.showtimeID,
                    showtimeId.data?.showtimeId,
                    showtimeId.data?.id,
                    showtimeId.data?.Showtime_ID
                ];
                
                // Tìm giá trị đầu tiên không phải null/undefined
                for (const id of possibleIds) {
                    if (id !== null && id !== undefined) {
                        return this.ensureNumericShowtimeId(id); // Đệ quy để xử lý trường hợp id là object
                    }
                }
                
                // Nếu không tìm thấy ID trong các thuộc tính, thử JSON.stringify
                console.warn(`⚠️ Không tìm thấy ID trong object, chuyển đổi toàn bộ object thành chuỗi`);
                const stringified = JSON.stringify(showtimeId);
                
                // Thử tìm số trong chuỗi JSON
                const matches = stringified.match(/"(showtime|Showtime)(_)?[Ii][Dd]":\s*(\d+)/);
                if (matches && matches[3]) {
                    return Number(matches[3]);
                }
                
                // Fallback: Trả về timestamp hiện tại để tránh lỗi
                console.error(`❌ Không thể xác định showtimeId từ object, sử dụng fallback`);
                return Date.now();
            } catch (error) {
                console.error(`❌ Lỗi khi xử lý showtimeId object: ${error.message}`);
                return Date.now(); // Fallback để tránh lỗi
            }
        }
        
        // Nếu là chuỗi, thử chuyển thành số
        if (typeof showtimeId === 'string') {
            // Loại bỏ các ký tự không phải số
            const numericPart = showtimeId.replace(/\D/g, '');
            if (numericPart) {
                return Number(numericPart);
            }
            return showtimeId; // Trả về chuỗi gốc nếu không thể chuyển đổi
        }
        
        // Nếu đã là số, trả về luôn
        return showtimeId;
    }

    /**
     * Khởi tạo trạng thái ghế từ database khi service được tạo
     */
    async initializeFromDatabase() {
        try {
            console.log('🔄 Đang khởi tạo trạng thái ghế từ database...');
            
            // Tìm tất cả các Tickets có trạng thái "Selecting"
            const selectingTickets = await Ticket.findAll({
                where: {
                    Status: 'Selecting',
                },
                include: [
                    {
                        model: TicketBooking,
                        as: 'TicketBooking',
                        attributes: ['User_ID']
                    }
                ]
            });

            if (selectingTickets.length > 0) {
                console.log(`📋 Đã tìm thấy ${selectingTickets.length} ghế đang được chọn trong database`);

                // Gom nhóm theo showtimeId
                for (const ticket of selectingTickets) {
                    const showtimeId = ticket.Showtime_ID;
                    const seatId = ticket.Seat_ID;
                    const userId = ticket.TicketBooking?.User_ID || 'anonymous';
                    
                    // Kiểm tra xem vé đã hết thời gian giữ chưa
                    const createdAt = new Date(ticket.createdAt || ticket.Created_At || Date.now());
                    const now = Date.now();
                    const elapsedTime = now - createdAt.getTime();
                    
                    // Nếu đã hết thời gian giữ, bỏ qua và xóa khỏi database
                    if (elapsedTime > this.SEAT_HOLD_TIMEOUT) {
                        this.removeFromDatabase(showtimeId, seatId);
                        continue;
                    }

                    // Khởi tạo showtime state nếu chưa có
                    if (!this.seatStates.has(showtimeId)) {
                        this.seatStates.set(showtimeId, {});
                    }

                    const showtimeSeats = this.seatStates.get(showtimeId);
                    
                    // Lưu thông tin vào memory cache
                    showtimeSeats[seatId] = {
                        status: 'selecting',
                        userId: userId,
                        socketId: null,
                        timestamp: createdAt.getTime()
                    };
                }

                console.log('✅ Đã khởi tạo trạng thái ghế từ database thành công');
            } else {
                console.log('ℹ️ Không có trạng thái ghế nào để khởi tạo từ database');
            }
        } catch (error) {
            console.error('❌ Lỗi khi khởi tạo trạng thái ghế từ database:', error);
        }
    }

    /**
     * Lấy trạng thái ghế cho một suất chiếu
     */
    async getShowtimeSeats(showtimeId) {
        try {
            // Đảm bảo showtimeId là số
            showtimeId = this.ensureNumericShowtimeId(showtimeId);
            console.log(`🔄 [BACKEND] Lấy trạng thái ghế cho suất chiếu ${showtimeId}`);

            // ❌ TẠMTHỜI COMMENT OUT API CALL ĐỂ TRÁNH VÒNG LẶP 401
            // Lý do: Service đang gọi API của chính nó mà không có auth token
            // TODO: Cần implement proper API authentication hoặc gọi trực tiếp database

            /*
            const axios = require('axios');
            const apiUrl = process.env.SEAT_API_URL || 'http://localhost:3000/api/seats';

            try {
                const response = await axios.get(`${apiUrl}/showtime/${showtimeId}`);
                if (response.data && response.data.success && response.data.data && Array.isArray(response.data.data.Seats)) {
                    console.log(`✅ [BACKEND] Lấy thành công ${response.data.data.Seats.length} ghế từ API`);
                    // ... API processing code ...
                    return seats;
                }
            } catch (apiError) {
                console.error(`❌ [BACKEND] Lỗi khi lấy dữ liệu từ API: ${apiError.message}`);
                // Fallback sang database
            }
            */

            console.log(`🔄 [BACKEND] Sử dụng database trực tiếp cho suất chiếu ${showtimeId}`);

            // Tìm thông tin suất chiếu
            let showtime = null;
            try {
                showtime = await Showtime.findByPk(showtimeId);
            if (!showtime) {
                    console.warn(`⚠️ [BACKEND] Không tìm thấy suất chiếu ${showtimeId}`);
                    return await this._createSampleSeatMap(showtimeId); // Trả về sơ đồ ghế động
                }
            } catch (error) {
                console.error(`❌ [BACKEND] Lỗi khi truy vấn Showtime: ${error.message}`);
                return await this._createSampleSeatMap(showtimeId); // Trả về sơ đồ ghế động
            }

            // Lấy thông tin layout ghế từ database
            let seatLayouts = [];
            try {
                seatLayouts = await SeatLayout.findAll({
                where: {
                    Cinema_Room_ID: showtime.Cinema_Room_ID,
                    Is_Active: true
                },
                order: [['Row_Label', 'ASC'], ['Column_Number', 'ASC']]
            });
                
                if (seatLayouts.length === 0) {
                    console.warn(`⚠️ [BACKEND] Không tìm thấy layout ghế cho phòng ${showtime.Cinema_Room_ID}`);
                    return await this._createSampleSeatMap(showtimeId); // Trả về sơ đồ ghế động
                }
            } catch (error) {
                console.error(`❌ [BACKEND] Lỗi khi lấy layout ghế: ${error.message}`);
                // Tiếp tục với sơ đồ ghế động
                return await this._createSampleSeatMap(showtimeId);
            }

            // Khởi tạo danh sách ghế đã đặt
            let bookedTickets = [];
            const bookedSeatMap = new Map();

            try {
                try {
                    // Sử dụng truy vấn đơn giản hơn để tránh lỗi cột không tồn tại
                bookedTickets = await Ticket.findAll({
                    where: {
                            Showtime_ID: showtimeId
                        },
                        attributes: ['Ticket_ID', 'Booking_ID', 'Seat_ID', 'Status'],
                        raw: true
                    });

                    console.log(`✅ [BACKEND] Tìm thấy ${bookedTickets.length} vé đã đặt cho suất chiếu ${showtimeId}`);
                    
                    // Xử lý từng vé để lấy thông tin ghế
                    for (const ticket of bookedTickets) {
                        try {
                            if (!ticket.Seat_ID) continue;
                            
                            // ✅ SỬA: Lấy thông tin ghế bằng raw SQL thay vì Sequelize
                            const { getConnection } = require('../config/database');
                            const pool = await getConnection();
                            const request = pool.request();
                            request.input('seatId', ticket.Seat_ID);

                            const seatResult = await request.query(`
                                SELECT
                                    s.Seat_ID,
                                    s.Layout_ID,
                                    s.Seat_Number,
                                    sl.Row_Label,
                                    sl.Column_Number,
                                    sl.Seat_Type,
                                    sl.Layout_ID as SeatLayout_Layout_ID
                                FROM [ksf00691_team03].[Seats] s
                                LEFT JOIN [ksf00691_team03].[Seat_Layout] sl ON s.Layout_ID = sl.Layout_ID
                                WHERE s.Seat_ID = @seatId
                            `);

                            const seat = seatResult.recordset[0];
                            if (seat) {
                                // Tạo cấu trúc tương tự như Sequelize
                                seat.SeatLayout = {
                                    Row_Label: seat.Row_Label,
                                    Column_Number: seat.Column_Number,
                                    Seat_Type: seat.Seat_Type,
                                    Layout_ID: seat.SeatLayout_Layout_ID
                                };
                            }

                            if (seat && seat.SeatLayout) {
                                const rowLabel = seat.SeatLayout.Row_Label;
                                const columnNumber = seat.SeatLayout.Column_Number;
                                const layoutId = seat.SeatLayout.Layout_ID;
                    const seatNumber = `${rowLabel}${columnNumber}`;
                                
                                // Lấy thông tin booking nếu cần
                                let userId = null;
                                let bookingStatus = null;
                                
                                if (ticket.Booking_ID) {
                                    const booking = await TicketBooking.findByPk(ticket.Booking_ID, {
                                        attributes: ['User_ID', 'Status'],
                                        raw: true
                                    });
                                    
                                    if (booking) {
                                        userId = booking.User_ID;
                                        bookingStatus = booking.Status;
                                    }
                                }
                    
                                console.log(`✅ [BACKEND] Ghế ${seatNumber} đã được đặt bởi user ${userId || 'N/A'}`);
                    
                                // Lưu thông tin ghế đã đặt
                    bookedSeatMap.set(seatNumber, {
                                    layoutId: layoutId || 0,
                                    userId: userId,
                                    status: (ticket.Status === 'Pending') ? 'pending' : 'booked',
                                    bookingId: ticket.Booking_ID,
                                    bookingStatus: bookingStatus || 'Unknown'
                    });
                }
                        } catch (seatError) {
                            console.error(`❌ [BACKEND] Lỗi khi xử lý thông tin ghế cho vé ${ticket.Ticket_ID}:`, seatError);
                        }
                    }
                } catch (ticketError) {
                    console.error(`❌ [BACKEND] Lỗi khi truy vấn Ticket:`, ticketError);
                    // Ghi log chi tiết về lỗi để debug
                    if (ticketError.parent) {
                        console.error(`❌ [BACKEND] Chi tiết lỗi SQL:`, {
                            message: ticketError.parent.message,
                            code: ticketError.parent.code,
                            state: ticketError.parent.state,
                            class: ticketError.parent.class,
                            errors: ticketError.parent.errors ? ticketError.parent.errors.map(e => e.message).join(', ') : 'None'
            });
                    }
                }
            } catch (dbError) {
                console.error(`❌ [BACKEND] Lỗi khi truy vấn Ticket:`, dbError);
                // Ghi log chi tiết về lỗi để debug
                if (dbError.parent) {
                    console.error(`❌ [BACKEND] Chi tiết lỗi SQL:`, {
                        message: dbError.parent.message,
                        code: dbError.parent.code,
                        state: dbError.parent.state,
                        class: dbError.parent.class,
                        errors: dbError.parent.errors ? dbError.parent.errors.map(e => e.message).join(', ') : 'None'
            });
                }
                // Không return ở đây, tiếp tục với bookedSeatMap rỗng - không làm gián đoạn luồng
            }

            // 🔧 FIX: Lấy TẤT CẢ trạng thái ghế từ Redis (selecting, selected, booked)
            let cachedSeats = {};
            try {
                const seatCacheService = require('./seatCacheService');
                const allCachedSeats = await seatCacheService.getShowtimeSeats(showtimeId);

                // 🔧 FIX: Lấy TẤT CẢ ghế từ Redis, không chỉ selecting
                cachedSeats = allCachedSeats || {};
                console.log(`🔧 [BACKEND] Lấy được ${Object.keys(cachedSeats).length} ghế từ Redis cache`);

                // Log chi tiết các ghế từ Redis
                Object.keys(cachedSeats).forEach(seatId => {
                    const seat = cachedSeats[seatId];
                    console.log(`🔧 [REDIS_SEAT] ${seatId}: status=${seat.status}, userId=${seat.userId}`);
                });
            } catch (cacheError) {
                console.error(`❌ [BACKEND] Lỗi khi lấy ghế từ cache:`, cacheError);
                // Tiếp tục với cachedSeats rỗng
            }

            // Tạo danh sách tất cả ghế với trạng thái
            const allSeats = [];

            // Lấy thông tin phòng chiếu để xác định loại phòng
            const roomType = showtime?.Room_Type || '2D'; // Mặc định là 2D nếu không có
            const showDate = showtime?.Show_Date;
            const startTime = showtime?.Start_Time;



            // Tạo ghế từ layout
            for (const layout of seatLayouts) {
                const rowLabel = layout.Row_Label;
                const columnNumber = layout.Column_Number;
                const seatId = `${rowLabel}${columnNumber}`;
                const seatType = layout.Seat_Type || 'Regular';
                
                // 🔧 FIX: Kiểm tra ghế từ Redis cache (selecting/selected/booked)
                const cachedSeat = cachedSeats && cachedSeats[seatId];

                // Kiểm tra xem ghế đã được đặt trong database chưa
                const bookedInfo = bookedSeatMap.get(seatId);
                const isBooked = !!bookedInfo;

                // Xác định trạng thái cuối cùng của ghế
                let status = 'available';
                let userId = null;

                if (isBooked) {
                    // Ghế đã booked trong database - ưu tiên cao nhất
                    status = bookedInfo.status;
                    userId = bookedInfo.userId;
                } else if (cachedSeat) {
                    // 🔧 FIX: Ghế có trong Redis cache - map status cho frontend
                    if (cachedSeat.status === 'selecting') {
                        status = 'selected'; // Map 'selecting' từ Redis thành 'selected' cho frontend
                    } else {
                        status = cachedSeat.status; // Giữ nguyên status khác (selected, booked)
                    }
                    userId = cachedSeat.userId;
                    console.log(`🔧 [SEAT_STATUS] ${seatId}: Redis=${cachedSeat.status} → Frontend=${status}, userId=${userId}`);
                }
                
                // Tính giá vé dựa trên loại ghế và suất chiếu
                let price = 81000; // Giá mặc định
                try {
                    const priceInfo = pricingService.calculateTicketPrice({
                        roomType,
                        seatType,
                        showDate,
                        startTime
                    });
                    price = priceInfo.finalPrice;


                } catch (error) {
                    console.error(`❌ [BACKEND] Lỗi khi tính giá vé cho ghế ${seatId}:`, error.message);
                }
                
                // Debug log để kiểm tra Layout_ID
                if (seatId === 'C9') {
                    console.log(`🔍 [DEBUG] Ghế C9 - Layout_ID: ${layout.Layout_ID}, Row: ${rowLabel}, Column: ${columnNumber}`);
                }

                // Thêm ghế vào danh sách kết quả
                allSeats.push({
                    seatId,
                    row: rowLabel,        // ✅ FIX: Frontend expect 'row'
                    column: columnNumber, // ✅ FIX: Frontend expect 'column'
                    rowLabel,            // Keep for backward compatibility
                    columnNumber,        // Keep for backward compatibility
                    status,
                    userId,
                    seatType,
                    price,
                    isBooked: status === 'booked',
                    isSelecting: status === 'selected', // 🔄 Fix: 'selected' thay vì 'selecting'
                    isPending: status === 'pending',
                    isAvailable: status === 'available',
                    layoutId: layout.Layout_ID
                });
            }

            // Debug logging removed for cleaner console output

            console.log(`✅ [BACKEND] Đã tạo sơ đồ ghế cho suất chiếu ${showtimeId} với ${allSeats.length} ghế`);
            return allSeats;
        } catch (error) {
            console.error(`❌ [BACKEND] Lỗi khi lấy trạng thái ghế:`, error);
            // Trả về sơ đồ ghế động trong trường hợp lỗi để tránh crash
            return await this._createSampleSeatMap(showtimeId);
        }
    }

    /**
     * Lấy thông tin ghế từ database hoặc API
     * @private
     * @param {number|string} showtimeId - ID của suất chiếu
     * @returns {Array} Mảng ghế
     */
    async _createSampleSeatMap(showtimeId) {
        console.log(`🔄 [BACKEND] Đang lấy layout ghế từ API cho suất chiếu ${showtimeId}`);
        
        try {
            // ❌ TẠMTHỜI COMMENT OUT API CALL ĐỂ TRÁNH VÒNG LẶP 401
            // Lý do: Service đang gọi API của chính nó mà không có auth token
            /*
            const axios = require('axios');
            const apiUrl = process.env.SEAT_API_URL || 'http://localhost:3000/api/seats';

            try {
                const response = await axios.get(`${apiUrl}/showtime/${showtimeId}`);
                if (response.data && response.data.success && response.data.data && Array.isArray(response.data.data.Seats)) {
                    console.log(`✅ [BACKEND] Lấy thành công ${response.data.data.Seats.length} ghế từ API`);
                    // ... API processing code ...
                    return seats;
                }
            } catch (apiError) {
                console.error(`❌ [BACKEND] Lỗi khi lấy dữ liệu từ API: ${apiError.message}`);
            }
            */

            console.log(`🔄 [BACKEND] Sử dụng database trực tiếp cho layout ghế suất chiếu ${showtimeId}`);
            
            // Nếu không lấy được từ API, thử lấy từ database
            let cinemaRoomId = null;
            try {
                const showtime = await Showtime.findByPk(showtimeId);
                if (showtime) {
                    cinemaRoomId = showtime.Cinema_Room_ID;
                    console.log(`✅ [BACKEND] Tìm thấy phòng ${cinemaRoomId} cho suất chiếu ${showtimeId}`);
                }
            } catch (error) {
                console.error(`❌ [BACKEND] Lỗi khi lấy thông tin suất chiếu: ${error.message}`);
            }
            
            // Nếu có thông tin phòng, thử lấy layout từ database
            if (cinemaRoomId) {
                try {
                    const layouts = await SeatLayout.findAll({
                        where: {
                            Cinema_Room_ID: cinemaRoomId,
                            Is_Active: true
                        },
                        order: [['Row_Label', 'ASC'], ['Column_Number', 'ASC']]
                    });
                    
                    if (layouts && layouts.length > 0) {
                        console.log(`✅ [BACKEND] Tìm thấy ${layouts.length} ghế trong layout cho phòng ${cinemaRoomId}`);
                        
                        // Tạo danh sách ghế từ layout thực tế
                        const seats = layouts.map(layout => {
                            const rowLabel = layout.Row_Label;
                            const columnNumber = layout.Column_Number;
                            const seatId = `${rowLabel}${columnNumber}`;
                            const seatType = layout.Seat_Type || 'Regular';

                            // Tính giá vé dựa trên loại ghế và suất chiếu (thống nhất với WebSocket)
                            let price = 81000; // Giá mặc định
                            try {
                                const priceInfo = pricingService.calculateTicketPrice({
                                    roomType,
                                    seatType,
                                    showDate,
                                    startTime
                                });
                                price = priceInfo.finalPrice;
                            } catch (error) {
                                console.error(`❌ [BACKEND] Lỗi khi tính giá vé cho ghế ${seatId}:`, error.message);
                                // Fallback: sử dụng giá cũ
                                price = seatType === 'VIP' ? 120000 : 81000;
                            }
                            
                            return {
                                seatId,
                                rowLabel,
                                columnNumber,
                                status: 'available',
                                userId: null,
                                seatType,
                                price,
                                isBooked: false,
                                isSelecting: false,
                                isPending: false,
                                isAvailable: true,
                                layoutId: layout.Layout_ID
                            };
                        });
                        
                        return seats;
                    }
                } catch (dbError) {
                    console.error(`❌ [BACKEND] Lỗi khi lấy layout ghế từ database: ${dbError.message}`);
                }
            }
            
            // Nếu không lấy được từ database, tạo layout động đơn giản
            console.warn(`⚠️ [BACKEND] Không thể lấy layout ghế từ API hoặc database, tạo layout động đơn giản`);
            
            // Tạo layout đơn giản với 5 hàng, 9 cột (bỏ cột 5 làm lối đi)
            const rows = ['A', 'B', 'C', 'D', 'E'];
            const columns = [1, 2, 3, 4, 6, 7, 8, 9, 10];
            const seats = [];
            
            let seatId = 1;
            for (const rowLabel of rows) {
                for (const columnNumber of columns) {
                    const seatNumber = `${rowLabel}${columnNumber}`;
                    seats.push({
                        seatId: seatNumber,
                        rowLabel,
                        columnNumber,
                        status: 'available',
                        userId: null,
                        seatType: 'Regular',
                        price: 81000,
                        isBooked: false,
                        isSelecting: false,
                        isPending: false,
                        isAvailable: true,
                        layoutId: seatId++
                    });
                }
            }
            
            console.log(`✅ [BACKEND] Đã tạo layout ghế động với ${seats.length} ghế`);
            return seats;
        } catch (error) {
            console.error(`❌ [BACKEND] Lỗi khi tạo layout ghế: ${error.message}`);
            
            // Trả về mảng rỗng để tránh crash
            return [];
        }
    }

    /**
     * Kiểm tra xem ghế đã được đặt trong database chưa
     */
    async checkSeatConflictInDatabase(showtimeId, seatId) {
        try {
            // ✅ Validation: Kiểm tra seatId hợp lệ
            if (!seatId || seatId === 'undefined' || seatId === 'undefinedundefined' || typeof seatId !== 'string') {
                console.error(`❌ [BACKEND] seatId không hợp lệ: ${seatId}`);
                return false; // Trả về false để không block việc chọn ghế
            }

            // Logic: Ghế chỉ tồn tại trong bảng Seats khi đã booking thành công
            // Lấy thông tin layout từ seatId (A6 -> Row_Label = A, Column_Number = 6)
            const rowLabel = seatId.charAt(0);
            const columnNumber = parseInt(seatId.substring(1));

            // ✅ Validation: Kiểm tra parse thành công
            if (!rowLabel || isNaN(columnNumber) || columnNumber <= 0) {
                console.error(`❌ [BACKEND] Không thể parse seatId "${seatId}" -> rowLabel: "${rowLabel}", columnNumber: ${columnNumber}`);
                return false;
            }

            console.log(`🔍 [BACKEND] Kiểm tra conflict cho ghế ${seatId} trong showtime ${showtimeId}`);

            // 🔧 FIX: Bỏ qua việc kiểm tra SeatLayout vì logic mới
            // Chỉ cần kiểm tra ghế đã booking trong showtime hiện tại

            // 2. 🔧 FIX: Kiểm tra ghế đã được đặt trong SHOWTIME HIỆN TẠI
            // Logic: Mỗi showtime tạo ra Seat records riêng từ cùng 1 layout
            // Cần kiểm tra Tickets của showtime này, không phải tất cả Seats có cùng layout
            const { getConnection } = require('../config/database');
            const pool = await getConnection();
            const request = pool.request();
            request.input('showtimeId', showtimeId);
            request.input('rowLabel', rowLabel);
            request.input('columnNumber', columnNumber);

            const bookedSeatResult = await request.query(`
                SELECT t.Ticket_ID, t.Seat_ID, s.Layout_ID, tb.Status as BookingStatus
                FROM [ksf00691_team03].[Tickets] t
                INNER JOIN [ksf00691_team03].[Seats] s ON t.Seat_ID = s.Seat_ID
                INNER JOIN [ksf00691_team03].[Seat_Layout] sl ON s.Layout_ID = sl.Layout_ID
                INNER JOIN [ksf00691_team03].[Ticket_Bookings] tb ON t.Booking_ID = tb.Booking_ID
                WHERE t.Showtime_ID = @showtimeId
                AND sl.Row_Label = @rowLabel
                AND sl.Column_Number = @columnNumber
                AND tb.Status IN ('Pending', 'Confirmed')
                AND t.Status = 'Active'
            `);

            const isBooked = bookedSeatResult.recordset.length > 0;

            if (isBooked) {
                console.log(`🚫 [BACKEND] Ghế ${seatId} đã được đặt trong showtime ${showtimeId} (Status: ${bookedSeatResult.recordset[0].BookingStatus})`);
                return true; // Có conflict - ghế đã được đặt trong showtime này
            }

            console.log(`✅ [BACKEND] Ghế ${seatId} chưa được đặt trong showtime ${showtimeId}, có thể chọn`);
            return false; // Không có conflict - ghế chưa được đặt trong showtime này
        } catch (error) {
            console.error(`❌ [BACKEND] Lỗi khi kiểm tra ghế ${seatId} trong database:`, error);
            // Nếu có lỗi, mặc định là ghế chưa được đặt
            return false;
        }
    }

    /**
     * Lưu booking đã confirmed vào database (chỉ khi user xác nhận đặt vé)
     */
    async saveConfirmedBookingToDatabase(showtimeId, seatIds, userId, totalAmount = 0) {
        try {
            console.log(`💾 Lưu booking đã confirmed vào database cho user ${userId}`);

            // Tạo TicketBooking mới với status Pending
            const booking = await TicketBooking.create({
                User_ID: userId,
                Showtime_ID: showtimeId,
                Status: 'Pending',
                Booking_Date: new Date(),
                Payment_Deadline: new Date(Date.now() + (30 * 60 * 1000)), // 30 phút để thanh toán
                Total_Amount: totalAmount,
                Created_By: userId
            });

            const createdTickets = [];

            // Tạo tickets cho từng ghế
            for (const seatId of seatIds) {
                // Kiểm tra format seatId
                if (typeof seatId === 'string' && /^[A-Z]\d+$/.test(seatId)) {
                    const row = seatId.charAt(0);
                    const column = parseInt(seatId.slice(1), 10);

                    // Tìm Layout_ID từ Row_Label và Column_Number
                    const seatLayout = await SeatLayout.findOne({
                        where: {
                            Row_Label: row,
                            Column_Number: column,
                            Is_Active: true
                        }
                    });

                    if (!seatLayout) {
                        console.error(`❌ Không tìm thấy SeatLayout cho ghế ${seatId}`);
                        continue;
                    }

                    // ✅ SỬA: Sử dụng raw SQL thay vì Sequelize để tìm Seat
                    const { getConnection } = require('../config/database');
                    const pool = await getConnection();
                    const request = pool.request();
                    request.input('layoutId', seatLayout.Layout_ID);

                    const seatResult = await request.query(`
                        SELECT TOP 1 Seat_ID, Layout_ID, Seat_Number, Is_Active, Status, User_ID
                        FROM [ksf00691_team03].[Seats]
                        WHERE Layout_ID = @layoutId AND Is_Active = 1
                    `);

                    const seat = seatResult.recordset[0];

                    if (!seat) {
                        console.error(`❌ Không tìm thấy Seat cho SeatLayout với ID ${seatLayout.Layout_ID}`);
                        continue;
                    }

                    // Kiểm tra conflict một lần nữa trước khi tạo
                    const hasConflict = await this.checkSeatConflictInDatabase(showtimeId, seatId);
                    if (hasConflict) {
                        console.error(`❌ Ghế ${seatId} đã bị conflict, không thể tạo ticket`);
                        continue;
                    }

                    // Tạo Ticket với status Pending
                    const ticket = await Ticket.create({
                        Booking_ID: booking.Booking_ID,
                        Seat_ID: seat.Seat_ID,
                        Showtime_ID: showtimeId,
                        Status: 'Pending',
                        Base_Price: totalAmount / seatIds.length, // Chia đều giá cho các ghế
                        Final_Price: totalAmount / seatIds.length,
                        Ticket_Code: `TKT-${Date.now()}-${Math.floor(Math.random() * 10000)}`
                    });

                    createdTickets.push({
                        seatId: seatId,
                        ticketId: ticket.Ticket_ID
                    });
                }
            }

            console.log(`✅ Đã tạo booking ${booking.Booking_ID} với ${createdTickets.length} tickets`);
            return {
                success: true,
                bookingId: booking.Booking_ID,
                tickets: createdTickets
            };

        } catch (error) {
            console.error(`❌ Lỗi khi lưu confirmed booking vào database:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Chọn ghế (đánh dấu đang chọn) - LƯU VÀO REDIS
     */
    async selectSeat(showtimeId, seatId, userId, socketId) {
        try {


            // Kiểm tra conflict trong database trước (chỉ check ghế đã confirmed)
            const hasConflict = await this.checkSeatConflictInDatabase(showtimeId, seatId);
            if (hasConflict) {
                return {
                    success: false,
                    message: 'Ghế đã được đặt bởi người khác',
                    reason: 'database_conflict'
                };
            }

            // ✅ Sử dụng Redis thay vì memory cache
            const seatCacheService = require('./seatCacheService');
            const result = await seatCacheService.selectSeat(showtimeId, seatId, userId, socketId);

            if (result.success) {
                // console.log(`✅ Ghế ${seatId} đã được lưu vào Redis bởi user ${userId}`);
            } else {
                // console.log(`❌ Không thể chọn ghế ${seatId}: ${result.message}`);
            }

            return result;

        } catch (error) {
            console.error(`❌ Lỗi khi chọn ghế:`, error);
            throw error;
        }
    }

    /**
     * Bỏ chọn ghế - XÓA KHỎI REDIS
     */
    async deselectSeat(showtimeId, seatId, userId) {
        try {


            // ✅ Sử dụng Redis thay vì memory cache
            const seatCacheService = require('./seatCacheService');
            const result = await seatCacheService.deselectSeat(showtimeId, seatId, userId);

            if (result.success) {
                console.log(`✅ Ghế ${seatId} đã được xóa khỏi Redis bởi user ${userId}`);
            } else {
                console.log(`❌ Không thể bỏ chọn ghế ${seatId}: ${result.message}`);
            }

            return result;

        } catch (error) {
            console.error(`❌ Lỗi khi bỏ chọn ghế:`, error);
            throw error;
        }
    }

    /**
     * Lấy trạng thái hiện tại của tất cả ghế (alias cho getShowtimeSeats)
     */
    async getCurrentSeats(showtimeId) {
        return await this.getShowtimeSeats(showtimeId);
    }

    /**
     * Clear tất cả ghế đã chọn của user trong showtime (force clear server state)
     */
    async clearAllUserSeats(showtimeId, userId) {
        try {
            // Đảm bảo showtimeId là số
            showtimeId = this.ensureNumericShowtimeId(showtimeId);
            console.log(`🧹 [CLEAR_ALL_USER_SEATS] Clearing all seats for user ${userId} in showtime ${showtimeId}`);

            const seatCacheService = require('./seatCacheService');

            // Lấy tất cả ghế đã chọn của user từ Redis
            let allSeats = await this.getCurrentSeats(showtimeId);
            
            // Đảm bảo allSeats là một mảng
            if (!allSeats || !Array.isArray(allSeats)) {
                console.warn(`⚠️ [CLEAR_ALL_USER_SEATS] allSeats không phải là mảng hoặc null/undefined, đang tạo mảng rỗng`);
                
                return {
                    success: true,
                    clearedSeats: [],
                    message: `Không tìm thấy ghế nào cho user ${userId} trong showtime ${showtimeId}`
                };
            }
            
            console.log(`🧹 [CLEAR_ALL_USER_SEATS] Total seats in showtime: ${allSeats.length}`);
            
            // Tìm các ghế của user cần clear
            const userSeats = allSeats.filter(seat => {
                if (!seat) return false;

                // 🔧 FIX: Bao gồm cả 'selecting' và 'selected' status
                const isUserSeat = (seat.status === 'selecting' || seat.status === 'selected') &&
                                  String(seat.userId) === String(userId);

                if (isUserSeat) {
                    console.log(`🎯 [CLEAR_ALL_USER_SEATS] Found user seat: ${seat.seatId} (status: ${seat.status}, userId: ${seat.userId})`);
                }

                return isUserSeat;
            });

            if (!userSeats || userSeats.length === 0) {
                console.log(`ℹ️ [CLEAR_ALL_USER_SEATS] Không tìm thấy ghế nào của user ${userId} cần clear`);
                return {
                    success: true,
                    clearedSeats: [],
                    message: `Không có ghế nào cần clear cho user ${userId}`
                };
            }

            console.log(`🧹 [CLEAR_ALL_USER_SEATS] Found ${userSeats.length} seats to clear:`,
                userSeats.map(s => s.seatId));

            // Clear từng ghế
            const clearedSeats = [];
            for (const seat of userSeats) {
                if (!seat || !seat.seatId) {
                    console.warn(`⚠️ [CLEAR_ALL_USER_SEATS] Bỏ qua ghế không hợp lệ:`, seat);
                    continue;
                }
                
                const seatId = seat.seatId; // Sử dụng đúng thuộc tính seatId
                console.log(`🔄 [CLEAR_ALL_USER_SEATS] Deselecting seat ${seatId}...`);
                
                try {
                const result = await seatCacheService.deselectSeat(showtimeId, seatId, userId);
                
                if (result.success) {
                    clearedSeats.push(seatId);
                    console.log(`✅ [CLEAR_ALL_USER_SEATS] Cleared seat ${seatId}`);
                } else {
                    console.error(`❌ [CLEAR_ALL_USER_SEATS] Failed to clear seat ${seatId}: ${result.message}`);
                    }
                } catch (seatError) {
                    console.error(`❌ [CLEAR_ALL_USER_SEATS] Error clearing seat ${seatId}:`, seatError);
                }
            }

            console.log(`✅ [CLEAR_ALL_USER_SEATS] Successfully cleared ${clearedSeats.length}/${userSeats.length} seats for user ${userId}`);

            return {
                success: true,
                clearedSeats: clearedSeats,
                message: `Đã xóa ${clearedSeats.length} ghế của user ${userId}`
            };
        } catch (error) {
            console.error(`❌ [CLEAR_ALL_USER_SEATS] Lỗi khi xóa ghế:`, error);
            return {
                success: false,
                error: error.message
            };
                }
    }

    /**
     * Khởi động cleanup timer để tự động xóa ghế hết hạn
     * @param {Object} io - Socket.IO server instance
     */
    startCleanupTimer(io) {
        if (this.cleanupTimer) {
            console.log('⚠️ Cleanup timer đã được khởi động trước đó');
            return;
        }

        console.log('🔄 Khởi động cleanup timer cho expired seats...');

        this.cleanupTimer = setInterval(async () => {
            try {
                await this.cleanupExpiredSeats(io);
            } catch (error) {
                console.error('❌ Lỗi trong cleanup timer:', error);
            }
        }, this.CLEANUP_INTERVAL);

        console.log(`✅ Cleanup timer đã được khởi động (interval: ${this.CLEANUP_INTERVAL / 1000}s)`);
    }

    /**
     * Dừng cleanup timer
     */
    stopCleanupTimer() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
            console.log('✅ Cleanup timer đã được dừng');
        }
    }

    /**
     * Xóa các ghế đã hết hạn
     * @param {Object} io - Socket.IO server instance để broadcast updates
     */
    async cleanupExpiredSeats(io) {
        const now = Date.now();
        let totalCleaned = 0;
        const affectedShowtimes = new Set();

        try {
            // Duyệt qua tất cả showtime states
            for (const [showtimeId, seats] of this.seatStates.entries()) {
                let showtimeCleaned = 0;

                for (const [seatId, seatState] of seats.entries()) {
                    // Kiểm tra nếu ghế đã hết hạn
                    if (seatState.status === 'selecting' &&
                        seatState.timestamp &&
                        (now - seatState.timestamp) > this.SEAT_HOLD_TIMEOUT) {

                        // Xóa ghế hết hạn
                        seats.delete(seatId);
                        showtimeCleaned++;
                        totalCleaned++;
                        affectedShowtimes.add(showtimeId);

                        console.log(`🧹 Cleaned expired seat ${seatId} in showtime ${showtimeId} (held for ${Math.round((now - seatState.timestamp) / 1000)}s)`);
                    }
                }

                // Nếu showtime không còn ghế nào, xóa luôn showtime
                if (seats.size === 0) {
                    this.seatStates.delete(showtimeId);
                }
            }

            // Broadcast updates cho các showtime bị ảnh hưởng
            if (affectedShowtimes.size > 0) {
                for (const showtimeId of affectedShowtimes) {
                    try {
                        const seats = await this.getShowtimeSeats(showtimeId);
                        const roomName = `showtime-${showtimeId}`;
                        io.to(roomName).emit('seats-state', seats);
                    } catch (error) {
                        console.error(`❌ Lỗi khi broadcast update cho showtime ${showtimeId}:`, error);
                    }
                }
            }

            if (totalCleaned > 0) {
                console.log(`🧹 Cleanup completed: ${totalCleaned} expired seats cleaned from ${affectedShowtimes.size} showtimes`);
            }

        } catch (error) {
            console.error('❌ Lỗi trong quá trình cleanup expired seats:', error);
        }
    }

    /**
     * Giải phóng tất cả ghế của một user khi disconnect
     * @param {number} userId - ID của user
     * @param {string} socketId - Socket ID của user
     */
    async releaseUserSeats(userId, socketId) {
        let totalReleased = 0;
        const affectedShowtimes = new Set();

        try {
            // Duyệt qua tất cả showtime states
            for (const [showtimeId, seats] of this.seatStates.entries()) {
                for (const [seatId, seatState] of seats.entries()) {
                    // Kiểm tra nếu ghế thuộc về user này
                    if (seatState.userId === userId &&
                        (seatState.socketId === socketId || !seatState.socketId)) {

                        // Chỉ release ghế đang selecting, không touch ghế đã booked
                        if (seatState.status === 'selecting') {
                            // 🔧 FIX: Kiểm tra xem có booking đang được tạo không
                            // Nếu ghế được chọn trong vòng 10 giây qua, có thể đang booking
                            const timeSinceSelection = Date.now() - (seatState.timestamp || 0);
                            const isRecentSelection = timeSinceSelection < 10000; // 10 giây

                            if (isRecentSelection) {
                                console.log(`⏳ [DELAYED_RELEASE] Skipping release of recently selected seat ${seatId} (${timeSinceSelection}ms ago) - might be booking in progress`);
                                continue;
                            }

                            seats.delete(seatId);
                            totalReleased++;
                            affectedShowtimes.add(showtimeId);

                            console.log(`🔓 Released seat ${seatId} for disconnected user ${userId}`);
                        }
                    }
                }

                // Nếu showtime không còn ghế nào, xóa luôn showtime
                if (seats.size === 0) {
                    this.seatStates.delete(showtimeId);
                }
            }

            console.log(`🔓 Released ${totalReleased} seats for user ${userId} (socket: ${socketId})`);
            return totalReleased;

        } catch (error) {
            console.error(`❌ Lỗi khi release seats cho user ${userId}:`, error);
            return 0;
        }
    }
}

module.exports = new SeatSelectionService();    