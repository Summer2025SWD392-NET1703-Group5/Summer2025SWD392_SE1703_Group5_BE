const { getConnection } = require('../config/database');
const logger = require('../utils/logger');
const sql = require('mssql');
const PromotionRepository = require('../repositories/PromotionRepository');
const TicketBookingRepository = require('../repositories/TicketBookingRepository');
const BookingHistoryRepository = require('../repositories/BookingHistoryRepository');
const { AppError, BadRequestError, NotFoundError } = require('../utils/errorHandler');
const { Op } = require('sequelize');
const db = require('../models');

// Constants moved from promotionConstants.js
const PROMOTION_STATUS = {
    ACTIVE: 'Active',
    INACTIVE: 'Inactive',
    EXPIRED: 'Expired',
    DELETED: 'Deleted', // Dùng cho xóa mềm nếu khuyến mãi chưa từng được sử dụng
};

const DISCOUNT_TYPE = {
    PERCENTAGE: 'Percentage',
    FIXED: 'Fixed', // Giảm giá theo số tiền cố định
};

const APPLICABLE_FOR = {
    ALL_USERS: 'All Users',
    NEW_USERS: 'New Users',
    VIP_USERS: 'VIP Users'
};

// DTOs moved from promotionDtos.js
class PromotionSummaryDto {
    constructor(data) {
        this.Promotion_ID = data.Promotion_ID;
        this.Title = data.Title;
        this.Promotion_Code = data.Promotion_Code;
        this.Start_Date = data.Start_Date;
        this.End_Date = data.End_Date;
        this.Discount_Type = data.Discount_Type;
        this.Discount_Value = data.Discount_Value;
        this.Minimum_Purchase = data.Minimum_Purchase;
        this.Maximum_Discount = data.Maximum_Discount;
        this.Applicable_For = data.Applicable_For;
        this.Usage_Limit = data.Usage_Limit;
        this.Current_Usage = data.Current_Usage;
        this.Status = data.Status;
        this.Promotion_Detail = data.Promotion_Detail;
        this.Created_At = data.Created_At;
        this.Created_By = data.Created_By;
        this.Is_Expired = data.Is_Expired;
        this.Is_Active = data.Is_Active;
    }
}

class PromotionValidationResult {
    constructor() {
        this.IsValid = false;
        this.Message = '';
        this.PromotionId = null;
        this.PromotionCode = '';
        this.Title = '';
        this.DiscountType = '';
        this.DiscountValue = 0;
        this.DiscountAmount = 0;
        this.FinalAmount = 0;
        this.ExpiresOn = null;
    }
}

class PromotionApplicationResult {
    constructor() {
        this.Success = false;
        this.Message = '';
        this.BookingId = null;
        this.PromotionId = null;
        this.PromotionCode = '';
        this.DiscountAmount = 0;
        this.OriginalTotal = 0;
        this.NewTotal = 0;
    }
}

class PromotionRemovalResult {
    constructor() {
        this.Success = false;
        this.Message = '';
        this.BookingId = null;
        this.NewTotal = 0;
    }
}

/**
 * Promotion Service - Handles all promotion-related operations
 * Uses mssql for database operations.
 */
class PromotionService {
    constructor() {
        logger.info('PromotionService initialized (mssql based)');
        this.promotionRepo = PromotionRepository;
        this.ticketBookingRepo = TicketBookingRepository;
        this.bookingHistoryRepo = BookingHistoryRepository;
        this.models = db;
    }

    _calculateDiscount(promotion, totalAmountStr) {
        const totalAmount = parseFloat(totalAmountStr);
        let discountAmount = 0;
        if (promotion.Discount_Type === DISCOUNT_TYPE.PERCENTAGE) {
            discountAmount = totalAmount * (parseFloat(promotion.Discount_Value) / 100);
            if (promotion.Maximum_Discount && discountAmount > parseFloat(promotion.Maximum_Discount)) {
                discountAmount = parseFloat(promotion.Maximum_Discount);
            }
        } else if (promotion.Discount_Type === DISCOUNT_TYPE.FIXED) {
            discountAmount = parseFloat(promotion.Discount_Value);
            if (discountAmount > totalAmount) {
                discountAmount = totalAmount;
            }
        }
        return Math.round(discountAmount); // Làm tròn đến số nguyên gần nhất
    }

    async getAllPromotions() {
        let pool;
        try {
            logger.info('Service: Fetching ALL promotions.');
            const now = new Date();
            pool = await getConnection();
            const result = await pool.request()
                .query(`
                    SELECT 
                        p.Promotion_ID, p.Title, p.Promotion_Code, p.Start_Date, p.End_Date,
                        p.Discount_Type, p.Discount_Value, p.Minimum_Purchase, p.Maximum_Discount,
                        p.Applicable_For, p.Usage_Limit, p.Current_Usage, p.Status,
                        p.Promotion_Detail, p.Created_At, p.Created_By,
                        u.Full_Name as CreatedByName
                    FROM Promotions p
                    LEFT JOIN Users u ON p.Created_By = u.User_ID
                    ORDER BY p.Created_At DESC
                `);

            const promotions = result.recordset.map(p => ({
                Promotion_ID: p.Promotion_ID,
                Title: p.Title,
                Promotion_Code: p.Promotion_Code,
                Start_Date: p.Start_Date,
                End_Date: p.End_Date,
                Discount_Type: p.Discount_Type,
                Discount_Value: p.Discount_Value,
                Minimum_Purchase: p.Minimum_Purchase,
                Maximum_Discount: p.Maximum_Discount,
                Applicable_For: p.Applicable_For,
                Usage_Limit: p.Usage_Limit,
                Current_Usage: p.Current_Usage,
                Status: p.Status,
                Promotion_Detail: p.Promotion_Detail,
                Created_At: p.Created_At,
                Created_By: p.CreatedByName || 'Không xác định',
                Is_Expired: p.End_Date < now,
                Is_Active: p.Status === PROMOTION_STATUS.ACTIVE && p.Start_Date <= now && p.End_Date >= now
            }));
            logger.info(`Service: Successfully fetched ${promotions.length} total promotions.`);
            return promotions;
        } catch (error) {
            logger.error('Service: Error fetching all promotions:', error);
            throw new AppError('Lỗi khi lấy danh sách khuyến mãi từ service.', 500, error);
        }
    }

