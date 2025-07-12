// src/services/seatLayoutService.js
const { SeatLayout, CinemaRoom, Seat, Showtime, TicketBooking, TicketPricing, Ticket, sequelize } = require('../models');
const { Op, Transaction } = require('sequelize');

class SeatLayoutService {

    /**
     * Helper: Chuẩn hóa loại ghế từ các định dạng khác nhau về định dạng chuẩn
     */
    normalizeSeatType(seatType) {
        const seatTypeMapping = {
            'Regular': 'Thường',
            'Standard': 'Thường',
            'Normal': 'Thường',
            'Thường': 'Thường',
            'VIP': 'VIP',
            'Premium': 'VIP'
        };

        const normalizedSeatType = seatTypeMapping[seatType];
        if (!normalizedSeatType) {
            const validInputTypes = Object.keys(seatTypeMapping);
            throw new Error(`Loại ghế '${seatType}' không hợp lệ. Các giá trị hợp lệ: ${validInputTypes.join(', ')}`);
        }

        return normalizedSeatType;
    }

    /**
     * Lấy sơ đồ ghế của phòng chiếu
     */
    async getSeatLayout(roomId) {
        // Kiểm tra phòng chiếu có tồn tại không
        const cinemaRoom = await CinemaRoom.findByPk(roomId);
        if (!cinemaRoom) {
            throw new Error(`Không tìm thấy phòng chiếu có ID ${roomId}`);
        }

        // Lấy layout ghế
        const seatLayouts = await SeatLayout.findAll({
            where: { Cinema_Room_ID: roomId },
            order: [['Row_Label', 'ASC'], ['Column_Number', 'ASC']]
        });

        // Nhóm theo hàng
        const rowGroups = {};
        seatLayouts.forEach(seat => {
            if (!rowGroups[seat.Row_Label]) {
                rowGroups[seat.Row_Label] = [];
            }
            rowGroups[seat.Row_Label].push({
                Layout_ID: seat.Layout_ID,
                Row_Label: seat.Row_Label,
                Column_Number: seat.Column_Number,
                Seat_Type: seat.Seat_Type,
                Is_Active: seat.Is_Active
            });
        });

        // Chuyển đổi thành mảng
        const rows = Object.keys(rowGroups)
            .sort()
            .map(rowLabel => ({
                Row: rowLabel,
                Seats: rowGroups[rowLabel].sort((a, b) => a.Column_Number - b.Column_Number)
            }));

        // Lấy danh sách ghế đã được sử dụng (thông qua tickets)
        const layoutIds = seatLayouts.map(sl => sl.Layout_ID);
        const seats = await Seat.findAll({
            where: {
                Layout_ID: { [Op.in]: layoutIds }
            },
            attributes: ['Seat_ID', 'Layout_ID']
        });

        const seatMap = {};
        seats.forEach(seat => {
            seatMap[seat.Seat_ID] = seat.Layout_ID;
        });

        const usedTickets = await Ticket.findAll({
            where: {
                Seat_ID: { [Op.in]: Object.keys(seatMap).map(Number) },
                Status: { [Op.notIn]: ['Cancelled', 'Expired'] }
            },
            attributes: ['Seat_ID']
        });

        const usedLayoutIds = usedTickets.map(ticket => seatMap[ticket.Seat_ID]);

        // Thống kê theo loại ghế
        const seatCountByType = {};
        seatLayouts.forEach(seat => {
            if (!seatCountByType[seat.Seat_Type]) {
                seatCountByType[seat.Seat_Type] = 0;
            }
            seatCountByType[seat.Seat_Type]++;
        });

        const seatTypes = Object.keys(seatCountByType).map(type => ({
            SeatType: type,
            Count: seatCountByType[type]
        }));

        const maxRow = rows.length;
        const maxColumn = rows.length > 0 ? Math.max(...rows.map(r => r.Seats.length)) : 0;

        return {
            cinema_room: {
                Cinema_Room_ID: cinemaRoom.Cinema_Room_ID,
                Room_Name: cinemaRoom.Room_Name,
                Room_Type: cinemaRoom.Room_Type
            },
            rows,
            dimensions: { rows: maxRow, columns: maxColumn },
            stats: {
                total_seats: seatLayouts.length,
                seat_types: seatTypes
            },
            can_modify: usedLayoutIds.length === 0
        };
    }

