const { getConnection, sql } = require('../config/database');
const logger = require('../utils/logger');

// Define the constant directly in this file
const PROMOTION_STATUS = {
    ACTIVE: 'Active',
    INACTIVE: 'Inactive',
    EXPIRED: 'Expired',
    DELETED: 'Deleted', // Dùng cho xóa mềm nếu khuyến mãi chưa từng được sử dụng
};

const fullPromotionTableName = 'ksf00691_team03.Promotions';

/**
 * Lớp Repository để thao tác với dữ liệu Khuyến mãi (Promotion) trong cơ sở dữ liệu.
 */
class PromotionRepository {
    constructor() {
        logger.info('PromotionRepository (mssql) initialized');
    }

    /**
     * Tạo một bản ghi khuyến mãi mới.
     * @param {object} promotionData - Đối tượng chứa thông tin chi tiết khuyến mãi (ví dụ: Title, Promotion_Code, Start_Date, End_Date, Discount_Type, Discount_Value, Min_Purchase_Amount, Max_Discount_Amount, Usage_Limit_Total, Usage_Limit_Per_User, Is_Active, Description).
     * @returns {Promise<object|null>} Đối tượng Promotion đã tạo hoặc null nếu tạo thất bại.
     */
    async create(promotionData) {
        logger.debug('Repo: Creating promotion:', promotionData);
        try {
            const pool = await getConnection();
            const request = pool.request();

            // Add all the necessary inputs
            if (promotionData.Title) request.input('Title', sql.NVarChar(255), promotionData.Title);
            if (promotionData.Promotion_Code) request.input('Promotion_Code', sql.NVarChar(50), promotionData.Promotion_Code);
            if (promotionData.Start_Date) request.input('Start_Date', sql.DateTime, new Date(promotionData.Start_Date));
            if (promotionData.End_Date) request.input('End_Date', sql.DateTime, new Date(promotionData.End_Date));
            if (promotionData.Discount_Type) request.input('Discount_Type', sql.NVarChar(50), promotionData.Discount_Type);
            if (promotionData.Discount_Value !== undefined) request.input('Discount_Value', sql.Decimal(10, 2), promotionData.Discount_Value);
            if (promotionData.Min_Purchase_Amount !== undefined) request.input('Min_Purchase_Amount', sql.Decimal(10, 2), promotionData.Min_Purchase_Amount);
            if (promotionData.Max_Discount_Amount !== undefined) request.input('Max_Discount_Amount', sql.Decimal(10, 2), promotionData.Max_Discount_Amount);
            if (promotionData.Usage_Limit_Total !== undefined) request.input('Usage_Limit_Total', sql.Int, promotionData.Usage_Limit_Total);
            if (promotionData.Usage_Limit_Per_User !== undefined) request.input('Usage_Limit_Per_User', sql.Int, promotionData.Usage_Limit_Per_User);
            if (promotionData.Is_Active !== undefined) request.input('Is_Active', sql.Bit, promotionData.Is_Active ? 1 : 0);
            if (promotionData.Description) request.input('Description', sql.NVarChar(sql.MAX), promotionData.Description);
            if (promotionData.Created_By) request.input('Created_By', sql.Int, promotionData.Created_By);
            request.input('Current_Usage', sql.Int, 0); // Initialize with 0
            request.input('Status', sql.NVarChar(50), PROMOTION_STATUS.ACTIVE);
            request.input('Created_At', sql.DateTime, new Date());
            request.input('Updated_At', sql.DateTime, new Date());

            // Build the column names and values for the query
            const columns = Object.keys(promotionData)
                .filter(key => promotionData[key] !== undefined)
                .concat(['Current_Usage', 'Status', 'Created_At', 'Updated_At']);

            const paramNames = columns.map(col => '@' + col);

            const query = `
                INSERT INTO ${fullPromotionTableName} (${columns.join(', ')})
                OUTPUT INSERTED.*
                VALUES (${paramNames.join(', ')});
            `;

            const result = await request.query(query);
            return result.recordset[0];
        } catch (error) {
            logger.error('Repo: Error creating promotion:', error);
            throw error;
        }
    }

