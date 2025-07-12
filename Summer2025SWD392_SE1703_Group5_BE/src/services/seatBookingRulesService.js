const { SeatLayout, Seat, Ticket, TicketBooking, sequelize } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * SEAT BOOKING RULES SERVICE
 * Xử lý các quy tắc nghiệp vụ khi đặt ghế rạp chiếu phim
 * 
 * PRIORITY 1 RULES:
 * 1. Adjacent Seat Rule - Ghế phải liền kề nhau
 * 2. Gap Prevention Rule - Không để trống ghế lẻ
 */
class SeatBookingRulesService {

    /**
     * 🔴 PRIORITY 1: ADJACENT SEAT RULE
     * Validate ghế phải liền kề nhau khi đặt >= 2 ghế
     */
    async validateAdjacentSeats(selectedLayoutIds, showtimeId, transaction = null) {
        try {
            logger.info(`[validateAdjacentSeats] Kiểm tra ghế liền kề cho ${selectedLayoutIds.length} ghế`);

            // Nếu chỉ đặt 1 ghế, không cần kiểm tra liền kề
            if (selectedLayoutIds.length <= 1) {
                return {
                    valid: true,
                    message: 'Chỉ 1 ghế được chọn, không cần kiểm tra liền kề'
                };
            }

            // Lấy thông tin layout của các ghế được chọn
            const selectedLayouts = await SeatLayout.findAll({
                where: {
                    Layout_ID: { [Op.in]: selectedLayoutIds },
                    Is_Active: true
                },
                attributes: ['Layout_ID', 'Row_Label', 'Column_Number', 'Cinema_Room_ID'],
                transaction
            });

            if (selectedLayouts.length !== selectedLayoutIds.length) {
                throw new Error('Một số ghế không tồn tại hoặc không hoạt động');
            }

            // Kiểm tra tất cả ghế cùng phòng chiếu
            const roomIds = [...new Set(selectedLayouts.map(l => l.Cinema_Room_ID))];
            if (roomIds.length > 1) {
                return {
                    valid: false,
                    errorCode: 'DIFFERENT_ROOMS',
                    message: 'Tất cả ghế phải trong cùng một phòng chiếu'
                };
            }

            // Nhóm ghế theo hàng
            const seatsByRow = this._groupSeatsByRow(selectedLayouts);

            // Validate từng hàng
            for (const [rowLabel, seats] of Object.entries(seatsByRow)) {
                const rowValidation = this._validateSingleRowAdjacency(seats, rowLabel);
                if (!rowValidation.valid) {
                    return rowValidation;
                }
            }

            // Kiểm tra multiple rows (nếu có)
            if (Object.keys(seatsByRow).length > 1) {
                const multiRowValidation = this._validateMultipleRowsAdjacency(seatsByRow);
                if (!multiRowValidation.valid) {
                    return multiRowValidation;
                }
            }

            logger.info(`[validateAdjacentSeats] ✅ Tất cả ghế đều liền kề hợp lệ`);
            return {
                valid: true,
                message: 'Tất cả ghế được chọn đều liền kề nhau'
            };

        } catch (error) {
            logger.error(`[validateAdjacentSeats] Lỗi:`, error);
            throw error;
        }
    }

