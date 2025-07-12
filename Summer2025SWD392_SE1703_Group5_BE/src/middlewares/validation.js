// src/middlewares/validation.js
const { body, param, query, validationResult } = require('express-validator');

/**
 * Helper function: Kiểm tra độ mạnh của mật khẩu
 * @param {string} password - Mật khẩu cần kiểm tra
 * @returns {Object} - Kết quả kiểm tra password
 */
function checkPasswordStrength(password) {

    const result = {
        isValid: false,
        score: 0,
        errors: [],
        checks: {
            length: false,
            lowercase: false,
            uppercase: false,
            number: false,
            special: false
        }
    };

    if (!password) {
        result.errors.push('Mật khẩu không được để trống');
        return result;
    }

    // Kiểm tra độ dài
    if (password.length >= 8 && password.length <= 50) {
        result.checks.length = true;
        result.score++;
    } else if (password.length < 8) {
        result.errors.push('Mật khẩu phải có ít nhất 8 ký tự');
    } else {
        result.errors.push('Mật khẩu không được quá 50 ký tự');
    }

    // Kiểm tra chữ thường
    if (/[a-z]/.test(password)) {
        result.checks.lowercase = true;
        result.score++;
    } else {
        result.errors.push('Mật khẩu phải chứa ít nhất 1 chữ cái thường (a-z)');
    }

    // Kiểm tra chữ hoa
    if (/[A-Z]/.test(password)) {
        result.checks.uppercase = true;
        result.score++;
    } else {
        result.errors.push('Mật khẩu phải chứa ít nhất 1 chữ cái hoa (A-Z)');
    }

    // Kiểm tra số
    if (/\d/.test(password)) {
        result.checks.number = true;
        result.score++;
    } else {
        result.errors.push('Mật khẩu phải chứa ít nhất 1 chữ số (0-9)');
    }

    // Kiểm tra ký tự đặc biệt
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        result.checks.special = true;
        result.score++;
    } else {
        result.errors.push('Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt (!@#$%^&*(),.?":{}|<>)');
    }

    // Xác định mật khẩu có hợp lệ không
    result.isValid = result.score === 5;

    return result;
}

/**
 * Helper function: Tạo response lỗi validation chi tiết
 * @param {Array} errors - Danh sách lỗi từ express-validator
 * @returns {Object} - Response object với UI cải thiện
 */
function createDetailedValidationResponse(errors) {
    const errorsByField = {};
    const errorMessages = [];
    let hasPasswordError = false;
    let passwordValidation = null;

    // Chuyển đổi tên field sang tiếng Việt
    const fieldTranslations = {
        'newPassword': 'Mật khẩu mới',
        'confirmPassword': 'Xác nhận mật khẩu',
        'currentPassword': 'Mật khẩu hiện tại',
        'Password': 'Mật khẩu',
        'password': 'Mật khẩu',
        'Email': 'Email',
        'email': 'Email',
        'FullName': 'Họ tên',
        'Full_Name': 'Họ tên',
        'PhoneNumber': 'Số điện thoại',
        'Phone_Number': 'Số điện thoại',
        'DateOfBirth': 'Ngày sinh',
        'Date_Of_Birth': 'Ngày sinh'
    };

    errors.forEach(error => {
        const field = error.path || error.param;
        const message = error.msg;
        const friendlyFieldName = fieldTranslations[field] || field;

        if (!errorsByField[field]) {
            errorsByField[field] = [];
        }
        errorsByField[field].push(message);
        errorMessages.push(`${friendlyFieldName}: ${message}`);

        // Kiểm tra nếu có lỗi password để thêm validation chi tiết
        if (['newPassword', 'Password', 'password'].includes(field)) {
            hasPasswordError = true;
        }
    });

    const response = {
        success: false,
        message: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại các thông tin sau:',
        errors: errorMessages,
        errorDetails: errorsByField
    };

    // Thêm thông tin chi tiết cho lỗi password
    if (hasPasswordError) {
        response.passwordHint = 'Ví dụ mật khẩu hợp lệ: "MyPass123@", "SecureP@ssw0rd", "Hello123!"';
        response.passwordRequirements = {
            title: 'Mật khẩu phải chứa:',
            requirements: [
                { text: 'Từ 8-50 ký tự', icon: '📏' },
                { text: 'Ít nhất 1 chữ thường (a-z)', icon: '🔤' },
                { text: 'Ít nhất 1 chữ hoa (A-Z)', icon: '🔠' },
                { text: 'Ít nhất 1 số (0-9)', icon: '🔢' },
                { text: 'Ít nhất 1 ký tự đặc biệt (!@#$...)', icon: '🔣' }
            ]
        };
        response.suggestions = [
            'Sử dụng cụm từ dễ nhớ kết hợp với số và ký tự đặc biệt',
            'Tránh sử dụng thông tin cá nhân như tên, ngày sinh',
            'Không sử dụng mật khẩu giống với các tài khoản khác'
        ];
    }

    return response;
}

