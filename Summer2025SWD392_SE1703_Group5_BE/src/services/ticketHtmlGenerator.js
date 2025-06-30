'use strict';

/**
 * TicketHtmlGenerator service
 * Tạo HTML tĩnh cho vé điện tử và email
 */
class TicketHtmlGenerator {
    /**
     * Tạo HTML cho một vé điện tử
     * @param {Object} ticketData - Dữ liệu vé
     * @returns {string} - HTML content của vé
     */
    generate(ticketData) {
        return `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vé xem phim - GALAXY Cinema</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', sans-serif;
            line-height: 1.5;
            color: #333333;
            background-color: #ffffff;
        }
        
        .ticket-container {
            max-width: 400px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        }
        
        .ticket-header {
            background: linear-gradient(135deg, #1a2a6c, #b21f1f, #fdbb2d);
            color: white;
            padding: 20px;
            text-align: center;
        }
        
        .ticket-header h2 {
            margin: 0;
            font-size: 24px;
            font-weight: 700;
            letter-spacing: 1px;
        }
        
        .ticket-header p {
            margin: 5px 0 0;
            font-size: 12px;
            letter-spacing: 2px;
            text-transform: uppercase;
        }
        
        .ticket-divider {
            position: relative;
            height: 20px;
            border-bottom: 2px dashed #d1d5db;
        }
        
        .ticket-divider::before,
        .ticket-divider::after {
            content: '';
            position: absolute;
            bottom: -6px;
            width: 12px;
            height: 12px;
            background-color: #f3f4f6;
            border-radius: 50%;
        }
        
        .ticket-divider::before {
            left: -6px;
        }
        
        .ticket-divider::after {
            right: -6px;
        }
        
        .ticket-content {
            padding: 25px;
        }
        
        .movie-title {
            font-size: 22px;
            font-weight: 700;
            color: #1f2937;
            margin: 0 0 5px;
            text-align: center;
        }
        
        .movie-meta {
            font-size: 14px;
            color: #6b7280;
            text-align: center;
            margin: 0 0 20px;
        }
        
        .ticket-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 25px;
        }
        
        .info-column {
            flex: 1;
        }
        
        .info-item {
            margin-bottom: 12px;
            display: flex;
            align-items: center;
        }
        
        .info-icon {
            width: 18px;
            height: 18px;
            margin-right: 10px;
            color: #6b7280;
        }
        
        .info-text {
            font-size: 14px;
            color: #1f2937;
        }
        
        .seat-badge {
            background-color: #ffedd5;
            color: #f97316;
            font-size: 24px;
            font-weight: 700;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 5px;
        }
        
        .seat-label {
            text-align: center;
            font-size: 12px;
            color: #6b7280;
        }
        
        .ticket-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 20px;
            border-top: 1px solid #e5e7eb;
            padding-top: 20px;
        }
        
        .qrcode {
            border: 4px solid #1f2937;
            padding: 5px;
            background: white;
            border-radius: 5px;
        }
        
        .qrcode img {
            width: 100px;
            height: 100px;
            display: block;
        }
        
        .ticket-id {
            margin-right: 15px;
        }
        
        .ticket-id-label {
            font-size: 12px;
            color: #6b7280;
            margin: 0;
        }
        
        .ticket-id-value {
            font-family: monospace;
            font-size: 16px;
            font-weight: 700;
            color: #1f2937;
            margin: 5px 0 0;
        }
        
        .ticket-footer-note {
            background-color: #f3f4f6;
            padding: 15px;
            text-align: center;
            margin-top: 20px;
        }
        
        .ticket-footer-note p {
            margin: 0;
            font-size: 14px;
            color: #4b5563;
            font-weight: 500;
        }
        
        .ticket-footer-note small {
            display: block;
            margin-top: 5px;
            font-size: 12px;
            color: #6b7280;
        }
    </style>
</head>
<body>
    <div class="ticket-container">
        <div class="ticket-header">
            <h2>GALAXY CINEMA</h2>
            <p>VŨ TRỤ ĐIỆN ẢNH</p>
        </div>
        
        <div class="ticket-divider"></div>
        
        <div class="ticket-content">
            <h2 class="movie-title">${ticketData.movieTitle}</h2>
            <p class="movie-meta">${ticketData.movieFormat}</p>
            
            <div class="ticket-info">
                <div class="info-column">
                    <div class="info-item">
                        <span class="info-icon">📅</span>
                        <span class="info-text">${ticketData.showDate}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-icon">⏰</span>
                        <span class="info-text">${ticketData.showtime}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-icon">🏢</span>
                        <span class="info-text">${ticketData.room}</span>
                    </div>
                </div>
                
                <div class="info-column" style="display: flex; flex-direction: column; align-items: center;">
                    <div class="seat-badge">
                        ${ticketData.seats}
                    </div>
                    <p class="seat-label">Ghế của bạn</p>
                </div>
            </div>
            
            <div class="ticket-footer">
                <div class="ticket-id">
                    <p class="ticket-id-label">MÃ VÉ</p>
                    <p class="ticket-id-value">${ticketData.bookingCode}</p>
                </div>
                
                <div class="qrcode">
                    <img src="${ticketData.qrCodeUrl}" alt="QR Code">
                </div>
            </div>
        </div>
        
        <div class="ticket-footer-note">
            <p>Vui lòng đến trước 15 phút để check-in</p>
            <small>Vé có giá trị duy nhất cho suất chiếu này</small>
        </div>
    </div>
</body>
</html>
        `;
    }

