// File: src/services/pricingService.js
// Mô tả: Service tính giá vé dựa trên cấu hình JSON

const fs = require('fs');
const path = require('path');
const { format, isWeekend } = require('date-fns');
const logger = require('../utils/logger');

class PricingService {
    constructor() {
        try {
            // Đọc file cấu hình giá vé
            const configPath = path.join(__dirname, '../config/ticketPricing.json');
            this.pricingConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            logger.info('Pricing configuration loaded successfully');
        } catch (error) {
            logger.error('Error loading pricing configuration:', error);
            // Sử dụng cấu hình mặc định nếu không đọc được file
            this.pricingConfig = {
                basePrices: {
                        "2D": { "Thường": 90000, "VIP": 120000 },
    "3D": { "Thường": 120000, "VIP": 150000 },
    "IMAX": { "Thường": 150000, "VIP": 180000 }
                },
                dayTypes: {
                    "weekday": { multiplier: 1.0 },
                    "weekend": { multiplier: 1.2 },
                    "holiday": { multiplier: 1.5 }
                },
                timeSlots: {
                    "morning": { multiplier: 0.9, startTime: "08:00:00", endTime: "12:00:00" },
                    "afternoon": { multiplier: 1.0, startTime: "12:00:00", endTime: "18:00:00" },
                    "evening": { multiplier: 1.1, startTime: "18:00:00", endTime: "23:59:59" }
                },
                holidays: []
            };
        }
    }

    /**
     * Tính giá vé dựa trên loại phòng, loại ghế, ngày và giờ chiếu
     * @param {Object} options - Các tùy chọn để tính giá
     * @param {string} options.roomType - Loại phòng (2D, 3D, IMAX, 4DX)
     * @param {string} options.seatType - Loại ghế (Standard, VIP, Sweetbox)
     * @param {string|Date} options.showDate - Ngày chiếu
     * @param {string} options.startTime - Giờ bắt đầu (HH:MM:SS)
     * @returns {Object} - Thông tin giá vé
     */
    calculateTicketPrice(options) {
        const { roomType, seatType, showDate, startTime } = options;

        // Kiểm tra các tham số đầu vào
        if (!roomType || !seatType || !showDate || !startTime) {
            const error = new Error('Thiếu thông tin để tính giá vé');
            logger.error('calculateTicketPrice: Missing parameters', options);
            error.statusCode = 400;
            throw error;
        }

        // Xử lý case-insensitive cho seatType
        let normalizedSeatType = seatType;
        const availableSeatTypes = this.getAllSeatTypes();

        // Tìm đúng cách viết loại ghế trong cấu hình
        const matchedSeatType = availableSeatTypes.find(
            type => type.toUpperCase() === seatType.toUpperCase()
        );

        if (matchedSeatType) {
            normalizedSeatType = matchedSeatType;
        }

        // Kiểm tra loại phòng và loại ghế có tồn tại trong cấu hình không
        if (!this.pricingConfig.basePrices[roomType] || !this.pricingConfig.basePrices[roomType][normalizedSeatType]) {
            // Ghi log các loại ghế có sẵn để debug
            logger.info(`Các loại ghế có sẵn trong cấu hình: ${availableSeatTypes.join(', ')}`);

                // Thử tìm giá của loại ghế Thường nếu không tìm thấy loại ghế yêu cầu
    if (this.pricingConfig.basePrices[roomType] && this.pricingConfig.basePrices[roomType]['Thường']) {
      logger.info(`Thử lại với loại ghế mặc định: Thường`);
      normalizedSeatType = 'Thường';
            } else {
                const error = new Error(`Không tìm thấy giá vé cho loại phòng ${roomType} và loại ghế ${seatType}`);
                logger.error('calculateTicketPrice: Invalid room or seat type', { roomType, seatType });
                error.statusCode = 400;
                throw error;
            }
        }

        // Lấy giá cơ bản từ cấu hình
        const basePrice = this.pricingConfig.basePrices[roomType][normalizedSeatType];

        if (normalizedSeatType !== seatType) {
            logger.info(`Đã sử dụng giá ghế mặc định ${normalizedSeatType} cho loại ghế ${seatType}: ${basePrice} VND`);
        }

        // Tính hệ số theo ngày
        const date = showDate instanceof Date ? showDate : new Date(showDate);
        const dayMultiplier = this.getDayMultiplier(date);

        // Tính hệ số theo giờ
        const timeMultiplier = this.getTimeMultiplier(startTime);

        // Tính giá vé cuối cùng, làm tròn đến 1000đ
        const finalPrice = Math.round((basePrice * dayMultiplier * timeMultiplier) / 1000) * 1000;

        return {
            basePrice,
            finalPrice,
            multipliers: {
                day: dayMultiplier,
                time: timeMultiplier
            },
            details: {
                roomType,
                seatType: normalizedSeatType, // Trả về loại ghế đã chuẩn hóa
                date: format(date, 'yyyy-MM-dd'),
                time: startTime,
                dayType: this.getDayType(date),
                timeSlot: this.getTimeSlot(startTime)
            }
        };
    }