    /**
     * Tìm khuyến mãi theo ID.
     * @param {number} id - ID của khuyến mãi cần tìm.
     * @returns {Promise<object|null>} Đối tượng Promotion nếu tìm thấy, ngược lại null.
     */
    async findById(id, transaction) {
        logger.debug(`Repo: Finding promotion by ID: ${id}`);
        try {
            const pool = await getConnection();
            const request = transaction ? transaction.request() : pool.request();
            const result = await request
                .input('promotionId', sql.Int, id)
                .query(`SELECT * FROM ${fullPromotionTableName} WHERE Promotion_ID = @promotionId`);
            return result.recordset[0];
        } catch (error) {
            logger.error(`Repo: Error finding promotion by ID ${id}:`, error);
            throw error;
        }
    }

    /**
     * Lấy tất cả các khuyến mãi.
     * @returns {Promise<object[]>} Mảng các đối tượng Promotion.
     * @description Cân nhắc thêm phân trang nếu số lượng khuyến mãi lớn.
     */
    async getAll(filters = {}) {
        logger.debug('Repo: Getting all promotions with filters:', filters);
        try {
            const pool = await getConnection();
            const request = pool.request();

            let query = `
                SELECT p.*, u.User_ID, u.Full_Name, u.Email 
                FROM ${fullPromotionTableName} p
                LEFT JOIN ksf00691_team03.Users u ON p.Created_By = u.User_ID
            `;

            // Add filters if provided
            if (filters.status) {
                request.input('status', sql.NVarChar(50), filters.status);
                query += ` WHERE p.Status = @status`;
            }

            query += ` ORDER BY p.Created_At DESC`;

            const result = await request.query(query);

            // Transform the results to include creator information
            return result.recordset.map(record => {
                const promotion = { ...record };
                // Create Creator object similar to Sequelize association
                if (record.User_ID) {
                    promotion.Creator = {
                        User_ID: record.User_ID,
                        Full_Name: record.Full_Name,
                        Email: record.Email
                    };

                    // Remove the duplicated fields
                    delete promotion.User_ID;
                    delete promotion.Full_Name;
                    delete promotion.Email;
                }

                return promotion;
            });
        } catch (error) {
            logger.error('Repo: Error getting all promotions:', error);
            throw error;
        }
    }

    /**
     * Cập nhật thông tin khuyến mãi hiện có.
     * @param {number} id - ID của khuyến mãi cần cập nhật.
     * @param {object} promotionData - Đối tượng chứa các trường cần cập nhật.
     * @returns {Promise<object|null>} Updated promotion object if successful, null otherwise.
     */
    async update(id, promotionData) {
        logger.debug(`Repo: Updating promotion ID ${id}:`, promotionData);
        try {
            const pool = await getConnection();
            const request = pool.request();

            // First check if the promotion exists
            const existingPromotion = await this.findById(id);
            if (!existingPromotion) {
                return null;
            }

            request.input('promotionId', sql.Int, id);

            // Add all the necessary inputs and build SET clause
            const setClauses = [];

            if (promotionData.Title !== undefined) {
                request.input('Title', sql.NVarChar(255), promotionData.Title);
                setClauses.push('Title = @Title');
            }

            if (promotionData.Promotion_Code !== undefined) {
                request.input('Promotion_Code', sql.NVarChar(50), promotionData.Promotion_Code);
                setClauses.push('Promotion_Code = @Promotion_Code');
            }

            if (promotionData.Start_Date !== undefined) {
                request.input('Start_Date', sql.DateTime, new Date(promotionData.Start_Date));
                setClauses.push('Start_Date = @Start_Date');
            }

            if (promotionData.End_Date !== undefined) {
                request.input('End_Date', sql.DateTime, new Date(promotionData.End_Date));
                setClauses.push('End_Date = @End_Date');
            }

            if (promotionData.Discount_Type !== undefined) {
                request.input('Discount_Type', sql.NVarChar(50), promotionData.Discount_Type);
                setClauses.push('Discount_Type = @Discount_Type');
            }

            if (promotionData.Discount_Value !== undefined) {
                request.input('Discount_Value', sql.Decimal(10, 2), promotionData.Discount_Value);
                setClauses.push('Discount_Value = @Discount_Value');
            }

            if (promotionData.Min_Purchase_Amount !== undefined) {
                request.input('Min_Purchase_Amount', sql.Decimal(10, 2), promotionData.Min_Purchase_Amount);
                setClauses.push('Min_Purchase_Amount = @Min_Purchase_Amount');
            }

            if (promotionData.Max_Discount_Amount !== undefined) {
                request.input('Max_Discount_Amount', sql.Decimal(10, 2), promotionData.Max_Discount_Amount);
                setClauses.push('Max_Discount_Amount = @Max_Discount_Amount');
            }

            if (promotionData.Usage_Limit_Total !== undefined) {
                request.input('Usage_Limit_Total', sql.Int, promotionData.Usage_Limit_Total);
                setClauses.push('Usage_Limit_Total = @Usage_Limit_Total');
            }

            if (promotionData.Usage_Limit_Per_User !== undefined) {
                request.input('Usage_Limit_Per_User', sql.Int, promotionData.Usage_Limit_Per_User);
                setClauses.push('Usage_Limit_Per_User = @Usage_Limit_Per_User');
            }

            if (promotionData.Is_Active !== undefined) {
                request.input('Is_Active', sql.Bit, promotionData.Is_Active ? 1 : 0);
                setClauses.push('Is_Active = @Is_Active');
            }

            if (promotionData.Description !== undefined) {
                request.input('Description', sql.NVarChar(sql.MAX), promotionData.Description);
                setClauses.push('Description = @Description');
            }

            if (promotionData.Status !== undefined) {
                request.input('Status', sql.NVarChar(50), promotionData.Status);
                setClauses.push('Status = @Status');
            }

            // Always update the Updated_At timestamp
            request.input('Updated_At', sql.DateTime, new Date());
            setClauses.push('Updated_At = @Updated_At');

            if (setClauses.length === 0) {
                return existingPromotion; // Nothing to update
            }

            const query = `
                UPDATE ${fullPromotionTableName}
                SET ${setClauses.join(', ')}
                OUTPUT INSERTED.*
                WHERE Promotion_ID = @promotionId;
            `;

            const result = await request.query(query);
            return result.recordset[0];
        } catch (error) {
            logger.error(`Repo: Error updating promotion ID ${id}:`, error);
            throw error;
        }
    }

