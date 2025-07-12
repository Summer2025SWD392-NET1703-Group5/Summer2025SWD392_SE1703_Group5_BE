const { PointsEarning, PointsRedemption, TicketBooking, Showtime, Movie, UserPoints, User, CinemaRoom, BookingHistory } = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../models');
const logger = require('../utils/logger');

class PointsService {
    constructor() {
        // Constructor tương đương với C#
    }

    /**
     * Áp dụng điểm giảm giá cho booking
     */
    async applyPointsDiscount(bookingId, userId, pointsToUse) {
        const transaction = await sequelize.transaction();

        try {
            // Lấy thông tin booking
            const booking = await TicketBooking.findOne({
                where: { Booking_ID: bookingId },
                include: [
                    {
                        model: Showtime,
                        as: 'Showtime',
                        include: [
                            { model: Movie, as: 'Movie' },
                            { model: CinemaRoom, as: 'CinemaRoom' }
                        ]
                    }
                ],
                transaction
            });

            if (!booking) {
                throw new Error(`Không tìm thấy booking với ID ${bookingId}`);
            }

            // THÊM MỚI: Kiểm tra trạng thái booking
            if (booking.Status !== 'Pending' && booking.Status !== 'Reserved') {
                logger.error(`Không thể áp dụng điểm cho booking ${bookingId} do trạng thái không hợp lệ: ${booking.Status}`);

                if (booking.Status === 'Cancelled') {
                    throw new Error(`Không thể sử dụng điểm cho booking đã bị hủy`);
                } else if (booking.Status === 'Completed' || booking.Status === 'Confirmed') {
                    throw new Error(`Không thể sử dụng điểm cho booking đã thanh toán hoặc hoàn thành`);
                } else {
                    throw new Error(`Không thể sử dụng điểm cho booking có trạng thái ${booking.Status}`);
                }
            }

            // THÊM MỚI: Kiểm tra xem booking đã sử dụng điểm chưa
            if (booking.Points_Used > 0) {
                throw new Error(`Booking ${bookingId} đã sử dụng ${booking.Points_Used} điểm trước đó`);
            }

            // THÊM MỚI: Kiểm tra và sử dụng User_ID từ booking nếu có
            if (booking.User_ID !== null && booking.User_ID > 0) {
                // Nếu booking đã liên kết với khách hàng và userId được truyền vào không khớp
                if (booking.User_ID !== userId) {
                    logger.warn(`Đang sử dụng booking.User_ID (${booking.User_ID}) thay vì userId được truyền vào (${userId})`);
                    userId = booking.User_ID; // Sử dụng ID của khách hàng liên kết với booking
                }
            } else {
                throw new Error(`Booking ${bookingId} chưa được liên kết với khách hàng`);
            }

            // Lưu lại tổng tiền ban đầu
            const originalTotalAmount = booking.Total_Amount;
            logger.info(`Tổng tiền ban đầu của booking ${bookingId}: ${originalTotalAmount}`);

            // Lấy tỷ lệ chuyển đổi điểm sang tiền
            const pointConversionRate = 1; // 1 điểm = 1 VND

            // Tính số tiền giảm
            let discountAmount = pointsToUse * pointConversionRate;

            // Giới hạn giảm giá tối đa 50% tổng số tiền
            const maxDiscountAllowed = originalTotalAmount * 0.5;
            discountAmount = Math.min(discountAmount, maxDiscountAllowed);

            // Tính lại số điểm thực tế sẽ sử dụng (dựa trên discountAmount đã giới hạn)
            const actualPointsToUse = Math.ceil(discountAmount / pointConversionRate);

            // Cập nhật điểm người dùng
            const userPoints = await UserPoints.findOne({
                where: { user_id: userId },
                transaction
            });

            if (!userPoints) {
                throw new Error(`Không tìm thấy thông tin điểm của người dùng ${userId}`);
            }

            // Kiểm tra số dư điểm
            if (userPoints.total_points < actualPointsToUse) {
                throw new Error(`Số dư điểm không đủ. Hiện có: ${userPoints.total_points}, Yêu cầu: ${actualPointsToUse}`);
            }

            // Cập nhật tổng số tiền booking
            const discountedTotalAmount = originalTotalAmount - discountAmount;
            
            // SỬA ĐỔI: Cập nhật cả Total_Amount và Discount_Amount
            booking.Total_Amount = discountedTotalAmount;
            booking.Points_Used = actualPointsToUse;
            booking.Discount_Amount = discountAmount;

            logger.info(`Cập nhật booking ${bookingId}: Tổng tiền ban đầu=${originalTotalAmount}, Giảm giá=${discountAmount}, Tổng tiền sau giảm=${discountedTotalAmount}, Điểm sử dụng=${actualPointsToUse}`);

            // Trừ điểm người dùng
            userPoints.total_points -= actualPointsToUse;
            userPoints.last_updated = sequelize.literal('GETDATE()');

            // Tạo bản ghi đổi điểm
            const pointsRedemption = {
                User_ID: userId,
                Points_Redeemed: actualPointsToUse,
                Date: sequelize.literal('GETDATE()'), // Sử dụng hàm SQL Server thay vì JS Date
                Status: 'Completed',
                Note: `Áp dụng điểm giảm giá cho booking ${bookingId}` // Thêm ghi chú
            };
            await PointsRedemption.create(pointsRedemption, { transaction });

            // Thêm lịch sử booking
            const bookingHistory = {
                Booking_ID: bookingId,
                Status: 'Points Applied',
                Notes: `Đã sử dụng ${actualPointsToUse} điểm để giảm giá ${discountAmount.toLocaleString('vi-VN')}đ cho đơn đặt vé này`,
                Date: sequelize.literal('GETDATE()'),
                IsRead: false
            };
            await BookingHistory.create(bookingHistory, { transaction });

            // Lưu các thay đổi
            await booking.save({ transaction });
            await userPoints.save({ transaction });

            // Commit transaction
            await transaction.commit();

            // Trả về thông tin chi tiết
            return {
                bookingId: bookingId,
                originalAmount: originalTotalAmount,
                discountAmount: discountAmount,
                finalAmount: discountedTotalAmount,
                pointsUsed: actualPointsToUse,
                remainingPoints: userPoints.total_points
            };
        } catch (error) {
            // Rollback transaction nếu có lỗi
                    await transaction.rollback();
            logger.error(`Lỗi khi áp dụng điểm giảm giá: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy thông tin điểm hiện tại của người dùng
     */
    async getUserPointsAsync(userId) {
        try {
            logger.info(`[getUserPointsAsync] Đang tìm điểm cho user ID: ${userId}`);

            const userPoints = await UserPoints.findOne({
                where: { user_id: userId },
                attributes: ['UserPoints_ID', 'user_id', 'total_points', 'last_updated']
            });

            if (!userPoints) {
                // Nếu người dùng không có bản ghi điểm, trả về điểm 0
                return {
                    user_id: userId,
                    total_points: 0,
                    last_updated: null
                };
            }

            // Chuyển đổi sang đối tượng phản hồi chuẩn
            const result = {
                user_id: userPoints.user_id,
                total_points: userPoints.total_points || 0,
                last_updated: userPoints.last_updated
            };

            return result;
        } catch (error) {
            logger.error(`Lỗi khi lấy thông tin điểm của người dùng ${userId}`, error);
            throw error;
        }
    }

    /**
     * Lấy tổng số điểm hiện tại của người dùng (chỉ trả về số điểm)
     */
    async getUserPointsTotalAsync(userId) {
        try {
            const userPoints = await UserPoints.findOne({
                where: { user_id: userId }
            });

            return userPoints?.total_points ?? 0;
        } catch (error) {
            logger.error(`Lỗi khi lấy tổng số điểm của người dùng ${userId}`, error);
            throw error;
        }
    }

    /**
     * Thêm điểm cho người dùng từ đơn đặt vé đã thanh toán
     * @param {number} userId - ID người dùng
     * @param {number} bookingId - ID đơn đặt vé
     * @param {number} totalAmount - Tổng tiền
     * @param {number} pointsUsed - Số điểm đã sử dụng (nếu có)
     * @returns {Promise<number>} Số điểm đã thêm
     */
    async addPointsFromBookingAsync(userId, bookingId, totalAmount, pointsUsed = 0) {
        try {
            // Kiểm tra các tham số đầu vào
            if (!userId || !bookingId || !totalAmount) {
                throw new Error('Thiếu thông tin cần thiết để tích điểm');
            }

            // Tính điểm tích lũy với giới hạn tối đa 50% số tiền hóa đơn
            let pointsToAdd = Math.floor(totalAmount * 0.1); // 10% tổng tiền
            
            // ✅ GIỚI HẠN TỐI ĐA 50% SỐ TIỀN HÓA ĐƠN
            const maxPointsAllowed = Math.floor(totalAmount * 0.5); // 50% tổng tiền
            if (pointsToAdd > maxPointsAllowed) {
                logger.warn(`Giới hạn điểm tích lũy: ${pointsToAdd} điểm vượt quá 50% hóa đơn (${maxPointsAllowed}). Điều chỉnh về ${maxPointsAllowed} điểm.`);
                pointsToAdd = maxPointsAllowed;
            }
            
            logger.info(`Tích điểm cho hóa đơn ${totalAmount} VND: ${pointsToAdd} điểm (giới hạn tối đa ${maxPointsAllowed} điểm)`);

            // Kiểm tra nếu booking đã có số điểm dự kiến
            const booking = await TicketBooking.findByPk(bookingId);
            if (booking && booking.Points_Earned && booking.Points_Earned > 0) {
                // ✅ KIỂM TRA ĐIỂM ĐÃ LƯU CŨNG PHẢI TUÂN THỦ GIỚI HẠN 50%
                const savedPoints = booking.Points_Earned;
                if (savedPoints > maxPointsAllowed) {
                    logger.warn(`Điểm đã lưu trong booking ${bookingId} (${savedPoints}) vượt quá giới hạn 50% (${maxPointsAllowed}). Sử dụng ${maxPointsAllowed} điểm.`);
                    pointsToAdd = maxPointsAllowed;
                } else {
                    logger.info(`Sử dụng ${savedPoints} điểm đã lưu trong booking ${bookingId} (hợp lệ với giới hạn ${maxPointsAllowed})`);
                    pointsToAdd = savedPoints;
                }
            }

            if (pointsToAdd <= 0) {
                return 0;
            }

            // Kiểm tra xem đã tích điểm cho booking này chưa
            const existingEarning = await PointsEarning.findOne({
                where: { Booking_ID: bookingId }
            });

            if (existingEarning) {
                logger.warn(`Booking ${bookingId} đã được tích điểm trước đó`);
                return 0; // Không tích điểm nữa
            }

            // Bắt đầu transaction
            const transaction = await sequelize.transaction();

            try {
                // Lưu lịch sử tích điểm
                await PointsEarning.create({
                    User_ID: userId,
                    Booking_ID: bookingId,
                    Actual_Amount: totalAmount,
                    Points_Earned: pointsToAdd,
                    Date: sequelize.literal('GETDATE()')
                }, { transaction });

                logger.info(`Đã tạo bản ghi PointsEarning cho booking ${bookingId}`);

                // Cập nhật tổng điểm người dùng
                const userPoints = await UserPoints.findOne({
                    where: { user_id: userId }
                });

                if (!userPoints) {
                    // Tạo mới nếu chưa có
                    logger.info(`Tạo bản ghi UserPoints mới cho user ID ${userId} với ${pointsToAdd} điểm`);
                    const createData = {
                        user_id: userId,
                        total_points: pointsToAdd,
                        last_updated: sequelize.literal('GETDATE()')
                    };

                    logger.info(`Dữ liệu tạo UserPoints: ${JSON.stringify(createData)}`);
                    await UserPoints.create(createData, { transaction });
                    logger.info(`Tạo mới bản ghi User_Points thành công cho user ${userId} với ${pointsToAdd} điểm`);
                } else {
                    // Cập nhật nếu đã có
                    await userPoints.increment('total_points', {
                        by: pointsToAdd,
                        transaction
                    });

                    // Cập nhật thời gian
                    await userPoints.update({
                        last_updated: sequelize.literal('GETDATE()')
                    }, { transaction });

                    logger.info(`Cập nhật thành công User_Points cho user ${userId}, cộng thêm ${pointsToAdd} điểm`);
                }

                // Tạo thông báo cho người dùng (tùy chọn)
                try {
                    // Kiểm tra xem có bảng BookingHistory không
                    const tableExists = await sequelize.query(
                        "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = 'Booking_History'",
                        { type: sequelize.QueryTypes.SELECT }
                    );

                    if (tableExists && tableExists[0].count > 0) {
                        // Tạo lịch sử tích điểm trong bảng BookingHistory
                        await sequelize.query(
                            `INSERT INTO Booking_History (Booking_ID, Status, Notes, Date, IsRead)
                             VALUES (:bookingId, 'Points Earned', :notes, GETDATE(), 0)`,
                            {
                                replacements: {
                                    bookingId: bookingId,
                                    notes: `Bạn đã được cộng ${pointsToAdd} điểm từ đơn đặt vé này.`
                                },
                                type: sequelize.QueryTypes.INSERT,
                                transaction
                            }
                        );
                        logger.info(`Đã tạo thông báo tích điểm trong BookingHistory cho booking ${bookingId}`);
                    }
                } catch (notificationError) {
                    logger.warn(`Không thể tạo thông báo tích điểm: ${notificationError.message}`);
                    // Tiếp tục xử lý, không làm ảnh hưởng đến việc tích điểm
                }

                // Commit transaction
                await transaction.commit();
                logger.info(`Đã thêm ${pointsToAdd} điểm cho người dùng ${userId} từ booking ${bookingId}`);

                return pointsToAdd;
            } catch (error) {
                // Rollback nếu có lỗi
                await transaction.rollback();
                throw error;
            }
        } catch (error) {
            logger.error(`Lỗi khi thêm điểm cho người dùng ${userId} từ booking ${bookingId}: ${error.message}`);
            throw new Error(`Không thể thêm điểm: ${error.message}`);
        }
    }

    /**
     * Hoàn điểm cho booking bị hủy do hết hạn
     */
    async refundPointsForExpiredBooking(bookingId, userId, pointsToRefund) {
        try {
            return await this.refundPointsForCancelledBooking(
                userId,
                bookingId,
                pointsToRefund,
                'Booking hết hạn thanh toán'
            );
        } catch (error) {
            logger.error(`Lỗi khi hoàn trả điểm cho expired booking ${bookingId}:`, error);
            throw error;
        }
    }

    /**
     * Hoàn điểm cho booking bị hủy (cả expired và manual cancellation)
     */
    async refundPointsForCancelledBooking(userId, bookingId, pointsToRefund, reasonMessage = 'Booking cancelled', externalTransaction = null) {
        const t = externalTransaction || await sequelize.transaction();
        let needToCommit = !externalTransaction;

        try {
            logger.info(`Bắt đầu hoàn trả ${pointsToRefund} điểm cho User ${userId} từ booking ${bookingId}. Lý do: ${reasonMessage}`);

            // Kiem tra booking
            const booking = await TicketBooking.findByPk(bookingId, { transaction: t });
            if (!booking) {
                logger.error(`Không thể hoàn trả điểm: Booking ${bookingId} không tồn tại`);
                if (needToCommit) await t.rollback();
                return { success: false, message: `Booking ${bookingId} không tồn tại` };
            }

            // Kiểm tra nếu đã hoàn trả rồi
            logger.info(`Kiểm tra xem đã hoàn điểm cho booking ${bookingId} chưa...`);
            const existingRefund = await PointsRedemption.findOne({
                where: {
                    User_ID: userId,
                    Points_Redeemed: -pointsToRefund, // Giá trị âm = hoàn trả
                    Status: 'Refunded',
                    Note: { [Op.like]: `%booking ${bookingId}%` }
                },
                transaction: t
            });

            if (existingRefund) {
                logger.warn(`Đã hoàn trả ${pointsToRefund} điểm cho booking ${bookingId} trước đó rồi!`);
                if (needToCommit) await t.commit();
                return { success: true, message: `Đã hoàn trả điểm trước đó rồi cho booking ${bookingId}`, alreadyRefunded: true };
            }

            // Tìm thông tin điểm hiện tại của user
            logger.info(`Lấy thông tin điểm hiện tại của User ${userId}`);
            const userPoints = await UserPoints.findOne({
                where: { user_id: userId },
                transaction: t
            });

            if (!userPoints) {
                logger.error(`Không tìm thấy thông tin điểm của User ${userId}`);
                if (needToCommit) await t.rollback();
                return { success: false, message: `Không tìm thấy thông tin điểm của User ${userId}` };
            }

            // Cộng điểm vào tài khoản
            const oldPoints = userPoints.total_points;
            const newPoints = oldPoints + pointsToRefund;
            logger.info(`Cập nhật điểm từ ${oldPoints} thành ${newPoints}`);

            await userPoints.update({
                total_points: newPoints,
                last_updated: sequelize.literal('GETDATE()')
            }, { transaction: t });

            // Tạo bản ghi hoàn điểm (với giá trị âm để biểu thị hoàn trả)
            // CẮT NGẮN THÔNG BÁO để tránh lỗi truncation
            const shortNote = `Hoàn ${pointsToRefund} điểm (booking ${bookingId})`;
            logger.info(`Tạo bản ghi hoàn điểm với ghi chú: "${shortNote}"`);

            const refundRecord = await PointsRedemption.create({
                User_ID: userId,
                Points_Redeemed: -pointsToRefund, // Giá trị âm = hoàn trả
                Date: sequelize.literal('GETDATE()'),
                Status: 'Refunded',
                Note: shortNote
            }, { transaction: t });

            logger.info(`Đã tạo bản ghi hoàn điểm ID=${refundRecord.Redemption_ID} thành công`);

            // Reset điểm đã dùng trong booking
            logger.info(`Đặt lại giá trị Points_Used=0 cho booking ${bookingId}`);
            await booking.update({
                Points_Used: 0
            }, { transaction: t });

            // Commit transaction nếu tự khởi tạo
            if (needToCommit) {
                await t.commit();
                logger.info(`✅ Hoàn trả ${pointsToRefund} điểm cho User ${userId} thành công!`);
            }

            return {
                success: true,
                userId: userId,
                bookingId: bookingId,
                pointsRefunded: pointsToRefund,
                oldPoints: oldPoints,
                newPoints: newPoints,
                redemptionId: refundRecord.Redemption_ID
            };
        } catch (error) {
            logger.error(`Lỗi khi hoàn trả điểm cho booking ${bookingId}: ${error.message}`, error);

            if (needToCommit) {
                try {
                    await t.rollback();
                    logger.info(`⚠️ Đã rollback transaction do lỗi hoàn điểm`);
                } catch (rollbackError) {
                    logger.error(`Lỗi khi rollback transaction: ${rollbackError.message}`);
                }
            }

            return { success: false, message: error.message, error: error };
        }
    }

    /**
 * Lấy lịch sử tích điểm của user
 * Converted from C# GetPointsEarningHistoryAsync
 */
    async getPointsEarningHistoryAsync(userId) {
        try {
            const earnings = await PointsEarning.findAll({
                where: { user_id: userId },
                include: [
                    {
                        model: TicketBooking,
                        as: 'booking',
                        attributes: ['booking_id', 'total_amount', 'booking_date'],
                        include: [
                            {
                                model: Showtime,
                                attributes: ['show_date', 'start_time'],
                                include: [
                                    {
                                        model: Movie,
                                        attributes: ['movie_name']
                                    }
                                ]
                            }
                        ]
                    }
                ],
                order: [['date', 'DESC']]
            });

            return earnings.map(earning => ({
                earning_id: earning.earning_id,
                points_earned: earning.points_earned,
                earned_date: earning.date,
                booking_id: earning.booking_id,
                actual_amount: earning.actual_amount,
                description: `Tích điểm từ booking #${earning.booking_id}`,
                movie_name: earning.booking?.Showtime?.Movie?.movie_name,
                show_date: earning.booking?.Showtime?.show_date,
                booking_amount: earning.booking?.total_amount
            }));
        } catch (error) {
            logger.error(`Error getting earning history for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Lấy lịch sử sử dụng điểm của user
     * Converted from C# GetPointsRedemptionHistoryAsync
     */
    async getPointsRedemptionHistoryAsync(userId) {
        try {
            const redemptions = await PointsRedemption.findAll({
                where: { user_id: userId },
                order: [['date', 'DESC']]
            });

            return redemptions.map(redemption => ({
                redemption_id: redemption.redemption_id,
                points_used: Math.abs(redemption.points_redeemed),
                redeemed_date: redemption.date,
                status: redemption.status,
                description: redemption.note || 'Sử dụng điểm',
                booking_id: redemption.booking_id || null,
                promotion_id: redemption.promotion_id || null
            }));
        } catch (error) {
            logger.error(`Error getting redemption history for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Kiểm tra và sửa chữa dữ liệu điểm cho các booking đã bị hủy
     */
    async repairCancelledBookingsPoints() {
        const transaction = await sequelize.transaction();

        try {
            logger.info('Bắt đầu sửa chữa dữ liệu điểm cho các booking đã bị hủy...');

            // Tìm tất cả booking đã bị hủy nhưng vẫn có Points_Used > 0
            const cancelledBookingsWithPoints = await TicketBooking.findAll({
                where: {
                    Status: 'Cancelled',
                    Points_Used: { [Op.gt]: 0 }
                },
                include: [{ model: User, as: 'User', attributes: ['User_ID', 'Full_Name'] }],
                transaction
            });

            logger.info(`Tìm thấy ${cancelledBookingsWithPoints.length} booking đã hủy nhưng chưa hoàn điểm`);

            const results = [];

            for (const booking of cancelledBookingsWithPoints) {
                try {
                    // Kiểm tra xem đã hoàn điểm chưa
                    const existingRefund = await PointsRedemption.findOne({
                        where: {
                            User_ID: booking.User_ID,
                            Points_Redeemed: -booking.Points_Used,
                            Status: 'Refunded',
                            Note: { [Op.like]: `%booking ${booking.Booking_ID}%` }
                        },
                        transaction
                    });

                    if (existingRefund) {
                        logger.info(`Booking ${booking.Booking_ID} đã được hoàn điểm, chỉ reset Points_Used`);

                        // Chỉ reset Points_Used về 0
                        await booking.update({ Points_Used: 0 }, { transaction });

                        results.push({
                            bookingId: booking.Booking_ID,
                            userId: booking.User_ID,
                            action: 'reset_points_used',
                            pointsUsed: booking.Points_Used
                        });
                    } else {
                        logger.info(`Hoàn trả điểm cho booking ${booking.Booking_ID}`);

                        // Hoàn trả điểm
                        const refundResult = await this.refundPointsForCancelledBooking(
                            booking.User_ID,
                            booking.Booking_ID,
                            booking.Points_Used,
                            'Sửa chữa dữ liệu - Booking đã hủy',
                            transaction
                        );

                        if (refundResult.success) {
                            // Reset Points_Used về 0
                            await booking.update({ Points_Used: 0 }, { transaction });

                            // Tạo booking history
                            await BookingHistory.create({
                                Booking_ID: booking.Booking_ID,
                                Status: 'Points Refunded',
                                Notes: `Hệ thống đã hoàn trả ${booking.Points_Used} điểm cho đặt vé đã hủy`,
                                Date: sequelize.literal('GETDATE()'),
                                IsRead: false
                            }, { transaction });

                            results.push({
                                bookingId: booking.Booking_ID,
                                userId: booking.User_ID,
                                userName: booking.User?.Full_Name,
                                action: 'refunded_and_reset',
                                pointsRefunded: booking.Points_Used,
                                newTotalPoints: refundResult.newPoints
                            });
                        }
                    }
                } catch (bookingError) {
                    logger.error(`Lỗi khi xử lý booking ${booking.Booking_ID}: ${bookingError.message}`);
                    results.push({
                        bookingId: booking.Booking_ID,
                        userId: booking.User_ID,
                        action: 'error',
                        error: bookingError.message
                    });
                }
            }

            await transaction.commit();
            logger.info(`Hoàn thành sửa chữa dữ liệu điểm. Xử lý ${results.length} booking`);

            return {
                success: true,
                totalProcessed: results.length,
                results: results
            };

        } catch (error) {
            await transaction.rollback();
            logger.error('Lỗi khi sửa chữa dữ liệu điểm:', error);
            throw error;
        }
    }

    /**
     * Lấy thông tin điểm của tất cả người dùng
     * @returns {Promise<Array>} Danh sách điểm của tất cả người dùng
     */
    async getAllUserPointsAsync() {
        try {
            logger.info(`[getAllUserPointsAsync] Đang lấy danh sách điểm của tất cả người dùng`);

            const allUserPoints = await UserPoints.findAll({
                include: [{
                    model: User,
                    as: 'User',
                    attributes: ['Full_Name', 'Email']
                }]
            });

            logger.info(`[getAllUserPointsAsync] Tìm thấy ${allUserPoints.length} bản ghi điểm`);

            const results = allUserPoints.map(points => ({
                user_id: points.User_ID,
                total_points: points.Total_Points || points.total_points || 0
            }));

            return results;
        } catch (error) {
            logger.error(`Lỗi khi lấy danh sách điểm của tất cả người dùng`, error);
            throw error;
        }
    }

}

module.exports = new PointsService();