    async getPromotionById(id) {
        let pool;
        try {
            logger.info(`Service: Fetching promotion with ID: ${id}`);
            pool = await getConnection();
            const promotionResult = await pool.request()
                .input('promotionId', sql.Int, id)
                .query(`
                    SELECT 
                        p.Promotion_ID, p.Title, p.Promotion_Code, p.Start_Date, p.End_Date,
                        p.Discount_Type, p.Discount_Value, p.Minimum_Purchase, p.Maximum_Discount,
                        p.Applicable_For, p.Usage_Limit, p.Current_Usage, p.Status,
                        p.Promotion_Detail, p.Created_At, p.Created_By,
                        u.Full_Name as CreatedByName
                    FROM Promotions p
                    LEFT JOIN Users u ON p.Created_By = u.User_ID
                    WHERE p.Promotion_ID = @promotionId
                `);

            if (promotionResult.recordset.length === 0) {
                throw new NotFoundError(`Không tìm thấy khuyến mãi có ID ${id}`);
            }
            const promotion = promotionResult.recordset[0];
            const now = new Date();

            const usageByDateResult = await pool.request()
                .input('promotionId', sql.Int, id)
                .query(`
                    SELECT 
                        CAST(pu.Applied_Date AS DATE) as Date,
                        COUNT(*) as Count,
                        SUM(pu.Discount_Amount) as Total_Discount
                    FROM PromotionUsages pu
                    WHERE pu.Promotion_ID = @promotionId
                    GROUP BY CAST(pu.Applied_Date AS DATE)
                    ORDER BY Date DESC
                    OFFSET 0 ROWS FETCH NEXT 30 ROWS ONLY;
                `);
            const usageByDate = usageByDateResult.recordset;

            const totalDiscountResult = await pool.request()
                .input('promotionId', sql.Int, id)
                .query('SELECT SUM(Discount_Amount) as TotalDiscount FROM PromotionUsages WHERE Promotion_ID = @promotionId');
            const totalDiscountSum = totalDiscountResult.recordset[0].TotalDiscount || 0;

            const averageDiscount = promotion.Current_Usage > 0 ? totalDiscountSum / promotion.Current_Usage : 0;

            const result = {
                Promotion_ID: promotion.Promotion_ID,
                Title: promotion.Title,
                Promotion_Code: promotion.Promotion_Code,
                Start_Date: promotion.Start_Date,
                End_Date: promotion.End_Date,
                Discount_Type: promotion.Discount_Type,
                Discount_Value: promotion.Discount_Value,
                Minimum_Purchase: promotion.Minimum_Purchase,
                Maximum_Discount: promotion.Maximum_Discount,
                Applicable_For: promotion.Applicable_For,
                Usage_Limit: promotion.Usage_Limit,
                Current_Usage: promotion.Current_Usage,
                Status: promotion.Status,
                Promotion_Detail: promotion.Promotion_Detail,
                Created_At: promotion.Created_At,
                Created_By: promotion.CreatedByName || 'Không xác định',
                Is_Expired: promotion.End_Date < now,
                Is_Active: promotion.Status === PROMOTION_STATUS.ACTIVE && promotion.Start_Date <= now && promotion.End_Date >= now,
                Usage_Statistics: {
                    Total_Usage: promotion.Current_Usage,
                    Total_Discount: totalDiscountSum,
                    Average_Discount: averageDiscount,
                    Usage_By_Date: usageByDate
                }
            };
            logger.info(`Service: Successfully fetched promotion ${id}`);
            return result;
        } catch (error) {
            logger.error(`Service: Error fetching promotion ${id}:`, error);
            if (error instanceof NotFoundError) throw error;
            throw new AppError(`Lỗi khi lấy chi tiết khuyến mãi ID ${id} từ service.`, 500, error);
        }
    }

    async createPromotion(dto, createdByUserId) {
        let pool;
        try {
            logger.info(`Service: Creating new promotion. Code: ${dto.Promotion_Code}`);
            pool = await getConnection();

            const existingCodeResult = await pool.request()
                .input('promotionCode', sql.NVarChar, dto.Promotion_Code)
                .query('SELECT Promotion_ID FROM Promotions WHERE Promotion_Code = @promotionCode');
            if (existingCodeResult.recordset.length > 0) {
                throw new BadRequestError(`Mã khuyến mãi "${dto.Promotion_Code}" đã tồn tại.`);
            }

            if (new Date(dto.Start_Date) >= new Date(dto.End_Date)) {
                throw new BadRequestError('Ngày bắt đầu phải trước ngày kết thúc.');
            }

            const result = await pool.request()
                .input('Title', sql.NVarChar, dto.Title)
                .input('Promotion_Code', sql.NVarChar, dto.Promotion_Code)
                .input('Start_Date', sql.DateTime, new Date(dto.Start_Date))
                .input('End_Date', sql.DateTime, new Date(dto.End_Date))
                .input('Discount_Type', sql.NVarChar, dto.Discount_Type)
                .input('Discount_Value', sql.Decimal(18, 2), dto.Discount_Value)
                .input('Minimum_Purchase', sql.Decimal(18, 2), dto.Minimum_Purchase || 0)
                .input('Maximum_Discount', sql.Decimal(18, 2), dto.Maximum_Discount || null)
                .input('Applicable_For', sql.NVarChar, dto.Applicable_For || 'All')
                .input('Usage_Limit', sql.Int, dto.Usage_Limit || null)
                .input('Status', sql.NVarChar, dto.Status || PROMOTION_STATUS.ACTIVE)
                .input('Promotion_Detail', sql.NVarChar, dto.Promotion_Detail || null)
                .input('Created_By', sql.Int, createdByUserId)
                .query(`
                    INSERT INTO Promotions (
                        Title, Promotion_Code, Start_Date, End_Date, Discount_Type, Discount_Value,
                        Minimum_Purchase, Maximum_Discount, Applicable_For, Usage_Limit, Current_Usage,
                        Status, Promotion_Detail, Created_By, Created_At
                    )
                    OUTPUT INSERTED.Promotion_ID, INSERTED.Title, INSERTED.Promotion_Code, INSERTED.Start_Date, INSERTED.End_Date, INSERTED.Discount_Type, INSERTED.Discount_Value, INSERTED.Status
                    VALUES (
                        @Title, @Promotion_Code, @Start_Date, @End_Date, @Discount_Type, @Discount_Value,
                        @Minimum_Purchase, @Maximum_Discount, @Applicable_For, @Usage_Limit, 0,
                        @Status, @Promotion_Detail, @Created_By, GETDATE()
                    )
                `);

            const createdPromo = result.recordset[0];
            logger.info(`Service: Successfully created promotion with ID: ${createdPromo.Promotion_ID}`);
            return {
                Promotion_ID: createdPromo.Promotion_ID,
                Title: createdPromo.Title,
                Promotion_Code: createdPromo.Promotion_Code,
                Start_Date: createdPromo.Start_Date,
                End_Date: createdPromo.End_Date,
                Discount_Type: createdPromo.Discount_Type,
                Discount_Value: createdPromo.Discount_Value,
                Status: createdPromo.Status
            };
        } catch (error) {
            logger.error('Service: Error creating promotion:', error);
            if (error instanceof BadRequestError) throw error;
            throw new AppError('Lỗi khi tạo khuyến mãi từ service.', 500, error);
        }
    }