    /**
     * Xóa khuyến mãi theo ID.
     * @param {number} id - ID của khuyến mãi cần xóa.
     * @returns {Promise<object>} Object with success status and additional info.
     * @description Cân nhắc việc xóa mềm (đặt Is_Active = false) thay vì xóa cứng để bảo toàn lịch sử.
     */
    async delete(id) {
        logger.debug(`Repo: Deleting promotion ID ${id}`);
        try {
            const pool = await getConnection();

            // First check if the promotion exists
            const existingPromotion = await this.findById(id);
            if (!existingPromotion) {
                return { success: false, message: 'Promotion not found' };
            }

            // Check if the promotion has been used
            const request = pool.request();
            const usageResult = await request
                .input('promotionId', sql.Int, id)
                .query(`
                    SELECT TOP 1 1 as HasUsed 
                    FROM ksf00691_team03.Promotion_Usage 
                    WHERE Promotion_ID = @promotionId AND HasUsed = 1
                `);

            const hasBeenUsed = usageResult.recordset.length > 0;

            // Update status based on usage
            const newStatus = hasBeenUsed ? PROMOTION_STATUS.INACTIVE : PROMOTION_STATUS.DELETED;

            await request
                .input('promotionId', sql.Int, id)
                .input('status', sql.NVarChar(50), newStatus)
                .input('updatedAt', sql.DateTime, new Date())
                .query(`
                    UPDATE ${fullPromotionTableName}
                    SET Status = @status, Updated_At = @updatedAt
                    WHERE Promotion_ID = @promotionId
                `);

            return {
                success: true,
                status: newStatus
            };
        } catch (error) {
            logger.error(`Repo: Error deleting promotion ID ${id}:`, error);
            throw error;
        }
    }

    /**
     * Tìm khuyến mãi theo mã (Promotion_Code).
     * @param {string} promotionCode - Mã khuyến mãi cần tìm.
     * @returns {Promise<object|null>} Đối tượng Promotion nếu tìm thấy, ngược lại null.
     */
    async findByCode(promotionCode, transaction) {
        logger.debug(`Repo: Finding promotion by code: ${promotionCode}`);
        try {
            const pool = await getConnection();
            const request = transaction ? transaction.request() : pool.request();
            const result = await request
                .input('promotionCode', sql.NVarChar, promotionCode)
                .query(`SELECT * FROM ${fullPromotionTableName} WHERE Promotion_Code = @promotionCode`);
            return result.recordset[0];
        } catch (error) {
            logger.error(`Repo: Error finding promotion by code ${promotionCode}:`, error);
            throw error;
        }
    }

