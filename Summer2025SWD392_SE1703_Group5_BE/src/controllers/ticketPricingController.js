// File: src/controllers/ticketPricingController.js
// Mô tả: Controller xử lý các request liên quan đến Quản lý Giá vé (TicketPricing).

const express = require('express');
const logger = require('../utils/logger');
const pricingService = require('../services/pricingService');

const handleError = (error, res) => {
    console.error('[TicketPricingController Error]', error);
    return res.status(error.statusCode || 500).json({ message: error.message });
};

const ticketPricingController = {
    async getAllTicketPricings(req, res) {
        try {
            const result = await pricingService.getAllTicketPricings();
            return res.status(200).json(result);
        } catch (error) {
            return handleError(error, res);
        }
    },

    async getTicketPricingById(req, res) {
        try {
            const { id } = req.params;
            // Trong cấu trúc mới, id là kết hợp của roomType_seatType
            const parts = id.split('_');

            if (parts.length < 2) {
                return res.status(400).json({ message: 'ID không hợp lệ' });
            }

            const roomType = parts[0];
            const seatType = parts.slice(1).join('_'); // Để hỗ trợ seat_type có dấu gạch dưới

            // Kiểm tra xem roomType và seatType có tồn tại trong cấu hình không
            const pricingStructure = pricingService.getPricingStructure();
            const roomTypeInfo = pricingStructure.roomTypes.find(rt => rt.roomType === roomType);

            if (!roomTypeInfo) {
                return res.status(404).json({ message: `Không tìm thấy loại phòng ${roomType}` });
            }

            const seatTypeInfo = roomTypeInfo.seatTypes.find(st => st.seatType === seatType);

            if (!seatTypeInfo) {
                return res.status(404).json({ message: `Không tìm thấy loại ghế ${seatType} trong loại phòng ${roomType}` });
            }

            // Tạo kết quả tương thích với API cũ
            const result = {
                Price_ID: id,
                Room_Type: roomType,
                Seat_Type: seatType,
                Base_Price: seatTypeInfo.basePrice,
                Status: 'Active',
                Created_Date: new Date().toISOString(),
                Last_Updated: new Date().toISOString(),
                total_seats_of_type: 0, // Không còn ý nghĩa trong cấu trúc mới
                used_in_rooms: [] // Không còn ý nghĩa trong cấu trúc mới
            };

            return res.status(200).json(result);
        } catch (error) {
            return handleError(error, res);
        }
    },

    async createTicketPricing(req, res) {
        try {
            const { Room_Type, Seat_Type, Base_Price } = req.body;

            // Kiểm tra các trường bắt buộc
            if (!Room_Type || !Seat_Type || !Base_Price) {
                return res.status(400).json({
                    message: 'Thiếu thông tin bắt buộc: Room_Type, Seat_Type, Base_Price'
                });
            }

            // Đọc file cấu hình hiện tại
            const fs = require('fs');
            const path = require('path');
            const configPath = path.join(__dirname, '../config/ticketPricing.json');

            let pricingConfig;
            try {
                const configContent = fs.readFileSync(configPath, 'utf8');
                pricingConfig = JSON.parse(configContent);
            } catch (error) {
                console.error('Lỗi khi đọc file cấu hình:', error);
                return res.status(500).json({
                    message: 'Không thể đọc file cấu hình giá vé',
                    error: error.message
                });
            }

            // Kiểm tra xem Room_Type đã tồn tại trong cấu hình chưa
            if (!pricingConfig.basePrices[Room_Type]) {
                pricingConfig.basePrices[Room_Type] = {};
            }

            // Kiểm tra xem cặp Room_Type và Seat_Type đã tồn tại chưa
            if (pricingConfig.basePrices[Room_Type][Seat_Type] !== undefined) {
            return res.status(400).json({
                    message: `Giá vé cho loại phòng "${Room_Type}" và loại ghế "${Seat_Type}" đã tồn tại`,
                    currentPrice: pricingConfig.basePrices[Room_Type][Seat_Type]
                });
            }

            // Thêm giá vé mới vào cấu hình
            pricingConfig.basePrices[Room_Type][Seat_Type] = Number(Base_Price);

            // Lưu cấu hình mới vào file
            try {
                fs.writeFileSync(configPath, JSON.stringify(pricingConfig, null, 4));
                
                // Force reload pricing service để sync data
                if (pricingService.reloadPricingConfig) {
                    pricingService.reloadPricingConfig();
                }

                // Thông báo thành công
                return res.status(201).json({
                    message: `Đã thêm giá vé mới: ${Room_Type} - ${Seat_Type}: ${Base_Price} VNĐ`,
                    data: {
                        Room_Type,
                        Seat_Type,
                        Base_Price,
                configPath: 'src/config/ticketPricing.json'
                    }
                });
            } catch (error) {
                console.error('❌ Lỗi khi ghi file cấu hình:', error);
                return res.status(500).json({
                    message: 'Không thể ghi file cấu hình giá vé',
                    error: error.message
                });
            }
        } catch (error) {
            return handleError(error, res);
        }
    },

    async updateTicketPricing(req, res) {
        try {
            const { id } = req.params;
            // id được định dạng dưới dạng Room_Type_Seat_Type
            const parts = id.split('_');

            if (parts.length < 2) {
                return res.status(400).json({ message: 'ID không hợp lệ' });
            }

            const Room_Type = parts[0];
            const Seat_Type = parts.slice(1).join('_'); // Để hỗ trợ seat_type có dấu gạch dưới
            const { Base_Price } = req.body;

            // Kiểm tra giá trị Base_Price
            if (Base_Price === undefined) {
            return res.status(400).json({
                    message: 'Cần cung cấp Base_Price để cập nhật'
                });
            }

            // Đọc file cấu hình hiện tại
            const fs = require('fs');
            const path = require('path');
            const configPath = path.join(__dirname, '../config/ticketPricing.json');

            let pricingConfig;
            try {
                const configContent = fs.readFileSync(configPath, 'utf8');
                pricingConfig = JSON.parse(configContent);
            } catch (error) {
                console.error('Lỗi khi đọc file cấu hình:', error);
                return res.status(500).json({
                    message: 'Không thể đọc file cấu hình giá vé',
                    error: error.message
                });
            }

            // Kiểm tra xem Room_Type có tồn tại không
            if (!pricingConfig.basePrices[Room_Type]) {
                return res.status(404).json({
                    message: `Không tìm thấy loại phòng "${Room_Type}" trong cấu hình`
                });
            }

            // Kiểm tra xem Seat_Type có tồn tại không
            if (pricingConfig.basePrices[Room_Type][Seat_Type] === undefined) {
                return res.status(404).json({
                    message: `Không tìm thấy loại ghế "${Seat_Type}" trong loại phòng "${Room_Type}"`
                });
            }

            // Lưu giá cũ để trả về
            const oldPrice = pricingConfig.basePrices[Room_Type][Seat_Type];

            // Cập nhật giá vé
            pricingConfig.basePrices[Room_Type][Seat_Type] = Number(Base_Price);

            // Lưu cấu hình mới vào file
            try {
                fs.writeFileSync(configPath, JSON.stringify(pricingConfig, null, 4));
                
                // Force reload pricing service
                if (pricingService.reloadPricingConfig) {
                    pricingService.reloadPricingConfig();
                }

                // Thông báo thành công
                return res.status(200).json({
                    message: `Đã cập nhật giá vé: ${Room_Type} - ${Seat_Type} từ ${oldPrice} thành ${Base_Price} VNĐ`,
                    data: {
                        Room_Type,
                        Seat_Type,
                        Old_Price: oldPrice,
                        New_Price: Number(Base_Price)
                    }
                });
            } catch (error) {
                console.error('Lỗi khi ghi file cấu hình:', error);
                return res.status(500).json({
                    message: 'Không thể ghi file cấu hình giá vé',
                    error: error.message
                });
            }
        } catch (error) {
            return handleError(error, res);
        }
    },

    async deleteTicketPricing(req, res) {
        try {
            const { id } = req.params;
            // id được định dạng dưới dạng Room_Type_Seat_Type
            const parts = id.split('_');

            if (parts.length < 2) {
                return res.status(400).json({ message: 'ID không hợp lệ' });
            }

            const Room_Type = parts[0];
            const Seat_Type = parts.slice(1).join('_'); // Để hỗ trợ seat_type có dấu gạch dưới

            // Đọc file cấu hình hiện tại
            const fs = require('fs');
            const path = require('path');
            const configPath = path.join(__dirname, '../config/ticketPricing.json');

            let pricingConfig;
            try {
                const configContent = fs.readFileSync(configPath, 'utf8');
                pricingConfig = JSON.parse(configContent);
            } catch (error) {
                console.error('Lỗi khi đọc file cấu hình:', error);
                return res.status(500).json({
                    message: 'Không thể đọc file cấu hình giá vé',
                    error: error.message
                });
            }

            // Kiểm tra xem Room_Type có tồn tại không
            if (!pricingConfig.basePrices[Room_Type]) {
                return res.status(404).json({
                    message: `Không tìm thấy loại phòng "${Room_Type}" trong cấu hình`
                });
            }

            // Kiểm tra xem Seat_Type có tồn tại không
            if (pricingConfig.basePrices[Room_Type][Seat_Type] === undefined) {
                return res.status(404).json({
                    message: `Không tìm thấy loại ghế "${Seat_Type}" trong loại phòng "${Room_Type}"`
                });
            }

            // Lưu giá cũ để trả về
            const oldPrice = pricingConfig.basePrices[Room_Type][Seat_Type];

            // Xóa giá vé
            delete pricingConfig.basePrices[Room_Type][Seat_Type];

            // Kiểm tra nếu loại phòng không còn loại ghế nào thì xóa luôn loại phòng
            if (Object.keys(pricingConfig.basePrices[Room_Type]).length === 0) {
                delete pricingConfig.basePrices[Room_Type];
            }

            // Lưu cấu hình mới vào file
            try {
                fs.writeFileSync(configPath, JSON.stringify(pricingConfig, null, 4));
                
                // Force reload pricing service
                if (pricingService.reloadPricingConfig) {
                    pricingService.reloadPricingConfig();
                }

                // Thông báo thành công
                return res.status(200).json({
                    message: `Đã xóa giá vé: ${Room_Type} - ${Seat_Type} (Giá cũ: ${oldPrice} VNĐ)`,
                    data: {
                        Room_Type,
                        Seat_Type,
                        Removed_Price: oldPrice
                    }
                });
            } catch (error) {
                console.error('Lỗi khi ghi file cấu hình:', error);
                return res.status(500).json({
                    message: 'Không thể ghi file cấu hình giá vé',
                    error: error.message
                });
            }
        } catch (error) {
            return handleError(error, res);
        }
    },

    async bulkUpdateTicketPrices(req, res) {
        try {
            const { PriceUpdates } = req.body;

            // Tương tự như updateTicketPricing, việc cập nhật hàng loạt không còn được thực hiện qua API
            return res.status(400).json({
                message: 'Tính năng cập nhật hàng loạt giá vé qua API đã được thay thế bằng hệ thống cấu hình tập trung. Vui lòng liên hệ quản trị viên để cập nhật file cấu hình giá vé.',
                configPath: 'src/config/ticketPricing.json'
            });
        } catch (error) {
            return handleError(error, res);
        }
    },

    async getAvailableSeatTypes(req, res) {
        try {
            const result = await pricingService.getAvailableSeatTypes();
            return res.status(200).json(result);
        } catch (error) {
            return handleError(error, res);
        }
    },

    // Thêm API mới để lấy cấu trúc giá vé
    async getPricingStructure(req, res) {
        try {
            const structure = pricingService.getPricingStructure();
            return res.status(200).json(structure);
        } catch (error) {
            return handleError(error, res);
        }
    },

    // API để tính giá vé cho một loại vé cụ thể
    async calculateTicketPrice(req, res) {
        try {
            const { roomType, seatType, showDate, startTime } = req.query;

            if (!roomType || !seatType || !showDate || !startTime) {
                return res.status(400).json({
                    message: 'Thiếu thông tin để tính giá vé. Yêu cầu: roomType, seatType, showDate, startTime'
                });
            }

            const priceInfo = pricingService.calculateTicketPrice({
                roomType,
                seatType,
                showDate,
                startTime
            });

            return res.status(200).json(priceInfo);
        } catch (error) {
            return handleError(error, res);
        }
    }
};

module.exports = ticketPricingController; 