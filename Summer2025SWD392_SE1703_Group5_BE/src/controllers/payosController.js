// File: src/controllers/payosController.js
const PayOSService = require('../services/payosService');
const { getConnection } = require('../config/database');
const sql = require('mssql');
const winston = require('winston');
const path = require('path');

// Logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        // Thêm file transport để lưu log vào thư mục logs
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/payos-controller.log')
        })
    ]
});

class PayOSController {
    constructor() {
        this.payosService = new PayOSService();
        this.poolPromise = null; // Cache connection pool
    }

    /**
     * Lấy kết nối database từ cache nếu có, hoặc tạo mới
     */
    async getDbConnection(req) {
        try {
            // Không cache connection để tránh lỗi connection closed
            if (req && req.app) {
                const getDbCache = req.app.get('dbConnectionCache');
                if (getDbCache) {
                    return await getDbCache();
                }
            }

            // Luôn lấy kết nối mới thay vì cache
            return await getConnection();
        } catch (error) {
            logger.error('Lỗi khi lấy kết nối database:', error);

            // Thử lại một lần nữa
            try {
                // Reset pool trước khi lấy lại
                this.poolPromise = null;
                return await getConnection();
            } catch (retryError) {
                logger.error('Lỗi khi lấy kết nối database lần thứ 2:', retryError);
                throw retryError;
            }
        }
    }