    /**
     * Tìm các khuyến mãi đang hoạt động (Is_Active = true và ngày hiện tại nằm trong khoảng Start_Date và End_Date).
     * @returns {Promise<object[]>} Mảng các đối tượng Promotion đang hoạt động.
     */
    async findActivePromotions() {
        try {
            const pool = await getConnection();
            const currentDate = new Date(); // Lấy ngày giờ hiện tại
            const result = await pool.request()
                .input('CurrentDate', sql.DateTime, currentDate)
                .query(`
                    SELECT * FROM ${fullPromotionTableName} 
                    WHERE Is_Active = 1 
                      AND Start_Date <= @CurrentDate 
                      AND End_Date >= @CurrentDate
                    ORDER BY Start_Date DESC
                `);
            return result.recordset;
        } catch (error) {
            logger.error(`Repo: Error finding active promotions: ${error.message}`);
            throw error;
        }
    }

    async incrementUsage(promotionId, transaction) {
        logger.debug(`Repo: Incrementing usage for promotion ID: ${promotionId}`);
        try {
            const request = transaction.request(); // Must have transaction
            await request
                .input('promotionId', sql.Int, promotionId)
                .query(`UPDATE ${fullPromotionTableName} SET Current_Usage = Current_Usage + 1, Updated_At = GETDATE() WHERE Promotion_ID = @promotionId`);
            return true;
        } catch (error) {
            logger.error(`Repo: Error incrementing usage for promotion ${promotionId}:`, error);
            throw error;
        }
    }

    async decrementUsage(promotionId, transaction) {
        logger.debug(`Repo: Decrementing usage for promotion ID: ${promotionId}`);
        try {
            const request = transaction.request(); // Must have transaction
            await request
                .input('promotionId', sql.Int, promotionId)
                .query(`UPDATE ${fullPromotionTableName} SET Current_Usage = CASE WHEN Current_Usage > 0 THEN Current_Usage - 1 ELSE 0 END, Updated_At = GETDATE() WHERE Promotion_ID = @promotionId`);
            return true;
        } catch (error) {
            logger.error(`Repo: Error decrementing usage for promotion ${promotionId}:`, error);
            throw error;
        }
    }

    // Các hàm liên quan đến PromotionUsage
    async createUsage(usageData, transaction) {
        logger.debug('Repo: Creating promotion usage:', usageData);
        try {
            const request = transaction.request(); // Must have transaction
            await request
                .input('User_ID', sql.Int, usageData.User_ID)
                .input('Promotion_ID', sql.Int, usageData.Promotion_ID)
                .input('Booking_ID', sql.Int, usageData.Booking_ID)
                .input('Discount_Amount', sql.Decimal(18, 2), usageData.Discount_Amount)
                .input('Applied_Date', sql.DateTime, usageData.Applied_Date || new Date())
                .input('HasUsed', sql.Bit, usageData.HasUsed !== undefined ? (usageData.HasUsed ? 1 : 0) : 1)
                .query(`
                    INSERT INTO ksf00691_team03.Promotion_Usage
                        (User_ID, Promotion_ID, Booking_ID, Discount_Amount, Applied_Date, HasUsed)
                    VALUES
                        (@User_ID, @Promotion_ID, @Booking_ID, @Discount_Amount, @Applied_Date, @HasUsed)
                `);
            return true;
        } catch (error) {
            logger.error('Repo: Error creating promotion usage:', error);
            throw error;
        }
    }

    async findUsage(criteria, transaction) {
        logger.debug('Repo: Finding promotion usage with criteria:', criteria);
        try {
            const pool = await getConnection();
            const request = transaction ? transaction.request() : pool.request();

            let query = `SELECT * FROM ksf00691_team03.Promotion_Usage WHERE 1=1`;

            if (criteria.User_ID !== undefined) {
                request.input('User_ID', sql.Int, criteria.User_ID);
                query += ` AND User_ID = @User_ID`;
            }

            if (criteria.Promotion_ID !== undefined) {
                request.input('Promotion_ID', sql.Int, criteria.Promotion_ID);
                query += ` AND Promotion_ID = @Promotion_ID`;
            }

            if (criteria.Booking_ID !== undefined) {
                request.input('Booking_ID', sql.Int, criteria.Booking_ID);
                query += ` AND Booking_ID = @Booking_ID`;
            }

            if (criteria.HasUsed !== undefined) {
                request.input('HasUsed', sql.Bit, criteria.HasUsed ? 1 : 0);
                query += ` AND HasUsed = @HasUsed`;
            }

            const result = await request.query(query);
            return result.recordset;
        } catch (error) {
            logger.error('Repo: Error finding promotion usage:', error);
            throw error;
        }
    }