    async updatePromotion(id, dto) {
        let pool;
        try {
            logger.info(`Service: Updating promotion ${id}`);
            pool = await getConnection();

            const promotion = (await pool.request().input('promotionId', sql.Int, id).query('SELECT * FROM Promotions WHERE Promotion_ID = @promotionId')).recordset[0];
            if (!promotion) {
                throw new NotFoundError(`Không tìm thấy khuyến mãi có ID ${id}`);
            }

            if (dto.Promotion_Code && dto.Promotion_Code !== promotion.Promotion_Code) {
                const duplicateCodeResult = await pool.request()
                    .input('promotionCode', sql.NVarChar, dto.Promotion_Code)
                    .input('promotionId', sql.Int, id)
                    .query('SELECT Promotion_ID FROM Promotions WHERE Promotion_Code = @promotionCode AND Promotion_ID != @promotionId');
                if (duplicateCodeResult.recordset.length > 0) {
                    throw new BadRequestError(`Mã khuyến mãi "${dto.Promotion_Code}" đã tồn tại.`);
                }
            }

            if (dto.Start_Date && dto.End_Date && new Date(dto.Start_Date) >= new Date(dto.End_Date)) {
                throw new BadRequestError('Ngày bắt đầu phải trước ngày kết thúc.');
            }

            const hasBeenUsedResult = await pool.request()
                .input('promotionId', sql.Int, id)
                .query('SELECT COUNT(*) as UsageCount FROM PromotionUsages WHERE Promotion_ID = @promotionId');
            const hasBeenUsed = hasBeenUsedResult.recordset[0].UsageCount > 0;

            let updateQuery = 'UPDATE Promotions SET ';
            const request = pool.request().input('promotionId', sql.Int, id);
            const updateFields = [];

            if (dto.Title !== undefined) { updateFields.push('Title = @Title'); request.input('Title', sql.NVarChar, dto.Title); }
            if (dto.End_Date !== undefined) { updateFields.push('End_Date = @End_Date'); request.input('End_Date', sql.DateTime, new Date(dto.End_Date)); }
            if (dto.Maximum_Discount !== undefined) { updateFields.push('Maximum_Discount = @Maximum_Discount'); request.input('Maximum_Discount', sql.Decimal(18, 2), dto.Maximum_Discount); }
            if (dto.Status !== undefined) { updateFields.push('Status = @Status'); request.input('Status', sql.NVarChar, dto.Status); }
            if (dto.Promotion_Detail !== undefined) { updateFields.push('Promotion_Detail = @Promotion_Detail'); request.input('Promotion_Detail', sql.NVarChar, dto.Promotion_Detail); }
            if (dto.Usage_Limit !== undefined) { updateFields.push('Usage_Limit = @Usage_Limit'); request.input('Usage_Limit', sql.Int, dto.Usage_Limit); }

            if (!hasBeenUsed) {
                if (dto.Promotion_Code !== undefined) { updateFields.push('Promotion_Code = @Promotion_Code'); request.input('Promotion_Code', sql.NVarChar, dto.Promotion_Code); }
                if (dto.Start_Date !== undefined) { updateFields.push('Start_Date = @Start_Date'); request.input('Start_Date', sql.DateTime, new Date(dto.Start_Date)); }
                if (dto.Discount_Type !== undefined) { updateFields.push('Discount_Type = @Discount_Type'); request.input('Discount_Type', sql.NVarChar, dto.Discount_Type); }
                if (dto.Discount_Value !== undefined) { updateFields.push('Discount_Value = @Discount_Value'); request.input('Discount_Value', sql.Decimal(18, 2), dto.Discount_Value); }
                if (dto.Minimum_Purchase !== undefined) { updateFields.push('Minimum_Purchase = @Minimum_Purchase'); request.input('Minimum_Purchase', sql.Decimal(18, 2), dto.Minimum_Purchase); }
                if (dto.Applicable_For !== undefined) { updateFields.push('Applicable_For = @Applicable_For'); request.input('Applicable_For', sql.NVarChar, dto.Applicable_For); }
            }

            if (updateFields.length === 0) {
                logger.info(`Service: No fields to update for promotion ${id}.`);
                const currentData = (await pool.request().input('pId', sql.Int, id).query('SELECT Promotion_ID, Title, Promotion_Code, Start_Date, End_Date, Discount_Type, Discount_Value, Status FROM Promotions WHERE Promotion_ID = @pId')).recordset[0];
                return { ...currentData, limited_update: hasBeenUsed, message: hasBeenUsed ? "Khuyến mãi đã được sử dụng, chỉ có thể cập nhật một số thông tin giới hạn (không có thay đổi được áp dụng)." : "Không có thông tin nào được thay đổi." };
            }

            updateQuery += updateFields.join(', ') + ', Updated_At = GETDATE() WHERE Promotion_ID = @promotionId';
            await request.query(updateQuery + `
                OUTPUT INSERTED.Promotion_ID, INSERTED.Title, INSERTED.Promotion_Code, INSERTED.Start_Date, INSERTED.End_Date, INSERTED.Discount_Type, INSERTED.Discount_Value, INSERTED.Status;
            `);

            const updatedPromo = (await pool.request().input('pId', sql.Int, id).query('SELECT Promotion_ID, Title, Promotion_Code, Start_Date, End_Date, Discount_Type, Discount_Value, Status FROM Promotions WHERE Promotion_ID = @pId')).recordset[0];

            logger.info(`Service: Successfully updated promotion ${id}`);
            return {
                ...updatedPromo,
                limited_update: hasBeenUsed,
                message: hasBeenUsed ? "Khuyến mãi đã được sử dụng, chỉ có thể cập nhật một số thông tin." : undefined
            };
        } catch (error) {
            logger.error(`Service: Error updating promotion ${id}:`, error);
            if (error instanceof BadRequestError || error instanceof NotFoundError) throw error;
            throw new AppError(`Lỗi khi cập nhật khuyến mãi ID ${id} từ service.`, 500, error);
        }
    }

    async deletePromotion(id) {
        let pool;
        try {
            logger.info(`Service: Deleting/Deactivating promotion ID ${id}`);
            pool = await getConnection();

            const promotion = (await pool.request().input('promotionId', sql.Int, id).query('SELECT Promotion_ID FROM Promotions WHERE Promotion_ID = @promotionId')).recordset[0];
            if (!promotion) {
                throw new NotFoundError(`Không tìm thấy khuyến mãi có ID ${id}`);
            }

            const usageResult = await pool.request()
                .input('promotionId', sql.Int, id)
                .query('SELECT COUNT(*) as UsageCount FROM PromotionUsages WHERE Promotion_ID = @promotionId');
            const hasBeenUsed = usageResult.recordset[0].UsageCount > 0;

            let newStatus;
            let message;
            let resultStatus;

            if (hasBeenUsed) {
                newStatus = PROMOTION_STATUS.INACTIVE;
                resultStatus = "deactivated";
                message = "Khuyến mãi đã được sử dụng, đã đánh dấu là không hoạt động.";
            } else {
                newStatus = PROMOTION_STATUS.DELETED;
                resultStatus = "deleted";
                message = "Khuyến mãi đã được đánh dấu là đã xóa.";
            }

            await pool.request()
                .input('promotionId', sql.Int, id)
                .input('newStatus', sql.NVarChar, newStatus)
                .query('UPDATE Promotions SET Status = @newStatus, Updated_At = GETDATE() WHERE Promotion_ID = @promotionId');

            logger.info(`Service: Promotion ${id} status set to ${newStatus}.`);
            return { status: resultStatus, message };

        } catch (error) {
            logger.error(`Service: Error deleting/deactivating promotion ${id}:`, error);
            if (error instanceof NotFoundError) throw error;
            throw new AppError(`Lỗi khi xử lý xóa khuyến mãi ID ${id} từ service.`, 500, error);
        }
    }