    /**
     * Lấy URL thanh toán cho đơn đặt vé
     * @route GET /api/payos/payment-url/:bookingId
     * @access Private
     */
    async getPaymentUrl(req, res) {
        let pool;
        try {
            const { bookingId } = req.params;
            logger.info(`Đang lấy URL thanh toán cho đơn đặt vé: ${bookingId}`);

            // Lấy thông tin người dùng từ token
            const userId = req.user?.User_ID || req.user?.id || req.user?.userId;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Không thể xác định người dùng'
                });
            }

            pool = await this.getDbConnection(req);

            // Truy vấn tối ưu hơn - lấy thông tin booking và user trong một truy vấn
            const optimizedQuery = `
                SELECT b.*, u.Full_Name 
                FROM ksf00691_team03.Ticket_Bookings b
                JOIN ksf00691_team03.Users u ON b.User_ID = u.User_ID
                WHERE b.Booking_ID = @bookingId AND b.User_ID = @userId
            `;
            const optimizedRequest = pool.request();
            optimizedRequest.input('bookingId', sql.Int, bookingId);
            optimizedRequest.input('userId', sql.Int, userId);
            const optimizedResult = await optimizedRequest.query(optimizedQuery);

            if (optimizedResult.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy đơn đặt vé'
                });
            }

            const booking = optimizedResult.recordset[0];
            const customerName = booking.Full_Name;

            // Kiểm tra quyền truy cập: cho phép nếu là chủ sở hữu (User_ID) hoặc người tạo (Created_By)
            if (booking.User_ID !== parseInt(userId) && booking.Created_By !== parseInt(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Bạn không có quyền truy cập đơn đặt vé này'
                });
            }

            // Kiểm tra trạng thái booking
            if (booking.Status !== 'Pending') {
                return res.status(400).json({
                    success: false,
                    message: `Đơn đặt vé đã ${booking.Status}. Không thể thanh toán.`
                });
            }

            // Kiểm tra thời gian hết hạn (15 phút)
            const bookingTime = new Date(booking.Booking_Date);
            const expiryTime = new Date(bookingTime.getTime() + 15 * 60 * 1000);

            if (new Date() > expiryTime) {
                // Bắt đầu transaction
                const transaction = new sql.Transaction(pool);
                await transaction.begin();

                try {
                    // Cập nhật trạng thái booking và xóa vé, ghế trong một transaction
                    const combinedUpdatesQuery = `
                        -- Cập nhật trạng thái booking
                        UPDATE [ksf00691_team03].[Ticket_Bookings] 
                        SET Status = 'Cancelled' 
                        WHERE Booking_ID = @bookingId;

                        -- Xóa các vé
                        DELETE FROM [ksf00691_team03].[Tickets]
                        WHERE Booking_ID = @bookingId;

                        -- Xóa các ghế
                        DELETE FROM [ksf00691_team03].[Seats]
                        WHERE Booking_ID = @bookingId;
                    `;
                    const combinedRequest = transaction.request();
                    combinedRequest.input('bookingId', sql.Int, bookingId);
                    await combinedRequest.query(combinedUpdatesQuery);

                    // Commit transaction
                    await transaction.commit();

                    logger.info(`Đơn đặt vé ${bookingId} đã hủy vì hết hạn thanh toán, đã xóa vé và ghế`);
                } catch (error) {
                    // Rollback nếu có lỗi
                    await transaction.rollback();
                    logger.error(`Lỗi khi cập nhật booking hết hạn và xóa dữ liệu: ${error.message}`);
                }

                return res.status(400).json({
                    success: false,
                    message: 'Đơn đặt vé đã bị hủy do hết hạn thanh toán'
                });
            }

            // Tạo link thanh toán (giới hạn 25 kí tự theo yêu cầu của PayOS)
            const paymentResponse = await this.payosService.createPaymentLink(
                parseInt(bookingId),
                booking.Total_Amount,
                `Thanh toán vé #${bookingId}`,
                customerName
            );

            logger.info(`Đã tạo thành công URL thanh toán cho booking ${bookingId}`);

            return res.status(200).json({
                success: true,
                message: 'Tạo link thanh toán thành công',
                data: paymentResponse.data
            });

        } catch (error) {
            logger.error('Lỗi khi lấy payment URL:', error);
            return res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi tạo link thanh toán',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Xử lý webhook từ PayOS
     * @route POST /api/payos/webhook
     * @access Public (PayOS webhook)
     */
    async handleWebhook(req, res) {
        try {
            // Trả về phản hồi cho PayOS ngay lập tức để tránh timeout
            res.status(200).json({
                success: true,
                message: 'Webhook received successfully'
            });

            logger.info('Nhận webhook từ PayOS:', JSON.stringify(req.body, null, 2));

            const webhookData = req.body;

            // Xác thực webhook
            const isValid = await this.payosService.verifyPaymentWebhook(webhookData);

            if (!isValid) {
                logger.warn('Webhook không hợp lệ từ PayOS');
                return;
            }

            // Xử lý theo trạng thái thanh toán
            const { data } = webhookData;
            const { orderCode, status, amount } = data;

            logger.info(`Xử lý webhook cho orderCode: ${orderCode}, status: ${status}`);

            // Xử lý webhook bất đồng bộ để không chặn response
            setImmediate(async () => {
                try {
                    let result;
                    switch (status) {
                        case 'PAID':
                            result = await this.payosService.handleSuccessfulPayment(data);
                            break;
                        case 'CANCELLED':
                        case 'EXPIRED':
                            result = await this.payosService.handleFailedPayment(data);
                            break;
                        default:
                            logger.info(`Trạng thái webhook không xử lý: ${status}`);
                            return;
                    }
                    logger.info(`Đã xử lý webhook thành công: ${JSON.stringify(result)}`);
                } catch (error) {
                    logger.error('Lỗi khi xử lý webhook bất đồng bộ:', error);
                }
            });
        } catch (error) {
            logger.error('Lỗi khi xử lý webhook:', error);
            // Không trả về lỗi vì đã trả về phản hồi thành công ở trên
        }
    }

    /**
     * Xử lý return từ PayOS (sau khi thanh toán)
     * @route GET /api/payos/return
     * @access Public
     */
    async handleReturn(req, res) {
        try {
            const { orderCode, status } = req.query;

            logger.info(`PayOS return - orderCode: ${orderCode}, status: ${status}`);

            if (!orderCode) {
                const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
                return res.redirect(`${frontendUrl}/payment/error?message=Missing order code`);
            }

            // Lấy booking ID từ orderCode
            const bookingId = Math.floor(parseInt(orderCode) / 1000);
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

            // Lấy thông tin thanh toán từ PayOS
            try {
                const paymentInfo = await this.payosService.getPaymentInfo(parseInt(orderCode));
                logger.info(`Thông tin thanh toán từ PayOS: ${JSON.stringify(paymentInfo)}`);

                // Xử lý theo trạng thái thanh toán - Thay thế cho webhook trong môi trường local
                if (paymentInfo.status === 'PAID') {
                    // Xử lý thanh toán thành công như trong webhook
                    await this.payosService.handleSuccessfulPayment({
                        orderCode: parseInt(orderCode),
                        amount: paymentInfo.amount,
                        transactionDateTime: paymentInfo.paymentLinkCreatedAt || new Date().toISOString(),
                        status: 'PAID'
                    });

                    logger.info(`Đã xử lý thành công thanh toán khi người dùng quay lại, orderCode: ${orderCode}`);
                    return res.redirect(`${frontendUrl}/payment/success?bookingId=${bookingId}&orderCode=${orderCode}`);
                } else if (paymentInfo.status === 'CANCELLED' || paymentInfo.status === 'EXPIRED') {
                    // Xử lý thanh toán bị hủy/hết hạn như trong webhook
                    await this.payosService.handleFailedPayment({
                        orderCode: parseInt(orderCode),
                        status: paymentInfo.status
                    });

                    logger.info(`Đã xử lý thanh toán thất bại khi người dùng quay lại, orderCode: ${orderCode}`);
                    return res.redirect(`${frontendUrl}/payment/failed?bookingId=${bookingId}&orderCode=${orderCode}`);
                } else {
                    // Trạng thái khác (PENDING) - chuyển hướng tới trang chờ
                    return res.redirect(`${frontendUrl}/payment/pending?bookingId=${bookingId}&orderCode=${orderCode}`);
                }
            } catch (error) {
                logger.error('Lỗi khi lấy và xử lý payment info:', error);
                return res.redirect(`${frontendUrl}/payment/error?message=Cannot verify payment status`);
            }
        } catch (error) {
            logger.error('Lỗi khi xử lý return:', error);
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            return res.redirect(`${frontendUrl}/payment/error?message=Internal server error`);
        }
    }

    /**
     * Xử lý cancel từ PayOS
     * @route GET /api/payos/cancel
     * @access Public
     */
    async handleCancel(req, res) {
        try {
            const { orderCode } = req.query;
            logger.info(`PayOS cancel - orderCode: ${orderCode}`);

            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

            if (!orderCode) {
                return res.redirect(`${frontendUrl}/payment/cancelled`);
            }

            // Lấy booking ID từ orderCode
            const bookingId = Math.floor(orderCode / 1000);

            // Chuyển hướng người dùng ngay lập tức
            res.redirect(`${frontendUrl}/payment/cancelled?bookingId=${bookingId}&orderCode=${orderCode}`);

            // Xử lý hủy bỏ bất đồng bộ để không chặn response
            setImmediate(async () => {
                try {
                    // Lấy kết nối database
                    const pool = await this.getDbConnection();

                    // Bắt đầu transaction
                    const transaction = new sql.Transaction(pool);
                    await transaction.begin();

                    try {
                        // Cập nhật tất cả trạng thái trong một truy vấn duy nhất
                        const cancelQuery = `
                            -- Cập nhật trạng thái payment
                            UPDATE [ksf00691_team03].[Payments]
                            SET Payment_Status = 'CANCELLED'
                            WHERE Payment_Reference = @orderCode;

                            -- Cập nhật trạng thái booking
                            UPDATE [ksf00691_team03].[Ticket_Bookings]
                            SET Status = 'Cancelled'
                            WHERE Booking_ID = @bookingId;

                            -- Xóa các vé
                            DELETE FROM [ksf00691_team03].[Tickets]
                            WHERE Booking_ID = @bookingId;

                            -- Xóa các ghế
                            DELETE FROM [ksf00691_team03].[Seats]
                            WHERE Booking_ID = @bookingId;
                        `;

                        const request = transaction.request();
                        request.input('orderCode', sql.VarChar(255), orderCode.toString());
                        request.input('bookingId', sql.Int, bookingId);
                        await request.query(cancelQuery);

                        // Commit transaction
                        await transaction.commit();

                        logger.info(`Đã hủy thành công booking ${bookingId} và xóa vé, ghế`);
                    } catch (error) {
                        // Rollback nếu có lỗi
                        await transaction.rollback();
                        logger.error(`Lỗi khi hủy booking và xóa dữ liệu: ${error.message}`);
                    }
                } catch (error) {
                    logger.error(`Lỗi database khi xử lý hủy: ${error.message}`);
                }
            });
        } catch (error) {
            logger.error('Lỗi khi xử lý cancel:', error);
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            return res.redirect(`${frontendUrl}/payment/error?message=Internal server error`);
        }
    }

    /**
     * Lấy trạng thái thanh toán
     * @route GET /api/payos/status/:orderCode
     * @access Private
     */
    async getPaymentStatus(req, res) {
        try {
            const { orderCode } = req.params;

            logger.info(`Lấy trạng thái thanh toán cho orderCode: ${orderCode}`);

            const pool = await this.getDbConnection(req);

            // Lấy thông tin từ database
            const query = `
                SELECT p.*, tb.User_ID 
                FROM ksf00691_team03.Payments p
                JOIN ksf00691_team03.Ticket_Bookings tb ON p.Booking_ID = tb.Booking_ID
                WHERE p.Payment_Reference = @orderCode
            `;
            const request = pool.request();
            request.input('orderCode', sql.VarChar(255), orderCode.toString());
            const result = await request.query(query);

            if (result.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy thông tin thanh toán'
                });
            }

            const payment = result.recordset[0];

            // Kiểm tra quyền truy cập
            const userId = req.user?.User_ID || req.user?.id || req.user?.userId;
            if (payment.User_ID !== parseInt(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Bạn không có quyền truy cập thông tin này'
                });
            }

            return res.status(200).json({
                success: true,
                data: {
                    orderCode: payment.Payment_Reference,
                    bookingId: payment.Booking_ID,
                    amount: payment.Amount,
                    status: payment.Payment_Status,
                    paymentMethod: payment.Payment_Method,
                    createdDate: payment.Transaction_Date,
                    updatedDate: payment.Transaction_Date
                }
            });

        } catch (error) {
            logger.error('Lỗi khi lấy payment status:', error);
            return res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi lấy trạng thái thanh toán'
            });
        }
    }

    /**
     * Kiểm tra trạng thái thanh toán trực tiếp từ PayOS và cập nhật database
     * @route GET /api/payos/check-status/:orderCode
     * @access Private
     */
    async checkPaymentStatusFromPayOS(req, res) {
        try {
            const { orderCode } = req.params;

            logger.info(`Kiểm tra trạng thái thanh toán trực tiếp từ PayOS cho orderCode: ${orderCode}`);

            const pool = await this.getDbConnection(req);

            // Lấy thông tin từ database để kiểm tra quyền truy cập
            const query = `
                SELECT p.*, tb.User_ID 
                FROM ksf00691_team03.Payments p
                JOIN ksf00691_team03.Ticket_Bookings tb ON p.Booking_ID = tb.Booking_ID
                WHERE p.Payment_Reference = @orderCode
            `;
            const request = pool.request();
            request.input('orderCode', sql.VarChar(255), orderCode.toString());
            const result = await request.query(query);

            if (result.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy thông tin thanh toán'
                });
            }

            const payment = result.recordset[0];

            // Kiểm tra quyền truy cập
            const userId = req.user?.User_ID || req.user?.id || req.user?.userId;
            if (payment.User_ID !== parseInt(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Bạn không có quyền truy cập thông tin này'
                });
            }

            try {
                // Lấy thông tin thanh toán trực tiếp từ PayOS
                const payosInfo = await this.payosService.getPaymentInfo(parseInt(orderCode));

                logger.info(`Thông tin từ PayOS cho orderCode ${orderCode}:`, JSON.stringify(payosInfo, null, 2));

                // Kiểm tra nếu trạng thái đã thay đổi
                const payosStatus = payosInfo.status;
                const currentDbStatus = payment.Payment_Status;

                logger.info(`Trạng thái PayOS: ${payosStatus}, Trạng thái DB: ${currentDbStatus}`);

                // Nếu PayOS cho biết đã thanh toán nhưng DB vẫn PENDING
                if (payosStatus === 'PAID' && currentDbStatus === 'PENDING') {
                    logger.info(`Phát hiện thanh toán thành công trên PayOS, cập nhật database...`);

                    // Xử lý thanh toán thành công
                    await this.payosService.handleSuccessfulPayment({
                        orderCode: parseInt(orderCode),
                        amount: payosInfo.amount,
                        transactionDateTime: payosInfo.paymentLinkCreatedAt || new Date().toISOString(),
                        status: 'PAID'
                    });

                    return res.status(200).json({
                        success: true,
                        data: {
                            orderCode: orderCode,
                            bookingId: payment.Booking_ID,
                            amount: payosInfo.amount,
                            status: 'PAID',
                            paymentMethod: 'PayOS',
                            payosInfo: payosInfo,
                            updated: true,
                            message: 'Đã cập nhật trạng thái thanh toán thành công'
                        }
                    });
                }

                // Trả về thông tin hiện tại
                return res.status(200).json({
                    success: true,
                    data: {
                        orderCode: orderCode,
                        bookingId: payment.Booking_ID,
                        amount: payment.Amount,
                        status: payosStatus,
                        paymentMethod: payment.Payment_Method,
                        payosInfo: payosInfo,
                        updated: false,
                        message: 'Trạng thái không thay đổi'
                    }
                });

            } catch (payosError) {
                logger.error(`Lỗi khi lấy thông tin từ PayOS:`, payosError);

                // Trả về thông tin từ database nếu không thể kết nối PayOS
                return res.status(200).json({
                    success: true,
                    data: {
                        orderCode: payment.Payment_Reference,
                        bookingId: payment.Booking_ID,
                        amount: payment.Amount,
                        status: payment.Payment_Status,
                        paymentMethod: payment.Payment_Method,
                        payosError: payosError.message,
                        message: 'Không thể kết nối PayOS, trả về thông tin từ database'
                    }
                });
            }

        } catch (error) {
            logger.error('Lỗi khi kiểm tra payment status từ PayOS:', error);
            return res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi kiểm tra trạng thái thanh toán'
            });
        }
    }

    /**
     * Hủy link thanh toán
     * @route DELETE /api/payos/cancel/:orderCode
     * @access Private
     */
    async cancelPaymentLink(req, res) {
        try {
            const { orderCode } = req.params;

            logger.info(`Hủy link thanh toán cho orderCode: ${orderCode}`);

            const pool = await this.getDbConnection(req);

            // Kiểm tra quyền truy cập
            const query = `
                SELECT p.*, tb.User_ID 
                FROM ksf00691_team03.Payments p
                JOIN ksf00691_team03.Ticket_Bookings tb ON p.Booking_ID = tb.Booking_ID
                WHERE p.Payment_Reference = @orderCode AND p.Payment_Status = 'PENDING'
            `;
            const request = pool.request();
            request.input('orderCode', sql.VarChar(255), orderCode.toString());
            const result = await request.query(query);

            if (result.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy link thanh toán hoặc đã được xử lý'
                });
            }

            const payment = result.recordset[0];
            const userId = req.user?.User_ID || req.user?.id || req.user?.userId;

            if (payment.User_ID !== parseInt(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Bạn không có quyền hủy link thanh toán này'
                });
            }

            // Hủy link thanh toán trên PayOS
            await this.payosService.cancelPaymentLink(parseInt(orderCode));

            // Cập nhật trạng thái payment
            await this.payosService.updatePaymentStatus(orderCode, 'Cancelled', { reason: 'User cancelled' });

            // Lấy booking ID
            const bookingId = Math.floor(parseInt(orderCode) / 1000);

            // Bắt đầu transaction
            const transaction = new sql.Transaction(pool);
            await transaction.begin();

            try {
                // Thực hiện tất cả các thao tác cập nhật trong một truy vấn duy nhất
                const cancelAllQuery = `
                    -- Cập nhật trạng thái booking
                    UPDATE [ksf00691_team03].[Ticket_Bookings]
                    SET Status = 'Cancelled'
                    WHERE Booking_ID = @bookingId;

                    -- Xóa các vé
                    DELETE FROM [ksf00691_team03].[Tickets]
                    WHERE Booking_ID = @bookingId;

                    -- Xóa các ghế
                    DELETE FROM [ksf00691_team03].[Seats]
                    WHERE Booking_ID = @bookingId;
                `;
                const combinedRequest = transaction.request();
                combinedRequest.input('bookingId', sql.Int, bookingId);
                await combinedRequest.query(cancelAllQuery);

                // Commit transaction
                await transaction.commit();

                logger.info(`Đã hủy thành công booking ${bookingId} và xóa vé, ghế`);
            } catch (error) {
                // Rollback nếu có lỗi
                await transaction.rollback();
                logger.error(`Lỗi khi hủy booking và xóa dữ liệu: ${error.message}`);
                throw error;
            }

            logger.info(`Đã hủy thành công link thanh toán ${orderCode}`);

            return res.status(200).json({
                success: true,
                message: 'Đã hủy link thanh toán thành công'
            });

        } catch (error) {
            logger.error('Lỗi khi hủy payment link:', error);
            return res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi hủy link thanh toán'
            });
        }
    }

    /**
     * Lấy URL thanh toán cho đơn đặt vé đang pending của người dùng
     * Không yêu cầu bookingId, tự động tìm booking đang chờ thanh toán
     * @route GET /api/payos/pending-payment-url
     * @access Private
     */
    async getPaymentUrlForPendingBooking(req, res) {
        try {
            // Lấy thông tin người dùng từ token
            const userId = req.user?.User_ID || req.user?.id || req.user?.userId;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Không thể xác định người dùng'
                });
            }

            logger.info(`Đang lấy URL thanh toán tự động cho đơn đặt vé đang chờ của user: ${userId}`);

            // Lấy tên người dùng từ token (nếu có) thay vì query database
            const customerName = req.user?.fullName || req.user?.Full_Name || 'Khách hàng';

            // Gọi service để tạo payment link cho booking đang pending
            // Service sẽ tự quản lý database connection
            const paymentResponse = await this.payosService.createPaymentLinkForPendingBooking(
                userId,
                customerName
            );

            // Kiểm tra kết quả
            if (!paymentResponse.success) {
                // Trả về 200 thay vì 404 vì đây là tình huống bình thường (không có đơn đặt vé đang chờ)
                return res.status(200).json({
                    success: false,
                    message: paymentResponse.message,
                    noPendingBookings: true
                });
            }

            logger.info(`Đã tạo thành công URL thanh toán tự động cho user ${userId}`);

            return res.status(200).json({
                success: true,
                message: 'Tạo link thanh toán thành công',
                data: {
                    booking: paymentResponse.booking,
                    payment: paymentResponse.payment
                }
            });

        } catch (error) {
            logger.error('Lỗi khi lấy payment URL tự động:', error);
            return res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi tạo link thanh toán',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Tạo link thanh toán PayOS cho Staff (không cần user ID)
     * Staff có thể tạo link thanh toán cho bất kỳ booking nào, kể cả khách vãng lai
     * @route POST /api/payos/staff/create-payment-link/:bookingId
     * @access Staff
     */
    async createPaymentLinkForStaff(req, res) {
        let pool;
        try {
            const { bookingId } = req.params;
            logger.info(`Staff đang tạo URL thanh toán cho đơn đặt vé: ${bookingId}`);

            // Kiểm tra quyền Staff/Admin
            const userRole = req.user?.Role || req.user?.role;
            if (!['Staff', 'Admin', 'Manager'].includes(userRole)) {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ nhân viên mới có quyền tạo link thanh toán này'
                });
            }

            pool = await this.getDbConnection(req);

            // Lấy thông tin booking (không cần kiểm tra user ID)
            const bookingQuery = `
                SELECT b.*, u.Full_Name, u.Email
                FROM ksf00691_team03.Ticket_Bookings b
                LEFT JOIN ksf00691_team03.Users u ON b.User_ID = u.User_ID
                WHERE b.Booking_ID = @bookingId
            `;
            const bookingRequest = pool.request();
            bookingRequest.input('bookingId', sql.Int, bookingId);
            const bookingResult = await bookingRequest.query(bookingQuery);

            if (bookingResult.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy đơn đặt vé'
                });
            }

            const booking = bookingResult.recordset[0];
            
            // Sử dụng tên khách hàng hoặc tên mặc định nếu là khách vãng lai
            const customerName = booking.Full_Name || 'Khách vãng lai';

            // Kiểm tra trạng thái booking
            if (booking.Status !== 'Pending') {
                return res.status(400).json({
                    success: false,
                    message: `Đơn đặt vé đã ${booking.Status}. Không thể thanh toán.`
                });
            }

            // Kiểm tra thời gian hết hạn (15 phút)
            const bookingTime = new Date(booking.Booking_Date);
            const expiryTime = new Date(bookingTime.getTime() + 15 * 60 * 1000);

            if (new Date() > expiryTime) {
                // Tự động hủy booking hết hạn
                const transaction = new sql.Transaction(pool);
                await transaction.begin();

                try {
                    const cancelQuery = `
                        UPDATE [ksf00691_team03].[Ticket_Bookings] 
                        SET Status = 'Cancelled' 
                        WHERE Booking_ID = @bookingId;

                        DELETE FROM [ksf00691_team03].[Tickets]
                        WHERE Booking_ID = @bookingId;

                        DELETE FROM [ksf00691_team03].[Seats]
                        WHERE Booking_ID = @bookingId;
                    `;
                    const cancelRequest = transaction.request();
                    cancelRequest.input('bookingId', sql.Int, bookingId);
                    await cancelRequest.query(cancelQuery);

                    await transaction.commit();
                    logger.info(`Đơn đặt vé ${bookingId} đã hủy vì hết hạn thanh toán`);
                } catch (error) {
                    await transaction.rollback();
                    logger.error(`Lỗi khi hủy booking hết hạn: ${error.message}`);
                }

                return res.status(400).json({
                    success: false,
                    message: 'Đơn đặt vé đã bị hủy do hết hạn thanh toán'
                });
            }

            // Tạo link thanh toán PayOS
            const paymentResponse = await this.payosService.createPaymentLink(
                parseInt(bookingId),
                booking.Total_Amount,
                `Thanh toán vé #${bookingId}`,
                customerName
            );

            logger.info(`Staff đã tạo thành công URL thanh toán cho booking ${bookingId}`);

            return res.status(200).json({
                success: true,
                message: 'Tạo link thanh toán thành công',
                data: {
                    ...paymentResponse.data,
                    customerName: customerName,
                    customerEmail: booking.Email || null,
                    isWalkInCustomer: !booking.User_ID,
                    amount: booking.Total_Amount
                }
            });

        } catch (error) {
            logger.error('Lỗi khi Staff tạo payment URL:', error);
            return res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi tạo link thanh toán',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Lấy thông tin thanh toán cho Staff (không cần user ID)
     * @route GET /api/payos/staff/payment-info/:bookingId
     * @access Staff
     */
    async getPaymentInfoForStaff(req, res) {
        try {
            const { bookingId } = req.params;

            // Kiểm tra quyền Staff/Admin
            const userRole = req.user?.Role || req.user?.role;
            if (!['Staff', 'Admin', 'Manager'].includes(userRole)) {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ nhân viên mới có quyền xem thông tin thanh toán này'
                });
            }

            logger.info(`Staff lấy thông tin thanh toán cho booking: ${bookingId}`);

            const pool = await this.getDbConnection(req);

            // Lấy thông tin payment (không cần kiểm tra user ID)
            const query = `
                SELECT p.*, tb.User_ID, tb.Total_Amount, u.Full_Name, u.Email
                FROM ksf00691_team03.Payments p
                JOIN ksf00691_team03.Ticket_Bookings tb ON p.Booking_ID = tb.Booking_ID
                LEFT JOIN ksf00691_team03.Users u ON tb.User_ID = u.User_ID
                WHERE p.Booking_ID = @bookingId
                ORDER BY p.Transaction_Date DESC
            `;
            const request = pool.request();
            request.input('bookingId', sql.Int, bookingId);
            const result = await request.query(query);

            if (result.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy thông tin thanh toán'
                });
            }

            const payment = result.recordset[0];

            return res.status(200).json({
                success: true,
                data: {
                    orderCode: payment.Payment_Reference,
                    bookingId: payment.Booking_ID,
                    amount: payment.Amount,
                    status: payment.Payment_Status,
                    paymentMethod: payment.Payment_Method,
                    createdDate: payment.Transaction_Date,
                    customerName: payment.Full_Name || 'Khách vãng lai',
                    customerEmail: payment.Email || null,
                    isWalkInCustomer: !payment.User_ID
                }
            });

        } catch (error) {
            logger.error('Lỗi khi Staff lấy payment info:', error);
            return res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi lấy thông tin thanh toán'
            });
        }
    }
}

module.exports = PayOSController;