    /**
     * Cấu hình sơ đồ ghế cho phòng chiếu
     */
    async configureSeatLayout(roomId, model) {
        const transaction = await sequelize.transaction();

        // Import Op trực tiếp
        const { Op } = require('sequelize');

        try {
            // Kiểm tra phòng chiếu
            const cinemaRoom = await CinemaRoom.findByPk(roomId, { transaction });
            if (!cinemaRoom) {
                throw new Error(`Không tìm thấy phòng chiếu có ID ${roomId}`);
            }

            // Kiểm tra sức chứa tối đa của phòng
            const maxCapacity = cinemaRoom.Max_Capacity || 150; // Nếu không có cấu hình sức chứa tối đa, lấy giá trị mặc định là 150

            // Tính tổng số ghế hiện có của phòng (không tính những ghế đang cấu hình lại)
            const currentActiveSeats = await SeatLayout.count({
                where: {
                    Cinema_Room_ID: roomId,
                    Is_Active: true,
                    Row_Label: { [Op.notIn]: model.Rows.map(r => r.RowLabel) }
                },
                transaction
            });

            // Tính tổng số ghế
            let totalSeats = 0;
            for (const row of model.Rows) {
                totalSeats += model.ColumnsPerRow - (row.EmptyColumns?.length || 0);
            }

            // Kiểm tra tổng số ghế sau khi cộng thêm ghế mới
            const totalSeatsAfterAddition = currentActiveSeats + totalSeats;
            if (totalSeatsAfterAddition > maxCapacity) {
                throw new Error(`Không thể thêm ${totalSeats} ghế mới. Phòng chỉ có thể chứa tối đa ${maxCapacity} ghế, hiện đã có ${currentActiveSeats} ghế. Vui lòng giảm số lượng ghế.`);
            }

            if (totalSeats < 20 || totalSeats > 150) {
                throw new Error(`Số lượng ghế phải từ 20 đến 150 (hiện tại: ${totalSeats})`);
            }

            // Kiểm tra có booking pending không
            if (await this.hasPendingBookingsForRoom(roomId)) {
                throw new Error('Không thể cập nhật layout ghế vì có đơn đặt vé đang chờ thanh toán');
            }

            // Kiểm tra phòng có showtime không
            const hasShowtimes = await Showtime.findOne({
                where: {
                    Cinema_Room_ID: roomId,
                    Show_Date: { [Op.gte]: new Date() },
                    Status: { [Op.ne]: 'Hidden' }
                },
                transaction
            });

            if (hasShowtimes) {
                throw new Error('Không thể thay đổi sơ đồ ghế vì phòng đã có lịch chiếu');
            }

            // Lấy danh sách row labels từ input
            const newRowLabels = model.Rows.map(r => r.RowLabel);

            // Xóa các layout ghế đang được cấu hình lại
            await SeatLayout.destroy({
                where: {
                    Cinema_Room_ID: roomId,
                    Row_Label: { [Op.in]: newRowLabels }
                },
                transaction
            });

            // Thêm các layout mới
            const newLayouts = [];
            for (const rowConfig of model.Rows) {
                for (let col = 1; col <= model.ColumnsPerRow; col++) {
                    if (!rowConfig.EmptyColumns?.includes(col)) {
                        newLayouts.push({
                            Cinema_Room_ID: roomId,
                            Row_Label: rowConfig.RowLabel,
                            Column_Number: col,
                            Seat_Type: rowConfig.SeatType,
                            Is_Active: true
                        });
                    }
                }
            }

            await SeatLayout.bulkCreate(newLayouts, { transaction });

            // Cập nhật tổng số ghế trong phòng
            await cinemaRoom.update({ Seat_Quantity: newLayouts.length }, { transaction });

            await transaction.commit();

            // Trả về kết quả
            const totalRows = await SeatLayout.count({
                where: { Cinema_Room_ID: roomId },
                distinct: true,
                col: 'Row_Label'
            });

            const seatTypeStats = await SeatLayout.findAll({
                where: { Cinema_Room_ID: roomId },
                attributes: [
                    'Seat_Type',
                    [sequelize.fn('COUNT', sequelize.col('Layout_ID')), 'count']
                ],
                group: ['Seat_Type']
            });

            return {
                id: require('crypto').randomUUID(),
                cinema_room_id: roomId,
                total_rows: totalRows,
                total_seats: newLayouts.length,
                seat_types: seatTypeStats.map(st => ({
                    type: st.Seat_Type,
                    count: parseInt(st.dataValues.count)
                }))
            };

        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    /**
     * Cấu hình hàng loạt sơ đồ ghế
     */
    async bulkConfigureSeatLayout(roomId, model, sequelize) {
        try {
            console.log(`Bắt đầu cấu hình ghế cho phòng ID: ${roomId} với input:`, JSON.stringify(model));

            // Nếu không có sequelize được truyền vào, lấy từ models
            if (!sequelize) {
                const { sequelize: seq } = require('../models');
                sequelize = seq;
            }

            // Import Op trực tiếp
            const { Op } = require('sequelize');

            // Kiểm tra phòng chiếu
            const cinemaRoom = await CinemaRoom.findByPk(roomId);
            if (!cinemaRoom) {
                return {
                    success: false,
                    message: `Không tìm thấy phòng chiếu có ID ${roomId}`,
                    error_code: 'ROOM_NOT_FOUND'
                };
            }

            // Kiểm tra sức chứa tối đa của phòng
            const maxCapacity = cinemaRoom.Max_Capacity || 50; // Nếu không có cấu hình sức chứa tối đa, lấy giá trị mặc định là 50

            // Tính tổng số ghế hiện có của phòng (không tính những ghế đang cấu hình lại)
            const parsedRows = this.parseRowsInput(model.RowsInput);
            const currentActiveSeats = await SeatLayout.count({
                where: {
                    Cinema_Room_ID: roomId,
                    Is_Active: true,
                    Row_Label: { [Op.notIn]: parsedRows }
                }
            });

            // Tính toán tổng số ghế dự kiến
            const newTotalColumns = model.ColumnsPerRow;
            const newEmptyColumnsPerRow = model.EmptyColumns?.length || 0;
            const newSeatsPerRow = newTotalColumns - newEmptyColumnsPerRow;
            const totalNewSeats = parsedRows.length * newSeatsPerRow;

            // Kiểm tra tổng số ghế sau khi cộng thêm ghế mới
            const totalSeatsAfterAddition = currentActiveSeats + totalNewSeats;
            if (totalSeatsAfterAddition > maxCapacity) {
                return {
                    success: false,
                    message: `Không thể thêm ${totalNewSeats} ghế mới. Phòng chỉ có thể chứa tối đa ${maxCapacity} ghế, hiện đã có ${currentActiveSeats} ghế. Vui lòng giảm số lượng ghế.`,
                    error_code: 'EXCEEDED_MAX_CAPACITY',
                    details: {
                        current_seats: currentActiveSeats,
                        new_seats: totalNewSeats,
                        max_capacity: maxCapacity,
                        exceeded_by: totalSeatsAfterAddition - maxCapacity
                    },
                    suggestion: 'Vui lòng giảm số lượng hàng hoặc cột để đảm bảo tổng số ghế không vượt quá sức chứa'
                };
            }

            // Kiểm tra số lượng ghế hợp lệ
            if (totalNewSeats < 20 || totalNewSeats > 150) {
                return {
                    success: false,
                    message: `Số lượng ghế phải từ 20 đến 150 (hiện tại: ${totalNewSeats})`,
                    error_code: 'INVALID_SEAT_COUNT',
                    details: {
                        total_seats: totalNewSeats,
                        rows: parsedRows.length,
                        columns_per_row: model.ColumnsPerRow,
                        empty_columns: model.EmptyColumns?.length || 0,
                        seats_per_row: newSeatsPerRow
                    },
                    suggestion: 'Vui lòng điều chỉnh số lượng hàng hoặc cột để có số lượng ghế từ 20 đến 150'
                };
            }

            // Kiểm tra có booking pending không
            if (await this.hasPendingBookingsForRoom(roomId)) {
                return {
                    success: false,
                    message: 'Không thể cập nhật layout ghế vì có đơn đặt vé đang chờ thanh toán',
                    error_code: 'PENDING_BOOKINGS',
                    suggestion: 'Vui lòng đợi các đơn này được hoàn tất hoặc hủy trước'
                };
            }

            // Kiểm tra loại ghế hợp lệ
            const validSeatTypes = ['Regular', 'VIP'];
            if (!validSeatTypes.includes(model.SeatType)) {
                return {
                    success: false,
                    message: `Loại ghế '${model.SeatType}' không hợp lệ`,
                    error_code: 'INVALID_SEAT_TYPE',
                    valid_values: validSeatTypes,
                    suggestion: `Loại ghế phải là một trong các giá trị: ${validSeatTypes.join(', ')}`
                };
            }

            // Kiểm tra dữ liệu đầu vào
            if (!model.RowsInput || model.RowsInput.trim() === '') {
                return {
                    success: false,
                    message: 'Danh sách hàng ghế không được bỏ trống',
                    error_code: 'INVALID_ROWS_INPUT',
                    suggestion: 'Vui lòng nhập danh sách hàng (ví dụ: A,B,C hoặc A-E)'
                };
            }

            if (model.ColumnsPerRow <= 0) {
                return {
                    success: false,
                    message: 'Số cột mỗi hàng phải lớn hơn 0',
                    error_code: 'INVALID_COLUMNS_COUNT',
                    suggestion: 'Vui lòng nhập số cột lớn hơn 0'
                };
            }

            // Xử lý input hàng ghế
            let rowLabels = [];

            if (model.RowsInput.includes('-')) {
                const range = model.RowsInput.split('-');
                if (range.length === 2 && range[0].length === 1 && range[1].length === 1) {
                    const start = range[0].charCodeAt(0);
                    const end = range[1].charCodeAt(0);

                    if (start > end) {
                        return {
                            success: false,
                            message: `Phạm vi hàng không hợp lệ: ${range[0]}-${range[1]}. Ký tự bắt đầu phải nhỏ hơn ký tự kết thúc trong bảng chữ cái A-Z`,
                            error_code: 'INVALID_ROW_RANGE',
                            suggestion: `Ví dụ hợp lệ: ${range[1]}-${range[0]}, không phải ${range[0]}-${range[1]}`
                        };
                    }

                    for (let c = start; c <= end; c++) {
                        rowLabels.push(String.fromCharCode(c));
                    }
                } else {
                    return {
                        success: false,
                        message: 'Định dạng phạm vi hàng không hợp lệ',
                        error_code: 'INVALID_ROW_RANGE_FORMAT',
                        suggestion: 'Định dạng hợp lệ: A-E (một ký tự đơn đến một ký tự đơn)'
                    };
                }
            } else {
                rowLabels = model.RowsInput.split(',')
                    .map(r => r.trim())
                    .filter(r => r.length > 0);

                if (rowLabels.length === 0) {
                    return {
                        success: false,
                        message: 'Không thể phân tích danh sách hàng',
                        error_code: 'EMPTY_ROW_LIST',
                        suggestion: 'Ví dụ hợp lệ: A,B,C hoặc A-E'
                    };
                }
            }

            console.log(`Đã xử lý input thành ${rowLabels.length} hàng: ${rowLabels.join(', ')}`);

            // Tính toán tổng số ghế dự kiến
            const totalColumns = model.ColumnsPerRow;
            const emptyColumnsPerRow = model.EmptyColumns?.length || 0;
            const seatsPerRow = totalColumns - emptyColumnsPerRow;
            const totalSeats = rowLabels.length * seatsPerRow;

            // Kiểm tra số lượng ghế hợp lệ
            if (totalSeats < 20 || totalSeats > 150) {
                return {
                    success: false,
                    message: `Số lượng ghế phải từ 20 đến 150 (hiện tại: ${totalSeats})`,
                    error_code: 'INVALID_SEAT_COUNT',
                    details: {
                        total_seats: totalSeats,
                        rows: rowLabels.length,
                        columns_per_row: model.ColumnsPerRow,
                        empty_columns: model.EmptyColumns?.length || 0,
                        seats_per_row: seatsPerRow
                    },
                    suggestion: 'Vui lòng điều chỉnh số lượng hàng hoặc cột để có số lượng ghế từ 20 đến 150'
                };
            }

            // Kiểm tra hàng đã tồn tại
            const existingRows = await SeatLayout.findAll({
                where: {
                    Cinema_Room_ID: roomId,
                    Row_Label: { [Op.in]: rowLabels }
                },
                attributes: ['Row_Label'],
                group: ['Row_Label']
            });

            const existingRowLabels = existingRows.map(r => r.Row_Label);

            if (existingRowLabels.length > 0) {
                if (!model.OverwriteExisting) {
                    return {
                        success: false,
                        message: `Các hàng ghế sau đã tồn tại: ${existingRowLabels.join(', ')}`,
                        error_code: 'ROWS_ALREADY_EXIST',
                        existing_rows: existingRowLabels,
                        suggestion: 'Nếu bạn muốn ghi đè cấu hình ghế hiện có, hãy thêm tham số \'overwriteExisting\': true'
                    };
                } else {
                    console.log(`Ghi đè cấu hình cho các hàng ghế đã tồn tại: ${existingRowLabels.join(', ')}`);
                }
            }

            // Tạo SeatMapConfigurationDto từ các hàng được chỉ định
            const configDto = {
                ColumnsPerRow: model.ColumnsPerRow,
                Rows: rowLabels.map(label => ({
                    RowLabel: label,
                    SeatType: model.SeatType,
                    EmptyColumns: model.EmptyColumns || []
                }))
            };

            // Gọi phương thức cấu hình hiện có
            const result = await this.configureSeatLayout(roomId, configDto);

            if (result) {
                console.log(`Đã cấu hình thành công sơ đồ ghế cho phòng ${roomId}: ${result.total_seats} ghế trong ${result.total_rows} hàng`);

                const successResult = {
                    success: true,
                    message: `Đã cấu hình thành công sơ đồ ghế cho phòng ${roomId}`,
                    result
                };

                return successResult;
            }

            console.log('Cấu hình ghế không thành công nhưng không có lỗi cụ thể');
            return {
                success: false,
                message: 'Cấu hình ghế không thành công',
                error_code: 'UNKNOWN_ERROR',
                suggestion: 'Vui lòng kiểm tra lại tham số đầu vào và thử lại'
            };

        } catch (error) {
            if (error.message.includes('Không tìm thấy')) {
                console.error(`Lỗi cấu hình ghế cho phòng ${roomId}: Không tìm thấy dữ liệu`);
                return {
                    success: false,
                    message: error.message,
                    error_code: 'NOT_FOUND',
                    suggestion: 'Vui lòng kiểm tra lại ID phòng chiếu'
                };
            }

            if (error.message.includes('Không thể thực hiện thao tác')) {
                console.error(`Lỗi cấu hình ghế cho phòng ${roomId}: Không thể thực hiện thao tác`);
                return {
                    success: false,
                    message: error.message,
                    error_code: 'INVALID_OPERATION',
                    suggestion: 'Phòng có thể đã có đặt vé hoặc đang được sử dụng'
                };
            }

            console.error(`Lỗi không xác định khi cấu hình ghế cho phòng ${roomId}:`, error);
            return {
                success: false,
                message: `Lỗi khi cấu hình ghế: ${error.message}`,
                error_code: 'INTERNAL_ERROR',
                stack_trace: error.stack,
                suggestion: 'Vui lòng liên hệ quản trị viên hệ thống'
            };
        }
    }

    /**
     * Cập nhật loại ghế
     */
    async updateSeatType(layoutId, model) {
        const seatLayout = await SeatLayout.findByPk(layoutId);
        if (!seatLayout) {
            throw new Error(`Không tìm thấy ghế có ID ${layoutId}`);
        }

        // Kiểm tra có booking pending không
        if (await this.hasPendingBookingsForLayouts([layoutId])) {
            throw new Error('Không thể cập nhật loại ghế vì có đơn đặt vé đang chờ thanh toán');
        }

        seatLayout.Seat_Type = model.SeatType;
        if (model.IsActive !== undefined) {
            seatLayout.Is_Active = model.IsActive;
        }

        await seatLayout.save();

        return {
            layout_id: seatLayout.Layout_ID,
            row_label: seatLayout.Row_Label,
            column_number: seatLayout.Column_Number,
            seat_type: seatLayout.Seat_Type,
            is_active: seatLayout.Is_Active
        };
    }

    /**
     * Cập nhật hàng loạt loại ghế
     */
    async bulkUpdateSeatTypes(model, sequelize) {
        if (!model.LayoutIds || model.LayoutIds.length === 0) {
            throw new Error('Danh sách ghế cần cập nhật không được trống');
        }

        // Import Op trực tiếp
        const { Op } = require('sequelize');

        // ✅ Chuẩn hóa loại ghế
        const seatTypeMapping = {
            'Regular': 'Thường',
            'Standard': 'Thường',
            'Normal': 'Thường',
            'Thường': 'Thường',
            'VIP': 'VIP',
            'Premium': 'VIP'
        };

        const normalizedSeatType = seatTypeMapping[model.SeatType];
        if (!normalizedSeatType) {
            const validInputTypes = Object.keys(seatTypeMapping);
            throw new Error(`Loại ghế '${model.SeatType}' không hợp lệ. Các giá trị hợp lệ: ${validInputTypes.join(', ')}`);
        }

        // Kiểm tra có booking pending không
        if (await this.hasPendingBookingsForLayouts(model.LayoutIds, sequelize)) {
            throw new Error('Không thể cập nhật loại ghế vì có đơn đặt vé đang chờ thanh toán');
        }

        const seatLayouts = await SeatLayout.findAll({
            where: { Layout_ID: { [Op.in]: model.LayoutIds } }
        });

        if (seatLayouts.length === 0) {
            throw new Error('Không tìm thấy ghế nào cần cập nhật');
        }

        // Cập nhật với loại ghế đã chuẩn hóa
        const updateData = { Seat_Type: normalizedSeatType };
        if (model.IsActive !== undefined) {
            updateData.Is_Active = model.IsActive;
        }

        await SeatLayout.update(updateData, {
            where: { Layout_ID: { [Op.in]: model.LayoutIds } }
        });

        return {
            UpdatedCount: seatLayouts.length,
            SeatType: normalizedSeatType, // ✅ Trả về loại ghế đã chuẩn hóa
            IsActive: model.IsActive
        };
    }

    /**
     * Lấy danh sách loại ghế
     */
    async getSeatTypes() {
        const fs = require('fs');
        const path = require('path');

        try {
            // Thử lấy dữ liệu từ database
            const seatTypes = await TicketPricing.findAll({
                where: { Status: 'Active' },
                attributes: [
                    'Room_Type',
                    'Seat_Type',
                    'Base_Price'
                ],
                group: ['Room_Type', 'Seat_Type', 'Base_Price'],
                order: [['Room_Type', 'ASC'], ['Seat_Type', 'ASC']]
            });

            // Nếu có dữ liệu từ DB, dùng dữ liệu đó
            if (seatTypes && seatTypes.length > 0) {
                return {
                    seat_types: seatTypes.map(st => ({
                        room_type: st.Room_Type,
                        seat_type: st.Seat_Type,
                        base_price: st.Base_Price
                    }))
                };
            }

            // Nếu không có dữ liệu từ DB, dùng dữ liệu từ file JSON
            console.log('Không tìm thấy dữ liệu loại ghế trong database, sử dụng dữ liệu từ file');

            const configPath = path.join(__dirname, '../config/ticketPricing.json');
            const priceConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

            // Chuyển đổi cấu trúc dữ liệu từ JSON sang định dạng API
            const result = [];

            for (const [roomType, seatPrices] of Object.entries(priceConfig.basePrices)) {
                for (const [seatType, basePrice] of Object.entries(seatPrices)) {
                    result.push({
                        room_type: roomType,
                        seat_type: seatType,
                        base_price: basePrice
                    });
                }
            }

            return {
                seat_types: result
            };

        } catch (error) {
            console.error('Lỗi khi lấy danh sách loại ghế:', error);
            // Trả về mảng rỗng nếu có lỗi
            return { seat_types: [] };
        }
    }

    /**
     * Toggle visibility (ẩn/hiện) hàng loạt layout ghế
     * Tái sử dụng logic từ bulk-delete nhưng cho phép set Is_Active = true hoặc false
     */
    async toggleSeatLayoutsVisibility(model, sequelize) {
        if (!model.LayoutIds || model.LayoutIds.length === 0) {
            throw new Error('Danh sách ghế cần thay đổi không được trống');
        }

        // Kiểm tra IsActive có được cung cấp không
        if (model.IsActive === undefined || model.IsActive === null) {
            throw new Error('Trạng thái Is_Active phải được chỉ định (true hoặc false)');
        }

        // Nếu không có sequelize được truyền vào, lấy từ models
        if (!sequelize) {
            const { sequelize: seq } = require('../models');
            sequelize = seq;
        }

        // Import Op trực tiếp
        const { Op } = require('sequelize');

        // Nếu đang ẩn ghế (set Is_Active = false), kiểm tra có booking pending không
        if (model.IsActive === false) {
            if (await this.hasPendingBookingsForLayouts(model.LayoutIds, sequelize)) {
                return {
                    success: false,
                    message: 'Không thể ẩn ghế vì có đơn đặt vé đang chờ thanh toán',
                    error_code: 'PENDING_BOOKINGS'
                };
            }

            // Kiểm tra ghế có đang được sử dụng không
            const usedLayoutIds = [];
            const checkUsageQuery = `
                SELECT DISTINCT sl.Layout_ID
                FROM [ksf00691_team03].[Seat_Layout] sl
                INNER JOIN [ksf00691_team03].[Seats] s ON sl.Layout_ID = s.Layout_ID
                INNER JOIN [ksf00691_team03].[Tickets] t ON s.Seat_ID = t.Seat_ID
                INNER JOIN [ksf00691_team03].[Ticket_Bookings] tb ON t.Booking_ID = tb.Booking_ID
                WHERE sl.Layout_ID IN (${model.LayoutIds.map(() => '?').join(',')})
                AND tb.Status IN ('Confirmed', 'Completed')
            `;

            try {
                const [usageResults] = await sequelize.query(checkUsageQuery, {
                    replacements: model.LayoutIds,
                    type: sequelize.QueryTypes.SELECT
                });

                if (usageResults && usageResults.length > 0) {
                    usageResults.forEach(row => {
                        if (row.Layout_ID && !usedLayoutIds.includes(row.Layout_ID)) {
                            usedLayoutIds.push(row.Layout_ID);
                        }
                    });
                }
            } catch (queryError) {
                console.warn('Không thể kiểm tra usage, tiếp tục với việc ẩn ghế:', queryError.message);
            }

            if (usedLayoutIds.length > 0) {
                return {
                    success: false,
                    message: `Không thể ẩn ghế vì có ${usedLayoutIds.length} ghế đã được sử dụng trong các đơn đặt vé đã xác nhận`,
                    error_code: 'SEATS_IN_USE',
                    used_layout_ids: usedLayoutIds
                };
            }
        }

        const transaction = await sequelize.transaction();

        try {
            // Lấy các SeatLayout cần thay đổi
            const seatLayouts = await SeatLayout.findAll({
                where: { Layout_ID: { [Op.in]: model.LayoutIds } },
                transaction
            });

            if (seatLayouts.length === 0) {
                throw new Error('Không tìm thấy layout ghế nào cần thay đổi');
            }

            // Cập nhật Is_Active theo yêu cầu
            await SeatLayout.update(
                { Is_Active: model.IsActive },
                {
                    where: { Layout_ID: { [Op.in]: model.LayoutIds } },
                    transaction
                }
            );

            // Cập nhật tổng số ghế active trong phòng
            if (seatLayouts.length > 0) {
                const roomId = seatLayouts[0].Cinema_Room_ID;
                const activeSeatCount = await SeatLayout.count({
                    where: {
                        Cinema_Room_ID: roomId,
                        Is_Active: true
                    },
                    transaction
                });

                await CinemaRoom.update(
                    { Seat_Quantity: activeSeatCount },
                    { where: { Cinema_Room_ID: roomId }, transaction }
                );
            }

            await transaction.commit();

            const actionText = model.IsActive ? 'hiện' : 'ẩn';
            return {
                success: true,
                message: `Đã ${actionText} thành công ${seatLayouts.length} ghế`,
                affected_count: seatLayouts.length,
                is_active: model.IsActive,
                room_id: seatLayouts[0]?.Cinema_Room_ID
            };

        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    /**
     * Xóa mềm layout ghế (giữ nguyên để backward compatibility)
     * Sử dụng toggleSeatLayoutsVisibility với IsActive = false
     */
    async softDeleteSeatLayouts(model, sequelize) {
        // Tái sử dụng hàm toggleSeatLayoutsVisibility với IsActive = false
        const toggleModel = {
            ...model,
            IsActive: false
        };

        const result = await this.toggleSeatLayoutsVisibility(toggleModel, sequelize);

        // Chuyển đổi message để phù hợp với context "xóa mềm"
        if (result.success) {
            result.message = `Đã xóa mềm thành công ${result.affected_count} ghế`;
        }

        return result;
    }

    /**
     * Tạo phòng chiếu mới với layout có sẵn
     */
    async createRoomWithExistingLayout(model) {
        // Kiểm tra phòng chiếu mẫu có tồn tại không
        const templateRoom = await CinemaRoom.findByPk(model.TemplateRoomId);
        if (!templateRoom) {
            throw new Error(`Không tìm thấy phòng chiếu mẫu có ID ${model.TemplateRoomId}`);
        }

        // Kiểm tra xem phòng chiếu mẫu có layout ghế không
        const templateLayouts = await SeatLayout.findAll({
            where: {
                Cinema_Room_ID: model.TemplateRoomId,
                Is_Active: true
            }
        });

        if (templateLayouts.length === 0) {
            throw new Error('Phòng chiếu mẫu không có layout ghế active để sao chép');
        }

        // Kiểm tra số lượng ghế hợp lệ
        const activeSeatCount = templateLayouts.length;
        if (activeSeatCount < 20 || activeSeatCount > 150) {
            throw new Error(`Số lượng ghế trong phòng mẫu phải từ 20 đến 150 (hiện tại: ${activeSeatCount})`);
        }

        const transaction = await sequelize.transaction();

        try {
            // Tạo phòng chiếu mới
            const newRoom = await CinemaRoom.create({
                Room_Name: model.RoomName,
                Room_Type: model.RoomType,
                Seat_Quantity: activeSeatCount,
                Status: 'Active'
            }, { transaction });

            // Sao chép layout ghế từ phòng chiếu mẫu
            const newLayouts = templateLayouts.map(templateLayout => ({
                Cinema_Room_ID: newRoom.Cinema_Room_ID,
                Row_Label: templateLayout.Row_Label,
                Column_Number: templateLayout.Column_Number,
                Seat_Type: templateLayout.Seat_Type,
                Is_Active: templateLayout.Is_Active
            }));

            await SeatLayout.bulkCreate(newLayouts, { transaction });

            await transaction.commit();

            return {
                cinema_room: {
                    Cinema_Room_ID: newRoom.Cinema_Room_ID,
                    Room_Name: newRoom.Room_Name,
                    Room_Type: newRoom.Room_Type,
                    seat_quantity: newRoom.Seat_Quantity
                },
                message: 'Đã tạo phòng chiếu mới và sao chép layout ghế thành công'
            };

        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    /**
     * Kiểm tra xem có booking chờ xử lý nào sử dụng các layout ID không
     */
    async hasPendingBookingsForLayouts(layoutIds, sequelize) {
        try {
            if (!layoutIds || !Array.isArray(layoutIds) || layoutIds.length === 0) {
                return false;
            }

            // Import Op từ Sequelize, không phụ thuộc vào sequelize được truyền vào
            const { Op } = require('sequelize');

            // Lấy danh sách Seat với các Layout_ID
            const seats = await Seat.findAll({
                where: {
                    Layout_ID: { [Op.in]: layoutIds },
                    Is_Active: true
                },
                attributes: ['Seat_ID']
            });

            if (!seats || seats.length === 0) {
                return false;
            }

            // Lấy các vé đã đặt cho các ghế này
            const tickets = await Ticket.findAll({
                where: {
                    Seat_ID: { [Op.in]: seats.map(seat => seat.Seat_ID) },
                    Status: { [Op.notIn]: ['Cancelled', 'Expired'] }
                },
                include: [{
                    model: TicketBooking,
                    as: 'TicketBooking',
                    where: {
                        Status: 'Pending'
                    },
                    required: true
                }]
            });

            return tickets.length > 0; // Có booking pending nếu có vé
        } catch (error) {
            console.error('Lỗi trong hàm hasPendingBookingsForLayouts:', error);
            return true; // Mặc định trả về true để an toàn
        }
    }

    /**
     * Kiểm tra xem phòng chiếu có đặt vé đang chờ không
     */
    async hasPendingBookingsForRoom(roomId) {
        try {
            // Lấy sequelize từ models
            const { sequelize } = require('../models');

            // Lấy tất cả layout ghế của phòng
            const layouts = await SeatLayout.findAll({
                where: { Cinema_Room_ID: roomId },
                attributes: ['Layout_ID']
            });

            if (layouts.length === 0) {
                return false;
            }

            // Dùng phương thức đã có để kiểm tra
            return await this.hasPendingBookingsForLayouts(
                layouts.map(l => l.Layout_ID),
                sequelize
            );
        } catch (error) {
            console.error('Lỗi trong hàm hasPendingBookingsForRoom:', error);
            return true; // Mặc định trả về true để an toàn
        }
    }

    /**
     * Lấy thống kê sử dụng ghế cho một phòng trong khoảng thời gian
     * @param {number} roomId - ID của phòng chiếu
     * @param {number} days - Số ngày cần lấy thống kê (mặc định 30 ngày)
     * @returns {object} Thống kê sử dụng ghế
     */
    async getSeatUsageStats(roomId, days = 30) {
        const { CinemaRoom, Booking_Seat, Showtime, TicketBooking, SeatLayout, sequelize } = require('../models');
        const { Op } = require('sequelize');

        // Kiểm tra phòng chiếu tồn tại
        const room = await CinemaRoom.findByPk(roomId);
        if (!room) {
            throw new Error(`Không tìm thấy phòng chiếu với ID ${roomId}`);
        }

        // Xác định khoảng thời gian tính thống kê
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Lấy tất cả các suất chiếu đã kết thúc trong phòng này
        const showtimes = await Showtime.findAll({
            where: {
                Cinema_Room_ID: roomId,
                Show_Date: { [Op.between]: [startDate, endDate] },
                Status: 'Finished'
            },
            attributes: ['Showtime_ID']
        });

        // Nếu không có suất chiếu nào
        if (!showtimes.length) {
            return {
                room_id: roomId,
                room_name: room.Room_Name,
                period_days: days,
                total_bookings: 0,
                seat_usage: [],
                most_booked_seats: [],
                least_booked_seats: []
            };
        }

        // Lấy ID các suất chiếu
        const showtimeIds = showtimes.map(s => s.Showtime_ID);

        // Lấy tất cả các đặt ghế cho các suất chiếu này
        const seatBookings = await Booking_Seat.findAll({
            include: [{
                model: TicketBooking,
                as: 'TicketBooking',
                where: {
                    Showtime_ID: { [Op.in]: showtimeIds },
                    Status: 'Completed'
                },
                required: true
            }]
        });

        // Lấy layout ghế hiện tại của phòng
        const currentLayout = await SeatLayout.findAll({
            where: {
                Cinema_Room_ID: roomId,
                Is_Active: true
            }
        });

        // Tính tần suất sử dụng của từng ghế
        const seatUsageCount = {};
        seatBookings.forEach(booking => {
            const seatKey = `${booking.Seat_Row}${booking.Seat_Number}`;
            seatUsageCount[seatKey] = (seatUsageCount[seatKey] || 0) + 1;
        });

        // Chuyển thành mảng để sắp xếp
        const seatUsageArray = Object.keys(seatUsageCount).map(key => ({
            seat: key,
            count: seatUsageCount[key],
            row: key.replace(/[0-9]/g, ''),
            number: parseInt(key.replace(/[^0-9]/g, ''))
        }));

        // Sắp xếp theo số lần đặt
        seatUsageArray.sort((a, b) => b.count - a.count);

        // Lấy top ghế được đặt nhiều nhất và ít nhất
        const mostBooked = seatUsageArray.slice(0, 5);
        const leastBooked = [...seatUsageArray].sort((a, b) => a.count - b.count).slice(0, 5);

        return {
            room_id: roomId,
            room_name: room.Room_Name,
            period_days: days,
            total_bookings: seatBookings.length,
            seat_usage: seatUsageArray,
            most_booked_seats: mostBooked,
            least_booked_seats: leastBooked
        };
    }

    /**
     * Chuyển đổi chuỗi đầu vào hàng ghế thành mảng các ký tự
     * Hỗ trợ các định dạng "A,B,C" hoặc "A-E"
     */
    parseRowsInput(rowsInput) {
        if (!rowsInput || rowsInput.trim() === '') {
            return [];
        }

        let rowLabels = [];

        if (rowsInput.includes('-')) {
            const range = rowsInput.split('-');
            if (range.length === 2 && range[0].length === 1 && range[1].length === 1) {
                const start = range[0].charCodeAt(0);
                const end = range[1].charCodeAt(0);

                if (start > end) {
                    return [];
                }

                for (let c = start; c <= end; c++) {
                    rowLabels.push(String.fromCharCode(c));
                }
            }
        } else {
            rowLabels = rowsInput.split(',')
                .map(r => r.trim())
                .filter(r => r.length > 0);
        }

        return rowLabels;
    }
}

module.exports = new SeatLayoutService();