    /**
     * Tạo HTML cho email xác nhận đặt vé
     * @param {Object} bookingData - Dữ liệu đơn đặt vé
     * @param {Array} tickets - Dữ liệu các vé trong đơn
     * @returns {string} - HTML content của email
     */
    generateEmail(bookingData, tickets = []) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vé điện tử - Galaxy Cinema</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            line-height: 1.6; 
            color: #333; 
            margin: 0; 
            padding: 0; 
        }
        
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: #ffffff; 
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .header { 
            background: #FFD875;
            background: linear-gradient(135deg, #FFD875, #E8B73E);
            color: #333; 
            padding: 30px 20px; 
            text-align: center; 
        }
        
        .header h1 { 
            margin: 0; 
            font-size: 28px; 
            font-weight: bold; 
            color: #333;
        }
        
        .header p { 
            margin: 10px 0 0 0; 
            font-size: 16px; 
            opacity: 0.9; 
            color: #333;
        }
        
        .content { 
            padding: 30px 20px; 
        }
        
        .movie-card {
            display: flex;
            margin-bottom: 20px;
            background-color: #FFFAED;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid #FFE9A8;
        }
        
        .movie-poster {
            width: 100px;
            min-width: 100px;
            height: 150px;
            object-fit: cover;
        }
        
        .movie-details {
            padding: 15px;
            flex: 1;
        }
        
        .movie-title {
            font-size: 18px;
            font-weight: 700;
            margin: 0 0 10px 0;
            color: #333;
        }
        
        .movie-meta {
            font-size: 14px;
            color: #4a5568;
            margin-bottom: 10px;
        }
        
        .tag {
            display: inline-block;
            padding: 4px 8px;
            background-color: #FFE9A8;
            color: #B38A28;
            border-radius: 4px;
            font-size: 12px;
            margin-right: 5px;
        }
        
        .tag.rating {
            background-color: #FFE9A8;
            color: #B38A28;
        }
        
        .booking-info { 
            background-color: #FFFAED; 
            padding: 20px; 
            border-radius: 8px; 
            margin: 20px 0; 
            border-left: 4px solid #FFD875; 
        }
        
        .booking-info h3 { 
            margin-top: 0; 
            color: #B38A28; 
            font-size: 18px; 
        }
        
        .info-row { 
            display: flex; 
            justify-content: space-between; 
            margin: 10px 0; 
            padding: 8px 0; 
            border-bottom: 1px solid #FFE9A8; 
        }
        
        .info-label { 
            font-weight: bold; 
            color: #495057; 
        }
        
        .info-value { 
            color: #212529; 
            text-align: right; 
        }
        
        .price-breakdown {
            background-color: #FFFAED;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
            border: 1px solid #FFE9A8;
        }
        
        .price-breakdown h3 {
            margin-top: 0;
            color: #B38A28;
            font-size: 16px;
            border-bottom: 1px solid #FFE9A8;
            padding-bottom: 10px;
        }
        
        .price-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            font-size: 14px;
        }
        
        .price-row.discount {
            color: #B38A28;
        }
        
        .price-row.total {
            font-weight: 700;
            font-size: 16px;
            margin-top: 10px;
            border-top: 2px dashed #FFE9A8;
            padding-top: 10px;
            color: #B38A28;
        }
        
        .tickets-section { 
            margin: 30px 0; 
        }
        
        .ticket-item { 
            background-color: #fff; 
            border: 2px solid #FFE9A8; 
            border-radius: 8px; 
            padding: 15px; 
            margin: 10px 0; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.1); 
        }
        
        .ticket-header { 
            background-color: #FFD875; 
            color: #333; 
            padding: 10px 15px; 
            margin: -15px -15px 15px -15px; 
            border-radius: 6px 6px 0 0; 
            display: flex;
            align-items: center;
        }
        
        .ticket-icon {
            font-size: 18px;
            margin-right: 8px;
        }
        
        .total-amount { 
            background-color: #FFD875; 
            color: #333; 
            padding: 15px; 
            text-align: center; 
            font-size: 18px; 
            font-weight: bold; 
            border-radius: 8px; 
            margin: 20px 0; 
        }
        
        .instructions { 
            background-color: #FFFAED; 
            border: 1px solid #FFE9A8; 
            padding: 20px; 
            border-radius: 8px; 
            margin: 20px 0; 
        }
        
        .instructions h4 { 
            color: #B38A28; 
            margin-top: 0; 
        }
        
        .instructions ul { 
            margin: 10px 0;
            padding-left: 20px;
        }
        
        .instructions li { 
            margin: 5px 0; 
            color: #333; 
        }
        
        .attachment-note { 
            background-color: #FFFAED; 
            border: 1px solid #FFE9A8; 
            color: #B38A28; 
            padding: 15px; 
            border-radius: 8px; 
            margin: 20px 0; 
        }
        
        .footer { 
            background-color: #FFFAED; 
            padding: 20px; 
            text-align: center; 
            font-size: 12px; 
            color: #6c757d; 
            border-top: 1px solid #FFE9A8;
        }
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>🎬 VÉ ĐIỆN TỬ GALAXY CINEMA</h1>
            <p>Cảm ơn bạn đã lựa chọn GALAXY Cinema!</p>
        </div>
        
        <div class='content'>
            <p>Xin chào <strong>${bookingData.customerName || 'Quý khách'}</strong>,</p>
            <p>Chúng tôi xin gửi đến bạn vé điện tử và hóa đơn cho buổi xem phim sắp tới:</p>
            
            <div class="movie-card">
                <img src="${bookingData.moviePosterUrl || 'https://via.placeholder.com/100x150?text=Cinema'}" 
                     alt="${bookingData.movieTitle}" class="movie-poster"
                     onerror="this.src='https://via.placeholder.com/100x150?text=Cinema'">
                     
                <div class="movie-details">
                    <h3 class="movie-title">${bookingData.movieTitle}</h3>
                    <p class="movie-meta">${bookingData.movieFormat}</p>
                    
                    <div>
                        <span class="tag">${bookingData.movieFormat || '2D'}</span>
                        <span class="tag rating">${bookingData.movieRating || 'PG'}</span>
                    </div>
                </div>
            </div>
            
            <div class='booking-info'>
                <h3>📋 THÔNG TIN ĐẶT VÉ</h3>
                <div class='info-row'>
                    <span class='info-label'>Mã đặt vé:</span>
                    <span class='info-value'><strong>${bookingData.bookingCode}</strong></span>
                </div>
                <div class='info-row'>
                    <span class='info-label'>Rạp chiếu:</span>
                    <span class='info-value'><strong>${bookingData.cinemaName}</strong></span>
                </div>
                <div class='info-row'>
                    <span class='info-label'>Phòng chiếu:</span>
                    <span class='info-value'>${bookingData.room}</span>
                </div>
                <div class='info-row'>
                    <span class='info-label'>Ngày chiếu:</span>
                    <span class='info-value'>${bookingData.showDate}</span>
                </div>
                <div class='info-row'>
                    <span class='info-label'>Giờ chiếu:</span>
                    <span class='info-value'><strong>${bookingData.showtime}</strong></span>
                </div>
                <div class='info-row'>
                    <span class='info-label'>Ghế ngồi:</span>
                    <span class='info-value'><strong>${bookingData.seats}</strong></span>
                </div>
            </div>
            
            <div class="price-breakdown">
                <h3>💰 CHI TIẾT THANH TOÁN</h3>
                <div class="price-row">
                    <span>Phương thức:</span>
                    <span>${bookingData.paymentMethod || 'Tiền mặt'}</span>
                </div>
                <div class="price-row">
                    <span>Tổng giá vé:</span>
                    <span>${bookingData.subtotal || '-'}</span>
                </div>
                ${bookingData.discount > 0 ? `
                <div class="price-row discount">
                    <span>Giảm giá (điểm):</span>
                    <span>${bookingData.discount}</span>
                </div>
                ` : ''}
                <div class="price-row total">
                    <span>TỔNG CỘNG:</span>
                    <span>${bookingData.total || '-'}</span>
                </div>
            </div>
            
            ${tickets.length > 0 ? `
            <div class='tickets-section'>
                <h3>🎫 DANH SÁCH VÉ (${tickets.length} vé):</h3>
                ${tickets.map((ticket, index) => {
                    const seatInfo = ticket.SeatInfo?.SeatLabel || ticket.seatLabel || '-';
                    const ticketCode = ticket.Ticket_Code || ticket.ticketCode || '-';
                    const price = ticket.PriceInfo?.Final_Price || ticket.finalPrice || 0;
                    
                    return `
                    <div class='ticket-item'>
                        <div class='ticket-header'>
                            <span class="ticket-icon">🎟️</span> VÉ #${ticketCode}
                        </div>
                        <div class='info-row'>
                            <span class='info-label'>Mã vé:</span>
                            <span class='info-value'><strong>${ticketCode}</strong></span>
                        </div>
                        <div class='info-row'>
                            <span class='info-label'>Ghế:</span>
                            <span class='info-value'><strong>${seatInfo}</strong></span>
                        </div>
                        <div class='info-row'>
                            <span class='info-label'>Giá vé:</span>
                            <span class='info-value'><strong>${typeof price === 'number' ? price.toLocaleString('vi-VN') : price} VND</strong></span>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
            ` : ''}
            
            <div class='attachment-note'>
                📎 <strong>VÉ PDF ĐÍNH KÈM:</strong><br>
                Chúng tôi đã đính kèm vé điện tử trong email này. 
                Bạn có thể in hoặc lưu trữ các file này để sử dụng tại rạp.
            </div>
            
            <div class='instructions'>
                <h4>📋 HƯỚNG DẪN QUAN TRỌNG:</h4>
                <ul>
                    <li><strong>Vui lòng đến rạp trước giờ chiếu ít nhất 15 phút</strong></li>
                    <li>Mang theo <strong>mã đặt vé ${bookingData.bookingCode}</strong> để check-in</li>
                    <li>Hoặc quét QR code trên vé PDF tại máy quét tự động</li>
                    <li>Hoặc sử dụng mã vé cá nhân để quét tại quầy</li>
                    <li>Đổi hoặc hoàn vé theo chính sách của rạp</li>
                </ul>
            </div>
            
            <p style="text-align: center; margin-top: 30px;">
                <strong>Chúc bạn có những phút giây giải trí tuyệt vời tại GALAXY Cinema! 🍿🎬</strong>
            </p>
            
            <p style="text-align: center; margin-top: 20px;">
                Trân trọng,<br>
                <strong>Đội ngũ GALAXY Cinema</strong>
            </p>
        </div>
        
        <div class='footer'>
            <p><strong>GALAXY Cinema</strong> - Hệ thống rạp chiếu phim hàng đầu Việt Nam</p>
            <p>Đây là email tự động, vui lòng không trả lời email này.</p>
            <p>&copy; ${new Date().getFullYear()} GALAXY Cinema. Bảo lưu mọi quyền.</p>
        </div>
    </div>
</body>
</html>
        `;
    }
}

module.exports = new TicketHtmlGenerator();