    async validatePromotionCode(promotionCode, userId, totalAmount = 0) {
        let pool;
        try {
            logger.info(`Service: Validating promotion code: ${promotionCode} for user ${userId}, amount: ${totalAmount}`);
            if (typeof promotionCode !== 'string' || promotionCode.trim() === '') {
                return { IsValid: false, Message: "Mã khuyến mãi không được để trống" };
            }
            pool = await getConnection();
            const promotionResult = await pool.request()
                .input('promotionCode', sql.NVarChar, promotionCode.trim())
                .query('SELECT * FROM Promotions WHERE Promotion_Code = @promotionCode');

            if (promotionResult.recordset.length === 0) {
                return { IsValid: false, Message: "Mã khuyến mãi không tồn tại" };
            }
            const promotion = promotionResult.recordset[0];

            const userUsageResult = await pool.request()
                .input('promotionId', sql.Int, promotion.Promotion_ID)
                .input('userId', sql.Int, userId)
                .query('SELECT COUNT(*) as UserUsageCount FROM PromotionUsages WHERE Promotion_ID = @promotionId AND User_ID = @userId AND HasUsed = 1');
            if (userUsageResult.recordset[0].UserUsageCount > 0) {
                return { IsValid: false, Message: "Bạn đã sử dụng mã khuyến mãi này rồi" };
            }

            if (promotion.Status !== PROMOTION_STATUS.ACTIVE) {
                return { IsValid: false, Message: "Mã khuyến mãi không hoạt động" };
            }
            const now = new Date();
            if (now < promotion.Start_Date) {
                return { IsValid: false, Message: `Mã khuyến mãi chỉ có hiệu lực từ ${promotion.Start_Date.toLocaleDateString('vi-VN')}` };
            }
            if (now > promotion.End_Date) {
                return { IsValid: false, Message: "Mã khuyến mãi đã hết hạn" };
            }
            if (promotion.Usage_Limit !== null && promotion.Current_Usage >= promotion.Usage_Limit) {
                return { IsValid: false, Message: "Mã khuyến mãi đã hết lượt sử dụng" };
            }
            const numericTotalAmount = parseFloat(totalAmount);
            if (numericTotalAmount < parseFloat(promotion.Minimum_Purchase)) {
                return { IsValid: false, Message: `Đơn hàng tối thiểu phải từ ${parseFloat(promotion.Minimum_Purchase).toLocaleString('vi-VN')} VND` };
            }

            const discountAmount = this._calculateDiscount(promotion, numericTotalAmount);

            logger.info(`Service: Promotion validation successful for ${promotionCode}. Discount: ${discountAmount}`);
            return {
                IsValid: true,
                PromotionId: promotion.Promotion_ID,
                PromotionCode: promotion.Promotion_Code,
                Title: promotion.Title,
                DiscountType: promotion.Discount_Type,
                DiscountValue: promotion.Discount_Value,
                DiscountAmount: discountAmount,
                FinalAmount: Math.round(numericTotalAmount - discountAmount),
                ExpiresOn: promotion.End_Date,
                Message: "Mã khuyến mãi hợp lệ"
            };
        } catch (error) {
            logger.error('Service: Error validating promotion code:', error);
            return { IsValid: false, Message: "Có lỗi xảy ra khi kiểm tra mã khuyến mãi." };
        }
    }

    async applyPromotionAsync(bookingId, promotionCode, currentUserId) {
        logger.info(`Bắt đầu áp dụng mã khuyến mãi: BookingId=${bookingId}, PromotionCode=${promotionCode}, RequestedBy=${currentUserId}`);

        const result = new PromotionApplicationResult();

        // Kiểm tra đầu vào
        if (!promotionCode || bookingId <= 0) {
            result.Success = false;
            result.Message = 'Dữ liệu không hợp lệ';
            return result;
        }

        let transaction;
        try {
            // Bắt đầu transaction trong khối try
            transaction = await this.models.sequelize.transaction();

            // Lấy thông tin đơn đặt vé
            const booking = await this.models.TicketBooking.findByPk(bookingId, { transaction });

            if (!booking) {
                await transaction.rollback();
                result.Success = false;
                result.Message = 'Không tìm thấy đơn đặt vé';
                return result;
            }

            // Xác định userId
            const userId = booking.User_ID || 0;
            if (userId === 0) {
                await transaction.rollback();
                result.Success = false;
                result.Message = 'Không xác định được người dùng';
                return result;
            }

            // Kiểm tra trạng thái đơn đặt vé
            if (booking.Status !== 'Pending') {
                await transaction.rollback();
                result.Success = false;
                result.Message = 'Chỉ có thể áp dụng khuyến mãi cho đơn đặt vé chưa thanh toán';
                return result;
            }

            // Kiểm tra đơn đặt vé đã có mã khuyến mãi chưa
            if (booking.Promotion_ID) {
                await transaction.rollback();
                result.Success = false;
                result.Message = 'Đơn đặt vé đã áp dụng khuyến mãi khác';
                return result;
            }

            // Lấy thông tin khuyến mãi
            const promotion = await this.models.Promotion.findOne({
                where: { Promotion_Code: promotionCode },
                transaction
            });

            if (!promotion) {
                await transaction.rollback();
                result.Success = false;
                result.Message = 'Mã khuyến mãi không tồn tại';
                return result;
            }

            // Chi tiết log để debug
            logger.info(`Promotion Details: ID=${promotion.Promotion_ID}, Status=${promotion.Status}, ` +
                `Start=${promotion.Start_Date}, End=${promotion.End_Date}`);

            // Kiểm tra trạng thái khuyến mãi
            if (promotion.Status !== PROMOTION_STATUS.ACTIVE) {
                await transaction.rollback();
                result.Success = false;
                result.Message = 'Mã khuyến mãi không hoạt động';
                return result;
            }

            // Kiểm tra thời gian hiệu lực
            const now = new Date();
            if (now < promotion.Start_Date || now > promotion.End_Date) {
                await transaction.rollback();
                result.Success = false;
                result.Message = 'Mã khuyến mãi không còn hiệu lực';
                return result;
            }

            // Kiểm tra giới hạn sử dụng
            if (promotion.Usage_Limit && promotion.Current_Usage >= promotion.Usage_Limit) {
                await transaction.rollback();
                result.Success = false;
                result.Message = 'Mã khuyến mãi đã hết lượt sử dụng';
                return result;
            }

            // Kiểm tra xem có đang sử dụng mã khuyến mãi nào khác không
            const activePromotionUsages = await this.models.PromotionUsage.findAll({
                include: [
                    {
                        model: this.models.Promotion,
                        as: 'Promotion',
                        where: { Status: PROMOTION_STATUS.ACTIVE }
                    },
                    {
                        model: this.models.TicketBooking,
                        as: 'TicketBooking',
                        where: { Status: { [Op.ne]: 'Cancelled' } }
                    }
                ],
                where: {
                    User_ID: userId,
                    HasUsed: true
                },
                transaction
            });

            // Ghi log chi tiết các khuyến mãi đang sử dụng
            activePromotionUsages.forEach(existingUsage => {
                logger.info(`Active Usage: PromotionID=${existingUsage.Promotion_ID}, ` +
                    `PromotionCode=${existingUsage.Promotion.Promotion_Code}, ` +
                    `BookingID=${existingUsage.Booking_ID}, ` +
                    `BookingStatus=${existingUsage.TicketBooking.Status}`);
            });

            // Kiểm tra xem có đang sử dụng mã khuyến mãi nào khác không
            if (activePromotionUsages.some(pu => pu.Booking_ID !== bookingId)) {
                await transaction.rollback();
                result.Success = false;
                result.Message = 'Bạn đã có đơn hàng khác đang sử dụng mã khuyến mãi, mỗi người chỉ được sử dụng một mã tại một thời điểm';
                return result;
            }

            // Tính toán giảm giá
            const discountAmount = this.calculateDiscountAmount(promotion, booking.Total_Amount);

            // Tạo bản ghi sử dụng khuyến mãi - Sử dụng GETDATE() của SQL Server
            logger.info(`Creating promotion usage with SQL Server's GETDATE() function`);

            await this.models.PromotionUsage.create({
                User_ID: userId,
                Promotion_ID: promotion.Promotion_ID,
                Booking_ID: bookingId,
                Discount_Amount: discountAmount,
                Applied_Date: this.models.sequelize.literal('GETDATE()'), // Sử dụng hàm GETDATE() của SQL Server
                HasUsed: true
            }, { transaction });

            // Cập nhật đơn đặt vé
            const originalTotal = parseFloat(booking.Total_Amount);
            booking.Promotion_ID = promotion.Promotion_ID;
            booking.Total_Amount = originalTotal - discountAmount;
            await booking.save({ transaction });

            // Tăng lượt sử dụng khuyến mãi
            promotion.Current_Usage += 1;
            await promotion.save({ transaction });

            // Lưu lịch sử
            logger.info(`Creating booking history with SQL Server's GETDATE() function`);

            await this.models.BookingHistory.create({
                Booking_ID: bookingId,
                Date: this.models.sequelize.literal('GETDATE()'), // Sử dụng hàm GETDATE() của SQL Server
                Status: 'Promotion Applied',
                Notes: `Áp dụng mã khuyến mãi ${promotion.Promotion_Code}, giảm ${this.formatCurrency(discountAmount)} VND`
            }, { transaction });

            // Commit transaction
            await transaction.commit();

            // Trả về kết quả thành công
            result.Success = true;
            result.BookingId = booking.Booking_ID;
            result.PromotionId = promotion.Promotion_ID;
            result.PromotionCode = promotion.Promotion_Code;
            result.DiscountAmount = discountAmount;
            result.OriginalTotal = originalTotal;
            result.NewTotal = parseFloat(booking.Total_Amount);
            result.Message = 'Áp dụng khuyến mãi thành công';

            return result;
        } catch (error) {
            // Rollback transaction nếu có và chưa hoàn thành
            if (transaction && !transaction.finished) {
                try {
                    await transaction.rollback();
                } catch (rollbackError) {
                    logger.error(`Lỗi khi rollback transaction: ${rollbackError.message}`, rollbackError);
                }
            }
            logger.error(`Lỗi khi áp dụng khuyến mãi: ${error.message}`, error);
            result.Success = false;
            result.Message = 'Đã xảy ra lỗi khi áp dụng khuyến mãi';
            return result;
        }
    }