    /**
     * Tính toán giá vé cho nhiều ghế
     * @param {Array} seatsInfo - Mảng thông tin ghế
     * @param {Object} showtime - Thông tin suất chiếu
     * @returns {Object} - Thông tin giá vé
     */
    calculateMultipleTickets(seatsInfo, showtime) {
        if (!Array.isArray(seatsInfo) || seatsInfo.length === 0) {
            const error = new Error('Danh sách ghế không hợp lệ');
            error.statusCode = 400;
            throw error;
        }

        const roomType = showtime.CinemaRoom?.Room_Type || '2D';
        const showDate = showtime.Show_Date;
        const startTime = showtime.Start_Time;

        // Tính giá vé cho từng ghế
        const tickets = [];
        let totalAmount = 0;

        for (const seatInfo of seatsInfo) {
            const seatType = seatInfo.Seat_Type;

            const priceInfo = this.calculateTicketPrice({
                roomType,
                seatType,
                showDate,
                startTime
            });

            tickets.push({
                seatInfo,
                priceInfo
            });

            totalAmount += priceInfo.finalPrice;
        }

        return {
            tickets,
            totalAmount,
            showtime: {
                Showtime_ID: showtime.Showtime_ID,
                Show_Date: showDate,
                Start_Time: startTime,
                Room_Type: roomType
            }
        };
    }

    /**
     * Xác định loại ngày (ngày thường, cuối tuần, ngày lễ)
     * @param {Date} date - Ngày cần kiểm tra
     * @returns {string} - Loại ngày (weekday, weekend, holiday)
     */
    getDayType(date) {
        // Kiểm tra ngày lễ
        if (this.isHoliday(date)) {
            return 'holiday';
        }

        // Kiểm tra cuối tuần (thứ 7, chủ nhật)
        if (isWeekend(date)) {
            return 'weekend';
        }

        // Ngày thường
        return 'weekday';
    }

    /**
     * Lấy hệ số giá theo loại ngày
     * @param {Date} date - Ngày cần kiểm tra
     * @returns {number} - Hệ số giá
     */
    getDayMultiplier(date) {
        const dayType = this.getDayType(date);
        return this.pricingConfig.dayTypes[dayType].multiplier;
    }

    /**
     * Xác định khung giờ cho thời gian nhất định
     * @param {string} time - Thời gian định dạng HH:MM:SS
     * @returns {string} - Loại khung giờ (morning, afternoon, evening)
     */
    getTimeSlot(time) {
        // Chuẩn hóa định dạng time để đảm bảo so sánh chính xác
        let normalizedTime = time;
        
        // Kiểm tra nếu time là đối tượng Date
        if (time instanceof Date) {
            // ✅ FIX TIMEZONE: Sử dụng UTC methods để tránh timezone offset
            const hours = time.getUTCHours().toString().padStart(2, '0');
            const minutes = time.getUTCMinutes().toString().padStart(2, '0');
            const seconds = time.getUTCSeconds().toString().padStart(2, '0');
            normalizedTime = `${hours}:${minutes}:${seconds}`;
        }
        // Kiểm tra nếu time là đối tượng SQL Server time hoặc time object
        else if (typeof time === 'object' && time !== null) {
            if (time.hours !== undefined) {
                const hours = String(time.hours).padStart(2, '0');
                const minutes = String(time.minutes || 0).padStart(2, '0');
                const seconds = String(time.seconds || 0).padStart(2, '0');
                normalizedTime = `${hours}:${minutes}:${seconds}`;
                logger.info(`Đã chuyển đổi time object thành chuỗi: ${normalizedTime}`);
            } else {
                logger.warn(`Invalid time object format: ${JSON.stringify(time)}, using default afternoon slot`);
                return 'afternoon';
            }
        }
        
        // Đảm bảo có định dạng HH:MM:SS
        if (typeof normalizedTime === 'string' && normalizedTime.includes(':')) {
            // Nếu chỉ có HH:MM, thêm :00 vào cuối
            if (normalizedTime.split(':').length === 2) {
                normalizedTime = `${normalizedTime}:00`;
            }
        } else {
            logger.warn(`Invalid time format: ${time}, using default afternoon slot`);
            return 'afternoon';
        }
        
        for (const [slotName, slot] of Object.entries(this.pricingConfig.timeSlots)) {
            if (normalizedTime >= slot.startTime && normalizedTime < slot.endTime) {
                return slotName;
            }
        }
        return 'afternoon'; // Mặc định là buổi chiều
    }

