// src/middlewares/validation.js
const { body, param, query, validationResult } = require('express-validator');

/**
 * Middleware xử lý lỗi validation
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.log('[Validation] Errors found:', errors.array());
        return res.status(400).json({
            success: false,
            message: 'Dữ liệu không hợp lệ',
            errors: errors.array().map(error => ({
                field: error.path,
                message: error.msg,
                value: error.value
            }))
        });
    }
    next();
};

// ==================== SEAT LAYOUT VALIDATION ====================
const seatLayoutValidation = {
    // Validation cho Room ID trong params
    validateRoomId: [
        param('roomId')
            .isInt({ min: 1 })
            .withMessage('Room ID phải là số nguyên dương')
            .toInt(),
        handleValidationErrors
    ],

    // Validation cho Showtime ID trong params
    validateShowtimeId: [
        param('showtimeId')
            .isInt({ min: 1 })
            .withMessage('Showtime ID phải là số nguyên dương')
            .toInt(),
        handleValidationErrors
    ],

    // Validation cho Seat ID trong params
    validateSeatId: [
        param('seatId')
            .isInt({ min: 1 })
            .withMessage('Seat ID phải là số nguyên dương')
            .toInt(),
        handleValidationErrors
    ],

    // Validation cho cấu hình layout ghế
    configureSeatLayout: [
        param('roomId')
            .isInt({ min: 1 })
            .withMessage('Room ID phải là số nguyên dương')
            .toInt(),

        body('ColumnsPerRow')
            .isInt({ min: 5, max: 20 })
            .withMessage('Số cột mỗi hàng phải từ 5 đến 20'),

        body('Rows')
            .isArray({ min: 1 })
            .withMessage('Phải có ít nhất 1 hàng ghế')
            .custom((rows) => {
                if (rows.length > 15) {
                    throw new Error('Không được có quá 15 hàng ghế');
                }
                return true;
            }),

        body('Rows.*.RowLabel')
            .notEmpty()
            .withMessage('Tên hàng không được để trống')
            .isLength({ min: 1, max: 5 })
            .withMessage('Tên hàng phải từ 1-5 ký tự')
            .matches(/^[A-Z]+$/)
            .withMessage('Tên hàng chỉ được chứa chữ cái in hoa'),

        body('Rows.*.SeatType')
            .optional()
            .isIn(['Standard', 'VIP', 'Premium', 'Economy', 'Couple'])
            .withMessage('Loại ghế phải là Standard, VIP, Premium, Economy hoặc Couple'),

        body('Rows.*.EmptyColumns')
            .optional()
            .isArray()
            .withMessage('EmptyColumns phải là một mảng')
            .custom((emptyColumns, { req }) => {
                if (emptyColumns) {
                    const columnsPerRow = req.body.ColumnsPerRow;

                    // Kiểm tra tất cả giá trị trong EmptyColumns
                    for (const col of emptyColumns) {
                        if (!Number.isInteger(col) || col < 1 || col > columnsPerRow) {
                            throw new Error(`Cột trống ${col} không hợp lệ. Phải từ 1 đến ${columnsPerRow}`);
                        }
                    }

                    // Kiểm tra không được để trống toàn bộ hàng
                    if (emptyColumns.length >= columnsPerRow) {
                        throw new Error('Không thể để trống toàn bộ hàng ghế');
                    }

                    // Kiểm tra không có giá trị trùng lặp
                    const uniqueColumns = [...new Set(emptyColumns)];
                    if (uniqueColumns.length !== emptyColumns.length) {
                        throw new Error('EmptyColumns không được chứa giá trị trùng lặp');
                    }
                }
                return true;
            }),

        // Custom validation cho toàn bộ cấu hình
        body()
            .custom((body) => {
                const { Rows, ColumnsPerRow } = body;

                // Kiểm tra tên hàng không trùng lặp
                const rowLabels = Rows.map(row => row.RowLabel);
                const uniqueRowLabels = [...new Set(rowLabels)];
                if (uniqueRowLabels.length !== rowLabels.length) {
                    throw new Error('Tên hàng không được trùng lặp');
                }

                // Tính tổng số ghế
                let totalSeats = 0;
                for (const row of Rows) {
                    const emptyCount = row.EmptyColumns ? row.EmptyColumns.length : 0;
                    totalSeats += ColumnsPerRow - emptyCount;
                }

                // Kiểm tra giới hạn tổng số ghế
                if (totalSeats < 20) {
                    throw new Error(`Tổng số ghế phải ít nhất 20 (hiện tại: ${totalSeats})`);
                }
                if (totalSeats > 150) {
                    throw new Error(`Tổng số ghế không được quá 150 (hiện tại: ${totalSeats})`);
                }

                return true;
            }),

        handleValidationErrors
    ],

    // Validation cho cập nhật trạng thái ghế
    updateSeatStatus: [
        param('seatId')
            .isInt({ min: 1 })
            .withMessage('Seat ID phải là số nguyên dương')
            .toInt(),

        body('status')
            .notEmpty()
            .withMessage('Trạng thái không được để trống')
            .isIn(['Available', 'Maintenance', 'Blocked', 'OutOfOrder'])
            .withMessage('Trạng thái phải là Available, Maintenance, Blocked hoặc OutOfOrder'),

        body('reason')
            .optional()
            .isLength({ max: 500 })
            .withMessage('Lý do không được quá 500 ký tự'),

        handleValidationErrors
    ]
};

// ==================== MOVIE VALIDATION ====================
const movieValidation = {
    create: [
        body('Movie_Name')
            .notEmpty()
            .withMessage('Tên phim không được để trống')
            .isLength({ min: 1, max: 255 })
            .withMessage('Tên phim phải từ 1-255 ký tự'),

        body('Release_Date')
            .isISO8601()
            .withMessage('Ngày phát hành không hợp lệ')
            .custom((value) => {
                if (new Date(value) <= new Date()) {
                    throw new Error('Ngày phát hành phải trong tương lai');
                }
                return true;
            }),

        body('Director')
            .notEmpty()
            .withMessage('Đạo diễn không được để trống'),

        body('Duration')
            .isInt({ min: 60 })
            .withMessage('Thời lượng phim phải từ 60 phút trở lên'),

        body('Genre')
            .notEmpty()
            .withMessage('Thể loại không được để trống'),

        body('Rating')
            .isIn(['G', 'PG', 'PG-13', 'R', 'NC-17'])
            .withMessage('Xếp hạng độ tuổi không hợp lệ'),

        // Validation cho các field optional
        body('End_Date')
            .optional()
            .isISO8601()
            .withMessage('Ngày kết thúc không hợp lệ'),

        body('Production_Company')
            .optional()
            .isLength({ max: 255 })
            .withMessage('Tên công ty sản xuất không được quá 255 ký tự'),

        body('Cast')
            .optional()
            .isLength({ max: 1000 })
            .withMessage('Danh sách diễn viên không được quá 1000 ký tự'),

        body('Language')
            .optional()
            .isLength({ max: 100 })
            .withMessage('Ngôn ngữ không được quá 100 ký tự'),

        body('Country')
            .optional()
            .isLength({ max: 100 })
            .withMessage('Quốc gia không được quá 100 ký tự'),

        body('Synopsis')
            .optional()
            .isLength({ max: 2000 })
            .withMessage('Tóm tắt không được quá 2000 ký tự'),

        body('Trailer_Link')
            .optional()
            .isURL()
            .withMessage('Link trailer không hợp lệ'),

        body('Status')
            .optional()
            .isIn(['Coming Soon', 'Now Showing', 'Ended', 'Cancelled'])
            .withMessage('Trạng thái không hợp lệ'),

        handleValidationErrors
    ],

    update: [
        body('Movie_Name')
            .optional()
            .isLength({ min: 1, max: 255 })
            .withMessage('Tên phim phải từ 1-255 ký tự'),

        body('Release_Date')
            .optional()
            .isISO8601()
            .withMessage('Ngày phát hành không hợp lệ'),

        body('Director')
            .optional()
            .notEmpty()
            .withMessage('Đạo diễn không được để trống'),

        body('Duration')
            .optional()
            .isInt({ min: 60 })
            .withMessage('Thời lượng phim phải từ 60 phút trở lên'),

        body('Genre')
            .optional()
            .notEmpty()
            .withMessage('Thể loại không được để trống'),

        body('Rating')
            .optional()
            .isIn(['G', 'PG', 'PG-13', 'R', 'NC-17'])
            .withMessage('Xếp hạng độ tuổi không hợp lệ'),

        // Các field optional khác
        body('End_Date')
            .optional()
            .isISO8601()
            .withMessage('Ngày kết thúc không hợp lệ'),

        body('Production_Company')
            .optional()
            .isLength({ max: 255 })
            .withMessage('Tên công ty sản xuất không được quá 255 ký tự'),

        body('Cast')
            .optional()
            .isLength({ max: 1000 })
            .withMessage('Danh sách diễn viên không được quá 1000 ký tự'),

        body('Language')
            .optional()
            .isLength({ max: 100 })
            .withMessage('Ngôn ngữ không được quá 100 ký tự'),

        body('Country')
            .optional()
            .isLength({ max: 100 })
            .withMessage('Quốc gia không được quá 100 ký tự'),

        body('Synopsis')
            .optional()
            .isLength({ max: 2000 })
            .withMessage('Tóm tắt không được quá 2000 ký tự'),

        body('Trailer_Link')
            .optional()
            .isURL()
            .withMessage('Link trailer không hợp lệ'),

        body('Status')
            .optional()
            .isIn(['Coming Soon', 'Now Showing', 'Ended', 'Cancelled'])
            .withMessage('Trạng thái không hợp lệ'),

        handleValidationErrors
    ]
};

// ==================== RATING VALIDATION ====================
const ratingValidation = [
    body('Rating')
        .isInt({ min: 1, max: 5 })
        .withMessage('Đánh giá phải từ 1-5 sao'),

    body('Comment')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Bình luận không được quá 500 ký tự'),

    handleValidationErrors
];

// ==================== MEMBER VALIDATION ====================
const memberValidation = {
    // Validation cho việc tìm kiếm theo phone
    lookupByPhone: [
        param('phoneNumber')
            .matches(/^[0-9]{10,11}$/)
            .withMessage('Số điện thoại phải có 10-11 chữ số và chỉ chứa số')
            .custom((value) => {
                // Kiểm tra format số điện thoại Việt Nam
                const vnPhoneRegex = /^(0[3|5|7|8|9])[0-9]{8}$|^(84[3|5|7|8|9])[0-9]{8}$/;
                if (!vnPhoneRegex.test(value)) {
                    throw new Error('Số điện thoại không đúng định dạng Việt Nam');
                }
                return true;
            }),
        handleValidationErrors
    ],

    // Validation cho việc tìm kiếm theo email
    lookupByEmail: [
        param('email')
            .isEmail()
            .withMessage('Email không hợp lệ')
            .normalizeEmail()
            .isLength({ max: 255 })
            .withMessage('Email không được quá 255 ký tự'),
        handleValidationErrors
    ],

    // Validation cho User ID trong params
    validateUserId: [
        param('userId')
            .isInt({ min: 1 })
            .withMessage('User ID phải là số nguyên dương')
            .toInt(),
        handleValidationErrors
    ],

    // Validation cho việc cập nhật thông tin member
    updateProfile: [
        body('Full_Name')
            .optional()
            .trim()
            .isLength({ min: 2, max: 100 })
            .withMessage('Họ tên phải có từ 2-100 ký tự')
            .matches(/^[a-zA-ZÀ-ỹ\s]+$/)
            .withMessage('Họ tên chỉ được chứa chữ cái và khoảng trắng'),

        body('Email')
            .optional()
            .isEmail()
            .withMessage('Email không hợp lệ')
            .normalizeEmail()
            .isLength({ max: 255 })
            .withMessage('Email không được quá 255 ký tự'),

        body('Phone_Number')
            .optional()
            .matches(/^[0-9]{10,11}$/)
            .withMessage('Số điện thoại phải có 10-11 chữ số')
            .custom((value) => {
                const vnPhoneRegex = /^(0[3|5|7|8|9])[0-9]{8}$|^(84[3|5|7|8|9])[0-9]{8}$/;
                if (!vnPhoneRegex.test(value)) {
                    throw new Error('Số điện thoại không đúng định dạng Việt Nam');
                }
                return true;
            }),

        body('Date_Of_Birth')
            .optional()
            .isDate()
            .withMessage('Ngày sinh không hợp lệ')
            .custom((value) => {
                const birthDate = new Date(value);
                const today = new Date();
                const age = today.getFullYear() - birthDate.getFullYear();

                if (age < 13) {
                    throw new Error('Tuổi phải từ 13 trở lên');
                }
                if (age > 120) {
                    throw new Error('Tuổi không được quá 120');
                }
                return true;
            }),

        body('Gender')
            .optional()
            .isIn(['Male', 'Female', 'Other'])
            .withMessage('Giới tính phải là Male, Female hoặc Other'),

        body('Address')
            .optional()
            .trim()
            .isLength({ max: 500 })
            .withMessage('Địa chỉ không được quá 500 ký tự'),

        handleValidationErrors
    ],

    // Validation cho pagination
    pagination: [
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Page phải là số nguyên dương')
            .toInt(),

        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit phải là số nguyên từ 1-100')
            .toInt(),

        handleValidationErrors
    ]
};

// ==================== AUTH VALIDATION ====================
const authValidation = {
    register: [
        body('Full_Name')
            .trim()
            .notEmpty()
            .withMessage('Họ tên không được để trống')
            .isLength({ min: 2, max: 100 })
            .withMessage('Họ tên phải có từ 2-100 ký tự')
            .matches(/^[a-zA-ZÀ-ỹ\s]+$/)
            .withMessage('Họ tên chỉ được chứa chữ cái và khoảng trắng'),

        body('Email')
            .isEmail()
            .withMessage('Email không hợp lệ')
            .normalizeEmail()
            .isLength({ max: 255 })
            .withMessage('Email không được quá 255 ký tự'),

        body('Password')
            .isLength({ min: 6, max: 50 })
            .withMessage('Mật khẩu phải có từ 6-50 ký tự')
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
            .withMessage('Mật khẩu phải chứa ít nhất 1 chữ thường, 1 chữ hoa và 1 số'),

        body('Phone_Number')
            .matches(/^[0-9]{10,11}$/)
            .withMessage('Số điện thoại phải có 10-11 chữ số')
            .custom((value) => {
                const vnPhoneRegex = /^(0[3|5|7|8|9])[0-9]{8}$|^(84[3|5|7|8|9])[0-9]{8}$/;
                if (!vnPhoneRegex.test(value)) {
                    throw new Error('Số điện thoại không đúng định dạng Việt Nam');
                }
                return true;
            }),

        body('Date_Of_Birth')
            .optional()
            .isDate()
            .withMessage('Ngày sinh không hợp lệ')
            .custom((value) => {
                if (value) {
                    const birthDate = new Date(value);
                    const today = new Date();
                    const age = today.getFullYear() - birthDate.getFullYear();

                    if (age < 13) {
                        throw new Error('Tuổi phải từ 13 trở lên');
                    }
                    if (age > 120) {
                        throw new Error('Tuổi không được quá 120');
                    }
                }
                return true;
            }),

        body('Gender')
            .optional()
            .isIn(['Male', 'Female', 'Other'])
            .withMessage('Giới tính phải là Male, Female hoặc Other'),

        handleValidationErrors
    ],

    login: [
        body('Email')
            .isEmail()
            .withMessage('Email không hợp lệ')
            .normalizeEmail(),

        body('Password')
            .notEmpty()
            .withMessage('Mật khẩu không được để trống'),

        handleValidationErrors
    ],

    changePassword: [
        body('currentPassword')
            .notEmpty()
            .withMessage('Mật khẩu hiện tại không được để trống'),

        body('newPassword')
            .isLength({ min: 6, max: 50 })
            .withMessage('Mật khẩu mới phải có từ 6-50 ký tự')
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
            .withMessage('Mật khẩu mới phải chứa ít nhất 1 chữ thường, 1 chữ hoa và 1 số'),

        body('confirmPassword')
            .custom((value, { req }) => {
                if (value !== req.body.newPassword) {
                    throw new Error('Xác nhận mật khẩu không khớp');
                }
                return true;
            }),

        handleValidationErrors
    ]
};

// ==================== BOOKING VALIDATION ====================
const bookingValidation = {
    create: [
        body('showtime_id')
            .isInt({ min: 1 })
            .withMessage('Showtime ID phải là số nguyên dương'),

        body('seats')
            .isArray({ min: 1 })
            .withMessage('Phải chọn ít nhất 1 ghế')
            .custom((seats) => {
                if (seats.length > 10) {
                    throw new Error('Không thể đặt quá 10 ghế trong 1 lần');
                }
                return true;
            }),

        body('seats.*')
            .isString()
            .matches(/^[A-Z][0-9]{1,2}$/)
            .withMessage('Mã ghế không hợp lệ (ví dụ: A1, B12)'),

        body('total_amount')
            .isNumeric()
            .withMessage('Tổng tiền phải là số')
            .custom((value) => {
                if (parseFloat(value) < 0) {
                    throw new Error('Tổng tiền không thể âm');
                }
                return true;
            }),

        body('payment_method')
            .optional()
            .isIn(['Cash', 'Card', 'Online', 'Points'])
            .withMessage('Phương thức thanh toán không hợp lệ'),

        handleValidationErrors
    ],

    cancel: [
        param('bookingId')
            .isInt({ min: 1 })
            .withMessage('Booking ID phải là số nguyên dương'),

        body('reason')
            .optional()
            .isLength({ max: 500 })
            .withMessage('Lý do hủy không được quá 500 ký tự'),

        handleValidationErrors
    ]
};

// ==================== SEARCH & FILTER VALIDATION ====================
const searchValidation = {
    movies: [
        query('keyword')
            .optional()
            .trim()
            .isLength({ min: 1, max: 100 })
            .withMessage('Từ khóa tìm kiếm phải có từ 1-100 ký tự'),

        query('genre')
            .optional()
            .trim()
            .isLength({ max: 50 })
            .withMessage('Thể loại không được quá 50 ký tự'),

        query('rating')
            .optional()
            .isIn(['G', 'PG', 'PG-13', 'R', 'NC-17'])
            .withMessage('Xếp hạng độ tuổi không hợp lệ'),

        query('status')
            .optional()
            .isIn(['Coming Soon', 'Now Showing', 'Ended', 'Cancelled'])
            .withMessage('Trạng thái không hợp lệ'),

        query('sort')
            .optional()
            .isIn(['name', 'release_date', 'rating', 'duration'])
            .withMessage('Trường sắp xếp không hợp lệ'),

        query('order')
            .optional()
            .isIn(['asc', 'desc'])
            .withMessage('Thứ tự sắp xếp phải là asc hoặc desc'),

        ...memberValidation.pagination
    ]


};


module.exports = {
    seatLayoutValidation,  // ⭐ THÊM MỚI
    movieValidation,
    ratingValidation,
    memberValidation,
    authValidation,
    bookingValidation,
    searchValidation,
    handleValidationErrors
};