/**
 * Middleware xử lý lỗi validation với UI tốt hơn
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        // Sử dụng helper function để tạo response chi tiết
        const detailedResponse = createDetailedValidationResponse(errors.array());
        return res.status(400).json(detailedResponse);
    }
    next();
};

// ==================== CINEMA VALIDATION ====================
const cinemaValidation = {
    create: [
        body('Cinema_Name')
            .notEmpty()
            .withMessage('Tên rạp phim không được để trống')
            .isLength({ min: 3, max: 255 })
            .withMessage('Tên rạp phim phải từ 3-255 ký tự'),

        body('Address')
            .notEmpty()
            .withMessage('Địa chỉ không được để trống')
            .isLength({ min: 10, max: 500 })
            .withMessage('Địa chỉ phải từ 10-500 ký tự'),

        body('City')
            .notEmpty()
            .withMessage('Thành phố không được để trống')
            .isLength({ min: 2, max: 100 })
            .withMessage('Tên thành phố phải từ 2-100 ký tự'),

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

        body('Email')
            .optional()
            .isEmail()
            .withMessage('Email không hợp lệ')
            .normalizeEmail()
            .isLength({ max: 255 })
            .withMessage('Email không được quá 255 ký tự'),

        body('Description')
            .optional()
            .isLength({ max: 2000 })
            .withMessage('Mô tả không được quá 2000 ký tự'),

        body('Status')
            .optional()
            .isIn(['Active', 'Inactive', 'Under Maintenance', 'Closed'])
            .withMessage('Trạng thái phải là Active, Inactive, Under Maintenance hoặc Closed'),

        handleValidationErrors
    ],

    update: [
        param('id')
            .isInt({ min: 1 })
            .withMessage('ID rạp phim phải là số nguyên dương')
            .toInt(),

        // Middleware xác định vai trò và áp dụng validation phù hợp
        (req, res, next) => {
            const role = req.user && req.user.role ? req.user.role : '';

            // Lưu vai trò vào request để sử dụng sau
            req.userRole = role;
            next();
        },

        // Các field chung cho cả Admin và Manager
        body('Cinema_Name')
            .optional()
            .isLength({ min: 3, max: 255 })
            .withMessage('Tên rạp phim phải từ 3-255 ký tự'),

        body('Address')
            .optional()
            .isLength({ min: 10, max: 500 })
            .withMessage('Địa chỉ phải từ 10-500 ký tự'),

        body('City')
            .optional()
            .isLength({ min: 2, max: 100 })
            .withMessage('Tên thành phố phải từ 2-100 ký tự'),

        body('Phone_Number')
            .optional()
            .matches(/^[0-9]{10,11}$/)
            .withMessage('Số điện thoại phải có 10-11 chữ số')
            .custom((value) => {
                if (!value) return true;
                const vnPhoneRegex = /^(0[3|5|7|8|9])[0-9]{8}$|^(84[3|5|7|8|9])[0-9]{8}$/;
                if (!vnPhoneRegex.test(value)) {
                    throw new Error('Số điện thoại không đúng định dạng Việt Nam');
                }
                return true;
            }),

        body('Description')
            .optional()
            .isLength({ max: 2000 })
            .withMessage('Mô tả không được quá 2000 ký tự'),

        body('Status')
            .optional()
            .isIn(['Active', 'Inactive', 'Under Maintenance', 'Closed', 'Deleted'])
            .withMessage('Trạng thái không hợp lệ'),

        // Chỉ Admin mới được phép thay đổi email
        body('Email')
            .optional()
            .custom((value, { req }) => {
                // Nếu không phải Admin mà cố gắng thay đổi email
                if (req.userRole !== 'Admin' && value !== undefined) {
                    throw new Error('Chỉ Admin mới có quyền thay đổi email của rạp phim');
                }

                // Nếu là Admin, kiểm tra định dạng email
                if (value !== undefined) {
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                        throw new Error('Email không hợp lệ');
                    }
                    if (value.length > 255) {
                        throw new Error('Email không được quá 255 ký tự');
                    }
                }

                return true;
            }),

        handleValidationErrors
    ],

    getById: [
        param('id')
            .isInt({ min: 1 })
            .withMessage('ID rạp phim phải là số nguyên dương')
            .toInt(),
        handleValidationErrors
    ],

    getByCity: [
        param('city')
            .notEmpty()
            .withMessage('Thành phố không được để trống')
            .isLength({ min: 2, max: 100 })
            .withMessage('Tên thành phố phải từ 2-100 ký tự')
            .custom((value) => {
                // Check if city is just numbers
                if (/^\d+$/.test(value)) {
                    throw new Error('Tên thành phố không hợp lệ');
                }
                return true;
            }),
        handleValidationErrors
    ],

    delete: [
        param('id')
            .isInt({ min: 1 })
            .withMessage('ID rạp phim phải là số nguyên dương')
            .toInt(),
        handleValidationErrors
    ],

    getShowtimes: [
        param('id')
            .isInt({ min: 1 })
            .withMessage('ID rạp phim phải là số nguyên dương')
            .toInt(),
        query('date')
            .optional()
            .matches(/^\d{4}-\d{2}-\d{2}$/)
            .withMessage('Ngày phải có định dạng YYYY-MM-DD')
            .custom((value) => {
                // Check if the date is valid
                const date = new Date(value);
                if (isNaN(date.getTime())) {
                    throw new Error('Ngày không hợp lệ');
                }
                return true;
            }),
        handleValidationErrors
    ]
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

        body('Premiere_Date')
            .optional()
            .isISO8601()
            .withMessage('Ngày công chiếu không hợp lệ')
            .custom((value, { req }) => {
                if (!value) return true;
                const releaseDate = req.body.Release_Date;
                if (releaseDate && new Date(value) < new Date(releaseDate)) {
                    throw new Error('Ngày công chiếu không được trước ngày phát hành');
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
            .custom((value) => {
                // Cho phép null, undefined hoặc chuỗi rỗng
                if (!value || value === '') return true;

                // Nếu không phải URL hợp lệ, báo lỗi
                try {
                    new URL(value);
                    return true;
                } catch (err) {
                    throw new Error('Link trailer phải là URL hợp lệ hoặc để trống');
                }
            }),

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

        body('Premiere_Date')
            .optional()
            .isISO8601()
            .withMessage('Ngày công chiếu không hợp lệ')
            .custom((value, { req }) => {
                if (!value) return true;
                const releaseDate = req.body.Release_Date;
                if (releaseDate && new Date(value) < new Date(releaseDate)) {
                    throw new Error('Ngày công chiếu không được trước ngày phát hành');
                }
                return true;
            }),

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
            .custom((value) => {
                // Cho phép null, undefined hoặc chuỗi rỗng
                if (!value || value === '') return true;

                // Nếu không phải URL hợp lệ, báo lỗi
                try {
                    new URL(value);
                    return true;
                } catch (err) {
                    throw new Error('Link trailer phải là URL hợp lệ hoặc để trống');
                }
            }),

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
        // Validation for FullName / Full_Name
        body(['FullName', 'Full_Name'])
            .optional()
            .custom((value, { req }) => {
                const fullName = req.body.FullName || req.body.Full_Name;
                if (fullName === undefined || fullName === null) return true;

                if (typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 100) {
                    throw new Error('Họ tên phải có từ 2-100 ký tự.');
                }
                if (!/^[\p{L}\s]+$/u.test(fullName)) {
                    throw new Error('Họ tên chỉ được chứa chữ cái và khoảng trắng.');
                }
                req.body.Full_Name = fullName.trim();
                req.body.FullName = fullName.trim();
                return true;
            }),

        // Email validation is kept simple as it's less likely to have casing issues
        body('Email')
            .optional()
            .isEmail().withMessage('Email không hợp lệ.')
            .normalizeEmail()
            .isLength({ max: 255 }).withMessage('Email không được quá 255 ký tự.'),

        // Validation for PhoneNumber / Phone_Number
        body(['PhoneNumber', 'Phone_Number'])
            .optional()
            .custom(async (value, { req }) => {
                const phoneNumber = req.body.PhoneNumber || req.body.Phone_Number;
                if (phoneNumber === undefined || phoneNumber === null) return true;

                const vnPhoneRegex = /^(0[3|5|7|8|9])[0-9]{8}$/;
                if (!vnPhoneRegex.test(phoneNumber)) {
                    throw new Error('Số điện thoại không đúng định dạng Việt Nam (10 số, bắt đầu bằng 03, 05, 07, 08, 09).');
                }

                const userId = req.user?.id || req.user?.userId;
                if (!userId) {
                    throw new Error('Không thể xác thực người dùng để kiểm tra số điện thoại.');
                }

                const UserRepository = require('../repositories/userRepository');
                const existingUser = await UserRepository.findByPhoneNumber(phoneNumber);
                if (existingUser && existingUser.User_ID !== userId) {
                    throw new Error('Số điện thoại đã được sử dụng bởi tài khoản khác.');
                }
                req.body.Phone_Number = phoneNumber;
                req.body.PhoneNumber = phoneNumber;
                return true;
            }),

        // Validation for DateOfBirth / Date_Of_Birth
        body(['DateOfBirth', 'Date_Of_Birth'])
            .optional()
            .custom((value, { req }) => {
                const dateOfBirth = req.body.DateOfBirth || req.body.Date_Of_Birth;
                if (dateOfBirth === undefined || dateOfBirth === null) return true;

                if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
                    throw new Error('Ngày sinh phải có định dạng YYYY-MM-DD.');
                }

                const birthDate = new Date(dateOfBirth);
                if (isNaN(birthDate.getTime())) {
                    throw new Error('Ngày sinh không hợp lệ.');
                }

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                if (birthDate > today) {
                    throw new Error('Ngày sinh không thể là một ngày trong tương lai.');
                }

                let age = today.getFullYear() - birthDate.getFullYear();
                const m = today.getMonth() - birthDate.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                    age--;
                }

                if (age < 13) {
                    throw new Error('Người dùng phải ít nhất 13 tuổi.');
                }
                if (age > 120) {
                    throw new Error('Tuổi không hợp lệ (phải nhỏ hơn 120).');
                }

                req.body.Date_Of_Birth = dateOfBirth;
                req.body.DateOfBirth = dateOfBirth;
                return true;
            }),

        // Validation for Sex / Gender
        body(['Sex', 'Gender'])
            .optional()
            .isIn(['Male', 'Female', 'Other'])
            .withMessage('Giới tính phải là Male, Female hoặc Other.'),

        // Validation for Address
        body('Address')
            .optional()
            .trim()
            .isLength({ max: 500 })
            .withMessage('Địa chỉ không được quá 500 ký tự.'),

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
        // Kiểm tra cả FullName và Full_Name để hỗ trợ cả hai kiểu gọi API
        body(['FullName', 'Full_Name'])
            .custom((value, { req }) => {
                // Lấy giá trị từ cả hai trường có thể có
                const fullName = value || req.body.FullName || req.body.Full_Name;
                if (!fullName) {
                    throw new Error('Họ tên không được để trống');
                }
                if (fullName.length < 2 || fullName.length > 100) {
                    throw new Error('Họ tên phải có từ 2-100 ký tự');
                }
                // Cho phép tên tiếng Việt và các ký tự Unicode khác
                if (!/^[\p{L}\s]+$/u.test(fullName)) {
                    throw new Error('Họ tên chỉ được chứa chữ cái và khoảng trắng');
                }

                // Lưu giá trị vào cả hai trường để đảm bảo tương thích
                req.body.FullName = fullName;
                req.body.Full_Name = fullName;
                return true;
            }),

        body(['Email'])
            .custom((value, { req }) => {
                const email = value || req.body.Email || req.body.email;
                if (!email) {
                    throw new Error('Email không được để trống');
                }
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    throw new Error('Email không hợp lệ');
                }
                if (email.length > 255) {
                    throw new Error('Email không được quá 255 ký tự');
                }

                // Lưu giá trị vào cả hai trường
                req.body.Email = email;
                req.body.email = email;
                return true;
            }),

        body(['Password', 'password'])
            .custom((value, { req }) => {
                const password = value || req.body.Password || req.body.password;
                if (!password) {
                    throw new Error('Mật khẩu không được để trống');
                }
                
                // Sử dụng helper function để kiểm tra password
                const passwordCheck = checkPasswordStrength(password);
                if (!passwordCheck.isValid) {
                    // Trả về error đầu tiên hoặc error tổng hợp
                    throw new Error(passwordCheck.errors[0] || 'Mật khẩu không đủ mạnh');
                }

                // Lưu giá trị vào cả hai trường
                req.body.Password = password;
                req.body.password = password;
                return true;
            }),

        body(['ConfirmPassword', 'confirmPassword'])
            .custom((value, { req }) => {
                const confirmPassword = value || req.body.ConfirmPassword || req.body.confirmPassword;
                const password = req.body.Password || req.body.password;

                if (!confirmPassword) {
                    throw new Error('Xác nhận mật khẩu không được để trống');
                }
                if (confirmPassword !== password) {
                    throw new Error('Mật khẩu xác nhận không khớp với mật khẩu');
                }

                // Lưu giá trị vào cả hai trường
                req.body.ConfirmPassword = confirmPassword;
                req.body.confirmPassword = confirmPassword;
                return true;
            }),

        body(['PhoneNumber', 'Phone_Number'])
            .custom((value, { req }) => {
                const phoneNumber = value || req.body.PhoneNumber || req.body.Phone_Number;

                if (!phoneNumber) {
                    throw new Error('Số điện thoại không được để trống');
                }
                if (!/^[0-9]{10,11}$/.test(phoneNumber)) {
                    throw new Error('Số điện thoại phải có 10-11 chữ số');
                }

                const vnPhoneRegex = /^(0[3|5|7|8|9])[0-9]{8}$|^(84[3|5|7|8|9])[0-9]{8}$/;
                if (!vnPhoneRegex.test(phoneNumber)) {
                    throw new Error('Số điện thoại không đúng định dạng Việt Nam');
                }

                // Lưu giá trị vào cả hai trường
                req.body.PhoneNumber = phoneNumber;
                req.body.Phone_Number = phoneNumber;
                return true;
            }),

        body(['DateOfBirth', 'Date_Of_Birth'])
            .optional()
            .custom((value, { req }) => {
                const dateOfBirth = value || req.body.DateOfBirth || req.body.Date_Of_Birth;

                if (!dateOfBirth) return true;

                // Kiểm tra định dạng ngày
                const date = new Date(dateOfBirth);
                if (isNaN(date.getTime())) {
                    throw new Error('Ngày sinh không hợp lệ');
                }

                // Kiểm tra tuổi
                const today = new Date();
                const age = today.getFullYear() - date.getFullYear();

                if (age < 13) {
                    throw new Error('Tuổi phải từ 13 trở lên');
                }
                if (age > 120) {
                    throw new Error('Tuổi không được quá 120');
                }

                // Lưu giá trị vào cả hai trường
                req.body.DateOfBirth = dateOfBirth;
                req.body.Date_Of_Birth = dateOfBirth;
                return true;
            }),

        body(['Sex', 'Gender'])
            .optional()
            .custom((value, { req }) => {
                const sex = value || req.body.Sex || req.body.Gender;

                if (!sex) return true;

                if (!['Male', 'Female', 'Other'].includes(sex)) {
                    throw new Error('Giới tính phải là Male, Female hoặc Other');
                }

                // Lưu giá trị vào cả hai trường
                req.body.Sex = sex;
                req.body.Gender = sex;
                return true;
            }),

        // Middleware để đảm bảo tất cả các trường đều được chuẩn hóa
        (req, res, next) => {
            // Đảm bảo tất cả các trường đều có cả dạng camelCase và snake_case
            if (req.body.Address) {
                req.body.address = req.body.Address;
            } else if (req.body.address) {
                req.body.Address = req.body.address;
            }

            next();
        },

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
        body(['currentPassword', 'OldPassword', 'oldPassword'])
            .custom((value, { req }) => {
                const currentPassword = value || req.body.currentPassword || req.body.OldPassword || req.body.oldPassword;
                
                if (!currentPassword) {
                    throw new Error('Mật khẩu hiện tại không được để trống');
                }
                
                // Lưu giá trị vào các trường để đảm bảo tương thích
                req.body.currentPassword = currentPassword;
                req.body.OldPassword = currentPassword;
                req.body.oldPassword = currentPassword;
                
                return true;
            }),

        body(['newPassword', 'NewPassword'])
            .custom((value, { req }) => {
                const newPassword = value || req.body.newPassword || req.body.NewPassword;
                
                if (!newPassword) {
                    throw new Error('Mật khẩu mới không được để trống');
                }
                
                // Sử dụng helper function để kiểm tra password
                const passwordCheck = checkPasswordStrength(newPassword);
                if (!passwordCheck.isValid) {
                    throw new Error(passwordCheck.errors[0] || 'Mật khẩu mới không đủ mạnh');
                }
                
                // Lưu giá trị vào các trường để đảm bảo tương thích
                req.body.newPassword = newPassword;
                req.body.NewPassword = newPassword;
                
                return true;
            }),

        body(['confirmPassword', 'ConfirmNewPassword', 'confirmNewPassword'])
            .custom((value, { req }) => {
                const confirmPassword = value || req.body.confirmPassword || req.body.ConfirmNewPassword || req.body.confirmNewPassword;
                const newPassword = req.body.newPassword || req.body.NewPassword;
                
                if (!confirmPassword) {
                    throw new Error('Xác nhận mật khẩu không được để trống');
                }
                
                if (confirmPassword !== newPassword) {
                    throw new Error('Xác nhận mật khẩu không khớp với mật khẩu mới');
                }
                
                // Lưu giá trị vào các trường để đảm bảo tương thích
                req.body.confirmPassword = confirmPassword;
                req.body.ConfirmNewPassword = confirmPassword;
                req.body.confirmNewPassword = confirmPassword;
                
                return true;
            }),

        handleValidationErrors
    ],

    resetPassword: [
        body('newPassword')
            .custom((value) => {
                if (!value) {
                    throw new Error('Mật khẩu mới không được để trống');
                }
                
                // Sử dụng helper function để kiểm tra password
                const passwordCheck = checkPasswordStrength(value);
                
                if (!passwordCheck.isValid) {
                    throw new Error(passwordCheck.errors[0] || 'Mật khẩu mới không đủ mạnh');
                }
                
                return true;
            }),

        body('confirmPassword')
            .custom((value, { req }) => {
                if (value !== req.body.newPassword) {
                    throw new Error('Xác nhận mật khẩu không khớp với mật khẩu mới');
                }
                
                return true;
            }),

        body('token')
            .notEmpty()
            .withMessage('Token không được để trống'),

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
    cinemaValidation,
    seatLayoutValidation,  // ⭐ THÊM MỚI
    movieValidation,
    ratingValidation,
    memberValidation,
    authValidation,
    bookingValidation,
    searchValidation,
    handleValidationErrors,
    // Helper functions
    checkPasswordStrength,
    createDetailedValidationResponse
};