    /**
     * Lấy hệ số giá theo khung giờ
     * @param {string} time - Thời gian định dạng HH:MM:SS
     * @returns {number} - Hệ số giá
     */
    getTimeMultiplier(time) {
        const timeSlot = this.getTimeSlot(time);
        return this.pricingConfig.timeSlots[timeSlot].multiplier;
    }

    /**
     * Kiểm tra ngày có phải là ngày lễ không
     * @param {Date} date - Ngày cần kiểm tra
     * @returns {boolean} - Kết quả kiểm tra
     */
    isHoliday(date) {
        const dateStr = format(date, 'yyyy-MM-dd');
        return this.pricingConfig.holidays.includes(dateStr);
    }

    /**
     * Lấy danh sách loại phòng
     * @returns {Array} - Danh sách loại phòng 
     */
    getRoomTypes() {
        return Object.keys(this.pricingConfig.basePrices);
    }

    /**
     * Lấy danh sách loại ghế cho một loại phòng cụ thể
     * @param {string} roomType - Loại phòng
     * @returns {Array} - Danh sách loại ghế
     */
    getSeatTypes(roomType) {
        if (!roomType || !this.pricingConfig.basePrices[roomType]) {
            return [];
        }
        return Object.keys(this.pricingConfig.basePrices[roomType]);
    }

    /**
     * Lấy danh sách tất cả các loại ghế
     * @returns {Array} - Danh sách loại ghế duy nhất
     */
    getAllSeatTypes() {
        const seatTypes = new Set();
        Object.values(this.pricingConfig.basePrices).forEach(roomPrices => {
            Object.keys(roomPrices).forEach(seatType => seatTypes.add(seatType));
        });
        return Array.from(seatTypes);
    }

    /**
     * Lấy cấu trúc giá vé đầy đủ
     * @returns {Object} - Cấu trúc giá vé
     */
    getPricingStructure() {
        const result = {
            roomTypes: [],
            holidays: this.pricingConfig.holidays,
            timeSlots: this.pricingConfig.timeSlots,
            dayTypes: this.pricingConfig.dayTypes
        };

        for (const [roomType, seatPrices] of Object.entries(this.pricingConfig.basePrices)) {
            const seatTypes = [];
            for (const [seatType, basePrice] of Object.entries(seatPrices)) {
                seatTypes.push({ seatType, basePrice });
            }

            result.roomTypes.push({
                roomType,
                seatTypes
            });
        }

        return result;
    }

    /**
     * Reload cấu hình từ file JSON
     */
    reloadPricingConfig() {
        try {
            const configPath = path.join(__dirname, '../config/ticketPricing.json');
            this.pricingConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            logger.info('Pricing configuration reloaded successfully');
        } catch (error) {
            logger.error('Error reloading pricing configuration:', error);
            throw error;
        }
    }

    /**
     * Tương thích với API cũ: getAllTicketPricings
     * @returns {Array} - Danh sách giá vé theo định dạng cũ
     */
    getAllTicketPricings() {
        // Reload config để đảm bảo data mới nhất
        this.reloadPricingConfig();
        
        return Object.entries(this.pricingConfig.basePrices).map(([roomType, seatPrices]) => ({
            room_type: roomType,
            seat_types: Object.entries(seatPrices).map(([seatType, basePrice]) => ({
                Price_ID: `${roomType}_${seatType}`.replace(/\s+/g, '_'),
                Seat_Type: seatType,
                Base_Price: basePrice,
                Status: 'Active',
                Created_Date: new Date().toISOString(),
                Last_Updated: new Date().toISOString()
            }))
        }));
    }



    /**
     * Tương thích với API cũ: getAvailableSeatTypes
     * @returns {Array} - Danh sách loại ghế có sẵn
     */
    getAvailableSeatTypes() {
        const allSeatTypes = this.getAllSeatTypes();

        return allSeatTypes.map(seatType => {
            const prices = [];

            // Tính giá trung bình cho loại ghế này
            let totalPrice = 0;
            let count = 0;

            Object.entries(this.pricingConfig.basePrices).forEach(([roomType, seatPrices]) => {
                if (seatPrices[seatType]) {
                    totalPrice += seatPrices[seatType];
                    count++;
                    prices.push({
                        roomType,
                        basePrice: seatPrices[seatType]
                    });
                }
            });

            const averagePrice = count > 0 ? totalPrice / count : 0;

            return {
                seat_type: seatType,
                average_price: averagePrice,
                prices: prices,
                room_types_count: count,
                usage: "Available in " + count + " room types"
            };
        });
    }
}

module.exports = new PricingService(); 