    async removePromotion(bookingId, currentUserId) {
        logger.info(`Service: Removing promotion from booking ID ${bookingId} by User ID ${currentUserId}.`);
        let pool = await getConnection();
        const transaction = new sql.Transaction(pool);
        try {
            await transaction.begin();

            const booking = await this.ticketBookingRepo.findById(bookingId, transaction);
            if (!booking) {
                throw new NotFoundError("Không tìm thấy đơn đặt vé.");
            }
            if (booking.Status !== 'Pending') {
                throw new BadRequestError("Chỉ có thể hủy khuyến mãi cho đơn đặt vé chưa thanh toán (Pending).");
            }
            if (!booking.Promotion_ID) {
                throw new AppError("Đơn đặt vé này không có khuyến mãi nào được áp dụng.");
            }

            const promotionId = booking.Promotion_ID;
            const promotionUsage = await this.promotionRepo.findUsageByBookingIdAndPromoId(bookingId, promotionId, transaction);
            if (!promotionUsage) {
                throw new AppError("Không tìm thấy thông tin sử dụng khuyến mãi cho đơn đặt vé này.");
            }
            const promotion = await this.promotionRepo.findById(promotionId, transaction);
            if (!promotion) {
                throw new AppError("Không tìm thấy thông tin khuyến mãi đã được áp dụng.");
            }

            const discountAmount = parseFloat(promotionUsage.Discount_Amount);
            const originalTotalBeforePromotion = parseFloat(booking.Total_Amount) + discountAmount;

            await this.promotionRepo.removeUsageById(promotionUsage.Promotion_Usage_ID, transaction);

            await this.ticketBookingRepo.update(bookingId, {
                Promotion_ID: null,
                Total_Amount: originalTotalBeforePromotion,
            }, transaction);

            if (promotion.Current_Usage > 0) {
                await this.promotionRepo.decrementUsage(promotionId, transaction);
            }

            await this.bookingHistoryRepo.create({
                Booking_ID: bookingId,
                Date: this.models.sequelize.literal('GETDATE()'), // Sử dụng hàm GETDATE() của SQL Server
                Status: "Promotion Removed",
                Notes: `Hủy áp dụng mã khuyến mãi ${promotion.Promotion_Code}. Hoàn lại ${discountAmount.toLocaleString('vi-VN')} VND.`
            }, transaction);

            await transaction.commit();
            logger.info(`Service: Successfully removed promotion from booking ${bookingId}.`);
            return {
                Success: true,
                BookingId: bookingId,
                NewTotal: originalTotalBeforePromotion,
                Message: "Đã hủy áp dụng khuyến mãi thành công."
            };

        } catch (error) {
            if (transaction.rolledBack === false) await transaction.rollback();
            logger.error(`Service: Error removing promotion from booking ${bookingId}.`, error);
            if (error instanceof AppError || error instanceof BadRequestError || error instanceof NotFoundError) throw error;
            throw new AppError('Đã xảy ra lỗi khi hủy khuyến mãi.', 500, error);
        }
    }

    async getAvailablePromotions(amount = 0) {
        let pool;
        try {
            logger.info(`Service: Fetching available promotions for amount ${amount}.`);
            const now = new Date();
            pool = await getConnection();
            const numericAmount = parseFloat(amount);

            const result = await pool.request()
                .input('now', sql.DateTime, now)
                .input('amount', sql.Decimal(18, 2), numericAmount)
                .query(`
                    SELECT * FROM Promotions 
                    WHERE Status = '${PROMOTION_STATUS.ACTIVE}'
                        AND Start_Date <= @now 
                        AND End_Date >= @now
                        AND (Usage_Limit IS NULL OR Current_Usage < Usage_Limit)
                        AND Minimum_Purchase <= @amount
                    ORDER BY Minimum_Purchase ASC, Created_At DESC 
                `);

            const promotions = result.recordset.map(p => {
                const discountAmount = this._calculateDiscount(p, numericAmount);
                let discountDescription = '';
                if (p.Discount_Type === DISCOUNT_TYPE.PERCENTAGE) {
                    discountDescription = `Giảm ${p.Discount_Value}%.`;
                    if (p.Maximum_Discount) {
                        discountDescription += ` Tối đa ${parseFloat(p.Maximum_Discount).toLocaleString('vi-VN')} VND.`;
                    }
                } else {
                    discountDescription = `Giảm ${parseFloat(p.Discount_Value).toLocaleString('vi-VN')} VND.`;
                }

                return {
                    Promotion_ID: p.Promotion_ID,
                    Title: p.Title,
                    Promotion_Code: p.Promotion_Code,
                    Discount_Type: p.Discount_Type,
                    Discount_Value: p.Discount_Value,
                    Minimum_Purchase: parseFloat(p.Minimum_Purchase),
                    Maximum_Discount: p.Maximum_Discount ? parseFloat(p.Maximum_Discount) : null,
                    End_Date: p.End_Date,
                    Discount_Description: discountDescription,
                    Usage_Remaining: p.Usage_Limit ? p.Usage_Limit - p.Current_Usage : null,
                    Discount_Amount: discountAmount,
                    Final_Amount: Math.round(numericAmount - discountAmount)
                };
            });
            logger.info(`Service: Found ${promotions.length} available promotions.`);
            return promotions;
        } catch (error) {
            logger.error('Service: Error fetching available promotions:', error);
            throw new AppError('Lỗi khi lấy danh sách khuyến mãi hiện có từ service.', 500, error);
        }
    }

    async expirePromotionsJob() {
        let pool;
        try {
            logger.info('Service: Starting ExpirePromotionsJob.');
            pool = await getConnection();
            const now = new Date();

            const result = await pool.request()
                .input('now', sql.DateTime, now)
                .input('statusActive', sql.NVarChar, PROMOTION_STATUS.ACTIVE)
                .input('statusExpired', sql.NVarChar, PROMOTION_STATUS.EXPIRED)
                .query(`
                    UPDATE Promotions 
                    SET Status = @statusExpired, Updated_At = GETDATE()
                    WHERE Status = @statusActive AND End_Date < @now;
                    SELECT @@ROWCOUNT as AffectedCount;
                `);

            const affectedCount = result.recordset[0] ? result.recordset[0].AffectedCount : (result.rowsAffected && result.rowsAffected[0] ? result.rowsAffected[0] : 0);

            if (affectedCount > 0) {
                logger.info(`Service: Total ${affectedCount} promotions have been marked as EXPIRED.`);
            } else {
                logger.info('Service: No active promotions found to expire.');
            }
            return { affectedCount };
        } catch (error) {
            logger.error('Service: Error in ExpirePromotionsJob.', error);
            return { affectedCount: 0, error: true, message: error.message };
        }
    }

