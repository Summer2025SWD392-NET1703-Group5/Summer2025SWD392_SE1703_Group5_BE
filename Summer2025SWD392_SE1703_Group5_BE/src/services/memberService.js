// services/memberService.js
const { User, TicketBooking, Score, Promotion, PromotionUsage, UserPoints, sequelize } = require('../models');
const logger = require('../utils/logger');

class MemberService {

    /**
     * Tìm kiếm thành viên theo số điện thoại
     */
    async findMemberByPhoneAsync(phoneNumber) {
        try {
            return await User.findOne({
                where: {
                    Phone_Number: phoneNumber,
                    Account_Status: 'Active'
                }
            });
        } catch (error) {
            logger.error(`Lỗi trong findMemberByPhoneAsync: ${error.message}`);
            throw error;
        }
    }

    /**
     * Tìm kiếm thành viên theo email
     */
    async findMemberByEmailAsync(email) {
        try {
            return await User.findOne({
                where: {
                    Email: email,
                    Account_Status: 'Active'
                }
            });
        } catch (error) {
            logger.error(`Lỗi trong findMemberByEmailAsync: ${error.message}`);
            throw error;
        }
    }

    /**
     * Tìm kiếm thành viên theo ID
     */
    async findMemberByIdAsync(userId) {
        try {
            return await User.findOne({
                where: {
                    User_ID: userId,
                    Account_Status: 'Active'
                }
            });
        } catch (error) {
            logger.error(`Lỗi trong findMemberByIdAsync: ${error.message}`);
            throw error;
        }
    }

    /**
     * Lấy tổng điểm tích lũy hiện tại của thành viên
     */
    async getCurrentPointsAsync(userId) {
        try {
            const userPoints = await UserPoints.findOne({
                where: { User_ID: userId }
            });

            return userPoints ? userPoints.Total_Points : 0;
        } catch (error) {
            logger.error(`Lỗi trong getCurrentPointsAsync: ${error.message}`);
            throw error;
        }
    }

    /**
     * Kiểm tra thành viên có phải là VIP hay không
     */
    async isVipMemberAsync(userId) {
        try {
            const totalSpent = await TicketBooking.sum('Total_Amount', {
                where: {
                    User_ID: userId,
                    Status: 'Completed'
                }
            });

            // VIP member là người dùng đã chi tiêu ít nhất 2,000,000 VND
            return totalSpent >= 2000000;
        } catch (error) {
            logger.error(`Lỗi trong isVipMemberAsync: ${error.message}`);
            throw error;
        }
    }

    /**
     * Áp dụng giảm giá VIP (10%)
     */
    applyVipDiscount(originalAmount) {
        return originalAmount * 0.9; // Giảm 10%
    }

    /**
     * ✅ Quy đổi điểm thành tiền (1 điểm = 1 VND - THỐNG NHẤT VỚI POINTSSERVICE)
     */
    convertPointsToMoney(points) {
        return points * 1.0; // 1 điểm = 1 VND (thay vì 100 điểm = 1 VND)
    }

    /**
     * Sử dụng điểm để giảm giá đơn hàng
     */
    async usePointsForDiscountAsync(userId, pointsToUse, bookingId) {
        const transaction = await sequelize.transaction();

        try {
            const availablePoints = await this.getCurrentPointsAsync(userId);

            if (pointsToUse <= 0 || pointsToUse > availablePoints) {
                return false;
            }

            // Lưu lại việc sử dụng điểm
            await Score.create({
                User_ID: userId,
                Points_Added: 0,
                Points_Used: pointsToUse,
                Date: new Date()
            }, { transaction });

            // Cập nhật thông tin đặt vé
            const booking = await TicketBooking.findByPk(bookingId, { transaction });

            if (booking) {
                booking.Points_Used = (booking.Points_Used || 0) + pointsToUse;

                // Cập nhật tổng tiền sau khi áp dụng điểm
                const pointsValue = this.convertPointsToMoney(pointsToUse);
                booking.Total_Amount -= pointsValue;

                if (booking.Total_Amount < 0) {
                    booking.Total_Amount = 0;
                }

                await booking.save({ transaction });
            }

            // Cập nhật tổng điểm của user
            const userPoints = await UserPoints.findOne({
                where: { User_ID: userId },
                transaction
            });

            if (userPoints) {
                userPoints.Total_Points -= pointsToUse;
                await userPoints.save({ transaction });
            }

            await transaction.commit();
            return true;
        } catch (error) {
            await transaction.rollback();
            logger.error(`Lỗi trong usePointsForDiscountAsync: ${error.message}`);
            return false;
        }
    }