    /**
     * 🔴 PRIORITY 1: GAP PREVENTION RULE  
     * Validate không được tạo ra ghế trống lẻ (orphaned seats)
     */
    async validateGapPrevention(selectedLayoutIds, showtimeId, transaction = null) {
        try {
            logger.info(`[validateGapPrevention] Kiểm tra ngăn chặn khoảng trống cho showtime ${showtimeId}`);

            // Lấy thông tin layout của ghế được chọn
            const selectedLayouts = await SeatLayout.findAll({
                where: {
                    Layout_ID: { [Op.in]: selectedLayoutIds },
                    Is_Active: true
                },
                attributes: ['Layout_ID', 'Row_Label', 'Column_Number', 'Cinema_Room_ID'],
                transaction
            });

            if (selectedLayouts.length === 0) {
                throw new Error('Không tìm thấy ghế được chọn');
            }

            const cinemaRoomId = selectedLayouts[0].Cinema_Room_ID;

            // Lấy tất cả ghế trong phòng chiếu
            const allLayouts = await SeatLayout.findAll({
                where: {
                    Cinema_Room_ID: cinemaRoomId,
                    Is_Active: true
                },
                attributes: ['Layout_ID', 'Row_Label', 'Column_Number'],
                order: [['Row_Label', 'ASC'], ['Column_Number', 'ASC']],
                transaction
            });

            // Lấy ghế đã được đặt trong suất chiếu này
            const bookedLayouts = await this._getBookedLayoutIds(showtimeId, cinemaRoomId, transaction);

            // Mô phỏng trạng thái sau khi đặt ghế
            const futureBookedLayouts = new Set([...bookedLayouts, ...selectedLayoutIds]);

            // Kiểm tra gap prevention cho từng hàng
            const seatsByRow = this._groupAllSeatsByRow(allLayouts);
            
            for (const [rowLabel, seats] of Object.entries(seatsByRow)) {
                const gapValidation = this._validateRowGapPrevention(
                    seats, 
                    futureBookedLayouts, 
                    selectedLayoutIds,
                    rowLabel
                );
                
                if (!gapValidation.valid) {
                    return gapValidation;
                }
            }

            logger.info(`[validateGapPrevention] ✅ Không tạo ra khoảng trống không hợp lệ`);
            return {
                valid: true,
                message: 'Việc đặt ghế không tạo ra khoảng trống không hợp lệ'
            };

        } catch (error) {
            logger.error(`[validateGapPrevention] Lỗi:`, error);
            throw error;
        }
    }

    /**
     * MASTER VALIDATION FUNCTION
     * Gọi tất cả validation rules cho seat booking
     */
    async validateSeatBookingRules(selectedLayoutIds, showtimeId, transaction = null) {
        try {
            logger.info(`[validateSeatBookingRules] Bắt đầu validate rules cho ${selectedLayoutIds.length} ghế`);

            // 1. Validate Adjacent Seats
            const adjacentResult = await this.validateAdjacentSeats(selectedLayoutIds, showtimeId, transaction);
            if (!adjacentResult.valid) {
                return {
                    valid: false,
                    rule: 'ADJACENT_SEATS',
                    ...adjacentResult
                };
            }

            // 2. Validate Gap Prevention
            const gapResult = await this.validateGapPrevention(selectedLayoutIds, showtimeId, transaction);
            if (!gapResult.valid) {
                return {
                    valid: false,
                    rule: 'GAP_PREVENTION',
                    ...gapResult
                };
            }

            logger.info(`[validateSeatBookingRules] ✅ Tất cả rules đều PASS`);
            return {
                valid: true,
                message: 'Tất cả quy tắc đặt ghế đều hợp lệ',
                rulesChecked: ['ADJACENT_SEATS', 'GAP_PREVENTION']
            };

        } catch (error) {
            logger.error(`[validateSeatBookingRules] Lỗi:`, error);
            return {
                valid: false,
                rule: 'SYSTEM_ERROR',
                errorCode: 'VALIDATION_ERROR',
                message: `Lỗi khi kiểm tra quy tắc đặt ghế: ${error.message}`
            };
        }
    }

    // =================== HELPER METHODS ===================

    /**
     * Nhóm ghế theo hàng (Row_Label)
     */
    _groupSeatsByRow(layouts) {
        const seatsByRow = {};
        layouts.forEach(layout => {
            if (!seatsByRow[layout.Row_Label]) {
                seatsByRow[layout.Row_Label] = [];
            }
            seatsByRow[layout.Row_Label].push(layout);
        });

        // Sắp xếp ghế trong mỗi hàng theo Column_Number
        Object.keys(seatsByRow).forEach(row => {
            seatsByRow[row].sort((a, b) => a.Column_Number - b.Column_Number);
        });

        return seatsByRow;
    }

