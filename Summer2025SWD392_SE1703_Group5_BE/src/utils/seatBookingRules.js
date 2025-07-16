const { SeatLayout, Seat, Ticket, sequelize } = require('../models');
const { Op } = require('sequelize');
const logger = require('./logger');

/**
 * 🔴 PRIORITY 1: SEAT BOOKING RULES HELPER
 * Helper functions để validate các quy tắc đặt ghế
 * 
 * RULES IMPLEMENTED:
 * 1. Adjacent Seat Rule - Ghế phải liền kề nhau  
 * 2. Gap Prevention Rule - Không để trống ghế lẻ
 */

/**
 * 🔴 RULE 1: ADJACENT SEAT VALIDATION
 * Validate ghế phải liền kề nhau khi đặt >= 2 ghế
 */
async function validateAdjacentSeats(seatLayouts, showtimeId, transaction = null) {
  try {
    logger.info(`[ADJACENT RULE] Kiểm tra ghế liền kề cho ${seatLayouts.length} ghế`);

    // Nếu chỉ đặt 1 ghế, không cần kiểm tra liền kề
    if (seatLayouts.length <= 1) {
      logger.info(`[ADJACENT RULE] ✅ Chỉ 1 ghế - skip validation`);
      return { valid: true, message: 'Chỉ 1 ghế được chọn' };
    }

    // Kiểm tra tất cả ghế cùng phòng chiếu
    const roomIds = [...new Set(seatLayouts.map(l => l.Cinema_Room_ID))];
    if (roomIds.length > 1) {
      return {
        valid: false,
        errorCode: 'DIFFERENT_ROOMS',
        message: 'Tất cả ghế phải trong cùng một phòng chiếu'
      };
    }

    // Nhóm ghế theo hàng
    const seatsByRow = groupSeatsByRow(seatLayouts);
    logger.info(`[ADJACENT RULE] Nhóm ghế: ${Object.keys(seatsByRow).length} hàng`);

    // Validate từng hàng
    for (const [rowLabel, seats] of Object.entries(seatsByRow)) {
      const rowValidation = validateSingleRowAdjacency(seats, rowLabel);
      if (!rowValidation.valid) {
        logger.warn(`[ADJACENT RULE] ❌ Hàng ${rowLabel} không liền kề`);
        return rowValidation;
      }
    }

    // Kiểm tra multiple rows (nếu có)
    if (Object.keys(seatsByRow).length > 1) {
      const multiRowValidation = validateMultipleRowsAdjacency(seatsByRow);
      if (!multiRowValidation.valid) {
        logger.warn(`[ADJACENT RULE] ❌ Nhiều hàng không liền kề`);
        return multiRowValidation;
      }
    }

    logger.info(`[ADJACENT RULE] ✅ Tất cả ghế đều liền kề hợp lệ`);
    return { valid: true, message: 'Tất cả ghế được chọn đều liền kề nhau' };

  } catch (error) {
    logger.error(`[ADJACENT RULE] Lỗi:`, error);
    throw error;
  }
}

/**
 * 🔴 RULE 2: GAP PREVENTION VALIDATION
 * Validate không được tạo ra ghế trống lẻ (orphaned seats)
 */
async function validateGapPrevention(seatLayouts, showtimeId, transaction = null) {
  try {
    logger.info(`[GAP PREVENTION] Kiểm tra ngăn chặn khoảng trống cho showtime ${showtimeId}`);

    if (seatLayouts.length === 0) {
      throw new Error('Không tìm thấy ghế được chọn');
    }

    const cinemaRoomId = seatLayouts[0].Cinema_Room_ID;
    const selectedLayoutIds = seatLayouts.map(l => l.Layout_ID);

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
    const bookedLayoutIds = await getBookedLayoutIds(showtimeId, cinemaRoomId, transaction);

    // Mô phỏng trạng thái sau khi đặt ghế
    const futureBookedLayouts = new Set([...bookedLayoutIds, ...selectedLayoutIds]);

    // Kiểm tra gap prevention cho từng hàng
    const seatsByRow = groupAllSeatsByRow(allLayouts);
    
    for (const [rowLabel, seats] of Object.entries(seatsByRow)) {
      const gapValidation = validateRowGapPrevention(
        seats, 
        futureBookedLayouts, 
        selectedLayoutIds,
        rowLabel
      );
      
      if (!gapValidation.valid) {
        logger.warn(`[GAP PREVENTION] ❌ Hàng ${rowLabel} có orphaned seat`);
        return gapValidation;
      }
    }

    logger.info(`[GAP PREVENTION] ✅ Không tạo ra khoảng trống không hợp lệ`);
    return { valid: true, message: 'Việc đặt ghế không tạo ra khoảng trống không hợp lệ' };

  } catch (error) {
    logger.error(`[GAP PREVENTION] Lỗi:`, error);
    throw error;
  }
}

/**
 * MASTER VALIDATION FUNCTION
 * Gọi tất cả validation rules cho seat booking
 */
