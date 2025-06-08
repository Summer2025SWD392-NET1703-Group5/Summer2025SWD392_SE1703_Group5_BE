// src/services/seatLayoutService.js
const { SeatLayout, CinemaRoom, Seat, Showtime, TicketBooking, TicketPricing, Ticket, sequelize } = require('../models');
const { Op, Transaction } = require('sequelize');

class SeatLayoutService {

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
     * Cập nhật hàng loạt loại ghế
     */
    async bulkUpdateSeatTypes(model, sequelize) {
        if (!model.LayoutIds || model.LayoutIds.length === 0) {
            throw new Error('Danh sách ghế cần cập nhật không được trống');
        }

        // Import Op trực tiếp
        const { Op } = require('sequelize');

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

        // Cập nhật
        const updateData = { Seat_Type: model.SeatType };
        if (model.IsActive !== undefined) {
            updateData.Is_Active = model.IsActive;
        }

        await SeatLayout.update(updateData, {
            where: { Layout_ID: { [Op.in]: model.LayoutIds } }
        });

        return {
            UpdatedCount: seatLayouts.length,
            SeatType: model.SeatType,
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
     * Xóa mềm layout ghế
     */
    async softDeleteSeatLayouts(model, sequelize) {
        if (!model.LayoutIds || model.LayoutIds.length === 0) {
            throw new Error('Danh sách ghế cần xóa không được trống');
        }


        // Nếu không có sequelize được truyền vào, lấy từ models
        if (!sequelize) {
            const { sequelize: seq } = require('../models');
            sequelize = seq;
        }


        // Import Op trực tiếp
        const { Op } = require('sequelize');


        // Kiểm tra có booking pending không
        if (await this.hasPendingBookingsForLayouts(model.LayoutIds, sequelize)) {
            return {
                success: false,
                message: 'Không thể xóa ghế vì có đơn đặt vé đang chờ thanh toán',
                error_code: 'PENDING_BOOKINGS'
            };
        }


        // Kiểm tra ghế có đang được sử dụng không
        const usedLayoutIds = [];


        try {
            // Lấy tất cả Seat có Layout_ID trong model.LayoutIds
            const seats = await Seat.findAll({
                where: {
                    Layout_ID: { [Op.in]: model.LayoutIds }
                },
                attributes: ['Seat_ID', 'Layout_ID']
            });


            if (seats.length > 0) {
                // Lấy tất cả Seat_ID
                const seatIds = seats.map(seat => seat.Seat_ID);


                // Lập map từ Seat_ID đến Layout_ID
                const seatToLayoutMap = {};
                seats.forEach(seat => {
                    seatToLayoutMap[seat.Seat_ID] = seat.Layout_ID;
                });


                // Kiểm tra các ghế có được sử dụng trong vé không
                const usedSeats = await Ticket.findAll({
                    where: {
                        Seat_ID: { [Op.in]: seatIds },
                        Status: { [Op.notIn]: ['Cancelled', 'Expired'] }
                    },
                    attributes: ['Seat_ID']
                });


                // Lấy Layout_ID của các ghế đã được sử dụng
                usedSeats.forEach(ticket => {
                    const layoutId = seatToLayoutMap[ticket.Seat_ID];
                    if (layoutId && !usedLayoutIds.includes(layoutId)) {
                        usedLayoutIds.push(layoutId);
                    }
                });
            }
        } catch (error) {
            console.error('Lỗi khi kiểm tra ghế đang sử dụng:', error);
        }


        if (usedLayoutIds.length > 0) {
            return {
                success: false,
                message: 'Một số layout ghế đã được sử dụng trong đặt vé và không thể xóa',
                used_layouts: usedLayoutIds
            };
        }


        const transaction = await sequelize.transaction();


        try {
            // Lấy các SeatLayout cần xóa mềm
            const seatLayouts = await SeatLayout.findAll({
                where: { Layout_ID: { [Op.in]: model.LayoutIds } },
                transaction
            });


            if (seatLayouts.length === 0) {
                throw new Error('Không tìm thấy layout ghế nào cần xóa');
            }


            // Cập nhật is_active = false thay vì xóa cứng
            await SeatLayout.update(
                { Is_Active: false },
                {
                    where: { Layout_ID: { [Op.in]: model.LayoutIds } },
                    transaction
                }
            );


            // Cập nhật tổng số ghế trong phòng
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


            return {
                success: true,
                message: `Đã xóa mềm ${seatLayouts.length} layout ghế thành công`,
                deleted_count: seatLayouts.length,
                deleted_layouts: seatLayouts.map(sl => ({
                    layout_id: sl.Layout_ID,
                    row_label: sl.Row_Label,
                    column_number: sl.Column_Number
                }))
            };


        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

}

module.exports = new SeatLayoutService();

