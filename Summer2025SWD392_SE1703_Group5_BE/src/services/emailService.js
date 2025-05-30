const nodemailer = require('nodemailer');

/**
 * @class EmailService
 * @description Dịch vụ xử lý việc gửi email trong hệ thống.
 */
class EmailService {
    /**
     * Khởi tạo dịch vụ email.
     * @constructor
     * @param {object} logger - Đối tượng logger (ví dụ: console).
     * @param {object} emailConfig - Cấu hình email, bao gồm:
     *   - smtpServer: SMTP server address
     *   - smtpPort: SMTP server port
     *   - enableSsl: Boolean, true nếu sử dụng SSL/TLS
     *   - smtpUsername: SMTP username
     *   - smtpPassword: SMTP password
     *   - senderEmail: Địa chỉ email người gửi
     *   - senderName: Tên người gửi (mặc định là 'GALAXY Cinema')
     *   - apiBaseUrl: URL cơ sở của API (ví dụ cho link xác thực: 'http://localhost:3000')
     *   - supportPhone: Số điện thoại hỗ trợ (ví dụ cho footer email: '1900 xxxx')
     */
    constructor(logger, emailConfig) {
        this._logger = logger || console;
        this._emailConfig = emailConfig;

        if (!this._emailConfig ||
            !this._emailConfig.smtpServer ||
            !this._emailConfig.smtpPort ||
            !this._emailConfig.smtpUsername ||
            !this._emailConfig.smtpPassword ||
            !this._emailConfig.senderEmail) {
            this._logger.error('[EmailService] Cấu hình email không đầy đủ. Các trường smtpServer, smtpPort, smtpUsername, smtpPassword, senderEmail là bắt buộc.');
            throw new Error('EmailService: Cấu hình email không đầy đủ.');
        }

        this._transporter = nodemailer.createTransport({
            host: this._emailConfig.smtpServer,
            port: parseInt(this._emailConfig.smtpPort, 10),
            secure: this._emailConfig.enableSsl || false, // true for 465, false for other ports
            auth: {
                user: this._emailConfig.smtpUsername,
                pass: this._emailConfig.smtpPassword,
            },
            // Ví dụ: để chấp nhận self-signed certificates (KHÔNG NÊN DÙNG TRONG PRODUCTION)
            // tls: {
            //     rejectUnauthorized: false
            // }
        });

        this._senderName = this._emailConfig.senderName || 'GALAXY Cinema';
        this._apiBaseUrl = this._emailConfig.apiBaseUrl || 'http://localhost:3000';
        this._supportPhone = this._emailConfig.supportPhone || '1900 xxxx';
    }