    /**
     * Nhóm tất cả ghế theo hàng (cho gap prevention)
     */
    _groupAllSeatsByRow(allLayouts) {
        const seatsByRow = {};
        allLayouts.forEach(layout => {
            if (!seatsByRow[layout.Row_Label]) {
                seatsByRow[layout.Row_Label] = [];
            }
            seatsByRow[layout.Row_Label].push(layout);
        });

        // Sắp xếp ghế trong mỗi hàng theo Column_Number
        Object.keys(seatsByRow).forEach(row => {
            seatsByRow[row].sort((a, b) => a.Column_Number - b.Column_Number);
        });

        return seatsByRow;
    }

    /**
     * Validate ghế liền kề trong 1 hàng
     */
    _validateSingleRowAdjacency(seats, rowLabel) {
        if (seats.length <= 1) return { valid: true };

        const columns = seats.map(s => s.Column_Number).sort((a, b) => a - b);
        
        // Kiểm tra các ghế có liên tiếp không
        for (let i = 1; i < columns.length; i++) {
            const gap = columns[i] - columns[i-1];
            if (gap > 1) {
                const missingSeats = [];
                for (let col = columns[i-1] + 1; col < columns[i]; col++) {
                    missingSeats.push(`${rowLabel}${col}`);
                }
                
                return {
                    valid: false,
                    errorCode: 'NOT_ADJACENT',
                    message: `Ghế trong hàng ${rowLabel} không liền kề. Thiếu ghế: ${missingSeats.join(', ')}`,
                    suggestedSeats: missingSeats,
                    rowLabel
                };
            }
        }

        return { valid: true };
    }

    /**
     * Validate ghế liền kề giữa nhiều hàng
     */
    _validateMultipleRowsAdjacency(seatsByRow) {
        const rowLabels = Object.keys(seatsByRow).sort();
        
        // Kiểm tra các hàng có liền kề nhau không (A, B, C...)
        for (let i = 1; i < rowLabels.length; i++) {
            const currentRow = rowLabels[i];
            const prevRow = rowLabels[i-1];
            
            // Kiểm tra các hàng có liên tiếp trong alphabet không
            if (currentRow.charCodeAt(0) - prevRow.charCodeAt(0) > 1) {
                return {
                    valid: false,
                    errorCode: 'NON_ADJACENT_ROWS',
                    message: `Hàng ${prevRow} và ${currentRow} không liền kề. Nhóm ghế nên ở các hàng liền kề nhau.`,
                    suggestion: 'Vui lòng chọn ghế trong cùng một hàng hoặc các hàng liền kề'
                };
            }
        }

        // Kiểm tra số lượng ghế ở mỗi hàng hợp lý
        for (const [rowLabel, seats] of Object.entries(seatsByRow)) {
            if (seats.length > 8) {
                return {
                    valid: false,
                    errorCode: 'TOO_MANY_SEATS_PER_ROW',
                    message: `Hàng ${rowLabel} có ${seats.length} ghế được chọn (tối đa 8 ghế/hàng)`,
                    suggestion: 'Vui lòng giảm số ghế trong mỗi hàng'
                };
            }
        }

        return { valid: true };
    }

    /**
     * Lấy danh sách Layout_ID đã được đặt
     */
    async _getBookedLayoutIds(showtimeId, cinemaRoomId, transaction) {
        try {
            const bookedTickets = await Ticket.findAll({
                where: {
                    Showtime_ID: showtimeId,
                    Status: { [Op.notIn]: ['Cancelled', 'Expired'] }
                },
                include: [{
                    model: Seat,
                    as: 'Seat',
                    include: [{
                        model: SeatLayout,
                        as: 'SeatLayout',
                        where: {
                            Cinema_Room_ID: cinemaRoomId,
                            Is_Active: true
                        }
                    }]
                }],
                transaction
            });

            return bookedTickets
                .filter(ticket => ticket.Seat && ticket.Seat.SeatLayout)
                .map(ticket => ticket.Seat.SeatLayout.Layout_ID);

        } catch (error) {
            logger.error('[_getBookedLayoutIds] Lỗi:', error);
            return [];
        }
    }

