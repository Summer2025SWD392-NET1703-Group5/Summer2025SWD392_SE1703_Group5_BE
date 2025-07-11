// File: src/services/ticketPricingService.js
// Mô tả: Service xử lý logic nghiệp vụ cho Quản lý Giá vé theo Loại ghế (TicketPricing).

const { TicketPricing, SeatLayout, CinemaRoom, Seat, TicketBooking, sequelize } = require('../models');
const { Op } = require('sequelize');

// Helper function to check for pending bookings for a specific seat type
async function _hasPendingBookingsForSeatType(seatType, transaction) {
    const seatLayouts = await SeatLayout.findAll({
        attributes: ['Layout_ID'],
        where: {
            Seat_Type: seatType,
            Is_Active: true
        },
        transaction
    });

    if (!seatLayouts.length) {
        return false;
    }

    const layoutIds = seatLayouts.map(sl => sl.Layout_ID);

    const pendingBookingsCount = await Seat.count({
        where: {
            Layout_ID: { [Op.in]: layoutIds }
        },
        include: [{
            model: TicketBooking,
            as: 'TicketBooking', // Phải khớp với alias trong model Seat.js
            where: { Status: 'Pending' },
            required: true // INNER JOIN
        }],
        transaction
    });

    return pendingBookingsCount > 0;
}