    /**
     * Gửi email đến người nhận với tiêu đề và nội dung được chỉ định.
     * @async
     * @param {string} toEmail - Địa chỉ email người nhận.
     * @param {string} subject - Tiêu đề email.
     * @param {string} body - Nội dung email (hỗ trợ HTML).
     * @param {Array<object>} [attachments=null] - Danh sách các tệp đính kèm (định dạng Nodemailer).
     *                                            Mỗi object attachment có dạng: { filename: string, content: Buffer|Stream|String, contentType: string (optional) }
     * @returns {Promise<boolean>} True nếu gửi thành công, False nếu có lỗi.
     */
    async sendEmailAsync(toEmail, subject, body, attachments = null) {
        try {
            this._logger.info(`[EmailService] Chuẩn bị gửi email đến ${toEmail} với tiêu đề: ${subject}`);

            const mailOptions = {
                from: `"${this._senderName}" <${this._emailConfig.senderEmail}>`,
                to: toEmail,
                subject: subject,
                html: body, // Nodemailer sử dụng 'html' cho nội dung HTML
            };

            if (attachments && attachments.length > 0) {
                this._logger.info(`[EmailService] Thêm ${attachments.length} tệp đính kèm vào email.`);
                // Đảm bảo rằng content là Buffer nếu nó là byte array từ C#
                mailOptions.attachments = attachments.map(att => ({
                    filename: att.filename,
                    content: Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content),
                    contentType: att.contentType,
                }));
            }

            const info = await this._transporter.sendMail(mailOptions);
            this._logger.info(`[EmailService] Email đã gửi thành công đến ${toEmail}. Message ID: ${info.messageId}. Số lượng tệp đính kèm: ${attachments?.length || 0}`);
            return true;
        } catch (error) {
            // Sử dụng this._logger.error(message, errorObject) để log cả error object
            this._logger.error(`[EmailService] Lỗi khi gửi email đến ${toEmail}: ${error.message}`, error);
            return false;
        }
    }

    /**
     * Gửi email xác thực tài khoản cho người dùng mới đăng ký.
     * @async
     * @param {string} email - Email người nhận.
     * @param {string} fullName - Họ tên người nhận.
     * @param {string} token - Token xác thực.
     * @returns {Promise<boolean>} True nếu gửi thành công, False nếu có lỗi.
     */
    async sendVerificationEmailAsync(email, fullName, token) {
        try {
            this._logger.info(`[EmailService] Chuẩn bị gửi email xác thực đến ${email}`);

            const verificationUrl = `${this._apiBaseUrl}/api/auth/verify-email?token=${token}`;
            const subject = "Xác thực tài khoản GALAXY Cinema";
            const body = `
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
                    .header { background-color: #007bff; color: white; padding: 15px; text-align: center; border-radius: 5px 5px 0 0; }
                    .content { padding: 20px; text-align: left; }
                    .button { display: inline-block; padding: 10px 20px; background-color: #007bff; color: white !important; text-decoration: none; border-radius: 5px; }
                    .footer { background-color: #f8f9fa; padding: 10px; text-align: center; font-size: 12px; color: #6c757d; border-radius: 0 0 5px 5px; }
                </style>
            </head>
            <body>
                <div class='container'>
                    <div class='header'>
                        <h2>Xác thực tài khoản GALAXY Cinema</h2>
                    </div>
                    <div class='content'>
                        <p>Xin chào <strong>${fullName}</strong>,</p>
                        <p>Cảm ơn bạn đã đăng ký tài khoản tại GALAXY Cinema. Để hoàn tất quá trình đăng ký, vui lòng xác thực email của bạn bằng cách nhấp vào nút bên dưới:</p>
                        <p style='text-align: center; margin: 20px 0;'>
                            <a href='${verificationUrl}' class='button' style='color: white;'>Xác thực tài khoản</a>
                        </p>
                        <p>Hoặc bạn có thể sao chép và dán đường dẫn sau vào trình duyệt:</p>
                        <p style='word-break: break-all;'><a href='${verificationUrl}'>${verificationUrl}</a></p>
                        <p>Liên kết này sẽ hết hạn sau 24 giờ (hoặc theo cấu hình hệ thống).</p>
                        <p>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.</p>
                        <p>Trân trọng,<br>Đội ngũ GALAXY Cinema</p>
                    </div>
                    <div class='footer'>
                        <p>Đây là email tự động, vui lòng không trả lời email này.</p>
                        <p>Hotline hỗ trợ: ${this._supportPhone}</p>
                    </div>
                </div>
            </body>
            </html>`;

            return await this.sendEmailAsync(email, subject, body);
        } catch (error) {
            this._logger.error(`[EmailService] Lỗi khi gửi email xác thực đến ${email}: ${error.message}`, error);
            return false;
        }
    }

    /**
     * Gửi email chứa mật khẩu tạm thời khi người dùng yêu cầu đặt lại mật khẩu.
     * @param {string} email - Email người nhận.
     * @param {string} fullName - Tên đầy đủ của người nhận.
     * @param {string} temporaryPassword - Mật khẩu tạm thời được tạo.
     * @returns {Promise<boolean>} - True nếu gửi email thành công.
     */
    async sendTemporaryPasswordEmail(email, fullName, temporaryPassword) {
        const loginUrl = `${this._apiBaseUrl}/login`;
        const html = `
            <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                    <h2 style="color: #007bff; text-align: center;">Yêu cầu đặt lại mật khẩu - GALAXY Cinema</h2>
                    <p>Xin chào <strong>${fullName}</strong>,</p>
                    <p>Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
                    <p>Mật khẩu tạm thời của bạn là: <strong style="font-size: 1.1em; color: #dc3545;">${temporaryPassword}</strong></p>
                    <p>Lưu ý quan trọng:</p>
                    <ul>
                        <li>Mật khẩu tạm thời này chỉ có hiệu lực trong một khoảng thời gian ngắn (thường là ${process.env.TEMP_PASSWORD_CACHE_MINUTES || 60} phút).</li>
                        <li>Bạn sẽ được yêu cầu thay đổi mật khẩu này ngay sau khi đăng nhập thành công.</li>
                    </ul>
                    <p>Vui lòng đăng nhập tại <a href="${loginUrl}" style="color: #007bff;">${loginUrl}</a> và sử dụng mật khẩu tạm thời này.</p>
                    <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này hoặc liên hệ bộ phận hỗ trợ nếu bạn lo ngại về bảo mật tài khoản.</p>
                    <p>Trân trọng,<br>Đội ngũ GALAXY Cinema</p>
                </div>
            </body>
            </html>
        `;

        return await this.sendEmailAsync(email, 'Mật khẩu tạm thời cho tài khoản GALAXY Cinema của bạn', html);
    }

    /**
     * Gửi email thông báo tài khoản bị khóa tạm thời.
     * @async
     * @param {string} email - Email người nhận.
     * @param {string} fullName - Họ tên người nhận.
     * @returns {Promise<boolean>} True nếu gửi thành công, False nếu có lỗi.
     */
    async sendAccountLockedEmailAsync(email, fullName) {
        try {
            this._logger.info(`[EmailService] Chuẩn bị gửi email thông báo khóa tài khoản đến ${email}`);

            const subject = "Thông báo tài khoản bị khóa tạm thời";
            const body = `
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
                    .header { background-color: #f8f9fa; padding: 10px; text-align: center; border-radius: 5px 5px 0 0; }
                    .content { padding: 20px; }
                    .footer { background-color: #f8f9fa; padding: 10px; text-align: center; font-size: 12px; color: #6c757d; border-radius: 0 0 5px 5px; }
                </style>
            </head>
            <body>
                <div class='container'>
                    <div class='header'>
                        <h2>Thông báo tài khoản bị khóa tạm thời</h2>
                    </div>
                    <div class='content'>
                    <p>Xin chào <strong>${fullName}</strong>,</p>
                        <p>Chúng tôi phát hiện có nhiều lần đăng nhập không thành công liên tiếp vào tài khoản của bạn.</p>
                        <p>Vì lý do bảo mật, tài khoản của bạn đã bị khóa tạm thời trong vòng 30 phút.</p>
                        <p>Bạn có thể thử đăng nhập lại sau khoảng thời gian này hoặc liên hệ với quản trị viên để được hỗ trợ.</p>
                        <p>Nếu bạn không thực hiện các lần đăng nhập này, vui lòng thay đổi mật khẩu của bạn ngay khi có thể đăng nhập lại.</p>
                        <p>Trân trọng,<br>Đội ngũ hỗ trợ GALAXY Cinema</p>
                    </div>
                    <div class='footer'>
                        <p>Đây là email tự động, vui lòng không trả lời email này.</p>
                        <p>Nếu bạn cần hỗ trợ, vui lòng liên hệ với chúng tôi qua hotline: ${this._supportPhone}</p>
                    </div>
                </div>
            </body>
            </html>
        `;

            return await this.sendEmailAsync(email, subject, body);
        } catch (error) {
            this._logger.error(`[EmailService] Lỗi khi gửi email thông báo khóa tài khoản đến ${email}: ${error.message}`, error);
            return false;
        }
    }

    /**
     * Gửi email chào mừng cho khách hàng mới đăng ký.
     * @async
     * @param {string} email - Email người nhận.
     * @param {string} fullName - Họ tên người nhận.
     * @returns {Promise<boolean>} True nếu gửi thành công, False nếu có lỗi.
     */
    async sendWelcomeEmailAsync(email, fullName) {
        try {
            this._logger.info(`[EmailService] Chuẩn bị gửi email chào mừng đến ${email}`);

            const subject = "Chào mừng bạn đến với GALAXY Cinema!";
            // Login URL or a general link to the service can be included.
            const serviceUrl = this._apiBaseUrl; // Or a more specific explore/login page

            const body = `
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
                    .header { background-color: #007bff; color: white; padding: 15px; text-align: center; border-radius: 5px 5px 0 0; }
                    .content { padding: 20px; text-align: left; }
                    .button { display: inline-block; padding: 10px 20px; margin-top: 15px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px; }
                    .footer { background-color: #f8f9fa; padding: 10px; text-align: center; font-size: 12px; color: #6c757d; border-radius: 0 0 5px 5px; }
                </style>
            </head>
            <body>
                <div class='container'>
                    <div class='header'>
                        <h2>Chào mừng bạn đến với GALAXY Cinema!</h2>
                    </div>
                    <div class='content'>
                    <p>Xin chào <strong>${fullName}</strong>,</p>
                        <p>Chúng tôi rất vui mừng chào đón bạn đã đăng ký tài khoản thành công trên hệ thống của GALAXY Cinema.</p>
                        <p>Với tài khoản này, bạn có thể:</p>
                        <ul>
                            <li>Đặt vé xem phim một cách nhanh chóng và tiện lợi.</li>
                            <li>Theo dõi lịch sử giao dịch và vé đã đặt.</li>
                            <li>Nhận thông báo về các bộ phim mới và ưu đãi đặc biệt.</li>
                            <li>Và nhiều tiện ích khác đang chờ bạn khám phá!</li>
                        </ul>
                        <p>Hãy bắt đầu trải nghiệm những dịch vụ tuyệt vời của chúng tôi ngay hôm nay!</p>
                        <p style='text-align: center;'>
                            <a href='${serviceUrl}' class='button' style='color: white;'>Khám phá ngay</a>
                        </p>
                        <p>Nếu bạn có bất kỳ câu hỏi nào, đừng ngần ngại liên hệ với đội ngũ hỗ trợ của chúng tôi.</p>
                        <p>Trân trọng,<br>Đội ngũ GALAXY Cinema</p>
                    </div>
                    <div class='footer'>
                        <p>Đây là email tự động, vui lòng không trả lời email này.</p>
                        <p>Hotline hỗ trợ: ${this._supportPhone}</p>
                    </div>
                </div>
            </body>
            </html>
        `;

            return await this.sendEmailAsync(email, subject, body);
        } catch (error) {
            this._logger.error(`[EmailService] Lỗi khi gửi email chào mừng đến ${email}: ${error.message}`, error);
            return false;
        }
    }

    /**
     * Gửi email thông báo mật khẩu đã được thay đổi thành công.
     * @param {string} email - Email người nhận.
     * @param {string} fullName - Tên đầy đủ của người nhận.
     * @returns {Promise<boolean>} - True nếu gửi email thành công.
     */
    async sendPasswordChangedEmail(email, fullName) {
        const loginUrl = `${this._apiBaseUrl}/login`;
        const contactUrl = `${this._apiBaseUrl}/contact`;
        const html = `
            <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                    <h2 style="color: #17a2b8; text-align: center;">Thông báo: Mật khẩu tài khoản GALAXY Cinema đã được thay đổi</h2>
                    <p>Xin chào <strong>${fullName}</strong>,</p>
                    <p>Mật khẩu cho tài khoản GALAXY Cinema liên kết với địa chỉ email này đã được thay đổi thành công.</p>
                    <p>Nếu bạn là người thực hiện thay đổi này, bạn không cần làm gì thêm.</p>
                    <p>Nếu bạn không thực hiện thay đổi này, vui lòng liên hệ ngay với bộ phận hỗ trợ của chúng tôi tại <a href="${contactUrl}" style="color: #007bff;">đây</a> hoặc thực hiện các bước bảo mật tài khoản cần thiết.</p>
                    <p>Bạn có thể đăng nhập vào tài khoản của mình tại <a href="${loginUrl}" style="color: #007bff;">${loginUrl}</a>.</p>
                    <p>Trân trọng,<br>Đội ngũ GALAXY Cinema</p>
                </div>
            </body>
            </html>
        `;
        return await this.sendEmailAsync(email, 'Thông báo thay đổi mật khẩu tài khoản GALAXY Cinema', html);
    }

    /**
     * Gửi email nhắc nhở trước suất chiếu kèm vé xem phim.
     * @async
     * @param {string} toEmail - Địa chỉ email người nhận.
     * @param {string} customerName - Tên khách hàng.
     * @param {object} bookingInfo - Thông tin đặt vé (ví dụ: { BookingId, MovieName, CinemaRoom, ShowDate, ShowTime, Seats }).
     * @param {Array<object>} pdfTickets - Danh sách các vé dạng PDF. Mỗi object: { filename: string, content: Buffer, contentType: 'application/pdf' }.
     * @param {number} minutesToShowtime - Số phút còn lại trước khi phim bắt đầu.
     * @returns {Promise<boolean>} True nếu gửi thành công, False nếu có lỗi.
     */
    async sendReminderEmailAsync(
        toEmail,
        customerName,
        bookingInfo,
        pdfTickets, // Expected: [{ filename: 'Ve_GALAXY_Cinema_CODE.pdf', content: Buffer, contentType: 'application/pdf' }, ...]
        minutesToShowtime
    ) {
        try {
            this._logger.info(`[EmailService] Chuẩn bị gửi email nhắc nhở đến ${toEmail} cho booking ${bookingInfo.BookingId}`);

            const subject = `⏰ NHẮC NHỞ: Suất chiếu phim ${bookingInfo.MovieName} sắp bắt đầu trong ${minutesToShowtime} phút`;
            const body = `
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
                    .header { background-color: #ffc107; color: #333; padding: 15px; text-align: center; border-radius: 5px 5px 0 0; }
                    .content { padding: 20px; }
                    .ticket-info { background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px; border: 1px dashed #ccc; }
                    .reminder { background-color: #fff3cd; color: #856404; padding: 15px; border-radius: 5px; margin-bottom: 20px; border-left: 5px solid #ffc107; }
                    .footer { background-color: #f8f9fa; padding: 10px; text-align: center; font-size: 12px; color: #6c757d; border-radius: 0 0 5px 5px; }
                </style>
            </head>
            <body>
                <div class='container'>
                    <div class='header'>
                        <h2>⏰ Nhắc nhở: Suất chiếu phim sắp bắt đầu</h2>
                    </div>
                    <div class='content'>
                        <p>Xin chào <strong>${customerName}</strong>,</p>
                        
                        <div class='reminder'>
                            <h3>Suất chiếu phim của bạn sẽ bắt đầu trong ${minutesToShowtime} phút!</h3>
                            <p>Hãy đảm bảo bạn đã có mặt tại rạp để không bỏ lỡ bất kỳ phần nào của bộ phim.</p>
                        </div>
                        
                        <p>Dưới đây là thông tin chi tiết về đặt vé của bạn:</p>
                        
                        <div class='ticket-info'>
                            <p><strong>Mã đặt vé:</strong> ${bookingInfo.BookingId}</p>
                            <p><strong>Phim:</strong> ${bookingInfo.MovieName}</p>
                            <p><strong>Phòng chiếu:</strong> ${bookingInfo.CinemaRoom}</p>
                            <p><strong>Ngày chiếu:</strong> ${bookingInfo.ShowDate}</p>
                            <p><strong>Giờ chiếu:</strong> ${bookingInfo.ShowTime}</p>
                            <p><strong>Ghế:</strong> ${bookingInfo.Seats}</p>
                        </div>
                        
                        <p>Vé của bạn được đính kèm lại dưới dạng file PDF để tiện sử dụng. Vui lòng mang theo vé (bản in hoặc trên điện thoại) khi đến rạp.</p>
                        <p><strong>Lưu ý quan trọng:</strong> Vui lòng đến trước giờ chiếu ít nhất 10 phút để hoàn tất thủ tục kiểm tra vé và vào phòng chiếu.</p>
                        <p>Chúc bạn có trải nghiệm xem phim thú vị!</p>
                        <p>Trân trọng,<br>Đội ngũ GALAXY Cinema</p>
                    </div>
                    <div class='footer'>
                        <p>Đây là email tự động, vui lòng không trả lời email này.</p>
                        <p>Nếu bạn cần hỗ trợ, vui lòng liên hệ với chúng tôi qua hotline: ${this._supportPhone}</p>
                    </div>
                </div>
            </body>
            </html>`;

            // Chuẩn bị attachments cho nodemailer
            // pdfTickets được kỳ vọng là một mảng các object, mỗi object chứa filename, content (Buffer), và contentType.
            const attachments = pdfTickets.map(ticket => ({
                filename: ticket.filename, // Ví dụ: 'Ve_GALAXY_Cinema_TICKETCODE1.pdf'
                content: ticket.content,   // Buffer nội dung PDF
                contentType: ticket.contentType || 'application/pdf',
            }));

            return await this.sendEmailAsync(toEmail, subject, body, attachments);

        } catch (error) {
            this._logger.error(`[EmailService] Lỗi khi gửi email nhắc nhở đến ${toEmail} cho booking ${bookingInfo?.BookingId}: ${error.message}`, error);
            return false;
        }
    }

    /**
     * Gửi email thông báo mật khẩu cho người dùng mới.
     * @async
     * @param {string} email - Email người nhận.
     * @param {string} fullName - Họ tên người nhận.
     * @param {string} password - Mật khẩu tạm thời.
     * @returns {Promise<boolean>} True nếu gửi thành công, False nếu có lỗi.
     */
    async sendPasswordNotificationEmailAsync(email, fullName, password) {
        try {
            this._logger.info(`[EmailService] Chuẩn bị gửi email thông báo mật khẩu đến ${email}`);

            const subject = "Thông tin tài khoản mới của bạn tại GALAXY Cinema";
            const body = `
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
                    .header { background-color: #f8f9fa; padding: 10px; text-align: center; border-radius: 5px 5px 0 0; }
                    .content { padding: 20px; }
                    .password { font-family: monospace; background-color: #f5f5f5; padding: 5px 8px; border-radius: 3px; border: 1px solid #ddd; display: inline-block; }
                    .footer { background-color: #f8f9fa; padding: 10px; text-align: center; font-size: 12px; color: #6c757d; border-radius: 0 0 5px 5px; }
                </style>
            </head>
            <body>
                <div class='container'>
                    <div class='header'>
                        <h2>Thông Tin Tài Khoản Mới - GALAXY Cinema</h2>
                    </div>
                    <div class='content'>
                        <p>Xin chào <strong>${fullName}</strong>,</p>
                        <p>Tài khoản của bạn đã được tạo thành công trong hệ thống GALAXY Cinema.</p>
                        <p>Dưới đây là thông tin đăng nhập của bạn:</p>
                        <ul>
                            <li><strong>Email:</strong> ${email}</li>
                            <li><strong>Mật khẩu tạm thời:</strong> <span class='password'>${password}</span></li>
                        </ul>
                        <p>Vui lòng đăng nhập và đổi mật khẩu ngay sau khi nhận được email này để đảm bảo an toàn cho tài khoản của bạn. Bạn có thể đăng nhập tại: <a href="${this._apiBaseUrl}/login">${this._apiBaseUrl}/login</a></p>
                        <p>Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.</p>
                        <p>Trân trọng,<br>Đội ngũ GALAXY Cinema</p>
                    </div>
                    <div class='footer'>
                        <p>Đây là email tự động, vui lòng không trả lời email này.</p>
                        <p>Nếu bạn cần hỗ trợ, vui lòng liên hệ với chúng tôi qua hotline: ${this._supportPhone}</p>
                    </div>
                </div>
            </body>
            </html>
            `;

            return await this.sendEmailAsync(email, subject, body);
        } catch (error) {
            this._logger.error(`[EmailService] Lỗi khi gửi email thông báo mật khẩu đến ${email}: ${error.message}`, error);
            return false;
        }
    }

    /**
     * Gửi email vé xem phim kèm file PDF.
     * @async
     * @param {string} toEmail - Địa chỉ email người nhận.
     * @param {string} customerName - Tên khách hàng.
     * @param {object} bookingInfo - Thông tin đặt vé (ví dụ: { BookingId, MovieName, CinemaRoom, ShowDate, ShowTime, Seats }).
     * @param {Array<object>} pdfTickets - Danh sách các vé dạng PDF. Mỗi object: { filename: string, content: Buffer, contentType: 'application/pdf' }.
     * @returns {Promise<boolean>} True nếu gửi thành công, False nếu có lỗi.
     */
    async sendTicketsEmailAsync(
        toEmail,
        customerName,
        bookingInfo,
        pdfTickets // Expected: [{ filename: 'Ve_GALAXY_Cinema_CODE.pdf', content: Buffer, contentType: 'application/pdf' }, ...]
    ) {
        try {
            this._logger.info(`[EmailService] Chuẩn bị gửi email vé đến ${toEmail} cho booking ${bookingInfo.BookingId}`);

            const subject = `Vé xem phim của bạn tại GALAXY Cinema - Mã đặt vé: ${bookingInfo.BookingId}`;
            const body = `
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
                    .header { background-color: #28a745; color: white; padding: 15px; text-align: center; border-radius: 5px 5px 0 0; }
                    .content { padding: 20px; }
                    .ticket-info { background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px; border: 1px dashed #ccc; }
                    .footer { background-color: #f8f9fa; padding: 10px; text-align: center; font-size: 12px; color: #6c757d; border-radius: 0 0 5px 5px; }
                </style>
            </head>
            <body>
                <div class='container'>
                    <div class='header'>
                        <h2>Vé xem phim của bạn - GALAXY Cinema</h2>
                    </div>
                    <div class='content'>
                        <p>Xin chào <strong>${customerName}</strong>,</p>
                        <p>Cảm ơn bạn đã đặt vé tại GALAXY Cinema. Dưới đây là thông tin chi tiết về đặt vé của bạn:</p>
                        
                        <div class='ticket-info'>
                            <p><strong>Mã đặt vé:</strong> ${bookingInfo.BookingId}</p>
                            <p><strong>Phim:</strong> ${bookingInfo.MovieName}</p>
                            <p><strong>Phòng chiếu:</strong> ${bookingInfo.CinemaRoom}</p>
                            <p><strong>Ngày chiếu:</strong> ${bookingInfo.ShowDate}</p>
                            <p><strong>Giờ chiếu:</strong> ${bookingInfo.ShowTime}</p>
                            <p><strong>Ghế:</strong> ${bookingInfo.Seats}</p>
                        </div>
                        
                        <p>Vé của bạn được đính kèm dưới dạng file PDF. Vui lòng mang theo vé (bản in hoặc trên điện thoại) khi đến rạp.</p>
                        <p><strong>Lưu ý quan trọng:</strong> Vui lòng đến trước giờ chiếu ít nhất 15 phút để hoàn tất thủ tục kiểm tra vé và vào phòng chiếu.</p>
                        <p>Chúc bạn có trải nghiệm xem phim thú vị!</p>
                        <p>Trân trọng,<br>Đội ngũ GALAXY Cinema</p>
                    </div>
                    <div class='footer'>
                        <p>Đây là email tự động, vui lòng không trả lời email này.</p>
                        <p>Nếu bạn cần hỗ trợ, vui lòng liên hệ với chúng tôi qua hotline: ${this._supportPhone}</p>
                    </div>
                </div>
            </body>
            </html>`;

            const attachments = pdfTickets.map(ticket => ({
                filename: ticket.filename,
                content: ticket.content,
                contentType: ticket.contentType || 'application/pdf',
            }));

            return await this.sendEmailAsync(toEmail, subject, body, attachments);

        } catch (error) {
            this._logger.error(`[EmailService] Lỗi khi gửi email vé đến ${toEmail} cho booking ${bookingInfo?.BookingId}: ${error.message}`, error);
            return false;
        }
    }

    async sendPasswordResetEmailAsync(email, fullName, resetLink) {
        try {
            this._logger.info(`[EmailService] Chuẩn bị gửi email đặt lại mật khẩu đến ${email}`);
            const subject = "Yêu cầu đặt lại mật khẩu cho tài khoản STP Cinema";
            const body = `
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9; }
                    .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                    .header h2 { margin: 0; font-size: 24px; }
                    .content { padding: 25px; text-align: left; background-color: #ffffff; border-bottom: 1px solid #eee; }
                    .content p { margin-bottom: 15px; font-size: 16px; }
                    .content strong { color: #333; }
                    .button-container { text-align: center; margin: 25px 0; }
                    .button { display: inline-block; padding: 14px 28px; background-color: #dc3545; color: white !important; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold; }
                    .link-alt { word-break: break-all; font-size: 13px; color: #555; }
                    .footer { background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #777; border-radius: 0 0 8px 8px; }
                    .footer p { margin: 5px 0; }
                </style>
            </head>
            <body>
                <div class='container'>
                    <div class='header'>
                        <h2>Yêu cầu đặt lại mật khẩu</h2>
                    </div>
                    <div class='content'>
                        <p>Xin chào <strong>${fullName}</strong>,</p>
                        <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản STP Cinema của bạn.</p>
                        <p>Vui lòng nhấp vào nút bên dưới để đặt lại mật khẩu của bạn:</p>
                        <div class='button-container'>
                            <a href='${resetLink}' class='button' style='color: white;'>Đặt lại mật khẩu</a>
                        </div>
                        <p>Nếu nút trên không hoạt động, bạn cũng có thể sao chép và dán đường dẫn sau vào trình duyệt:</p>
                        <p class='link-alt'><a href='${resetLink}' style='color: #007bff;'>${resetLink}</a></p>
                        <p>Liên kết này sẽ hết hạn sau ${parseInt(process.env.PASSWORD_RESET_TOKEN_EXPIRES_MINUTES || '60', 10)} phút.</p>
                        <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này. Tài khoản của bạn vẫn an toàn.</p>
                        <p>Trân trọng,<br>Đội ngũ STP Cinema</p>
                    </div>
                    <div class='footer'>
                        <p>Đây là email tự động, vui lòng không trả lời.</p>
                        <p>Hotline hỗ trợ: ${this._supportPhone || '1900 xxxx'}</p>
                    </div>
                </div>
            </body>
            </html>`;

            return await this.sendEmailAsync(email, subject, body);
        } catch (error) {
            this._logger.error(`[EmailService] Lỗi khi gửi email đặt lại mật khẩu đến ${email}: ${error.message}`, error);
            return false;
        }
    }

    async sendPasswordChangedConfirmationEmailAsync(email, fullName) {
        try {
            this._logger.info(`[EmailService] Chuẩn bị gửi email xác nhận thay đổi mật khẩu đến ${email}`);
            const subject = "Xác nhận thay đổi mật khẩu tài khoản STP Cinema";
            // Login URL or a general link to the service can be included.
            const serviceUrl = this._apiBaseUrl || 'http://localhost:3000';
            const loginUrl = `${serviceUrl}/login`; // Assuming a login path

            const body = `
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9; }
                    .header { background-color: #28a745; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                    .header h2 { margin: 0; font-size: 24px; }
                    .content { padding: 25px; text-align: left; background-color: #ffffff; border-bottom: 1px solid #eee; }
                    .content p { margin-bottom: 15px; font-size: 16px; }
                    .footer { background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #777; border-radius: 0 0 8px 8px; }
                    .footer p { margin: 5px 0; }
                </style>
            </head>
            <body>
                <div class='container'>
                    <div class='header'>
                        <h2>Mật khẩu đã được thay đổi</h2>
                    </div>
                    <div class='content'>
                        <p>Xin chào <strong>${fullName}</strong>,</p>
                        <p>Mật khẩu cho tài khoản STP Cinema của bạn đã được thay đổi thành công.</p>
                        <p>Nếu bạn là người thực hiện thay đổi này, bạn không cần làm gì thêm.</p>
                        <p>Nếu bạn không thực hiện thay đổi này, vui lòng liên hệ ngay với bộ phận hỗ trợ của chúng tôi.</p>
                        <p>Bạn có thể đăng nhập vào tài khoản của mình tại <a href="${loginUrl}" style="color: #007bff;">trang đăng nhập</a>.</p>
                        <p>Trân trọng,<br>Đội ngũ STP Cinema</p>
                    </div>
                    <div class='footer'>
                        <p>Đây là email tự động, vui lòng không trả lời.</p>
                        <p>Hotline hỗ trợ: ${this._supportPhone || '1900 xxxx'}</p>
                    </div>
                </div>
            </body>
            </html>`;

            return await this.sendEmailAsync(email, subject, body);
        } catch (error) {
            this._logger.error(`[EmailService] Lỗi khi gửi email xác nhận thay đổi mật khẩu đến ${email}: ${error.message}`, error);
            return false;
        }
    }
}

module.exports = EmailService;