    /**
     * Validate gap prevention cho 1 hàng
     */
    _validateRowGapPrevention(rowSeats, futureBookedLayouts, selectedLayoutIds, rowLabel) {
        // Tạo array trạng thái ghế trong hàng
        const seatStatuses = rowSeats.map(seat => ({
            layoutId: seat.Layout_ID,
            column: seat.Column_Number,
            willBeBooked: futureBookedLayouts.has(seat.Layout_ID),
            isSelected: selectedLayoutIds.includes(seat.Layout_ID)
        }));

        // Tìm các khoảng trống (gaps)
        const gaps = this._findGapsInRow(seatStatuses);
        
        // Kiểm tra các gap có hợp lệ không
        for (const gap of gaps) {
            if (gap.size === 1) {
                // Orphaned seat - không được phép
                return {
                    valid: false,
                    errorCode: 'ORPHANED_SEAT',
                    message: `Không thể để ghế ${rowLabel}${gap.columns[0]} trống lẻ. Vui lòng chọn thêm ghế này.`,
                    suggestedSeats: [`${rowLabel}${gap.columns[0]}`],
                    rowLabel,
                    gapSize: gap.size
                };
            } else if (gap.size === 2) {
                // 2 ghế trống giữa các nhóm - cảnh báo
                logger.warn(`[Gap Detection] Hàng ${rowLabel} có 2 ghế trống liền kề: ${gap.columns.map(c => `${rowLabel}${c}`).join(', ')}`);
                // Cho phép nhưng gợi ý
                // return {
                //     valid: false,
                //     errorCode: 'SMALL_GAP',
                //     message: `Nên đặt thêm 2 ghế ${gap.columns.map(c => `${rowLabel}${c}`).join(', ')} để tránh khoảng trống`,
                //     suggestedSeats: gap.columns.map(c => `${rowLabel}${c}`),
                //     rowLabel,
                //     gapSize: gap.size,
                //     isWarning: true
                // };
            }
        }

        return { valid: true };
    }

    /**
     * Tìm các khoảng trống trong 1 hàng
     */
    _findGapsInRow(seatStatuses) {
        const gaps = [];
        let currentGap = null;

        for (let i = 0; i < seatStatuses.length; i++) {
            const seat = seatStatuses[i];
            
            if (!seat.willBeBooked) {
                // Ghế trống - bắt đầu hoặc tiếp tục gap
                if (!currentGap) {
                    currentGap = {
                        columns: [seat.column],
                        size: 1
                    };
                } else {
                    currentGap.columns.push(seat.column);
                    currentGap.size++;
                }
            } else {
                // Ghế đã đặt - kết thúc gap (nếu có)
                if (currentGap) {
                    gaps.push(currentGap);
                    currentGap = null;
                }
            }
        }

        // Thêm gap cuối cùng (nếu có)
        if (currentGap) {
            gaps.push(currentGap);
        }

        return gaps;
    }

    /**
     * Gợi ý ghế tốt nhất cho user
     */
    async getSeatRecommendations(showtimeId, requestedSeatCount, transaction = null) {
        try {
            logger.info(`[getSeatRecommendations] Gợi ý ${requestedSeatCount} ghế cho showtime ${showtimeId}`);

            // Implementation cho smart seat recommendations
            // TODO: Implement trong phase 2
            
            return {
                recommendations: [],
                message: 'Tính năng gợi ý ghế sẽ được phát triển trong giai đoạn tiếp theo'
            };

        } catch (error) {
            logger.error(`[getSeatRecommendations] Lỗi:`, error);
            return {
                recommendations: [],
                error: error.message
            };
        }
    }
}

module.exports = new SeatBookingRulesService(); 