    async getAllPromotionsAsync() {
        logger.info('Fetching ALL promotions.');
        const now = new Date(); // Lấy thời gian hiện tại một lần

        try {
            // Không còn lọc theo includeInactive nữa, lấy tất cả từ Promotions
            const promotions = await this.models.Promotion.findAll({
                include: [
                    { model: this.models.User, as: 'Creator', attributes: ['Full_Name'] }
                ],
                order: [['Created_At', 'DESC']]
            });

            // Ánh xạ sang DTO
            const result = promotions.map(p => {
                return new PromotionSummaryDto({
                    Promotion_ID: p.Promotion_ID,
                    Title: p.Title,
                    Promotion_Code: p.Promotion_Code,
                    Start_Date: p.Start_Date,
                    End_Date: p.End_Date,
                    Discount_Type: p.Discount_Type,
                    Discount_Value: p.Discount_Value,
                    Minimum_Purchase: p.Minimum_Purchase,
                    Maximum_Discount: p.Maximum_Discount,
                    Applicable_For: p.Applicable_For,
                    Usage_Limit: p.Usage_Limit,
                    Current_Usage: p.Current_Usage,
                    Status: p.Status,
                    Promotion_Detail: p.Promotion_Detail,
                    Created_At: p.Created_At,
                    Created_By: p.Creator ? p.Creator.Full_Name : 'Không xác định',
                    // Tính toán trạng thái thực tế dựa trên thời gian hiện tại và Status
                    Is_Expired: p.End_Date < now,
                    Is_Active: p.Status === PROMOTION_STATUS.ACTIVE && p.Start_Date <= now && p.End_Date >= now
                });
            });

            logger.info(`Successfully fetched ${result.length} total promotions.`);
            return result;
        } catch (error) {
            logger.error('Error fetching all promotions:', error);
            throw error; // Ném lại lỗi
        }
    }

    async getPromotionAsync(id) {
        const promotion = await this.models.Promotion.findByPk(id, {
            include: [
                { model: this.models.User, as: 'Creator', attributes: ['Full_Name'] },
                { model: this.models.PromotionUsage, as: 'PromotionUsages' }
            ]
        });

        if (!promotion) {
            throw new Error(`Không tìm thấy khuyến mãi có ID ${id}`);
        }

        // Lấy thống kê sử dụng theo ngày
        const usageByDate = await this.models.PromotionUsage.findAll({
            attributes: [
                [this.models.sequelize.literal('CAST(Applied_Date AS DATE)'), 'date'],
                [this.models.sequelize.fn('COUNT', this.models.sequelize.col('Usage_ID')), 'count'],
                [this.models.sequelize.fn('SUM', this.models.sequelize.col('Discount_Amount')), 'total_discount']
            ],
            where: { Promotion_ID: id },
            group: [this.models.sequelize.literal('CAST(Applied_Date AS DATE)')],
            order: [[this.models.sequelize.literal('CAST(Applied_Date AS DATE)'), 'DESC']],
            limit: 30
        });

        // Tính tổng số tiền giảm giá
        const totalDiscount = promotion.PromotionUsages.reduce((sum, usage) => sum + parseFloat(usage.Discount_Amount || 0), 0);

        // Tính trung bình số tiền giảm giá
        const averageDiscount = promotion.PromotionUsages.length > 0
            ? totalDiscount / promotion.PromotionUsages.length
            : 0;

        return {
            Promotion_ID: promotion.Promotion_ID,
            Title: promotion.Title,
            Promotion_Code: promotion.Promotion_Code,
            Start_Date: promotion.Start_Date,
            End_Date: promotion.End_Date,
            Discount_Type: promotion.Discount_Type,
            Discount_Value: promotion.Discount_Value,
            Minimum_Purchase: promotion.Minimum_Purchase,
            Maximum_Discount: promotion.Maximum_Discount,
            Applicable_For: promotion.Applicable_For,
            Usage_Limit: promotion.Usage_Limit,
            Current_Usage: promotion.Current_Usage,
            Status: promotion.Status,
            Promotion_Detail: promotion.Promotion_Detail,
            Created_At: promotion.Created_At,
            Created_By: promotion.Creator ? promotion.Creator.Full_Name : 'Không xác định',
            Is_Expired: promotion.End_Date < new Date(),
            Is_Active: promotion.Status === PROMOTION_STATUS.ACTIVE &&
                promotion.Start_Date <= new Date() &&
                promotion.End_Date >= new Date(),
            Usage_Statistics: {
                Total_Usage: promotion.Current_Usage,
                Total_Discount: totalDiscount,
                Average_Discount: averageDiscount,
                Usage_By_Date: usageByDate.map(u => ({
                    Date: u.getDataValue('date'),
                    Count: parseInt(u.getDataValue('count')),
                    Total_Discount: parseFloat(u.getDataValue('total_discount') || 0)
                }))
            }
        };
    }

    async createPromotionAsync(model, userId) {
        // Kiểm tra mã khuyến mãi đã tồn tại chưa
        const existingPromotion = await this.models.Promotion.findOne({
            where: { Promotion_Code: model.Promotion_Code }
        });

        if (existingPromotion) {
            throw new Error(`Mã khuyến mãi '${model.Promotion_Code}' đã tồn tại`);
        }

        try {
            // Kiểm tra và xử lý định dạng ngày
            // Chuyển đổi chuỗi ngày thành đối tượng Date
            const startDate = new Date(model.Start_Date);
            const endDate = new Date(model.End_Date);

            // Kiểm tra ngày bắt đầu và kết thúc
            if (startDate >= endDate) {
                throw new Error('Ngày bắt đầu phải trước ngày kết thúc');
            }

            // Format lại ngày để tránh vấn đề với SQL Server
            // Tạo chuỗi ngày ở định dạng YYYY-MM-DD
            const formatDate = (date) => {
                return date.toISOString().split('T')[0];
            };

            // Log để debug
            console.log(`Creating promotion with formatted dates: Start = ${formatDate(startDate)}, End = ${formatDate(endDate)}`);

            // Tạo khuyến mãi mới với ngày đã định dạng
            const promotion = await this.models.Promotion.create({
                Title: model.Title,
                Promotion_Code: model.Promotion_Code,
                Start_Date: startDate, // Truyền đối tượng Date, để Sequelize xử lý
                End_Date: endDate,     // Truyền đối tượng Date, để Sequelize xử lý
                Discount_Type: model.Discount_Type,
                Discount_Value: model.Discount_Value,
                Minimum_Purchase: model.Minimum_Purchase || 0,
                Maximum_Discount: model.Maximum_Discount || null,
                Applicable_For: model.Applicable_For || 'All Users',
                Usage_Limit: model.Usage_Limit || null,
                Current_Usage: 0,
                Status: model.Status || PROMOTION_STATUS.ACTIVE,
                Promotion_Detail: model.Promotion_Detail || '',
                Created_By: userId,
                // Sử dụng hàm SQL Server thay vì JavaScript Date
                Created_At: this.models.sequelize.literal('GETDATE()')
            });

            return {
                Promotion_ID: promotion.Promotion_ID,
                Title: promotion.Title,
                Promotion_Code: promotion.Promotion_Code,
                Start_Date: promotion.Start_Date,
                End_Date: promotion.End_Date,
                Discount_Type: promotion.Discount_Type,
                Discount_Value: promotion.Discount_Value,
                Status: promotion.Status
            };
        } catch (error) {
            console.error(`Error creating promotion: ${error.message}`);
            throw error;
        }
    }

