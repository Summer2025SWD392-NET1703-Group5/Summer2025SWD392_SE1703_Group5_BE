'use strict';

const CinemaRepository = require('../repositories/CinemaRepository');
const CinemaRoomRepository = require('../repositories/CinemaRoomRepository');
const logger = require('../utils/logger');
const { User, TicketBooking, Showtime, CinemaRoom, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * Service xử lý logic nghiệp vụ liên quan đến rạp phim.
 * Chứa các phương thức để thao tác với dữ liệu rạp phim, phòng chiếu, và các logic liên quan.
 */
class CinemaService {
    /**
     * Tạo một rạp phim mới.
     * @param {Object} cinemaData - Thông tin rạp phim từ request body.
     * @returns {Promise<Object>} - Kết quả sau khi tạo rạp phim, bao gồm cả dữ liệu rạp phim mới.
     */
    async createCinema(cinemaData) {
        logger.info('[CinemaService] Bắt đầu xử lý tạo rạp phim mới với dữ liệu:', cinemaData);
        try {
            // Loại bỏ Cinema_ID nếu người dùng vô tình gửi lên, vì ID này sẽ do database tự động tạo.
            const { Cinema_ID, ...validCinemaData } = cinemaData;

            // Gán trạng thái mặc định là 'Active' nếu không được cung cấp.
            if (!validCinemaData.Status) {
                validCinemaData.Status = 'Active';
                logger.info(`[CinemaService] Trạng thái không được cung cấp, gán mặc định là 'Active'.`);
            }

            // Kiểm tra xem đã tồn tại rạp phim nào khác ở cùng địa chỉ và thành phố chưa.
            logger.info(`[CinemaService] Kiểm tra sự tồn tại của rạp tại địa chỉ: "${validCinemaData.Address}", thành phố: ${validCinemaData.City}`);
            const existingCinemas = await CinemaRepository.getCinemasByCity(validCinemaData.City);
            const duplicateCinema = existingCinemas.find(cinema =>
                cinema.Address.toLowerCase() === validCinemaData.Address.toLowerCase()
            );

            if (duplicateCinema) {
                logger.warn(`[CinemaService] Phát hiện rạp phim đã tồn tại tại địa chỉ này.`);
                throw new Error(`Đã tồn tại rạp phim tại địa chỉ "${validCinemaData.Address}" ở thành phố ${validCinemaData.City}`);
            }

            // Xóa trường Phone_Number và Email nếu có, vì sẽ được cập nhật khi gán Manager
            if (validCinemaData.Phone_Number) {
                delete validCinemaData.Phone_Number;
                logger.info('[CinemaService] Đã xóa trường Phone_Number, sẽ được cập nhật khi gán Manager');
            }

            if (validCinemaData.Email) {
                delete validCinemaData.Email;
                logger.info('[CinemaService] Đã xóa trường Email, sẽ được cập nhật khi gán Manager');
            }

            // Tiến hành tạo rạp phim trong database.
            logger.info('[CinemaService] Gọi CinemaRepository để tạo rạp phim.');
            const newCinema = await CinemaRepository.create(validCinemaData);
            if (!newCinema) {
                throw new Error('Không thể tạo rạp phim do lỗi từ repository.');
            }
            logger.info(`[CinemaService] Tạo rạp phim thành công với ID: ${newCinema.Cinema_ID}`);

            return {
                success: true,
                message: 'Tạo rạp phim thành công',
                data: newCinema
            };
        } catch (error) {
            logger.error(`[CinemaService] Lỗi trong quá trình tạo rạp phim: ${error.message}`, { stack: error.stack });
            throw error;
        }
    }

    /**
     * Lấy thông tin chi tiết của một rạp phim theo ID, bao gồm cả danh sách các phòng chiếu.
     * @param {number} cinemaId - ID của rạp phim.
     * @returns {Promise<Object>} - Thông tin chi tiết của rạp phim.
     */
    async getCinemaById(cinemaId) {
        logger.info(`[CinemaService] Bắt đầu lấy thông tin rạp phim với ID: ${cinemaId}`);
        try {
            // Lấy thông tin cơ bản của rạp.
            const cinema = await CinemaRepository.findById(cinemaId);
            if (!cinema) {
                logger.warn(`[CinemaService] Không tìm thấy rạp phim với ID: ${cinemaId}`);
                throw new Error('Không tìm thấy rạp phim');
            }
            logger.info(`[CinemaService] Tìm thấy thông tin rạp: ${cinema.Cinema_Name}`);

            // Lấy thêm danh sách các phòng chiếu thuộc rạp này.
            logger.info(`[CinemaService] Lấy danh sách phòng chiếu cho rạp ID: ${cinemaId}`);
            const rooms = await CinemaRepository.getRoomsByCinemaId(cinemaId);
            logger.info(`[CinemaService] Tìm thấy ${rooms ? rooms.length : 0} phòng chiếu.`);

            // Chuyển đổi cinema và rooms thành plain object để tránh circular reference
            const plainCinema = cinema && typeof cinema.toJSON === 'function'
                ? cinema.toJSON()
                : JSON.parse(JSON.stringify(cinema));

            const plainRooms = rooms && rooms.length > 0
                ? rooms.map(room => typeof room.toJSON === 'function' ? room.toJSON() : JSON.parse(JSON.stringify(room)))
                : [];

            // Kết hợp thông tin rạp và phòng chiếu để trả về.
            return {
                success: true,
                data: {
                    ...plainCinema, // Dữ liệu của rạp phim
                    rooms: plainRooms // Danh sách phòng chiếu
                }
            };
        } catch (error) {
            logger.error(`[CinemaService] Lỗi khi lấy thông tin rạp phim ID ${cinemaId}: ${error.message}`, { stack: error.stack });
            throw error;
        }
    }

    /**
     * Lấy danh sách tất cả các rạp phim trong hệ thống (Active, Inactive - không bao gồm rạp đã xóa mềm).
     * @returns {Promise<Object>} - Danh sách tất cả rạp phim.
     */
    async getAllCinemas() {
        logger.info('[CinemaService] Bắt đầu lấy danh sách tất cả rạp phim (không bao gồm rạp đã xóa).');
        try {
            const cinemas = await CinemaRepository.getAll();
            logger.info(`[CinemaService] Lấy thành công ${cinemas ? cinemas.length : 0} rạp phim (Active + Inactive).`);
            return {
                success: true,
                data: cinemas || []
            };
        } catch (error) {
            logger.error(`[CinemaService] Lỗi khi lấy tất cả rạp phim: ${error.message}`, { stack: error.stack });
            throw error;
        }
    }

    /**
     * Lấy danh sách các rạp phim đang ở trạng thái hoạt động.
     * @returns {Promise<Object>} - Danh sách rạp phim đang hoạt động.
     */
    async getActiveCinemas() {
        logger.info('[CinemaService] Bắt đầu lấy danh sách các rạp phim đang hoạt động.');
        try {
            const cinemas = await CinemaRepository.getActiveCinemas();
            logger.info(`[CinemaService] Lấy thành công ${cinemas ? cinemas.length : 0} rạp phim đang hoạt động.`);
            return {
                success: true,
                data: cinemas || []
            };
        } catch (error) {
            logger.error(`[CinemaService] Lỗi khi lấy các rạp phim đang hoạt động: ${error.message}`, { stack: error.stack });
            throw error;
        }
    }

    /**
     * Cập nhật thông tin của một rạp phim.
     * @param {number} cinemaId - ID của rạp phim cần cập nhật.
     * @param {Object} updateData - Dữ liệu cần cập nhật.
     * @param {Object} user - Thông tin người dùng đang thực hiện (từ authMiddleware).
     * @returns {Promise<Object>} - Kết quả cập nhật.
     */
    async updateCinema(cinemaId, updateData, user) {
        logger.info(`[CinemaService] Bắt đầu cập nhật rạp phim ID: ${cinemaId} bởi người dùng ${user.email}`, { data: updateData });
        const transaction = await sequelize.transaction();
        try {
            // Lấy thông tin rạp phim hiện tại để so sánh.
            const cinema = await CinemaRepository.findById(cinemaId);
            if (!cinema) {
                logger.warn(`[CinemaService] Không tìm thấy rạp phim ID: ${cinemaId} để cập nhật.`);
                throw new Error('Không tìm thấy rạp phim');
            }

            // ✅ SECURITY FIX: Kiểm tra active bookings trước khi cho phép cập nhật thông tin quan trọng
            const criticalFields = ['Cinema_Name', 'Address', 'Phone_Number', 'Status', 'Manager_ID'];
            const hasCriticalChanges = criticalFields.some(field =>
                updateData[field] !== undefined && updateData[field] !== cinema[field]
            );

            if (hasCriticalChanges) {
                logger.info(`[CinemaService] Phát hiện thay đổi thông tin quan trọng cho rạp ID ${cinemaId}, kiểm tra active bookings...`);

                // Kiểm tra active bookings trong tất cả phòng chiếu của rạp
                const activeBookingsInCinema = await TicketBooking.count({
                    include: [{
                        model: Showtime,
                        as: 'Showtime',
                        include: [{
                            model: CinemaRoom,
                            as: 'CinemaRoom',
                            where: { Cinema_ID: cinemaId },
                            required: true
                        }],
                        required: true
                    }],
                    where: {
                        Status: { [Op.in]: ['Pending', 'Confirmed'] }
                    }
                });

                if (activeBookingsInCinema > 0) {
                    const errorMsg = `Không thể cập nhật thông tin rạp quan trọng vì có ${activeBookingsInCinema} booking đang hoạt động trong các phòng chiếu. ` +
                                   `Vui lòng chờ khách hàng hoàn thành hoặc hủy các booking trước khi cập nhật.`;
                    logger.warn(`[CinemaService] ${errorMsg}`);
                    throw new Error(errorMsg);
                }

                logger.info(`[CinemaService] An toàn để cập nhật - không có active bookings`);
            }

            // Nếu người dùng cập nhật tên rạp, kiểm tra xem tên mới có bị trùng không.
            if (updateData.Cinema_Name && updateData.Cinema_Name !== cinema.Cinema_Name) {
                logger.info(`[CinemaService] Phát hiện thay đổi tên rạp, kiểm tra trùng lặp.`);
                const allCinemas = await CinemaRepository.getAll();
                const existingCinema = allCinemas.find(c =>
                    c.Cinema_ID !== cinemaId &&
                    c.Cinema_Name.toLowerCase() === updateData.Cinema_Name.toLowerCase()
                );

                if (existingCinema) {
                    logger.warn(`[CinemaService] Tên rạp phim "${updateData.Cinema_Name}" đã tồn tại.`);
                    throw new Error(`Tên rạp phim "${updateData.Cinema_Name}" đã tồn tại. Vui lòng chọn tên khác.`);
                }
            }

            // Xử lý logic phức tạp khi email quản lý bị thay đổi.
            if (updateData.Email && updateData.Email.toLowerCase() !== cinema.Email.toLowerCase()) {
                logger.info(`[CinemaService] Phát hiện thay đổi email cho rạp ${cinemaId}. Bắt đầu quy trình phân công lại quản lý.`);

                // Chỉ Admin mới có quyền thay đổi email (tương đương thay đổi quản lý).
                if (user.role !== 'Admin') {
                    throw new Error('Chỉ Admin có quyền thay đổi email và quản lý của rạp phim.');
                }

                // Tìm quản lý mới theo email.
                const newManager = await User.findOne({ where: { Email: updateData.Email, Role: 'Manager' } });
                if (!newManager) {
                    throw new Error(`Email "${updateData.Email}" không thuộc về tài khoản quản lý nào.`);
                }
                if (newManager.Cinema_ID && newManager.Cinema_ID !== cinemaId) {
                    throw new Error(`Quản lý với email "${updateData.Email}" đã được phân công cho một rạp phim khác.`);
                }

                // Hủy phân công của quản lý cũ (nếu có).
                const oldManager = await User.findOne({ where: { Cinema_ID: cinemaId, Role: 'Manager' } });
                if (oldManager && oldManager.User_ID !== newManager.User_ID) {
                    await oldManager.update({ Cinema_ID: null }, { transaction });
                    logger.info(`[CinemaService] Đã hủy phân công quản lý cũ (${oldManager.Email}) khỏi rạp ${cinemaId}.`);
                }

                // Phân công quản lý mới và tự động cập nhật SĐT của rạp theo SĐT của quản lý.
                await newManager.update({ Cinema_ID: cinemaId }, { transaction });
                updateData.Phone_Number = newManager.Phone_Number;
                logger.info(`[CinemaService] Đã phân công quản lý mới (${newManager.Email}) và đồng bộ SĐT cho rạp ${cinemaId}.`);
            } else {
                // Nếu email không đổi, kiểm tra các trường khác.
                const assignedManager = await User.findOne({ where: { Cinema_ID: cinemaId, Role: 'Manager' } });
                if (assignedManager) {
                    if (updateData.Phone_Number && updateData.Phone_Number !== assignedManager.Phone_Number && user.role !== 'Admin') {
                        throw new Error(`Số điện thoại của rạp phải trùng với số của quản lý đã được phân công (${assignedManager.Phone_Number}). Vui lòng liên hệ Admin để thay đổi.`);
                    }
                }
            }

            // Thực hiện cập nhật trong một transaction để đảm bảo toàn vẹn dữ liệu.
            const [updatedRows] = await CinemaRepository.updateInTransaction(cinemaId, updateData, transaction);

            if (updatedRows === 0) {
                logger.warn(`[CinemaService] Không có hàng nào được cập nhật cho rạp phim ID: ${cinemaId}. Dữ liệu có thể không thay đổi.`);
            }

            // Nếu mọi thứ thành công, commit transaction.
            await transaction.commit();
            logger.info(`[CinemaService] Cập nhật rạp phim ID: ${cinemaId} thành công.`);
            const updatedCinema = await CinemaRepository.findById(cinemaId);

            return {
                success: true,
                message: 'Cập nhật rạp phim thành công',
                data: updatedCinema
            };
        } catch (error) {
            // Nếu có lỗi, rollback transaction để hoàn tác mọi thay đổi.
            if (transaction && !transaction.finished) {
                await transaction.rollback();
                logger.info(`[CinemaService] Transaction đã được rollback do lỗi.`);
            }
            logger.error(`[CinemaService] Lỗi khi cập nhật rạp phim ID ${cinemaId}: ${error.message}`, { stack: error.stack });
            throw error;
        }
    }

    /**
     * Xóa một rạp phim (xóa mềm bằng cách cập nhật trạng thái thành 'Deleted').
     * ✅ SECURITY ENHANCED - Kiểm tra manager/staff và active bookings trước khi xóa
     * @param {number} cinemaId - ID của rạp phim cần xóa.
     * @returns {Promise<Object>} - Kết quả xóa.
     */
    async deleteCinema(cinemaId) {
        logger.info(`[CinemaService] Bắt đầu xử lý xóa mềm rạp phim ID: ${cinemaId}`);
        try {
            // Kiểm tra rạp phim có tồn tại không.
            const cinema = await CinemaRepository.findById(cinemaId);
            if (!cinema) {
                logger.warn(`[CinemaService] Không tìm thấy rạp phim ID: ${cinemaId} để xóa.`);
                throw new Error('Không tìm thấy rạp phim');
            }

            // Kiểm tra rạp đã bị xóa mềm chưa
            if (cinema.Status === 'Deleted') {
                logger.warn(`[CinemaService] Rạp phim ID: ${cinemaId} đã được xóa trước đó.`);
                throw new Error('Rạp phim đã được xóa');
            }

            // ✅ KIỂM TRA MANAGER VÀ STAFF TRONG RẠP
            const { User } = require('../models');
            const managersAndStaff = await User.findAll({
                where: {
                    Cinema_ID: cinemaId,
                    Role: { [Op.in]: ['Manager', 'Staff'] },
                    Account_Status: { [Op.ne]: 'Deleted' }
                },
                attributes: ['User_ID', 'Full_Name', 'Role']
            });

            if (managersAndStaff && managersAndStaff.length > 0) {
                const staffList = managersAndStaff.map(user => `${user.Full_Name} (${user.Role})`).join(', ');
                const errorMsg = `Không thể xóa rạp vì còn có ${managersAndStaff.length} nhân viên đang được phân công: ${staffList}. ` +
                               `Vui lòng hủy phân công tất cả manager và staff trước khi xóa rạp.`;
                logger.warn(`[CinemaService] ${errorMsg}`);
                throw new Error(errorMsg);
            }

            // ✅ SECURITY FIX: Kiểm tra active bookings trong TẤT CẢ rooms của cinema trước
            const { TicketBooking, Showtime, CinemaRoom } = require('../models');
            const { Op } = require('sequelize');
            
            logger.info(`[CinemaService] Kiểm tra active bookings trong rạp ID: ${cinemaId}`);

            const activeBookingsInCinema = await TicketBooking.count({
                include: [{
                    model: Showtime,
                    as: 'Showtime',
                    include: [{
                        model: CinemaRoom,
                        as: 'CinemaRoom',
                        where: { Cinema_ID: cinemaId },
                        required: true
                    }],
                    required: true
                }],
                where: { Status: { [Op.in]: ['Pending', 'Confirmed'] } }
            });

            if (activeBookingsInCinema > 0) {
                const errorMsg = `Không thể xóa rạp vì có ${activeBookingsInCinema} booking đang hoạt động trong các phòng chiếu. ` +
                               `Vui lòng chờ khách hàng hoàn thành hoặc hủy các booking trước khi xóa rạp.`;
                logger.warn(`[CinemaService] ${errorMsg}`);
                throw new Error(errorMsg);
            }

            // Kiểm tra không còn phòng chiếu liên kết sau khi đã kiểm tra bookings
            const rooms = await CinemaRepository.getRoomsByCinemaId(cinemaId);
            if (rooms && rooms.length > 0) {
                logger.warn(`[CinemaService] Cố gắng xóa rạp ID ${cinemaId} nhưng vẫn còn ${rooms.length} phòng chiếu.`);
                throw new Error('Không thể xóa rạp phim có phòng chiếu. Vui lòng xóa phòng chiếu trước.');
            }

            // Thực hiện xóa mềm: Cập nhật trạng thái thành 'Deleted'.
            logger.info(`[CinemaService] Thực hiện xóa mềm cho rạp ID: ${cinemaId} - ${cinema.Cinema_Name}`);
            const updated = await CinemaRepository.update(cinemaId, {
                Status: 'Deleted',
                Updated_At: new Date()
            });
            if (!updated) {
                throw new Error('Xóa mềm rạp phim thất bại ở tầng repository.');
            }

            logger.info(`[CinemaService] Đã xóa mềm rạp phim thành công: ${cinema.Cinema_Name} (ID: ${cinemaId})`);
            return {
                success: true,
                message: `Đã xóa mềm rạp phim "${cinema.Cinema_Name}" thành công`,
                data: {
                    Cinema_ID: cinemaId,
                    Cinema_Name: cinema.Cinema_Name,
                    Previous_Status: cinema.Status,
                    New_Status: 'Deleted'
                }
            };
        } catch (error) {
            logger.error(`[CinemaService] Lỗi khi xóa mềm rạp phim ID ${cinemaId}: ${error.message}`, { stack: error.stack });
            throw error;
        }
    }

    /**
     * Lấy danh sách các rạp phim theo tên thành phố.
     * @param {string} city - Tên thành phố.
     * @returns {Promise<Object>} - Danh sách rạp phim trong thành phố.
     */
    async getCinemasByCity(city) {
        logger.info(`[CinemaService] Bắt đầu lấy rạp phim theo thành phố: "${city}"`);
        try {
            // Validate đầu vào cơ bản.
            if (!city) {
                throw new Error('Thành phố không được để trống');
            }
            if (city === '0' || /^\d+$/.test(city)) {
                throw new Error('Tên thành phố không hợp lệ');
            }
            if (city.length < 2) {
                throw new Error('Tên thành phố phải có ít nhất 2 ký tự');
            }

            const cinemas = await CinemaRepository.getCinemasByCity(city);
            logger.info(`[CinemaService] Tìm thấy ${cinemas ? cinemas.length : 0} rạp phim ở thành phố ${city}.`);
            return {
                success: true,
                data: cinemas || []
            };
        } catch (error) {
            logger.error(`[CinemaService] Lỗi khi lấy rạp phim theo thành phố ${city}: ${error.message}`, { stack: error.stack });
            throw error;
        }
    }

    /**
     * Lấy danh sách tất cả các thành phố có rạp chiếu.
     * @returns {Promise<Object>} - Danh sách các thành phố (duy nhất).
     */
    async getAllCities() {
        logger.info('[CinemaService] Bắt đầu lấy danh sách tất cả các thành phố.');
        try {
            const cities = await CinemaRepository.getAllCities();
            logger.info(`[CinemaService] Lấy thành công ${cities ? cities.length : 0} thành phố.`);
            return {
                success: true,
                data: cities || []
            };
        } catch (error) {
            logger.error(`[CinemaService] Lỗi khi lấy danh sách thành phố: ${error.message}`, { stack: error.stack });
            throw error;
        }
    }

    /**
     * Tạo một phòng chiếu mới cho một rạp phim cụ thể.
     * @param {number} cinemaId - ID của rạp phim cha.
     * @param {Object} roomData - Dữ liệu của phòng chiếu mới.
     * @returns {Promise<Object>} - Kết quả tạo phòng chiếu.
     */
    async createCinemaRoom(cinemaId, roomData) {
        logger.info(`[CinemaService] Bắt đầu tạo phòng chiếu cho rạp ID: ${cinemaId}`, { data: roomData });
        try {
            // Đảm bảo rạp phim cha tồn tại.
            const cinema = await CinemaRepository.findById(cinemaId);
            if (!cinema) {
                logger.warn(`[CinemaService] Không tìm thấy rạp phim ID: ${cinemaId} để tạo phòng chiếu.`);
                throw new Error('Không tìm thấy rạp phim');
            }

            // Dọn dẹp và chuẩn bị dữ liệu phòng chiếu.
            const { Cinema_ID, ...cleanRoomData } = roomData;
            const newRoomData = {
                RoomName: roomData.RoomName || roomData.Room_Name,
                Capacity: roomData.Capacity || roomData.Seat_Quantity,
                Status: roomData.Status || 'Available',
                RoomType: roomData.RoomType || roomData.Room_Type || '2D',
                Description: roomData.Description || roomData.Notes || '',
                Cinema_ID: cinemaId
            };

            // Sử dụng cinemaRoomService thay vì gọi trực tiếp repository
            const cinemaRoomService = require('./cinemaRoomService');
            logger.info('[CinemaService] Gọi cinemaRoomService để tạo phòng chiếu với kiểm tra trùng lặp.');

            try {
                const room = await cinemaRoomService.createCinemaRoom(newRoomData);
                logger.info(`[CinemaService] Tạo phòng chiếu thành công với ID: ${room.Cinema_Room_ID}`);

                return {
                    success: true,
                    message: 'Tạo phòng chiếu thành công',
                    data: room
                };
            } catch (error) {
                // Nếu lỗi từ cinemaRoomService, trả về lỗi đó
                logger.error(`[CinemaService] Lỗi từ cinemaRoomService: ${error.message}`);
                throw error;
            }
        } catch (error) {
            logger.error(`[CinemaService] Lỗi khi tạo phòng chiếu cho rạp ID ${cinemaId}: ${error.message}`, { stack: error.stack });
            throw error;
        }
    }

    /**
     * Lấy danh sách các phòng chiếu của một rạp phim.
     * @param {number} cinemaId - ID của rạp phim.
     * @returns {Promise<Object>} - Danh sách các phòng chiếu.
     */
    async getCinemaRooms(cinemaId) {
        logger.info(`[CinemaService] Bắt đầu lấy danh sách phòng chiếu cho rạp ID: ${cinemaId}`);
        try {
            const cinema = await CinemaRepository.findById(cinemaId);
            if (!cinema) {
                logger.warn(`[CinemaService] Không tìm thấy rạp phim ID: ${cinemaId} khi lấy phòng chiếu.`);
                return { success: false, message: 'Không tìm thấy rạp phim' };
            }

            const rooms = await CinemaRepository.getRoomsByCinemaId(cinemaId);
            logger.info(`[CinemaService] Tìm thấy ${rooms ? rooms.length : 0} phòng chiếu cho rạp ID ${cinemaId}.`);
            return {
                success: true,
                data: rooms
            };
        } catch (error) {
            logger.error(`[CinemaService] Lỗi khi lấy phòng chiếu cho rạp ID ${cinemaId}: ${error.message}`, { stack: error.stack });
            throw error;
        }
    }

    /**
     * Lấy thông tin rạp phim mà một quản lý đang quản lý.
     * @param {number} userId - ID của người dùng (quản lý).
     * @returns {Promise<Object>} - Thông tin chi tiết của rạp phim bao gồm cả phòng chiếu.
     */
    async getManagerCinema(userId) {
        logger.info(`[CinemaService] Bắt đầu lấy thông tin rạp của quản lý với User ID: ${userId}`);
        try {
            // Tìm người dùng và kiểm tra vai trò.
            const manager = await User.findByPk(userId);
            if (!manager || manager.Role !== 'Manager' || !manager.Cinema_ID) {
                logger.warn(`[CinemaService] User ID ${userId} không phải là quản lý hoặc chưa được phân công rạp.`);
                return {
                    success: false,
                    message: 'Người dùng không phải là quản lý hoặc chưa được phân công cho rạp phim nào.',
                    data: null
                };
            }
            logger.info(`[CinemaService] Quản lý ${manager.Email} đang quản lý rạp ID: ${manager.Cinema_ID}`);

            // Lấy thông tin rạp phim.
            const cinema = await CinemaRepository.findById(manager.Cinema_ID);
            if (!cinema) {
                logger.warn(`[CinemaService] Không tìm thấy rạp phim được phân công với ID: ${manager.Cinema_ID}`);
                return {
                    success: false,
                    message: 'Không tìm thấy rạp phim được phân công cho quản lý này.',
                    data: null
                };
            }

            // Lấy danh sách phòng chiếu của rạp đó.
            const rooms = await CinemaRepository.getRoomsByCinemaId(manager.Cinema_ID);
            logger.info(`[CinemaService] Tìm thấy ${rooms ? rooms.length : 0} phòng chiếu cho rạp của quản lý.`);

            // Kết hợp dữ liệu và chuyển đổi thành đối tượng thuần túy để tránh lỗi JSON.
            const cinemaData = cinema.get({ plain: true });
            cinemaData.rooms = rooms; // rooms đã là plain objects từ repository

            return {
                success: true,
                message: 'Lấy thông tin rạp phim của quản lý thành công.',
                data: cinemaData
            };
        } catch (error) {
            logger.error(`[CinemaService] Lỗi khi lấy rạp phim của quản lý ID ${userId}: ${error.message}`, { stack: error.stack });
            throw error;
        }
    }

    /**
     * Lấy danh sách suất chiếu của một rạp phim trong một ngày cụ thể.
     * @param {number} cinemaId - ID của rạp phim.
     * @param {string} date - Ngày cần lấy suất chiếu (định dạng YYYY-MM-DD).
     * @returns {Promise<Object>} - Danh sách các phim và suất chiếu tương ứng.
     */
    async getCinemaShowtimes(cinemaId, date) {
        logger.info(`[CinemaService] Bắt đầu lấy lịch chiếu cho rạp ID: ${cinemaId}, ngày: ${date}`);
        try {
            // Kiểm tra sự tồn tại của rạp.
            const cinema = await CinemaRepository.findById(cinemaId);
            if (!cinema) {
                throw new Error('Không tìm thấy rạp phim');
            }

            // Chuẩn hóa và kiểm tra ngày truy vấn.
            let queryDate = date || new Date().toISOString().split('T')[0];
            const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateFormatRegex.test(queryDate) || isNaN(new Date(queryDate).getTime())) {
                throw new Error('Định dạng ngày không hợp lệ. Sử dụng YYYY-MM-DD.');
            }
            logger.info(`[CinemaService] Truy vấn lịch chiếu cho ngày: ${queryDate}`);

            // Lấy ID các phòng chiếu của rạp.
            const rooms = await CinemaRepository.getRoomsByCinemaId(cinemaId);
            if (!rooms || rooms.length === 0) {
                logger.info(`[CinemaService] Rạp ID ${cinemaId} không có phòng chiếu nào, trả về kết quả rỗng.`);
                return {
                    success: true,
                    data: { cinema_id: cinemaId, cinema_name: cinema.Cinema_Name, date: queryDate, movies: [] }
                };
            }
            const roomIds = rooms.map(room => room.Cinema_Room_ID);

            // Sử dụng model để truy vấn suất chiếu.
            const { Showtime, Movie, CinemaRoom } = require('../models');
            const { Op } = require('sequelize');

            const showtimes = await Showtime.findAll({
                where: {
                    Cinema_Room_ID: { [Op.in]: roomIds },
                    Show_Date: queryDate,
                    Status: 'Scheduled'
                },
                include: [
                    { model: Movie, as: 'Movie', attributes: ['Movie_ID', 'Movie_Name', 'Duration', 'Poster_URL', 'Rating'] },
                    { model: CinemaRoom, as: 'CinemaRoom', attributes: ['Cinema_Room_ID', 'Room_Name', 'Room_Type'] }
                ],
                order: [['Start_Time', 'ASC']]
            });
            logger.info(`[CinemaService] Tìm thấy ${showtimes.length} suất chiếu.`);

            // Nhóm các suất chiếu theo từng bộ phim.
            const movieShowtimes = showtimes.reduce((acc, showtime) => {
                const movieId = showtime.Movie.Movie_ID;
                if (!acc[movieId]) {
                    acc[movieId] = {
                        movie_id: movieId,
                        movie_name: showtime.Movie.Movie_Name,
                        duration: showtime.Movie.Duration,
                        poster_url: showtime.Movie.Poster_URL,
                        rating: showtime.Movie.Rating,
                        showtimes: []
                    };
                }
                
                // ✅ FIX TIMEZONE: Function để format thời gian từ SQL Server TIME type về HH:MM
                const formatTime = (timeValue) => {
                    if (!timeValue) return null;
                    
                    // ✅ FIX: Nếu là Date object từ Sequelize - sử dụng UTC methods
                    if (timeValue instanceof Date) {
                        const hours = timeValue.getUTCHours().toString().padStart(2, '0');
                        const minutes = timeValue.getUTCMinutes().toString().padStart(2, '0');
                        return `${hours}:${minutes}`;
                    }
                    
                    // Nếu là ISO string
                    if (typeof timeValue === 'string' && timeValue.includes('T')) {
                        const date = new Date(timeValue);
                        const hours = date.getUTCHours().toString().padStart(2, '0');
                        const minutes = date.getUTCMinutes().toString().padStart(2, '0');
                        return `${hours}:${minutes}`;
                    }
                    
                    // Nếu là chuỗi HH:MM:SS hoặc HH:MM
                    if (typeof timeValue === 'string' && /^\d{1,2}:\d{2}/.test(timeValue)) {
                        return timeValue.substring(0, 5);
                    }
                    
                    // SQL Server TIME object từ raw SQL
                    if (typeof timeValue === 'object' && timeValue.hours !== undefined) {
                        const hours = String(timeValue.hours).padStart(2, '0');
                        const minutes = String(timeValue.minutes).padStart(2, '0');
                        return `${hours}:${minutes}`;
                    }
                    
                    return timeValue;
                };
                
                acc[movieId].showtimes.push({
                    showtime_id: showtime.Showtime_ID,
                    start_time: formatTime(showtime.Start_Time),
                    end_time: formatTime(showtime.End_Time),
                    room_id: showtime.Cinema_Room_ID,
                    room_name: showtime.CinemaRoom.Room_Name,
                    room_type: showtime.CinemaRoom.Room_Type,
                    capacity_available: showtime.Capacity_Available
                });
                return acc;
            }, {});

            return {
                success: true,
                data: {
                    cinema_id: cinemaId,
                    cinema_name: cinema.Cinema_Name,
                    date: queryDate,
                    movies: Object.values(movieShowtimes)
                }
            };
        } catch (error) {
            logger.error(`[CinemaService] Lỗi khi lấy lịch chiếu: ${error.message}`, { stack: error.stack });
            throw error;
        }
    }

    /**
     * Lấy thông tin chi tiết tổng hợp của một rạp chiếu phim.
     * @param {number} cinemaId - ID của rạp phim.
     * @returns {Promise<Object>} - Dữ liệu chi tiết và thống kê của rạp.
     */
    async getCinemaDetails(cinemaId) {
        logger.info(`[CinemaService] Bắt đầu lấy thông tin chi tiết tổng hợp cho rạp ID: ${cinemaId}`);
        try {
            // Lấy thông tin cơ bản của rạp và các phòng chiếu song song để tăng hiệu suất.
            const [cinema, rooms] = await Promise.all([
                CinemaRepository.findById(cinemaId),
                CinemaRepository.getRoomsByCinemaId(cinemaId) // Giả định phương thức này tồn tại
            ]);

            if (!cinema) {
                throw new Error(`Không tìm thấy rạp phim với ID ${cinemaId}`);
            }

            // Tính toán các số liệu thống kê từ dữ liệu phòng chiếu.
            const totalRooms = rooms.length;
            const activeRooms = rooms.filter(room => room.Status === 'Active').length;
            const totalSeats = rooms.reduce((sum, room) => sum + (room.Seat_Quantity || 0), 0);

            // Phân loại các phòng theo loại.
            const roomTypes = rooms.reduce((acc, room) => {
                const type = room.Room_Type || 'Unknown';
                if (!acc[type]) {
                    acc[type] = { count: 0, seats: 0, rooms: [] };
                }
                acc[type].count++;
                acc[type].seats += room.Seat_Quantity || 0;
                acc[type].rooms.push({ id: room.Cinema_Room_ID, name: room.Room_Name, seats: room.Seat_Quantity, status: room.Status });
                return acc;
            }, {});

            // Lấy số lượng suất chiếu hôm nay.
            const today = new Date().toISOString().split('T')[0];
            const showtimes = await CinemaRepository.getCinemaShowtimesByDate(cinemaId, today);
            logger.info(`[CinemaService] Thống kê: ${totalRooms} phòng, ${totalSeats} ghế, ${showtimes.length} suất chiếu hôm nay.`);

            // Tổng hợp và trả về kết quả.
            return {
                success: true,
                data: {
                    cinemaInfo: {
                        id: cinema.Cinema_ID,
                        name: cinema.Cinema_Name,
                        address: cinema.Address,
                        city: cinema.City,
                        phone: cinema.Phone_Number,
                        email: cinema.Email,
                        status: cinema.Status,
                        description: cinema.Description
                    },
                    statistics: { totalRooms, activeRooms, inactiveRooms: totalRooms - activeRooms, totalSeats, totalShowtimesToday: showtimes.length },
                    roomTypes,
                    lastUpdated: new Date()
                }
            };
        } catch (error) {
            logger.error(`[CinemaService] Lỗi khi lấy chi tiết rạp phim ID ${cinemaId}: ${error.message}`, { stack: error.stack });
            throw error;
        }
    }

    /**
     * Lấy danh sách phòng chiếu của rạp phim mà một quản lý đang quản lý.
     * @param {number} userId - ID của người dùng (quản lý).
     * @returns {Promise<Object>} - Danh sách phòng chiếu.
     */
    async getManagerCinemaRooms(userId) {
        logger.info(`[CinemaService] Bắt đầu lấy phòng chiếu của rạp do quản lý ID: ${userId} quản lý.`);
        try {
            // Kiểm tra người dùng có phải là quản lý hợp lệ không.
            const user = await User.findByPk(userId);
            if (!user) { throw new Error('Không tìm thấy người dùng'); }
            if (user.Role !== 'Manager') { throw new Error('Người dùng không phải là Manager'); }
            if (!user.Cinema_ID) { throw new Error('Manager chưa được phân công rạp phim'); }

            logger.info(`[CinemaService] Quản lý ID ${userId} quản lý rạp ID ${user.Cinema_ID}. Lấy phòng chiếu...`);
            // Gọi lại phương thức getCinemaRooms đã có sẵn.
            const roomsResult = await this.getCinemaRooms(user.Cinema_ID);

            if (!roomsResult.success || !roomsResult.data || roomsResult.data.length === 0) {
                logger.warn(`[CinemaService] Rạp phim ID ${user.Cinema_ID} chưa có phòng chiếu nào.`);
                throw new Error('Rạp phim này chưa có phòng chiếu nào');
            }

            return {
                success: true,
                data: {
                    cinema_id: user.Cinema_ID,
                    rooms: roomsResult.data
                }
            };
        } catch (error) {
            logger.error(`[CinemaService] Lỗi khi lấy phòng chiếu của quản lý ID ${userId}: ${error.message}`, { stack: error.stack });
            throw error;
        }
    }

    /**
     * Lấy danh sách các phòng chiếu hoạt động của một rạp phim.
     * @param {number} cinemaId - ID của rạp phim.
     * @returns {Promise<Object>} - Danh sách các phòng chiếu hoạt động.
     */
    async getActiveCinemaRooms(cinemaId) {
        logger.info(`[CinemaService] Bắt đầu lấy danh sách phòng chiếu hoạt động cho rạp ID: ${cinemaId}`);
        try {
            const cinema = await CinemaRepository.findById(cinemaId);
            if (!cinema) {
                logger.warn(`[CinemaService] Không tìm thấy rạp phim ID: ${cinemaId} khi lấy phòng chiếu hoạt động.`);
                throw new Error('Không tìm thấy rạp phim');
            }

            const allRooms = await CinemaRepository.getRoomsByCinemaId(cinemaId);
            // Lọc chỉ những phòng có status Active
            const activeRooms = allRooms ? allRooms.filter(room => room.Status === 'Active') : [];
            
            logger.info(`[CinemaService] Tìm thấy ${activeRooms.length} phòng chiếu hoạt động cho rạp ID ${cinemaId}.`);
            return {
                success: true,
                data: activeRooms
            };
        } catch (error) {
            logger.error(`[CinemaService] Lỗi khi lấy phòng chiếu hoạt động cho rạp ID ${cinemaId}: ${error.message}`, { stack: error.stack });
            throw error;
        }
    }
}

module.exports = new CinemaService();   