async function validateSeatBookingRules(seatLayouts, showtimeId, transaction = null) {
  try {
    logger.info(`[SEAT RULES] 🔥 Bắt đầu validate ${seatLayouts.length} ghế`);

    // Rule 1: Adjacent Seats
    const adjacentResult = await validateAdjacentSeats(seatLayouts, showtimeId, transaction);
    if (!adjacentResult.valid) {
      logger.error(`[SEAT RULES] ❌ Adjacent rule failed: ${adjacentResult.message}`);
      return {
        valid: false,
        rule: 'ADJACENT_SEATS',
        ...adjacentResult
      };
    }

    // Rule 2: Gap Prevention
    const gapResult = await validateGapPrevention(seatLayouts, showtimeId, transaction);
    if (!gapResult.valid) {
      logger.error(`[SEAT RULES] ❌ Gap prevention failed: ${gapResult.message}`);
      return {
        valid: false,
        rule: 'GAP_PREVENTION',
        ...gapResult
      };
    }

    logger.info(`[SEAT RULES] 🎉 Tất cả rules đều PASS!`);
    return {
      valid: true,
      message: 'Tất cả quy tắc đặt ghế đều hợp lệ',
      rulesChecked: ['ADJACENT_SEATS', 'GAP_PREVENTION']
    };

  } catch (error) {
    logger.error(`[SEAT RULES] ❌ System error:`, error);
    return {
      valid: false,
      rule: 'SYSTEM_ERROR',
      errorCode: 'VALIDATION_ERROR',
      message: `Lỗi hệ thống khi kiểm tra quy tắc đặt ghế: ${error.message}`
    };
  }
}

// =================== HELPER FUNCTIONS ===================

/**
 * Nhóm ghế theo hàng (Row_Label)
 */
function groupSeatsByRow(layouts) {
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
function groupAllSeatsByRow(allLayouts) {
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
function validateSingleRowAdjacency(seats, rowLabel) {
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
        message: `Ghế trong hàng ${rowLabel} không liền kề. Vui lòng chọn ghế liền kề nhau hoặc thêm ghế: ${missingSeats.join(', ')}`,
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
function validateMultipleRowsAdjacency(seatsByRow) {
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
        message: `Hàng ${prevRow} và ${currentRow} không liền kề. Nhóm ghế nên ở các hàng liền kề để có trải nghiệm xem phim tốt nhất.`,
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
        message: `Hàng ${rowLabel} có ${seats.length} ghế được chọn (tối đa 8 ghế/hàng để đảm bảo trải nghiệm tốt)`,
        suggestion: 'Vui lòng giảm số ghế trong mỗi hàng'
      };
    }
  }

  return { valid: true };
}

/**
 * Lấy danh sách Layout_ID đã được đặt
 */
async function getBookedLayoutIds(showtimeId, cinemaRoomId, transaction) {
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
    logger.error('[getBookedLayoutIds] Lỗi:', error);
    return [];
  }
}

/**
 * Validate gap prevention cho 1 hàng
 */
function validateRowGapPrevention(rowSeats, futureBookedLayouts, selectedLayoutIds, rowLabel) {
  // Tạo array trạng thái ghế trong hàng
  const seatStatuses = rowSeats.map(seat => ({
    layoutId: seat.Layout_ID,
    column: seat.Column_Number,
    willBeBooked: futureBookedLayouts.has(seat.Layout_ID),
    isSelected: selectedLayoutIds.includes(seat.Layout_ID)
  }));

  // Tìm các khoảng trống (gaps)
  const gaps = findGapsInRow(seatStatuses);
  
  // Kiểm tra các gap có hợp lệ không
  for (const gap of gaps) {
    if (gap.size === 1) {
      // Orphaned seat - không được phép
      return {
        valid: false,
        errorCode: 'ORPHANED_SEAT',
        message: `❌ Không thể để ghế ${rowLabel}${gap.columns[0]} trống lẻ!\n\n🎭 Trong ngành rạp chiếu phim, ghế trống lẻ rất khó bán và ảnh hưởng đến doanh thu.\n\n💡 Gợi ý: Vui lòng chọn thêm ghế ${rowLabel}${gap.columns[0]} hoặc chọn vị trí khác.`,
        suggestedSeats: [`${rowLabel}${gap.columns[0]}`],
        rowLabel,
        gapSize: gap.size
      };
    } else if (gap.size === 2) {
      // 2 ghế trống giữa các nhóm - cảnh báo nhẹ nhưng vẫn cho phép
      logger.warn(`[Gap Detection] Hàng ${rowLabel} có 2 ghế trống liền kề: ${gap.columns.map(c => `${rowLabel}${c}`).join(', ')}`);
      // Không block, chỉ log warning cho business analysis
    }
  }

  return { valid: true };
}

/**
 * Tìm các khoảng trống trong 1 hàng
 */
function findGapsInRow(seatStatuses) {
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

module.exports = {
  validateSeatBookingRules,
  validateAdjacentSeats,
  validateGapPrevention
}; 