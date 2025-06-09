'use strict';


const TicketService = require('../services/ticketService');
const logger = require('../utils/logger');


// Tạo một thể hiện của TicketService
const ticketService = new TicketService();


class TicketController {
    


    async getMyTickets(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ message: "Không thể xác thực người dùng" });
            }


            logger.info(`[TicketController] Đang lấy vé của người dùng ${userId}`);


            const result = await ticketService.getMyTicketsAsync(userId);


            return res.status(200).json(result);
        } catch (error) {
            logger.error(`[TicketController] Lỗi khi lấy vé của người dùng ${req.user?.id}: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: `Đã xảy ra lỗi khi lấy danh sách vé của bạn. Vui lòng thử lại sau.`,
                error_details: error.message
            });
        }
    }


    
}


module.exports = new TicketController();