const ticketPricingService = {
    async getAllTicketPricings() {
        const pricings = await TicketPricing.findAll({
            where: { Status: 'Active' }, // Chỉ lấy các loại vé đang hoạt động
            order: [['Room_Type', 'ASC'], ['Seat_Type', 'ASC']]
        });

        // Group by Room_Type client-side for similar structure to C#
        const grouped = pricings.reduce((acc, tp) => {
            const roomType = tp.Room_Type;
            if (!acc[roomType]) {
                acc[roomType] = [];
            }
            acc[roomType].push({
                Price_ID: tp.Price_ID,
                Seat_Type: tp.Seat_Type,
                Base_Price: tp.Base_Price,
                Status: tp.Status,
                Created_Date: tp.Created_Date,
                Last_Updated: tp.Last_Updated
            });
            return acc;
        }, {});

        return Object.keys(grouped).map(roomType => ({
            room_type: roomType,
            seat_types: grouped[roomType]
        }));
    },

    async getTicketPricingById(id) {
        const pricing = await TicketPricing.findByPk(id);
        if (!pricing) {
            const error = new Error(`Không tìm thấy loại giá vé có ID ${id}`);
            error.statusCode = 404;
            throw error;
        }

        // Lấy số lượng ghế sử dụng loại vé này
        const seatCount = await SeatLayout.count({
            where: { Seat_Type: pricing.Seat_Type, Is_Active: true }
        });

        // Lấy thông tin các phòng đang sử dụng loại ghế này
        const usedInRoomsData = await SeatLayout.findAll({
            where: { Seat_Type: pricing.Seat_Type, Is_Active: true },
            include: [{
                model: CinemaRoom,
                as: 'CinemaRoom', // Phải khớp với alias trong model SeatLayout.js
                attributes: ['Room_Name']
            }],
            attributes: [
                // Cần đảm bảo alias 'CinemaRoom.Room_Name' là đúng hoặc truy cập qua 'CinemaRoom.Room_Name'
                [sequelize.literal('"CinemaRoom"."Room_Name"'), 'room_name'], // Điều chỉnh nếu cần dựa trên alias
                [sequelize.fn('COUNT', sequelize.col('SeatLayout.Layout_ID')), 'seat_count']
            ],
            group: [sequelize.literal('"CinemaRoom"."Room_Name"'), 'CinemaRoom.Cinema_Room_ID'], // Group by cả ID để ổn định
            raw: true // Để lấy kết quả phẳng hơn cho group by
        });

        // Xử lý usedInRoomsData để có định dạng mong muốn
        // Sequelize có thể trả về tên cột bao gồm tên model, ví dụ 'CinemaRoom.Room_Name'
        // Chúng ta cần chuẩn hóa nó thành 'room_name'
        const usedInRooms = usedInRoomsData.map(item => ({
            // Tên cột thực tế có thể là 'CinemaRoom.Room_Name' hoặc chỉ 'Room_Name' tùy thuộc vào cấu hình include và raw query
            room_name: item['room_name'] || item['CinemaRoom.Room_Name'],
            seat_count: parseInt(item.seat_count, 10)
        })).filter(item => item.room_name);


        return {
            Price_ID: pricing.Price_ID,
            Room_Type: pricing.Room_Type,
            Seat_Type: pricing.Seat_Type,
            Base_Price: pricing.Base_Price,
            Status: pricing.Status,
            Created_Date: pricing.Created_Date,
            Last_Updated: pricing.Last_Updated,
            total_seats_of_type: seatCount, // Tổng số ghế cấu hình với loại ghế này
            used_in_rooms: usedInRooms
        };
    },

    async createTicketPricing(data) {
        const { Room_Type, Seat_Type, Base_Price } = data;

        if (!Room_Type || typeof Room_Type !== 'string' || Room_Type.trim() === '') {
            const error = new Error("Loại phòng không được để trống");
            error.statusCode = 400;
            throw error;
        }
        if (!Seat_Type || typeof Seat_Type !== 'string' || Seat_Type.trim() === '') {
            const error = new Error("Loại ghế không được để trống");
            error.statusCode = 400;
            throw error;
        }
        if (Base_Price === undefined || typeof Base_Price !== 'number' || Base_Price <= 0) {
            const error = new Error("Giá vé phải là một số lớn hơn 0");
            error.statusCode = 400;
            throw error;
        }

        // Model đã có unique constraint cho (Room_Type, Seat_Type) và defaultValue cho Status
        try {
            const newPricing = await TicketPricing.create({
                Room_Type: Room_Type.trim(),
                Seat_Type: Seat_Type.trim(),
                Base_Price,
                Created_Date: sequelize.fn('GETDATE'), // Sử dụng hàm của SQL Server
                Last_Updated: sequelize.fn('GETDATE')  // Sử dụng hàm của SQL Server
                // Status sẽ dùng giá trị mặc định từ model
            });
            return {
                Price_ID: newPricing.Price_ID,
                Room_Type: newPricing.Room_Type,
                Seat_Type: newPricing.Seat_Type,
                Base_Price: newPricing.Base_Price,
                Status: newPricing.Status,
                Created_Date: newPricing.Created_Date, // Sequelize sẽ trả về giá trị đã được insert
                Last_Updated: newPricing.Last_Updated // Sequelize sẽ trả về giá trị đã được insert
            };
        } catch (err) {
            if (err.name === 'SequelizeUniqueConstraintError') {
                const error = new Error(`Loại ghế '${Seat_Type.trim()}' cho loại phòng '${Room_Type.trim()}' đã tồn tại`);
                error.statusCode = 400;
                throw error;
            }
            // Lỗi khác
            console.error('[Service Error - createTicketPricing]', err); // Log chi tiết lỗi ở service
            const error = new Error("Có lỗi xảy ra khi tạo loại giá vé mới: " + err.message);
            error.statusCode = 500;
            throw error;
        }
    },

    async updateTicketPricing(id, data) {
        return sequelize.transaction(async (t) => {
            const pricing = await TicketPricing.findByPk(id, { transaction: t });
            if (!pricing) {
                const error = new Error(`Không tìm thấy loại giá vé có ID ${id}`);
                error.statusCode = 404;
                throw error;
            }

            const { Room_Type, Seat_Type, Base_Price, Status } = data;

            // Kiểm tra có booking pending không
            if (await _hasPendingBookingsForSeatType(pricing.Seat_Type, t)) {
                const error = new Error("Không thể cập nhật thông tin loại giá vé vì có đơn đặt vé đang chờ thanh toán cho loại ghế này.");
                error.statusCode = 400; // Hoặc 409 Conflict
                throw error;
            }

            let limitedUpdate = false;
            // Kiểm tra xem loại ghế có đang được sử dụng không nếu Seat_Type hoặc Room_Type thay đổi
            // Chỉ cho phép thay đổi Seat_Type và Room_Type nếu nó chưa được sử dụng trong SeatLayout
            const isCurrentlyInUse = await SeatLayout.count({ where: { Seat_Type: pricing.Seat_Type, Is_Active: true }, transaction: t }) > 0;

            if (isCurrentlyInUse && ((Room_Type && Room_Type !== pricing.Room_Type) || (Seat_Type && Seat_Type !== pricing.Seat_Type))) {
                limitedUpdate = true;
            }


            if (Base_Price !== undefined) {
                if (typeof Base_Price !== 'number' || Base_Price <= 0) {
                    const error = new Error("Giá vé phải là một số lớn hơn 0");
                    error.statusCode = 400;
                    throw error;
                }
                pricing.Base_Price = Base_Price;
            }
            if (Status !== undefined) {
                if (!['Active', 'Inactive', 'Deleted'].includes(Status)) {
                    const error = new Error("Trạng thái không hợp lệ.");
                    error.statusCode = 400;
                    throw error;
                }
                pricing.Status = Status;
            }

            pricing.Last_Updated = new Date();

            if (!limitedUpdate) {
                if (Room_Type !== undefined && Room_Type.trim() !== '') {
                    pricing.Room_Type = Room_Type.trim();
                }
                if (Seat_Type !== undefined && Seat_Type.trim() !== '') {
                    pricing.Seat_Type = Seat_Type.trim();
                }
            }

            try {
                await pricing.save({ transaction: t });
            } catch (err) {
                if (err.name === 'SequelizeUniqueConstraintError') {
                    const error = new Error(`Loại ghế '${pricing.Seat_Type}' cho loại phòng '${pricing.Room_Type}' đã tồn tại`);
                    error.statusCode = 400;
                    throw error;
                }
                throw err; // Ném lại lỗi để transaction rollback
            }

            const response = {
                Price_ID: pricing.Price_ID,
                Room_Type: pricing.Room_Type,
                Seat_Type: pricing.Seat_Type,
                Base_Price: pricing.Base_Price,
                Status: pricing.Status,
                Last_Updated: pricing.Last_Updated,
            };

            if (limitedUpdate) {
                return {
                    data: response,
                    message: "Chỉ cập nhật giá vé và trạng thái. Không thể thay đổi loại ghế/phòng vì đang được sử dụng trong sơ đồ ghế."
                };
            }
            return response;
        });
    },

    async deleteTicketPricing(id) {
        return sequelize.transaction(async (t) => {
            const pricing = await TicketPricing.findByPk(id, { transaction: t });
            if (!pricing) {
                const error = new Error(`Không tìm thấy loại giá vé có ID ${id}`);
                error.statusCode = 404;
                throw error;
            }

            if (await _hasPendingBookingsForSeatType(pricing.Seat_Type, t)) {
                const error = new Error("Không thể xóa loại giá vé vì có đơn đặt vé đang chờ thanh toán cho loại ghế này.");
                error.statusCode = 400;
                throw error;
            }

            const isInUse = await SeatLayout.count({ where: { Seat_Type: pricing.Seat_Type, Is_Active: true }, transaction: t }) > 0;

            pricing.Status = isInUse ? 'Inactive' : 'Deleted'; // Trong C# là "Deleted", ở đây có thể dùng chung "Inactive"
            pricing.Last_Updated = new Date();
            await pricing.save({ transaction: t });

            return {
                status: pricing.Status === 'Inactive' ? "deactivated" : "deleted",
                message: isInUse ? "Loại giá vé đang được sử dụng, đã đánh dấu là không hoạt động." : "Loại giá vé đã được đánh dấu là đã xóa."
            };
        });
    },

    async bulkUpdateTicketPrices(priceUpdates) { // priceUpdates: [{ Price_ID, Base_Price }]
        if (!Array.isArray(priceUpdates) || !priceUpdates.length) {
            const error = new Error("Dữ liệu cập nhật không hợp lệ.");
            error.statusCode = 400;
            throw error;
        }

        return sequelize.transaction(async (t) => {
            let updatedCount = 0;
            for (const update of priceUpdates) {
                if (update.Base_Price === undefined || typeof update.Base_Price !== 'number' || update.Base_Price <= 0) {
                    const error = new Error(`Giá vé cho Price_ID ${update.Price_ID} không hợp lệ.`);
                    error.statusCode = 400;
                    throw error;
                }

                const pricing = await TicketPricing.findByPk(update.Price_ID, { transaction: t });
                if (!pricing) {
                    const error = new Error(`Không tìm thấy loại giá vé có ID ${update.Price_ID}`);
                    error.statusCode = 404; // Hoặc có thể bỏ qua và tiếp tục
                    throw error;
                }

                if (await _hasPendingBookingsForSeatType(pricing.Seat_Type, t)) {
                    const error = new Error(`Không thể cập nhật giá vé cho loại ghế '${pricing.Seat_Type}' (ID: ${pricing.Price_ID}) vì có đơn đặt vé đang chờ thanh toán.`);
                    error.statusCode = 400;
                    throw error;
                }

                pricing.Base_Price = update.Base_Price;
                pricing.Last_Updated = new Date();
                await pricing.save({ transaction: t });
                updatedCount++;
            }
            return {
                updated_count: updatedCount,
                message: "Cập nhật giá vé hàng loạt thành công."
            };
        });
    },

    async getAvailableSeatTypes() {
        // Lấy tất cả Seat_Type đang 'Active' từ TicketPricing
        const activeTicketPricings = await TicketPricing.findAll({
            where: { Status: 'Active' },
            attributes: ['Seat_Type', 'Base_Price'],
            raw: true
        });

        if (!activeTicketPricings.length) return [];

        const seatTypeNames = [...new Set(activeTicketPricings.map(tp => tp.Seat_Type))];

        // Đếm số lượng sử dụng của từng Seat_Type trong SeatLayout
        const usageCounts = await SeatLayout.findAll({
            attributes: ['Seat_Type', [sequelize.fn('COUNT', sequelize.col('Seat_Type')), 'count']],
            where: {
                Seat_Type: { [Op.in]: seatTypeNames },
                Is_Active: true
            },
            group: ['Seat_Type'],
            raw: true
        });

        // Tính giá trung bình cho từng Seat_Type từ activeTicketPricings
        const averagePrices = activeTicketPricings.reduce((acc, tp) => {
            if (!acc[tp.Seat_Type]) {
                acc[tp.Seat_Type] = { total: 0, count: 0 };
            }
            acc[tp.Seat_Type].total += parseFloat(tp.Base_Price);
            acc[tp.Seat_Type].count++;
            return acc;
        }, {});

        return seatTypeNames.map(st => {
            const usage = usageCounts.find(u => u.Seat_Type === st);
            const priceData = averagePrices[st];
            return {
                seat_type: st,
                usage_count: usage ? parseInt(usage.count, 10) : 0,
                average_price: priceData ? (priceData.total / priceData.count) : 0
            };
        });
    }
};

module.exports = ticketPricingService; 