    async updatePromotionAsync(id, model) {
        const promotion = await this.models.Promotion.findByPk(id);
        if (!promotion) {
            throw new Error(`Không tìm thấy khuyến mãi có ID ${id}`);
        }

        try {
            // Kiểm tra mã khuyến mãi có bị trùng không
            if (model.Promotion_Code !== promotion.Promotion_Code) {
                const existingPromotion = await this.models.Promotion.findOne({
                    where: { Promotion_Code: model.Promotion_Code }
                });

                if (existingPromotion) {
                    throw new Error(`Mã khuyến mãi '${model.Promotion_Code}' đã tồn tại`);
                }
            }

            // Xử lý định dạng ngày tháng
            const startDate = new Date(model.Start_Date);
            const endDate = new Date(model.End_Date);

            // Kiểm tra tính hợp lệ của ngày tháng
            if (startDate >= endDate) {
                throw new Error('Ngày bắt đầu phải trước ngày kết thúc');
            }

            // Kiểm tra khuyến mãi đã được sử dụng chưa
            const hasBeenUsed = await this.models.PromotionUsage.count({
                where: { Promotion_ID: id }
            }) > 0;

            if (hasBeenUsed) {
                // Chỉ cập nhật một số thông tin
                promotion.Title = model.Title;
                promotion.End_Date = endDate; // Sử dụng đối tượng Date
                promotion.Maximum_Discount = model.Maximum_Discount;
                promotion.Status = model.Status;
                promotion.Promotion_Detail = model.Promotion_Detail;
                promotion.Usage_Limit = model.Usage_Limit;

                await promotion.save();

                return {
                    Promotion_ID: promotion.Promotion_ID,
                    Title: promotion.Title,
                    End_Date: promotion.End_Date,
                    Status: promotion.Status,
                    limited_update: true,
                    message: 'Khuyến mãi đã được sử dụng, chỉ có thể cập nhật một số thông tin'
                };
            }

            // Cập nhật tất cả thông tin
            promotion.Title = model.Title;
            promotion.Promotion_Code = model.Promotion_Code;
            promotion.Start_Date = startDate; // Sử dụng đối tượng Date
            promotion.End_Date = endDate;     // Sử dụng đối tượng Date
            promotion.Discount_Type = model.Discount_Type;
            promotion.Discount_Value = model.Discount_Value;
            promotion.Minimum_Purchase = model.Minimum_Purchase;
            promotion.Maximum_Discount = model.Maximum_Discount;
            promotion.Applicable_For = model.Applicable_For;
            promotion.Usage_Limit = model.Usage_Limit;
            promotion.Status = model.Status;
            promotion.Promotion_Detail = model.Promotion_Detail;

            await promotion.save();

            return {
                Promotion_ID: promotion.Promotion_ID,
                Title: promotion.Title,
                Promotion_Code: promotion.Promotion_Code,
                Start_Date: promotion.Start_Date,
                End_Date: promotion.End_Date,
                Discount_Type: promotion.Discount_Type,
                Discount_Value: promotion.Discount_Value,
                Status: promotion.Status,
                limited_update: false
            };
        } catch (error) {
            console.error(`Error updating promotion ID ${id}: ${error.message}`);
            throw error;
        }
    }

    async deletePromotionAsync(id) {
        const promotion = await this.models.Promotion.findByPk(id);
        if (!promotion) {
            throw new Error(`Không tìm thấy khuyến mãi có ID ${id}`);
        }

        const hasBeenUsed = await this.models.PromotionUsage.count({
            where: { Promotion_ID: id }
        }) > 0;

        // Sử dụng xóa mềm
        if (hasBeenUsed) {
            promotion.Status = PROMOTION_STATUS.INACTIVE;
        } else {
            promotion.Status = PROMOTION_STATUS.DELETED;
        }

        await promotion.save();

        return {
            status: hasBeenUsed ? 'deactivated' : 'deleted',
            message: hasBeenUsed
                ? 'Khuyến mãi đã được sử dụng, đã đánh dấu là không hoạt động'
                : 'Khuyến mãi đã được đánh dấu là đã xóa'
        };
    }

    async validatePromotionAsync(promotionCode, userId) {
        const result = new PromotionValidationResult();

        if (!promotionCode) {
            result.IsValid = false;
            result.Message = 'Mã khuyến mãi không được để trống';
            return result;
        }

        console.log(`Service - Validating promotion code: "${promotionCode}"`); // Log mã khuyến mãi để debug

        const promotion = await this.models.Promotion.findOne({
            where: { Promotion_Code: promotionCode }
        });

        console.log(`Found promotion:`, promotion ? `ID: ${promotion.Promotion_ID}, Code: ${promotion.Promotion_Code}` : 'Not found'); // Log kết quả

        if (!promotion) {
            result.IsValid = false;
            result.Message = 'Mã khuyến mãi không tồn tại';
            return result;
        }

        // Kiểm tra người dùng đã sử dụng mã này chưa (chỉ khi đã đăng nhập)
        if (userId > 0) {
            const userPromotionUsage = await this.models.PromotionUsage.findOne({
                where: {
                    User_ID: userId,
                    Promotion_ID: promotion.Promotion_ID,
                    HasUsed: true
                }
            });

            if (userPromotionUsage) {
                result.IsValid = false;
                result.Message = 'Bạn đã sử dụng mã khuyến mãi này rồi';
                return result;
            }
        }

        // Kiểm tra trạng thái
        if (promotion.Status !== PROMOTION_STATUS.ACTIVE) {
            result.IsValid = false;
            result.Message = 'Mã khuyến mãi không hoạt động';
            return result;
        }

        // Kiểm tra số lượng còn lại
        if (promotion.Usage_Limit !== null && promotion.Usage_Limit > 0) {
            if (promotion.Usage_Remaining <= 0) {
                result.IsValid = false;
                result.Message = 'Mã khuyến mãi đã hết lượt sử dụng';
                return result;
            }
        }

        // Kiểm tra thời gian sử dụng
        const now = new Date();
        if (promotion.Start_Date && now < new Date(promotion.Start_Date)) {
            result.IsValid = false;
            result.Message = 'Mã khuyến mãi chưa đến thời gian sử dụng';
            return result;
        }

        if (promotion.End_Date && now > new Date(promotion.End_Date)) {
            result.IsValid = false;
            result.Message = 'Mã khuyến mãi đã hết hạn';
            return result;
        }

        // Nếu tất cả kiểm tra đều pass, trả về kết quả thành công
        result.IsValid = true;
        result.Message = 'Mã khuyến mãi hợp lệ';
        result.PromotionId = promotion.Promotion_ID;
        result.Title = promotion.Title;
        result.DiscountType = promotion.Discount_Type;
        result.DiscountValue = promotion.Discount_Value;
        result.DiscountAmount = 0; // Tính toán sau khi có đơn hàng thực tế
        result.FinalAmount = 0; // Tính toán sau khi có đơn hàng thực tế
        result.ExpiresOn = promotion.End_Date;

        return result;
    }

