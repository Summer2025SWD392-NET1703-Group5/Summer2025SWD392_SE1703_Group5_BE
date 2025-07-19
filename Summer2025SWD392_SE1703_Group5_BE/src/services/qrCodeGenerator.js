'use strict';

const QRCode = require('qrcode');
const logger = require('../utils/logger');

// Cache cho QR codes để tránh tạo lại các mã đã tạo trước đó
const qrCodeCache = new Map();

class QRCodeGenerator {
    async generateQRCode(ticketCode) {
        try {
            // Kiểm tra cache trước
            if (qrCodeCache.has(ticketCode)) {
                return qrCodeCache.get(ticketCode);
            }
            
            logger.info(`Generating QR code for ticket: ${ticketCode}`);

            const qrCodeImage = await QRCode.toBuffer(ticketCode, {
                errorCorrectionLevel: 'M', // Giảm từ H xuống M để nhanh hơn
                type: 'png',
                width: 200,
                margin: 0,
                scale: 4 // Tối ưu kích thước
            });

            // Lưu vào cache
            qrCodeCache.set(ticketCode, qrCodeImage);
            
            logger.info(`QR code generated for ticket: ${ticketCode}`);
            return qrCodeImage;
        } catch (error) {
            logger.error(`Error generating QR code: ${error.message}`);
            return null;
        }
    }
}

module.exports = new QRCodeGenerator();