    /**
     * Áp dụng khuyến mãi vào đơn đặt vé
     */
    async applyPromotionAsync(promotionId, bookingId, userId) {
        const transaction = await sequelize.transaction();

        try {
            const promotion = await Promotion.findOne({
                where: {
                    Promotion_ID: promotionId,
                    Status: 'Active'
                },
                transaction
            });

            if (!promotion) {
                await transaction.rollback();
                return false;
            }

            // Kiểm tra thời hạn khuyến mãi
            const currentDate = new Date();
            if (currentDate < promotion.Start_Date || currentDate > promotion.End_Date) {
                await transaction.rollback();
                return false;
            }

            // Kiểm tra giới hạn sử dụng
            if (promotion.Usage_Limit && promotion.Current_Usage >= promotion.Usage_Limit) {
                await transaction.rollback();
                return false;
            }

            const booking = await TicketBooking.findByPk(bookingId, { transaction });

            if (!booking) {
                await transaction.rollback();
                return false;
            }

            // Kiểm tra giá trị đơn hàng tối thiểu
            if (booking.Total_Amount < promotion.Minimum_Purchase) {
                await transaction.rollback();
                return false;
            }

            let discountAmount = 0;

            // Tính toán giảm giá
            if (promotion.Discount_Type === 'Percentage') {
                discountAmount = booking.Total_Amount * (promotion.Discount_Value / 100);

                // Áp dụng giảm giá tối đa nếu có
                if (promotion.Maximum_Discount && discountAmount > promotion.Maximum_Discount) {
                    discountAmount = promotion.Maximum_Discount;
                }
            } else if (promotion.Discount_Type === 'Fixed Amount') {
                discountAmount = promotion.Discount_Value;
            }

            // Cập nhật thông tin đặt vé
            booking.Promotion_ID = promotionId;
            booking.Total_Amount -= discountAmount;

            if (booking.Total_Amount < 0) {
                booking.Total_Amount = 0;
            }

            await booking.save({ transaction });

            // Ghi nhận việc sử dụng khuyến mãi
            await PromotionUsage.create({
                Promotion_ID: promotionId,
                Booking_ID: bookingId,
                User_ID: userId,
                Discount_Amount: discountAmount,
                Applied_Date: new Date()
            }, { transaction });

            // Tăng số lần sử dụng khuyến mãi
            promotion.Current_Usage = (promotion.Current_Usage || 0) + 1;
            await promotion.save({ transaction });

            await transaction.commit();
            return true;
        } catch (error) {
            await transaction.rollback();
            logger.error(`Lỗi trong applyPromotionAsync: ${error.message}`);
            return false;
        }
    }