    async removePromotionAsync(bookingId, userId) {
        const result = new PromotionRemovalResult();

        try {
            // Truy vấn booking trước khi bắt đầu transaction
            const booking = await this.models.TicketBooking.findOne({
                where: { Booking_ID: bookingId },
                include: [
                    { model: this.models.PromotionUsage, as: 'PromotionUsages' }
                ]
            });

            if (!booking) {
                result.Success = false;
                result.Message = 'Không tìm thấy đơn đặt vé';
                return result;
            }

            if (booking.Status !== 'Pending') {
                result.Success = false;
                result.Message = 'Chỉ có thể hủy khuyến mãi cho đơn đặt vé chưa thanh toán';
                return result;
            }

            if (!booking.Promotion_ID) {
                result.Success = false;
                result.Message = 'Đơn đặt vé chưa áp dụng khuyến mãi';
                return result;
            }

            const promotionId = booking.Promotion_ID;
            const promotion = await this.models.Promotion.findByPk(promotionId);

            if (!promotion) {
                result.Success = false;
                result.Message = 'Không tìm thấy khuyến mãi đã áp dụng';
                return result;
            }

            const promotionUsage = booking.PromotionUsages.find(pu => pu.Promotion_ID === promotionId);
            if (!promotionUsage) {
                result.Success = false;
                result.Message = 'Không tìm thấy thông tin sử dụng khuyến mãi';
                return result;
            }

            // Bắt đầu transaction trong khối try
            const transaction = await this.models.sequelize.transaction();

            try {
                const discountAmount = parseFloat(promotionUsage.Discount_Amount);

                // Cập nhật tổng tiền của đơn hàng
                booking.Total_Amount = parseFloat(booking.Total_Amount) + discountAmount;
                booking.Promotion_ID = null;
                await booking.save({ transaction });

                // Xóa bản ghi sử dụng khuyến mãi
                await promotionUsage.destroy({ transaction });

                // Giảm số lượt sử dụng của khuyến mãi
                if (promotion.Current_Usage > 0) {
                    promotion.Current_Usage -= 1;
                    await promotion.save({ transaction });
                }

                // Thêm bản ghi lịch sử booking - Sử dụng GETDATE()
                logger.info('Creating booking history with SQL Server GETDATE() function');

                await this.models.BookingHistory.create({
                    Booking_ID: bookingId,
                    Date: this.models.sequelize.literal('GETDATE()'), // Sử dụng hàm GETDATE() của SQL Server
                    Status: 'Promotion Removed',
                    Notes: `Đã hủy mã khuyến mãi ${promotion.Promotion_Code}`
                }, { transaction });

                // Commit transaction
                await transaction.commit();

                result.Success = true;
                result.BookingId = booking.Booking_ID;
                result.NewTotal = parseFloat(booking.Total_Amount);
                result.Message = 'Đã hủy áp dụng khuyến mãi thành công';

                return result;
            } catch (error) {
                // Rollback transaction nếu có lỗi và transaction vẫn còn hoạt động
                if (transaction && !transaction.finished) {
                    try {
                        await transaction.rollback();
                    } catch (rollbackError) {
                        logger.error(`Lỗi khi rollback transaction hủy khuyến mãi: ${rollbackError.message}`, rollbackError);
                    }
                }
                throw error; // Re-throw để xử lý ở catch bên ngoài
            }
        } catch (error) {
            logger.error(`Lỗi khi hủy khuyến mãi cho booking ${bookingId}:`, error);
            result.Success = false;
            result.Message = 'Đã xảy ra lỗi khi hủy áp dụng khuyến mãi';
            return result;
        }
    }

    async getAvailablePromotionsAsync() {
        const now = new Date();

        // Lấy tất cả khuyến mãi, không filter theo trạng thái hoặc ngày hiệu lực
        const promotions = await this.models.Promotion.findAll({
            order: [
                ['Status', 'ASC'],  // Sắp xếp theo trạng thái để Active lên đầu
                ['Start_Date', 'DESC']  // Rồi đến ngày bắt đầu gần nhất
            ]
        });

        return promotions.map(p => {
            // Xác định khuyến mãi có đang hoạt động hay không
            const isActive = p.Status === PROMOTION_STATUS.ACTIVE &&
                p.Start_Date <= now &&
                p.End_Date >= now;

            const usageRemaining = p.Usage_Limit ? p.Usage_Limit - p.Current_Usage : null;

            return {
                Promotion_ID: p.Promotion_ID,
                Title: p.Title,
                Promotion_Code: p.Promotion_Code,
                Status: p.Status,
                Start_Date: p.Start_Date,
                End_Date: p.End_Date,
                Is_Active: isActive,
                Discount_Type: p.Discount_Type,
                Discount_Value: parseFloat(p.Discount_Value),
                Discount_Description: p.Discount_Type === DISCOUNT_TYPE.PERCENTAGE
                    ? `Giảm ${p.Discount_Value}%`
                    : `Giảm ${this.formatCurrency(p.Discount_Value)} VND`,
                Minimum_Purchase: parseFloat(p.Minimum_Purchase),
                Usage_Limit: p.Usage_Limit,
                Current_Usage: p.Current_Usage,
                Usage_Remaining: usageRemaining
            };
        });
    }

    async expirePromotionsAsync() {
        try {
            const now = new Date();
            const expiredPromotions = await this.models.Promotion.findAll({
                where: {
                    Status: PROMOTION_STATUS.ACTIVE,
                    End_Date: { [Op.lt]: now }
                }
            });

            for (const promotion of expiredPromotions) {
                promotion.Status = PROMOTION_STATUS.EXPIRED;
                await promotion.save();
                logger.info(`Expired promotion: ${promotion.Promotion_ID} - ${promotion.Title}`);
            }

            if (expiredPromotions.length > 0) {
                logger.info(`Total ${expiredPromotions.length} promotions expired`);
            }
        } catch (error) {
            logger.error('Error expiring promotions:', error);
        }
    }

    calculateDiscountAmount(promotion, totalAmount) {
        let discountAmount = 0;

        // Log chi tiết thông tin đầu vào
        logger.info(
            "Discount Calculation Details: " +
            `Total Amount: ${totalAmount}, ` +
            `Discount Type: ${promotion.Discount_Type}, ` +
            `Discount Value: ${promotion.Discount_Value}, ` +
            `Maximum Discount: ${promotion.Maximum_Discount}`
        );

        if (promotion.Discount_Type === DISCOUNT_TYPE.PERCENTAGE) {
            // Tính giảm giá theo phần trăm
            discountAmount = totalAmount * (promotion.Discount_Value / 100);

            // Log giá trị giảm ban đầu
            logger.info(`Initial Percentage Discount: ${discountAmount}`);

            // Kiểm tra và áp dụng giới hạn giảm tối đa nếu có
            if (promotion.Maximum_Discount) {
                discountAmount = Math.min(discountAmount, parseFloat(promotion.Maximum_Discount));

                logger.info(
                    `Maximum Discount Applied: ${discountAmount} ` +
                    `(Limit: ${promotion.Maximum_Discount})`
                );
            }
        } else { // Giảm giá cố định
            discountAmount = parseFloat(promotion.Discount_Value);

            // Đảm bảo không giảm quá tổng số tiền
            if (discountAmount > totalAmount) {
                discountAmount = totalAmount;
            }
        }

        // Làm tròn số tiền giảm xuống số nguyên
        const roundedDiscountAmount = Math.round(discountAmount);

        logger.info(
            "Final Discount Calculation: " +
            `Total Amount: ${totalAmount}, ` +
            `Discount Amount: ${roundedDiscountAmount}`
        );

        return roundedDiscountAmount;
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN').format(amount);
    }

    formatDate(date) {
        return new Intl.DateTimeFormat('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).format(date);
    }
}

module.exports = new PromotionService();