    async findUsageByBookingId(bookingId) {
        logger.debug(`Repo: Finding promotion usage by booking ID: ${bookingId}`);
        try {
            return await this.findUsage({ Booking_ID: bookingId });
        } catch (error) {
            logger.error(`Repo: Error finding promotion usage by booking ID ${bookingId}:`, error);
            throw error;
        }
    }

    async findActiveUsagesByUserForActivePromotions(userId, excludeBookingId = null) {
        logger.debug(`Repo: Finding active usages for user ID: ${userId}, excluding booking ID: ${excludeBookingId}`);
        try {
            const pool = await getConnection();
            const request = pool.request();
            request.input('userId', sql.Int, userId);
            request.input('currentDate', sql.DateTime, new Date());

            let query = `
                SELECT pu.*, p.*
                FROM ksf00691_team03.Promotion_Usage pu
                JOIN ${fullPromotionTableName} p ON pu.Promotion_ID = p.Promotion_ID
                WHERE pu.User_ID = @userId
                AND pu.HasUsed = 1
                AND p.Is_Active = 1
                AND p.Start_Date <= @currentDate
                AND p.End_Date >= @currentDate
            `;

            if (excludeBookingId) {
                request.input('excludeBookingId', sql.Int, excludeBookingId);
                query += ` AND (pu.Booking_ID IS NULL OR pu.Booking_ID <> @excludeBookingId)`;
            }

            const result = await request.query(query);

            // Transform the results to combine promotion and usage data
            return result.recordset.map(record => {
                const usage = {
                    Usage_ID: record.Usage_ID,
                    User_ID: record.User_ID,
                    Promotion_ID: record.Promotion_ID,
                    Booking_ID: record.Booking_ID,
                    Discount_Amount: record.Discount_Amount,
                    Applied_Date: record.Applied_Date,
                    HasUsed: record.HasUsed === 1,
                    Promotion: {
                        Promotion_ID: record.Promotion_ID,
                        Title: record.Title,
                        Promotion_Code: record.Promotion_Code,
                        Start_Date: record.Start_Date,
                        End_Date: record.End_Date,
                        Discount_Type: record.Discount_Type,
                        Discount_Value: record.Discount_Value,
                        Min_Purchase_Amount: record.Min_Purchase_Amount,
                        Max_Discount_Amount: record.Max_Discount_Amount,
                        Usage_Limit_Total: record.Usage_Limit_Total,
                        Usage_Limit_Per_User: record.Usage_Limit_Per_User,
                        Current_Usage: record.Current_Usage,
                        Is_Active: record.Is_Active === 1,
                        Status: record.Status,
                        Description: record.Description
                    }
                };

                return usage;
            });
        } catch (error) {
            logger.error(`Repo: Error finding active usages for user ${userId}:`, error);
            throw error;
        }
    }

    async removeUsageById(usageId, transaction) {
        logger.debug(`Repo: Removing promotion usage by ID: ${usageId}`);
        try {
            const request = transaction.request(); // Must have transaction
            await request
                .input('usageId', sql.Int, usageId)
                .query(`DELETE FROM ksf00691_team03.Promotion_Usage WHERE Usage_ID = @usageId`);
            return true;
        } catch (error) {
            logger.error(`Repo: Error removing promotion usage by ID ${usageId}:`, error);
            throw error;
        }
    }

    async removeUsageByBookingId(bookingId, transaction) {
        logger.debug(`Repo: Removing promotion usage by booking ID: ${bookingId}`);
        try {
            const request = transaction.request(); // Must have transaction
            await request
                .input('bookingId', sql.Int, bookingId)
                .query(`DELETE FROM ksf00691_team03.Promotion_Usage WHERE Booking_ID = @bookingId`);
            return true;
        } catch (error) {
            logger.error(`Repo: Error removing promotion usage by booking ID ${bookingId}:`, error);
            throw error;
        }
    }
}

module.exports = PromotionRepository; 