// File: src/services/payosService.js
const PayOS = require('@payos/node');
const { getConnection } = require('../config/database');
const sql = require('mssql');
const winston = require('winston');
const path = require('path');

// Logger riêng cho PayOS
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
        new winston.transports.File({ filename: path.join(__dirname, '../logs/payos.log') })
    ]
});

class PayOSService {
    constructor() {
        // Lấy thông tin từ cấu hình
        const clientId = process.env.PAYOS_CLIENT_ID;
        const apiKey = process.env.PAYOS_API_KEY;
        const checksumKey = process.env.PAYOS_CHECKSUM_KEY;

        if (!clientId || !apiKey || !checksumKey) {
            throw new Error('PayOS configuration is missing. Please check PAYOS_CLIENT_ID, PAYOS_API_KEY, and PAYOS_CHECKSUM_KEY');
        }

        // Khởi tạo PayOS
        this.payOS = new PayOS(clientId, apiKey, checksumKey);
        this.poolPromise = null; // Cache kết nối database

        logger.info('PayOS Service initialized successfully');
    }

    /**
     * Lấy kết nối database từ cache hoặc tạo mới
     */
    async getDbConnection() {
        try {
            // Không cache connection để tránh lỗi connection closed
            return await getConnection();
        } catch (error) {
            logger.error('Lỗi khi lấy kết nối database:', error);

            // Thử lại một lần nữa với kết nối mới
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
     * Cập nhật trạng thái thanh toán trong database
     */
    async updatePaymentStatus(orderCode, status, paymentData = {}, existingTransaction = null) {
        try {
            let shouldCloseConnection = false;
            let dbTransaction = existingTransaction;
            let pool;

            // Nếu không có transaction sẵn, tạo mới
            if (!dbTransaction) {
                shouldCloseConnection = true;
                pool = await this.getDbConnection();
                dbTransaction = new sql.Transaction(pool);
                await dbTransaction.begin();
            }

            // Cập nhật trạng thái payment
            const updateQuery = `
                UPDATE [ksf00691_team03].[Payments] 
                SET 
                    Payment_Status = @status,
                    Processor_Response = @processorResponse,
                    Transaction_Date = GETDATE()
                WHERE Payment_Reference = @orderCode
            `;

            const request = dbTransaction.request();
            request.input('orderCode', sql.VarChar(255), orderCode.toString());
            request.input('status', sql.VarChar(50), status);
            request.input('processorResponse', sql.NVarChar(sql.MAX), JSON.stringify(paymentData));

            await request.query(updateQuery);

            // Chỉ commit nếu chúng ta đã tạo transaction mới
            if (shouldCloseConnection) {
                await dbTransaction.commit();
            }

            logger.info(`Đã cập nhật trạng thái payment ${orderCode} thành ${status}`);
            return true;

        } catch (error) {
            logger.error(`Lỗi khi cập nhật trạng thái payment ${orderCode}:`, error);
            throw error;
        }
    }

    /**
     * Cập nhật trạng thái booking
     */
    async updateBookingStatus(bookingId, status, transaction = null) {
        try {
            let shouldCloseConnection = false;
            let dbTransaction = transaction;
            let pool;

            // Nếu không có transaction sẵn, tạo mới
            if (!dbTransaction) {
                shouldCloseConnection = true;
                pool = await this.getDbConnection();
                dbTransaction = new sql.Transaction(pool);
                await dbTransaction.begin();
            }

            const query = `
                UPDATE [ksf00691_team03].[Ticket_Bookings]
                SET Status = @status
              WHERE Booking_ID = @bookingId 
            `;

            const request = dbTransaction.request();
            request.input('bookingId', sql.Int, bookingId);
            request.input('status', sql.VarChar(50), status);
            await request.query(query);

            // Chỉ commit nếu chúng ta đã tạo transaction mới
            if (shouldCloseConnection) {
                await dbTransaction.commit();
            }

            logger.info(`Đã cập nhật trạng thái booking ${bookingId} thành ${status}`);
            return true;

        } catch (error) {
            logger.error(`Lỗi khi cập nhật trạng thái booking ${bookingId}:`, error);
            throw error;
        }
    }

    /**
     * Tạo thông báo thanh toán (nếu có bảng Notifications)
     */
    async createPaymentNotification(bookingId, amount, status, transaction = null) {
        try {
            // Kiểm tra bảng Notifications có tồn tại không
            let pool = await this.getDbConnection();
            const checkTableQuery = `
                SELECT COUNT(*) as table_exists 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = 'ksf00691_team03' 
                AND TABLE_NAME = 'Notifications'
            `;
            const checkResult = await pool.request().query(checkTableQuery);

            if (checkResult.recordset[0].table_exists === 0) {
                logger.warn('Bảng Notifications không tồn tại, bỏ qua tạo notification');
                return false;
            }

            // Bảng tồn tại, tiến hành tạo notification
            let shouldCloseConnection = false;
            let dbTransaction = transaction;

            // Nếu không có transaction sẵn, tạo mới
            if (!dbTransaction) {
                shouldCloseConnection = true;
                dbTransaction = new sql.Transaction(pool);
                await dbTransaction.begin();
            }

            // Lấy thông tin user_id từ booking
            const userQuery = `
                SELECT User_ID FROM [ksf00691_team03].[Ticket_Bookings]
                WHERE Booking_ID = @bookingId
            `;
            const userRequest = dbTransaction.request();
            userRequest.input('bookingId', sql.Int, bookingId);
            const userResult = await userRequest.query(userQuery);

            if (userResult.recordset.length === 0) {
                throw new Error(`Không tìm thấy booking ${bookingId}`);
            }

            const userId = userResult.recordset[0].User_ID;

            // Tạo nội dung thông báo
            let title, content;
            if (status === 'success') {
                title = 'Thanh toán thành công';
                content = `Thanh toán ${amount.toLocaleString('vi-VN')}đ cho đơn đặt vé #${bookingId} đã được xác nhận.`;
            } else {
                title = 'Thanh toán thất bại';
                content = `Thanh toán cho đơn đặt vé #${bookingId} không thành công. Vui lòng thử lại.`;
            }

            // Thêm thông báo
            const insertQuery = `
                INSERT INTO [ksf00691_team03].[Notifications] 
                (User_ID, Title, Content, IsRead, CreatedDate, Type)
                VALUES (@userId, @title, @content, 0, GETDATE(), 'Payment')
            `;

            const request = dbTransaction.request();
            request.input('userId', sql.Int, userId);
            request.input('title', sql.NVarChar(255), title);
            request.input('content', sql.NVarChar(500), content);
            await request.query(insertQuery);

            // Chỉ commit nếu chúng ta đã tạo transaction mới
            if (shouldCloseConnection) {
                await dbTransaction.commit();
            }

            return true;
        } catch (error) {
            logger.error(`Lỗi khi tạo thông báo thanh toán:`, error);
            return false;
        }
    }

    /**
     * Cộng điểm thưởng cho người dùng
     */
    async addRewardPoints(bookingId, amount, transaction = null) {
        try {
            // Tính điểm tích lũy với giới hạn tối đa 50% số tiền hóa đơn
            let pointsToAdd = Math.floor(amount / 10); // 10% của số tiền (amount / 10 = amount * 0.1)
            
            // ✅ GIỚI HẠN TỐI ĐA 50% SỐ TIỀN HÓA ĐƠN
            const maxPointsAllowed = Math.floor(amount * 0.5); // 50% số tiền
            if (pointsToAdd > maxPointsAllowed) {
                logger.warn(`[PayOS] Giới hạn điểm tích lũy: ${pointsToAdd} điểm vượt quá 50% hóa đơn (${maxPointsAllowed}). Điều chỉnh về ${maxPointsAllowed} điểm.`);
                pointsToAdd = maxPointsAllowed;
            }
            
            logger.info(`[PayOS] Tích điểm cho hóa đơn ${amount} VND: ${pointsToAdd} điểm (giới hạn tối đa ${maxPointsAllowed} điểm)`);

            let shouldCloseConnection = false;
            let dbTransaction = transaction;
            let pool;

            // Nếu không có transaction sẵn, tạo mới
            if (!dbTransaction) {
                shouldCloseConnection = true;
                pool = await this.getDbConnection();
                dbTransaction = new sql.Transaction(pool);
                await dbTransaction.begin();
            }

            try {
                // Thực hiện cập nhật points và thêm lịch sử trong một lần query để tối ưu
                const query = `
                    -- Lấy user_id từ booking
                    DECLARE @userId INT;
                    SELECT @userId = User_ID FROM [ksf00691_team03].[Ticket_Bookings] WHERE Booking_ID = @bookingId;

                    -- Kiểm tra xem user có bản ghi User_Points chưa
                    DECLARE @userPointsId INT;
                    SELECT @userPointsId = UserPoints_ID FROM [ksf00691_team03].[User_Points] WHERE User_ID = @userId;

                    -- Nếu chưa có, thêm mới
                    IF @userPointsId IS NULL
                    BEGIN
                        INSERT INTO [ksf00691_team03].[User_Points]
                        (User_ID, Total_Points, Last_Updated)
                        VALUES (@userId, @points, GETDATE());
                    END
                    ELSE
                    -- Nếu đã có, cập nhật
                    BEGIN
                        UPDATE [ksf00691_team03].[User_Points]
                        SET Total_Points = Total_Points + @points,
                            Last_Updated = GETDATE()
                        WHERE User_ID = @userId;
                    END

                    -- Trả về userId để log
                    SELECT @userId as UserId;
                `;

                const request = dbTransaction.request();
                request.input('bookingId', sql.Int, bookingId);
                request.input('points', sql.Int, pointsToAdd);
                const result = await request.query(query);

                // Thêm lịch sử điểm nếu bảng Points_Earning tồn tại
                try {
                    // Kiểm tra xem bảng Points_Earning tồn tại không
                    const checkTableQuery = `
                        SELECT COUNT(*) as table_exists 
                        FROM INFORMATION_SCHEMA.TABLES 
                        WHERE TABLE_SCHEMA = 'ksf00691_team03' 
                        AND TABLE_NAME = 'Points_Earning'
                    `;
                    const checkRequest = dbTransaction.request();
                    const checkResult = await checkRequest.query(checkTableQuery);

                    if (checkResult.recordset[0].table_exists > 0) {
                        // Bảng tồn tại, thêm lịch sử
                        const historyQuery = `
                            INSERT INTO [ksf00691_team03].[Points_Earning]
                            (User_ID, Points_Earned, Activity_Type, Reference_ID, Earning_Date, Notes)
                            VALUES (@userId, @points, 'Booking Reward', @bookingId, GETDATE(), 'Điểm thưởng từ thanh toán đặt vé');
                        `;

                        const historyRequest = dbTransaction.request();
                        historyRequest.input('userId', sql.Int, result.recordset[0]?.UserId);
                        historyRequest.input('points', sql.Int, pointsToAdd);
                        historyRequest.input('bookingId', sql.Int, bookingId);
                        await historyRequest.query(historyQuery);

                        logger.info(`Đã thêm lịch sử điểm thưởng vào Points_Earning`);
                    }
                } catch (historyError) {
                    // Bỏ qua lỗi khi thêm lịch sử, vẫn cộng điểm thành công
                    logger.warn(`Không thể thêm lịch sử điểm, nhưng vẫn cộng điểm thành công: ${historyError.message}`);
                }

                // Chỉ commit nếu chúng ta đã tạo transaction mới
                if (shouldCloseConnection) {
                    await dbTransaction.commit();
                }

                const userId = result.recordset[0]?.UserId;
                logger.info(`Đã cộng ${pointsToAdd} điểm thưởng cho user ${userId} từ booking ${bookingId}`);

                return { points: pointsToAdd, userId };
            } catch (error) {
                // Rollback nếu có lỗi và transaction được tạo bởi phương thức này
                if (shouldCloseConnection) {
                    await dbTransaction.rollback();
                }
                throw error;
            }
        } catch (error) {
            logger.error(`Lỗi khi cộng điểm thưởng cho booking ${bookingId}:`, error);
            return false;
        }
    }

    /**
     * Hủy thanh toán cho booking
     */
    async cancelBookingPayment(bookingId, userId) {
        try {
            logger.info(`Hủy payment cho booking ${bookingId} bởi user ${userId}`);

            // Lấy thông tin payment từ database
            const pool = await this.getDbConnection();

            // Lấy thông tin booking trước khi cập nhật
            const bookingQuery = `
                SELECT b.Booking_ID, b.User_ID, b.Status, b.Points_Used, b.Promotion_ID 
                FROM [ksf00691_team03].[Ticket_Bookings] b
                WHERE b.Booking_ID = @bookingId
            `;

            const bookingRequest = pool.request();
            bookingRequest.input('bookingId', sql.Int, bookingId);
            const bookingResult = await bookingRequest.query(bookingQuery);

            if (bookingResult.recordset.length === 0) {
                logger.warn(`Không tìm thấy booking ${bookingId}`);
                return {
                    success: false,
                    message: 'Không tìm thấy thông tin đơn đặt'
                };
            }

            const booking = bookingResult.recordset[0];
            const bookingUserId = booking.User_ID;
            const pointsToRefund = booking.Points_Used || 0;
            const promotionId = booking.Promotion_ID;
            const currentStatus = booking.Status;

            logger.info(`Thông tin booking ${bookingId}: Status=${currentStatus}, Points_Used=${pointsToRefund}, User_ID=${bookingUserId}, Promotion_ID=${promotionId}`);

            // Lấy thông tin payment
            const paymentQuery = `
                SELECT * FROM [ksf00691_team03].[Payments]
                WHERE Booking_ID = @bookingId
            `;
            const paymentRequest = pool.request();
            paymentRequest.input('bookingId', sql.Int, bookingId);
            const paymentResult = await paymentRequest.query(paymentQuery);

            if (paymentResult.recordset.length === 0) {
                logger.warn(`Không tìm thấy payment cho booking ${bookingId}`);
                return {
                    success: false,
                    message: 'Không tìm thấy thông tin thanh toán'
                };
            }

            const payment = paymentResult.recordset[0];
            const orderCode = payment.Payment_Reference;
            const amount = payment.Amount;
            const currentPaymentStatus = payment.Payment_Status;
            const paymentId = payment.Payment_ID;

            // Nếu payment đã hoàn thành, không thể hủy
            if (currentPaymentStatus === 'PAID' || currentPaymentStatus === 'Completed') {
                logger.warn(`Payment cho booking ${bookingId} đã hoàn thành, không thể hủy`);
                return {
                    success: false,
                    message: 'Không thể hủy thanh toán đã hoàn thành'
                };
            }

            // Nếu payment đã bị hủy rồi
            if (currentPaymentStatus === 'CANCELLED' || currentPaymentStatus === 'Cancelled') {
                logger.info(`Payment cho booking ${bookingId} đã được hủy trước đó`);
                return {
                    success: true,
                    message: 'Thanh toán đã được hủy trước đó',
                    orderCode: orderCode,
                    amount: amount
                };
            }

            let payosCancelResult = null;

            // Chỉ gọi PayOS cancel nếu payment đang pending
            if (currentPaymentStatus === 'PENDING' || currentPaymentStatus === 'Pending') {
                try {
                    payosCancelResult = await this.cancelPaymentLink(orderCode);
                    logger.info(`PayOS cancel result:`, payosCancelResult);
                } catch (payosError) {
                    logger.warn(`PayOS cancel failed (có thể link đã hết hạn): ${payosError.message}`);
                    // Không throw error, vẫn tiếp tục cập nhật database
                }
            }

            // Bắt đầu database transaction
            const dbTransaction = new sql.Transaction(pool);
            await dbTransaction.begin();

            try {
                // Cập nhật trạng thái payment và booking, xóa vé và ghế trong một truy vấn
                const combinedQuery = `
                    -- Cập nhật trạng thái payment
                  UPDATE [ksf00691_team03].[Payments] 
                  SET 
                      Payment_Status = 'CANCELLED',
                      Processed_By = @processedBy,
                        Processor_Response = @processorResponse,
                        Transaction_Date = GETDATE()
                    WHERE Payment_ID = @paymentId;

                    -- Cập nhật trạng thái booking
                    UPDATE [ksf00691_team03].[Ticket_Bookings]
                    SET Status = 'Cancelled',
                        Points_Used = 0,
                        Promotion_ID = NULL
                    WHERE Booking_ID = @bookingId;

                    -- Xóa các vé
                    DELETE FROM [ksf00691_team03].[Tickets]
                    WHERE Booking_ID = @bookingId;

                    -- Xóa các ghế
                    DELETE FROM [ksf00691_team03].[Seats]
                    WHERE Booking_ID = @bookingId;
                `;

                const combinedRequest = dbTransaction.request();
                combinedRequest.input('paymentId', sql.Int, paymentId);
                combinedRequest.input('bookingId', sql.Int, bookingId);
                combinedRequest.input('processedBy', sql.Int, userId);
                combinedRequest.input('processorResponse', sql.NVarChar(sql.MAX),
                    JSON.stringify({
                        cancelledBy: userId,
                        cancelledAt: new Date().toISOString(),
                        payosCancelResult: payosCancelResult || { message: 'No PayOS response' }
                    })
                );

                await combinedRequest.query(combinedQuery);

                // Hoàn trả điểm thưởng nếu có
                if (pointsToRefund > 0 && bookingUserId) {
                    logger.info(`Hoàn trả ${pointsToRefund} điểm cho user ${bookingUserId}`);

                    // Cộng lại điểm cho user
                    try {
                        const refundPointsQuery = `
                            -- Kiểm tra xem user có bản ghi User_Points chưa
                            DECLARE @userPointsId INT;
                            SELECT @userPointsId = UserPoints_ID FROM [ksf00691_team03].[User_Points] WHERE User_ID = @userId;

                            -- Nếu chưa có, thêm mới
                            IF @userPointsId IS NULL
                            BEGIN
                                INSERT INTO [ksf00691_team03].[User_Points]
                                (User_ID, Total_Points, Last_Updated)
                                VALUES (@userId, @points, GETDATE());
                            END
                            ELSE
                            -- Nếu đã có, cập nhật
                            BEGIN
                                UPDATE [ksf00691_team03].[User_Points]
                                SET Total_Points = Total_Points + @points,
                                    Last_Updated = GETDATE()
                                WHERE User_ID = @userId;
                            END
                        `;

                        const refundRequest = dbTransaction.request();
                        refundRequest.input('userId', sql.Int, bookingUserId);
                        refundRequest.input('points', sql.Int, pointsToRefund);
                        await refundRequest.query(refundPointsQuery);

                        // Thêm lịch sử hoàn trả điểm
                        try {
                            // Kiểm tra xem bảng Points_Redemption tồn tại không
                            const checkTableQuery = `
                                SELECT COUNT(*) as table_exists 
                                FROM INFORMATION_SCHEMA.TABLES 
                                WHERE TABLE_SCHEMA = 'ksf00691_team03' 
                                AND TABLE_NAME = 'Points_Redemption'
                            `;
                            const checkRequest = dbTransaction.request();
                            const checkResult = await checkRequest.query(checkTableQuery);

                            if (checkResult.recordset[0].table_exists > 0) {
                                // Bảng tồn tại, thêm lịch sử
                                const historyQuery = `
                                    INSERT INTO [ksf00691_team03].[Points_Redemption]
                                    (User_ID, Points_Redeemed, Activity_Type, Reference_ID, Redemption_Date, Notes)
                                    VALUES (@userId, @points, 'Cancellation', @bookingId, GETDATE(), 'Hoàn trả điểm do hủy đặt vé');
                                `;

                                const historyRequest = dbTransaction.request();
                                historyRequest.input('userId', sql.Int, bookingUserId);
                                historyRequest.input('points', sql.Int, pointsToRefund);
                                historyRequest.input('bookingId', sql.Int, bookingId);
                                await historyRequest.query(historyQuery);

                                logger.info(`Đã thêm lịch sử hoàn trả điểm vào Points_Redemption`);
                            }
                        } catch (historyError) {
                            // Bỏ qua lỗi khi thêm lịch sử, vẫn cộng điểm thành công
                            logger.warn(`Không thể thêm lịch sử hoàn trả điểm, nhưng vẫn hoàn trả điểm thành công: ${historyError.message}`);
                        }

                        logger.info(`Đã hoàn trả ${pointsToRefund} điểm cho user ${bookingUserId}`);
                    } catch (pointsError) {
                        logger.error(`Lỗi khi hoàn trả điểm: ${pointsError.message}`);
                        // Không throw lỗi để tiếp tục xử lý các phần khác
                    }
                }

                // Xử lý hoàn trả mã khuyến mãi nếu có
                if (promotionId) {
                    logger.info(`Xử lý hoàn trả mã khuyến mãi ID=${promotionId}`);

                    try {
                        // Cập nhật bản ghi PromotionUsage
                        const updatePromotionQuery = `
                            -- Cập nhật PromotionUsages
                            UPDATE [ksf00691_team03].[Promotion_Usages]
                            SET HasUsed = 0
                            WHERE Booking_ID = @bookingId;
                            
                            -- Giảm lượt sử dụng của promotion
                            UPDATE [ksf00691_team03].[Promotions]
                            SET Current_Usage = Current_Usage - 1
                            WHERE Promotion_ID = @promotionId AND Current_Usage > 0;
                        `;

                        const promotionRequest = dbTransaction.request();
                        promotionRequest.input('bookingId', sql.Int, bookingId);
                        promotionRequest.input('promotionId', sql.Int, promotionId);
                        await promotionRequest.query(updatePromotionQuery);

                        logger.info(`Đã hoàn trả mã khuyến mãi ID=${promotionId}`);
                    } catch (promoError) {
                        logger.warn(`Không thể hoàn trả mã khuyến mãi: ${promoError.message}`);
                    }
                }

                // Tạo thông báo cho user (nếu bảng tồn tại)
                try {
                    await this.createPaymentNotification(bookingId, 0, 'failed', dbTransaction);
                } catch (notifError) {
                    logger.warn('Không thể tạo thông báo:', notifError.message);
                }

                // Thêm vào lịch sử booking
                const historyQuery = `
                    INSERT INTO [ksf00691_team03].[Booking_History]
                    (Booking_ID, Status, Date, Notes, IsRead)
                    VALUES 
                    (@bookingId, 'Cancelled', GETDATE(), 'Hủy đơn đặt vé thủ công, đã hoàn trả điểm và mã khuyến mãi', 0)
                `;

                const historyRequest = dbTransaction.request();
                historyRequest.input('bookingId', sql.Int, bookingId);
                await historyRequest.query(historyQuery);

                // Commit transaction
                await dbTransaction.commit();

                logger.info(`Đã hủy thành công thanh toán cho booking ${bookingId}`);

                return {
                    success: true,
                    message: 'Hủy thanh toán thành công',
                    orderCode: orderCode,
                    amount: amount,
                    payosCancelResult: payosCancelResult,
                    pointsRefunded: pointsToRefund > 0,
                    promotionRefunded: promotionId !== null
                };

            } catch (dbError) {
                await dbTransaction.rollback();
                throw dbError;
            }

        } catch (error) {
            logger.error(`Lỗi khi hủy thanh toán cho booking ${bookingId}:`, error);
            return {
                success: false,
                message: `Lỗi khi hủy thanh toán: ${error.message}`
            };
        }
    }

    /**
     * Tạo link thanh toán PayOS
     */
    async createPaymentLink(bookingId, amount, description, customerName = null) {
        try {
            logger.info(`Tạo link thanh toán cho đơn đặt vé ${bookingId} với số tiền ${amount}`);

            // Tạo orderCode từ bookingId
            const orderCode = parseInt(bookingId) * 1000 + Math.floor(Math.random() * 1000);

            // Khởi tạo URL callback
            const appUrl = process.env.APP_URL || 'http://localhost:3000';
            const returnURL = `${appUrl}/api/payos/return`;
            const cancelURL = `${appUrl}/api/payos/cancel`;

            logger.info(`ReturnURL: ${returnURL}, CancelURL: ${cancelURL}`);

            // Tạo dữ liệu thanh toán
            const paymentData = {
                orderCode: orderCode,
                amount: amount,
                description: description,
                returnUrl: returnURL,
                cancelUrl: cancelURL,
            };

            // Thêm thông tin khách hàng nếu có
            if (customerName) {
                paymentData.customerInfo = {
                    name: customerName
                };
            }

            logger.info(`PayOS Payment Data:`, paymentData);

            // Gọi API của PayOS
            const paymentLinkResponse = await this.payOS.createPaymentLink(paymentData);

            logger.info('PayOS Response:', JSON.stringify(paymentLinkResponse, null, 2));

            // Lưu thông tin payment vào database
            await this.savePaymentInfo(bookingId, orderCode, amount, paymentLinkResponse);

            return {
                success: true,
                data: {
                    paymentUrl: paymentLinkResponse.checkoutUrl,
                    orderCode: orderCode,
                    amount: amount,
                    qrCode: paymentLinkResponse.qrCode || null
                }
            };

        } catch (error) {
            logger.error('Lỗi khi tạo payment link:', error);
            throw new Error(`Không thể tạo link thanh toán: ${error.message}`);
        }
    }

    /**
     * Lưu thông tin payment vào database
     */
    async savePaymentInfo(bookingId, orderCode, amount, paymentLinkResponse) {
        try {
            const pool = await this.getDbConnection();

            // Kiểm tra xem payment đã tồn tại chưa
            const checkQuery = `
                SELECT Payment_ID FROM [ksf00691_team03].[Payments]
                WHERE Booking_ID = @bookingId AND Payment_Reference = @orderCode
            `;
            const checkRequest = pool.request();
            checkRequest.input('bookingId', sql.Int, bookingId);
            checkRequest.input('orderCode', sql.VarChar(255), orderCode.toString());
            const checkResult = await checkRequest.query(checkQuery);

            if (checkResult.recordset.length > 0) {
                // Payment đã tồn tại, cập nhật
                const updateQuery = `
                    UPDATE [ksf00691_team03].[Payments]
                    SET 
                        Amount = @amount,
                        Payment_Method = 'PayOS',
                        Payment_Status = 'PENDING',
                        Transaction_Date = GETDATE(),
                        Processor_Response = @processorResponse
                    WHERE Booking_ID = @bookingId AND Payment_Reference = @orderCode
                `;
                const updateRequest = pool.request();
                updateRequest.input('bookingId', sql.Int, bookingId);
                updateRequest.input('orderCode', sql.VarChar(255), orderCode.toString());
                updateRequest.input('amount', sql.Decimal(18, 2), amount);
                updateRequest.input('processorResponse', sql.NVarChar(sql.MAX), JSON.stringify(paymentLinkResponse));
                await updateRequest.query(updateQuery);
            } else {
                // Tạo payment mới
                const insertQuery = `
                    INSERT INTO [ksf00691_team03].[Payments]
                    (Booking_ID, Payment_Reference, Amount, Payment_Method, Payment_Status, Transaction_Date, Processor_Response)
                    VALUES
                    (@bookingId, @orderCode, @amount, 'PayOS', 'PENDING', GETDATE(), @processorResponse)
                `;
                const insertRequest = pool.request();
                insertRequest.input('bookingId', sql.Int, bookingId);
                insertRequest.input('orderCode', sql.VarChar(255), orderCode.toString());
                insertRequest.input('amount', sql.Decimal(18, 2), amount);
                insertRequest.input('processorResponse', sql.NVarChar(sql.MAX), JSON.stringify(paymentLinkResponse));
                await insertRequest.query(insertQuery);
            }

            logger.info(`Đã lưu thông tin payment cho booking ${bookingId}, orderCode ${orderCode}`);
            return true;

        } catch (error) {
            logger.error(`Lỗi khi lưu thông tin payment:`, error);
            throw error;
        }
    }

    /**
     * Hủy link thanh toán PayOS
     */
    async cancelPaymentLink(orderCode) {
        try {
            logger.info(`Yêu cầu hủy payment link với orderCode: ${orderCode}`);
            const response = await this.payOS.cancelPaymentLink(orderCode);
            logger.info(`Kết quả hủy payment link:`, response);
            return response;
        } catch (error) {
            logger.error('Lỗi khi hủy payment link:', error);
            throw error;
        }
    }

    /**
     * Xác thực webhook từ PayOS
     */
    async verifyPaymentWebhook(webhookData) {
        try {
            logger.info('Verifying PayOS webhook:', JSON.stringify(webhookData, null, 2));

            // PayOS sẽ tự động verify signature thông qua SDK
            const verificationResult = this.payOS.verifyPaymentWebhookData(webhookData);

            logger.info('Webhook verification result:', verificationResult);
            return verificationResult;
        } catch (error) {
            logger.error('Lỗi khi verify webhook:', error);
            return false;
        }
    }

    /**
     * Lấy thông tin thanh toán từ PayOS
     */
    async getPaymentInfo(orderCode) {
        try {
            logger.info(`Lấy thông tin thanh toán cho orderCode: ${orderCode}`);

            const paymentInfo = await this.payOS.getPaymentLinkInformation(orderCode);

            logger.info('Payment info from PayOS:', JSON.stringify(paymentInfo, null, 2));
            return paymentInfo;
        } catch (error) {
            logger.error('Lỗi khi lấy payment info:', error);
            throw new Error(`Không thể lấy thông tin thanh toán: ${error.message}`);
        }
    }

    /**
     * Xử lý kết quả thanh toán thành công
     */
    async handleSuccessfulPayment(paymentData) {
        try {
            const { orderCode, amount, transactionDateTime } = paymentData;

            logger.info(`Xử lý thanh toán thành công cho orderCode: ${orderCode}`);

            // Lấy booking ID từ orderCode
            const bookingId = Math.floor(orderCode / 1000);

            const pool = await this.getDbConnection();

            // Lấy User_ID trước để sử dụng trong transaction
            const userQuery = `SELECT User_ID FROM [ksf00691_team03].[Ticket_Bookings] WHERE Booking_ID = @bookingId`;
            const userRequest = pool.request();
            userRequest.input('bookingId', sql.Int, bookingId);
            const userResult = await userRequest.query(userQuery);

            if (userResult.recordset.length === 0) {
                throw new Error(`Booking not found for ID: ${bookingId} from orderCode: ${orderCode}`);
            }
            const userId = userResult.recordset[0].User_ID;


            // Bắt đầu transaction
            const transaction = new sql.Transaction(pool);
            await transaction.begin();

            try {
                // Thực hiện tất cả các thao tác trong một truy vấn SQL để tối ưu hiệu suất
                const combinedQuery = `
                    -- Cập nhật trạng thái payment và người xử lý
                    UPDATE [ksf00691_team03].[Payments]
                    SET 
                        Payment_Status = 'PAID',
                        Transaction_Date = GETDATE(),
                        Processor_Response = @processorResponse,
                        Processed_By = @userId
                    WHERE Payment_Reference = @orderCode;

                    -- Cập nhật trạng thái booking
                    UPDATE [ksf00691_team03].[Ticket_Bookings]
                    SET Status = 'Confirmed'
                    WHERE Booking_ID = @bookingId;
                `;

                const request = transaction.request();
                request.input('orderCode', sql.VarChar(255), orderCode.toString());
                request.input('bookingId', sql.Int, bookingId);
                request.input('processorResponse', sql.NVarChar(sql.MAX), JSON.stringify(paymentData));
                request.input('userId', sql.Int, userId);

                await request.query(combinedQuery);

                // Tạo thông báo cho user (nếu bảng tồn tại)
                try {
                    await this.createPaymentNotification(bookingId, amount, 'success', transaction);
                } catch (notifError) {
                    logger.warn('Failed to create notification:', notifError.message);
                }

                // Cộng điểm thưởng cho user (nếu bảng tồn tại)
                try {
                    await this.addRewardPoints(bookingId, amount, transaction);
                } catch (pointsError) {
                    logger.warn('Failed to add reward points:', pointsError.message);
                }

                // Commit transaction
                await transaction.commit();

                logger.info(`Đã xử lý thành công thanh toán cho booking ${bookingId}`);

                return {
                    success: true,
                    bookingId: bookingId,
                    userId: userId,
                    message: 'Thanh toán thành công'
                };

            } catch (error) {
                await transaction.rollback();
                throw error;
            }

        } catch (error) {
            logger.error('Lỗi khi xử lý successful payment:', error);
            throw error;
        }
    }

    /**
     * Xử lý thanh toán thất bại
     */
    async handleFailedPayment(paymentData) {
        try {
            const { orderCode } = paymentData;

            logger.info(`Xử lý thanh toán thất bại cho orderCode: ${orderCode}`);

            // Lấy booking ID từ orderCode
            const bookingId = Math.floor(orderCode / 1000);

            const pool = await this.getDbConnection();

            // Bắt đầu transaction
            const transaction = new sql.Transaction(pool);
            await transaction.begin();

            try {
                // Lấy thông tin booking trước khi cập nhật
                const bookingQuery = `
                    SELECT Booking_ID, User_ID, Status, Points_Used, Promotion_ID 
                    FROM [ksf00691_team03].[Ticket_Bookings]
                    WHERE Booking_ID = @bookingId
                `;

                const bookingRequest = transaction.request();
                bookingRequest.input('bookingId', sql.Int, bookingId);
                const bookingResult = await bookingRequest.query(bookingQuery);

                if (bookingResult.recordset.length === 0) {
                    throw new Error(`Không tìm thấy booking ${bookingId}`);
                }

                const booking = bookingResult.recordset[0];
                const userId = booking.User_ID;
                const pointsToRefund = booking.Points_Used || 0;
                const promotionId = booking.Promotion_ID;

                logger.info(`Thông tin booking ${bookingId}: Status=${booking.Status}, Points_Used=${pointsToRefund}, User_ID=${userId}, Promotion_ID=${promotionId}`);

                // Thực hiện tất cả các thao tác trong một truy vấn SQL để tối ưu hiệu suất
                const combinedQuery = `
                    -- Cập nhật trạng thái payment
              UPDATE [ksf00691_team03].[Payments] 
                    SET 
                        Payment_Status = 'FAILED',
                        Transaction_Date = GETDATE(),
                  Processor_Response = @processorResponse,
                        Processed_By = @userId
                    WHERE Payment_Reference = @orderCode;

                    -- Cập nhật trạng thái booking và đặt Points_Used = 0
                    UPDATE [ksf00691_team03].[Ticket_Bookings]
                    SET Status = 'Cancelled',
                        Points_Used = 0,
                        Promotion_ID = NULL
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
                request.input('processorResponse', sql.NVarChar(sql.MAX), JSON.stringify(paymentData));
                request.input('userId', sql.Int, userId);

                await request.query(combinedQuery);

                logger.info(`Đã xóa vé và ghế cho booking ${bookingId}`);

                // Hoàn trả điểm thưởng nếu có
                if (pointsToRefund > 0 && userId) {
                    logger.info(`Hoàn trả ${pointsToRefund} điểm cho user ${userId}`);

                    // Cộng lại điểm cho user
                    try {
                        const refundPointsQuery = `
                            -- Kiểm tra xem user có bản ghi User_Points chưa
                            DECLARE @userPointsId INT;
                            SELECT @userPointsId = UserPoints_ID FROM [ksf00691_team03].[User_Points] WHERE User_ID = @userId;

                            -- Nếu chưa có, thêm mới
                            IF @userPointsId IS NULL
                            BEGIN
                                INSERT INTO [ksf00691_team03].[User_Points]
                                (User_ID, Total_Points, Last_Updated)
                                VALUES (@userId, @points, GETDATE());
                            END
                            ELSE
                            -- Nếu đã có, cập nhật
                            BEGIN
                                UPDATE [ksf00691_team03].[User_Points]
                                SET Total_Points = Total_Points + @points,
                                    Last_Updated = GETDATE()
                                WHERE User_ID = @userId;
                            END
                        `;

                        const refundRequest = transaction.request();
                        refundRequest.input('userId', sql.Int, userId);
                        refundRequest.input('points', sql.Int, pointsToRefund);
                        await refundRequest.query(refundPointsQuery);

                        // Thêm lịch sử hoàn trả điểm nếu bảng Points_Redemption tồn tại
                        try {
                            // Kiểm tra xem bảng Points_Redemption tồn tại không
                            const checkTableQuery = `
                                SELECT COUNT(*) as table_exists 
              FROM INFORMATION_SCHEMA.TABLES 
              WHERE TABLE_SCHEMA = 'ksf00691_team03' 
                                AND TABLE_NAME = 'Points_Redemption'
          `;
                            const checkRequest = transaction.request();
                            const checkResult = await checkRequest.query(checkTableQuery);

                            if (checkResult.recordset[0].table_exists > 0) {
                                // Bảng tồn tại, thêm lịch sử
                                const historyQuery = `
                                    INSERT INTO [ksf00691_team03].[Points_Redemption]
                                    (User_ID, Points_Redeemed, Activity_Type, Reference_ID, Redemption_Date, Notes)
                                    VALUES (@userId, @points, 'Refund', @bookingId, GETDATE(), 'Hoàn trả điểm do thanh toán thất bại');
                                `;

                                const historyRequest = transaction.request();
                                historyRequest.input('userId', sql.Int, userId);
                                historyRequest.input('points', sql.Int, pointsToRefund);
                                historyRequest.input('bookingId', sql.Int, bookingId);
                                await historyRequest.query(historyQuery);

                                logger.info(`Đã thêm lịch sử hoàn trả điểm vào Points_Redemption`);
                            }
                        } catch (historyError) {
                            // Bỏ qua lỗi khi thêm lịch sử, vẫn cộng điểm thành công
                            logger.warn(`Không thể thêm lịch sử hoàn trả điểm, nhưng vẫn hoàn trả điểm thành công: ${historyError.message}`);
                        }

                        logger.info(`Đã hoàn trả ${pointsToRefund} điểm cho user ${userId}`);
                    } catch (pointsError) {
                        logger.error(`Lỗi khi hoàn trả điểm: ${pointsError.message}`);
                        // Không throw lỗi để tiếp tục xử lý các phần khác
                    }
                }

                // Xử lý hoàn trả mã khuyến mãi nếu có
                if (promotionId) {
                    logger.info(`Xử lý hoàn trả mã khuyến mãi ID=${promotionId}`);

                    try {
                        // Cập nhật bản ghi PromotionUsage
                        const updatePromotionQuery = `
                            -- Cập nhật PromotionUsages
                            UPDATE [ksf00691_team03].[Promotion_Usages]
                            SET HasUsed = 0
                            WHERE Booking_ID = @bookingId;
                            
                            -- Giảm lượt sử dụng của promotion
                            UPDATE [ksf00691_team03].[Promotions]
                            SET Current_Usage = Current_Usage - 1
                            WHERE Promotion_ID = @promotionId AND Current_Usage > 0;
                        `;

                        const promotionRequest = transaction.request();
                        promotionRequest.input('bookingId', sql.Int, bookingId);
                        promotionRequest.input('promotionId', sql.Int, promotionId);
                        await promotionRequest.query(updatePromotionQuery);

                        logger.info(`Đã hoàn trả mã khuyến mãi ID=${promotionId}`);
                    } catch (promoError) {
                        logger.warn(`Không thể hoàn trả mã khuyến mãi: ${promoError.message}`);
                    }
                }

                // Tạo thông báo cho user (nếu bảng tồn tại)
                try {
                    await this.createPaymentNotification(bookingId, 0, 'failed', transaction);
                } catch (notifError) {
                    logger.warn('Không thể tạo thông báo:', notifError.message);
                }

                // Thêm vào lịch sử booking
                const historyQuery = `
                    INSERT INTO [ksf00691_team03].[Booking_History]
                    (Booking_ID, Status, Date, Notes, IsRead)
                    VALUES 
                    (@bookingId, 'Cancelled', GETDATE(), 'Thanh toán thất bại qua PayOS, đã hoàn trả điểm và mã khuyến mãi', 0)
                `;

                const historyRequest = transaction.request();
                historyRequest.input('bookingId', sql.Int, bookingId);
                await historyRequest.query(historyQuery);

                // Commit transaction
                await transaction.commit();

                logger.info(`Đã xử lý thanh toán thất bại cho booking ${bookingId}`);

                return {
                    success: false,
                    bookingId: bookingId,
                    userId: userId,
                    pointsRefunded: pointsToRefund,
                    promotionRefunded: promotionId !== null,
                    message: 'Thanh toán thất bại'
                };

            } catch (error) {
                await transaction.rollback();
                throw error;
            }

        } catch (error) {
            logger.error('Lỗi khi xử lý failed payment:', error);
            throw error;
        }
    }

    /**
     * Tạo link thanh toán PayOS cho booking đang pending của người dùng
     * @param {number} userId - ID của người dùng thực hiện thanh toán
     * @param {string} customerName - Tên của khách hàng (tuỳ chọn)
     * @returns {Promise<Object>} - Thông tin thanh toán và URL thanh toán
     */
    async createPaymentLinkForPendingBooking(userId, customerName = null) {
        try {
            logger.info(`Tạo link thanh toán cho booking đang pending của user ${userId}`);

            // Lấy connection pool
            const pool = await this.getDbConnection();

            // Tìm booking đang pending của user
            const findBookingQuery = `
                SELECT b.Booking_ID, b.Total_Amount, b.Status, m.Movie_Name, s.Show_Date, s.Start_Time
                FROM [ksf00691_team03].[Ticket_Bookings] b
                JOIN [ksf00691_team03].[Showtimes] s ON b.Showtime_ID = s.Showtime_ID
                JOIN [ksf00691_team03].[Movies] m ON s.Movie_ID = m.Movie_ID
                WHERE b.User_ID = @userId 
                AND b.Status = 'Pending'
                ORDER BY b.Booking_Date DESC
            `;

            const request = pool.request();
            request.input('userId', sql.Int, userId);
            const result = await request.query(findBookingQuery);

            // Kiểm tra kết quả
            if (result.recordset.length === 0) {
                logger.warn(`Không tìm thấy booking đang pending cho user ${userId}`);
                return {
                    success: false,
                    message: 'Không tìm thấy đơn đặt vé nào đang chờ thanh toán'
                };
            }

            // Lấy booking gần nhất
            const pendingBooking = result.recordset[0];
            const bookingId = pendingBooking.Booking_ID;
            const amount = pendingBooking.Total_Amount;

            // Kiểm tra nếu booking không phải trạng thái Pending
            if (pendingBooking.Status !== 'Pending') {
                logger.warn(`Booking ${bookingId} không ở trạng thái Pending: ${pendingBooking.Status}`);
                return {
                    success: false,
                    message: `Đơn đặt vé không ở trạng thái chờ thanh toán. Trạng thái hiện tại: ${pendingBooking.Status}`
                };
            }

            // Tạo mô tả thanh toán (giới hạn 25 kí tự theo yêu cầu của PayOS)
            const description = `Thanh toán vé #${bookingId}`;

            // Gọi phương thức tạo payment link với booking ID đã tìm được
            logger.info(`Tạo payment link cho booking ${bookingId} của user ${userId}, số tiền: ${amount}`);
            const paymentResult = await this.createPaymentLink(bookingId, amount, description, customerName);

            // Lấy tên phim từ kết quả truy vấn
            const movieName = pendingBooking.Movie_Name || 'Phim';

            // Format Show_Date để chỉ lấy ngày (YYYY-MM-DD)
            const showDate = pendingBooking.Show_Date ?
                new Date(pendingBooking.Show_Date).toISOString().split('T')[0] : null;

            // Format Start_Time để lấy giờ:phút:giây (HH:mm:ss) - Fix timezone issue
            const startTime = pendingBooking.Start_Time ?
                (() => {
                    if (typeof pendingBooking.Start_Time === 'string') {
                        return pendingBooking.Start_Time.slice(0, 8); // Get HH:MM:SS
                    } else {
                        const timeObj = new Date(pendingBooking.Start_Time);
                        const hours = timeObj.getUTCHours().toString().padStart(2, '0');
                        const minutes = timeObj.getUTCMinutes().toString().padStart(2, '0');
                        const seconds = timeObj.getUTCSeconds().toString().padStart(2, '0');
                        return `${hours}:${minutes}:${seconds}`;
                    }
                })() : null;

            return {
                success: true,
                message: 'Tạo link thanh toán thành công',
                booking: {
                    Booking_ID: bookingId,
                    Movie_Name: movieName,
                    Show_Date: showDate,      // Đã format chỉ lấy ngày
                    Start_Time: startTime,     // Đã format lấy giờ:phút:giây
                    Total_Amount: amount
                },
                payment: paymentResult.data
            };
        } catch (error) {
            logger.error(`Lỗi khi tạo payment link cho user ${userId}:`, error);
            throw new Error(`Không thể tạo link thanh toán: ${error.message}`);
        }
    }
}

module.exports = PayOSService;