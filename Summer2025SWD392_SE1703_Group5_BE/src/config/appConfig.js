console.log('[appConfig.js] Module loaded. Reading environment variables...');

const emailConfig = {
    smtpServer: process.env.EMAIL_HOST,
    smtpPort: parseInt(process.env.EMAIL_PORT, 10),
    smtpSecure: process.env.EMAIL_PORT === '465',
    smtpUsername: process.env.EMAIL_USER,
    smtpPassword: process.env.EMAIL_PASSWORD,
    senderEmail: process.env.EMAIL_FROM,
    senderName: process.env.EMAIL_FROM_NAME || '"STP Cinema"',
    apiBaseUrl: process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
    supportPhone: process.env.SUPPORT_PHONE || '1900 xxxx'
};

const logger = console; // Hoặc một instance logger phức tạp hơn (ví dụ: Winston)

const databaseConfig = {
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT, 10),
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
    }
};

const jwtConfig = {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN,
    issuer: process.env.JWT_ISSUER,
    audience: process.env.JWT_AUDIENCE,
    expiresInMilliseconds: parseInt(process.env.JWT_EXPIRES_IN_MILLISECONDS, 10) || 86400000 // 1 ngày
};

const serverConfig = {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    apiBaseUrl: process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`
};

const tokenExpiryConfig = {
    emailVerification: parseInt(process.env.EMAIL_VERIFICATION_TOKEN_EXPIRES_SECONDS, 10) || 86400, // 24 giờ
    passwordReset: parseInt(process.env.PASSWORD_RESET_TOKEN_EXPIRES_MINUTES, 10) || 60,          // 60 phút
};

const constants = {
    SUPPORT_EMAIL: process.env.SUPPORT_EMAIL || 'support@stpcinema.com',
    SUPPORT_PHONE: process.env.SUPPORT_PHONE || '1900-xxxx',
};

module.exports = {
    emailConfig,
    databaseConfig,
    jwtConfig,
    serverConfig,
    tokenExpiryConfig,
    constants,
    logger,
}; 