    /**
     * Liên kết đơn đặt vé với thành viên
     */
    async linkBookingToMemberAsync(bookingId, memberIdentifier, staffId) {
        let transaction;

        try {
            transaction = await sequelize.transaction();

            // Kiểm tra booking
            const booking = await TicketBooking.findByPk(bookingId, { transaction });

            if (!booking) {
                await transaction.rollback();
                throw new Error('Không tìm thấy đơn đặt vé');
            }

            // Nếu đơn đã liên kết với tài khoản
            if (booking.User_ID) {
                await transaction.rollback();
                throw new Error('Đơn đặt vé này đã được liên kết với một tài khoản');
            }

            // Tìm thành viên theo email hoặc số điện thoại
            let member;
            // Kiểm tra nếu là email
            if (memberIdentifier.includes('@')) {
                member = await this.findMemberByEmailAsync(memberIdentifier);
            } else {
                // Nếu không phải email, xem như số điện thoại
                member = await this.findMemberByPhoneAsync(memberIdentifier);
            }

            if (!member) {
                await transaction.rollback();
                throw new Error('Không tìm thấy thành viên với thông tin này');
            }

            // Kiểm tra trạng thái booking
            if (!['Completed', 'Confirmed', 'Pending', 'Cancelled'].includes(booking.Status)) {
                await transaction.rollback();
                throw new Error('Trạng thái đơn đặt vé không hợp lệ để liên kết');
            }

            // Liên kết đơn với thành viên
            booking.User_ID = member.User_ID;
            await booking.save({ transaction });

            // Tính điểm thưởng nếu đơn hoàn thành
            if (booking.Status === 'Completed') {
                // Tính điểm: 1 điểm cho mỗi 10,000 đơn vị tiền (0.01%)
                let pointsEarned = Math.floor(booking.Total_Amount / 10000);
                
                // ✅ GIỚI HẠN TỐI ĐA 50% SỐ TIỀN HÓA ĐƠN
                const maxPointsAllowed = Math.floor(booking.Total_Amount * 0.5); // 50% tổng tiền
                if (pointsEarned > maxPointsAllowed) {
                    logger.warn(`[MemberService] Giới hạn điểm tích lũy: ${pointsEarned} điểm vượt quá 50% hóa đơn (${maxPointsAllowed}). Điều chỉnh về ${maxPointsAllowed} điểm.`);
                    pointsEarned = maxPointsAllowed;
                }
                
                logger.info(`[MemberService] Tích điểm cho hóa đơn ${booking.Total_Amount} VND: ${pointsEarned} điểm (giới hạn tối đa ${maxPointsAllowed} điểm)`);

                if (pointsEarned > 0) {
                    // Ghi nhận điểm thưởng
                    await Score.create({
                        User_ID: member.User_ID,
                        Points_Added: pointsEarned,
                        Points_Used: 0,
                        Date: new Date()
                    }, { transaction });

                    // Cập nhật tổng điểm
                    let userPoints = await UserPoints.findOne({
                        where: { User_ID: member.User_ID },
                        transaction
                    });

                    if (userPoints) {
                        userPoints.Total_Points += pointsEarned;
                        await userPoints.save({ transaction });
                    } else {
                        await UserPoints.create({
                            User_ID: member.User_ID,
                            Total_Points: pointsEarned
                        }, { transaction });
                    }

                    // Cập nhật điểm cho booking
                    booking.Points_Earned = pointsEarned;
                    await booking.save({ transaction });
                }
            }

            // Ghi log hành động
            // try {
            //     await sequelize.query(
            //         `INSERT INTO ksf00691_team03.Staff_Activity_Log 
            //         (Staff_ID, Action, Detail, Action_Time) 
            //         VALUES (?, 'Liên kết đặt vé', ?, GETDATE())`,
            //         {
            //             replacements: [
            //                 staffId,
            //                 `Đã liên kết đơn đặt vé #${bookingId} với thành viên ${member.Full_Name} (ID: ${member.User_ID})`
            //             ],
            //             transaction
            //         }
            //     );
            // } catch (logError) {
            //     logger.error(`Lỗi khi ghi log hoạt động: ${logError.message}`);
            //     // Không rollback transaction nếu chỉ là lỗi ghi log
            // }

            await transaction.commit();

            return {
                success: true,
                bookingId: booking.Booking_ID,
                memberId: member.User_ID,
                memberName: member.Full_Name,
                totalAmount: booking.Total_Amount,
                pointsEarned: booking.Points_Earned || 0,
                message: `Đã liên kết đơn đặt vé #${bookingId} với thành viên ${member.Full_Name} thành công`
            };
        } catch (error) {
            if (transaction) {
                try {
                    await transaction.rollback();
                } catch (rollbackError) {
                    logger.error(`Lỗi khi rollback transaction: ${rollbackError.message}`);
                }
            }
            logger.error(`Lỗi trong linkBookingToMemberAsync: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new MemberService();

