// File: src/utils/validators.js
// Mô tả: Chứa các schema validation sử dụng thư viện Joi để kiểm tra dữ liệu đầu vào cho các request.

const Joi = require('joi'); // Import thư viện Joi.

// Đối tượng chứa các schema validation khác nhau.
const validators = {
    // Schema cho việc đăng ký người dùng mới.
    register: Joi.object({
        email: Joi.string().email().required()
            .messages({
                'string.base': 'Email phải là một chuỗi.',
                'string.email': 'Email không hợp lệ.',
                'string.empty': 'Email không được để trống.',
                'any.required': 'Email là trường bắt buộc.'
            }),
        password: Joi.string().min(8).required()
            .messages({
                'string.base': 'Mật khẩu phải là một chuỗi.',
                'string.min': 'Mật khẩu phải có ít nhất {#limit} ký tự.',
                'string.empty': 'Mật khẩu không được để trống.',
                'any.required': 'Mật khẩu là trường bắt buộc.'
            }),
        fullName: Joi.string().required()
            .messages({
                'string.base': 'Họ tên phải là một chuỗi.',
                'string.empty': 'Họ tên không được để trống.',
                'any.required': 'Họ tên là trường bắt buộc.'
            }),
        dateOfBirth: Joi.date().iso().optional() // Định dạng YYYY-MM-DD
            .messages({
                'date.base': 'Ngày sinh phải là một ngày hợp lệ.',
                'date.format': 'Ngày sinh phải đúng định dạng YYYY-MM-DD.'
            }),
        sex: Joi.string().valid('Male', 'Female', 'Other').optional() // Cho phép các giá trị cụ thể.
            .messages({
                'string.base': 'Giới tính phải là một chuỗi.',
                'any.only': 'Giới tính không hợp lệ. Chỉ chấp nhận Male, Female, Other.'
            }),
        phoneNumber: Joi.string().pattern(/^[0-9]{10,11}$/).optional()
            .messages({
                'string.base': 'Số điện thoại phải là một chuỗi.',
                'string.pattern.base': 'Số điện thoại không hợp lệ. Phải là 10 hoặc 11 chữ số.'
            }),
        address: Joi.string().optional()
            .messages({
                'string.base': 'Địa chỉ phải là một chuỗi.'
            })
    }),

    // Schema cho việc đăng nhập.
    login: Joi.object({
        email: Joi.string().email().required()
            .messages({
                'string.email': 'Email không hợp lệ.',
                'string.empty': 'Email không được để trống.',
                'any.required': 'Email là trường bắt buộc.'
            }),
        password: Joi.string().required()
            .messages({
                'string.empty': 'Mật khẩu không được để trống.',
                'any.required': 'Mật khẩu là trường bắt buộc.'
            })
    }),

    // Schema cho việc cập nhật thông tin hồ sơ người dùng.
    // Lưu ý: Các trường ở đây thường là tùy chọn (optional) vì người dùng có thể chỉ muốn cập nhật một vài thông tin.
    updateProfile: Joi.object({
        fullName: Joi.string().optional()
            .messages({
                'string.base': 'Họ tên phải là một chuỗi.',
                'string.empty': 'Họ tên không được để trống nếu cung cấp.'
            }),
        dateOfBirth: Joi.date().iso().optional()
            .messages({
                'date.base': 'Ngày sinh phải là một ngày hợp lệ.',
                'date.format': 'Ngày sinh phải đúng định dạng YYYY-MM-DD.'
            }),
        sex: Joi.string().valid('Male', 'Female', 'Other').optional()
            .messages({
                'string.base': 'Giới tính phải là một chuỗi.',
                'any.only': 'Giới tính không hợp lệ. Chỉ chấp nhận Male, Female, Other.'
            }),
        phoneNumber: Joi.string().pattern(/^[0-9]{10,11}$/).allow(null, '').optional() // Cho phép null hoặc chuỗi rỗng để xóa
            .messages({
                'string.base': 'Số điện thoại phải là một chuỗi.',
                'string.pattern.base': 'Số điện thoại không hợp lệ. Phải là 10 hoặc 11 chữ số nếu cung cấp.'
            }),
        address: Joi.string().allow(null, '').optional()
            .messages({
                'string.base': 'Địa chỉ phải là một chuỗi.'
            })
    }).min(1) // Yêu cầu ít nhất một trường được cung cấp để cập nhật.
        .messages({
            'object.min': 'Cần cung cấp ít nhất một trường để cập nhật thông tin.'
        }),

    // Schema cho việc thay đổi mật khẩu.
    changePassword: Joi.object({
        oldPassword: Joi.string().required()
            .messages({
                'string.empty': 'Mật khẩu cũ không được để trống.',
                'any.required': 'Mật khẩu cũ là trường bắt buộc.'
            }),
        newPassword: Joi.string().min(8).required()
            .messages({
                'string.base': 'Mật khẩu mới phải là một chuỗi.',
                'string.min': 'Mật khẩu mới phải có ít nhất {#limit} ký tự.',
                'string.empty': 'Mật khẩu mới không được để trống.',
                'any.required': 'Mật khẩu mới là trường bắt buộc.'
            })
        // .invalid(Joi.ref('oldPassword')) // (Tùy chọn) Không cho phép mật khẩu mới trùng mật khẩu cũ
        // .messages({ 'any.invalid': 'Mật khẩu mới không được trùng với mật khẩu cũ.' })
    }),

    // Schema cho việc yêu cầu reset mật khẩu (thường chỉ cần email).
    resetPasswordRequest: Joi.object({
        email: Joi.string().email().required()
            .messages({
                'string.email': 'Email không hợp lệ.',
                'string.empty': 'Email không được để trống.',
                'any.required': 'Email là trường bắt buộc.'
            })
    }),

    // Schema cho việc thực hiện reset mật khẩu (khi đã có token).
    confirmPasswordReset: Joi.object({
        token: Joi.string().required()
            .messages({
                'string.empty': 'Token không được để trống.',
                'any.required': 'Token là trường bắt buộc.'
            }),
        newPassword: Joi.string().min(8).required()
            .messages({
                'string.base': 'Mật khẩu mới phải là một chuỗi.',
                'string.min': 'Mật khẩu mới phải có ít nhất {#limit} ký tự.',
                'string.empty': 'Mật khẩu mới không được để trống.',
                'any.required': 'Mật khẩu mới là trường bắt buộc.'
            })
    }),

    // TODO: Thêm các schema validation khác cho các entities khác của ứng dụng (ví dụ: Movie, Showtime, Booking, ...)
    // createMovie: Joi.object({ ... }),
    // updateMovie: Joi.object({ ... }),
};

// Các console.log này hữu ích để debug khi khởi động, nhưng có thể xóa trong production.
console.log('[validators.js] Exporting validators object with keys:', Object.keys(validators));
if (validators.register) {
    console.log('[validators.js] typeof validators.register before export:', typeof validators.register.validate);
}

module.exports = validators; // Export đối tượng validators.