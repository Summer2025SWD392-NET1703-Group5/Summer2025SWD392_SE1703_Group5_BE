const movieReferences = require('../constants/movieReferences');

class ReferenceService {
    /**
     * Lấy tất cả danh sách tham chiếu
     * @returns {Object} Đối tượng chứa tất cả danh sách tham chiếu
     */
    getAllReferences() {
        return movieReferences;
    }

    /**
     * Lấy danh sách diễn viên
     * @returns {Array} Mảng tên các diễn viên
     */
    getActors() {
        return movieReferences.actors;
    }

    /**
     * Lấy danh sách công ty sản xuất
     * @returns {Array} Mảng tên các công ty sản xuất
     */
    getProductionCompanies() {
        return movieReferences.productionCompanies;
    }

    /**
     * Lấy danh sách đạo diễn
     * @returns {Array} Mảng tên các đạo diễn
     */
    getDirectors() {
        return movieReferences.directors;
    }

    /**
     * Lấy danh sách ngôn ngữ
     * @returns {Array} Mảng các ngôn ngữ
     */
    getLanguages() {
        return movieReferences.languages;
    }

    /**
     * Lấy danh sách quốc gia
     * @returns {Array} Mảng các quốc gia
     */
    getCountries() {
        return movieReferences.countries;
    }

    /**
     * Lấy danh sách thể loại phim
     * @returns {Array} Mảng các thể loại phim
     */
    getGenres() {
        return movieReferences.genres;
    }

    /**
     * Lấy danh sách xếp hạng độ tuổi
     * @returns {Array} Mảng các xếp hạng độ tuổi
     */
    getRatings() {
        return movieReferences.ratings;
    }

    /**
     * Lấy danh sách trạng thái phim
     * @returns {Array} Mảng các trạng thái phim
     */
    getStatuses() {
        return movieReferences.statuses;
    }

    /**
     * Chuẩn hóa chuỗi để tránh trùng lặp do cách viết khác nhau
     * @param {string} value - Chuỗi cần chuẩn hóa
     * @returns {string} Chuỗi đã chuẩn hóa
     */
    normalizeString(value) {
        if (!value) return '';

        // Chuyển về chữ thường
        let normalized = value.toLowerCase();

        // Loại bỏ khoảng trắng đầu và cuối
        normalized = normalized.trim();

        // Thay thế nhiều khoảng trắng liền nhau thành một khoảng trắng
        normalized = normalized.replace(/\s+/g, ' ');

        return normalized;
    }

    /**
     * Viết hoa chữ cái đầu của mỗi từ trong chuỗi (Title Case)
     * @param {string} value - Chuỗi cần xử lý
     * @returns {string} Chuỗi đã được viết hoa chữ cái đầu mỗi từ
     */
    toTitleCase(value) {
        if (!value) return '';

        // Loại bỏ khoảng trắng thừa và chuẩn hóa
        let trimmed = value.trim().replace(/\s+/g, ' ');

        // Tách chuỗi thành các từ và viết hoa chữ cái đầu mỗi từ
        return trimmed.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    /**
     * Kiểm tra xem một giá trị có trong danh sách tham chiếu không (sau khi chuẩn hóa)
     * @param {string} type - Loại tham chiếu (actors, directors, etc.)
     * @param {string} value - Giá trị cần kiểm tra
     * @returns {boolean} true nếu giá trị có trong danh sách, ngược lại false
     */
    isValidReference(type, value) {
        if (!movieReferences[type]) {
            return false;
        }

        const normalizedValue = this.normalizeString(value);
        return movieReferences[type].some(item =>
            this.normalizeString(item) === normalizedValue
        );
    }

    /**
     * Tìm kiếm tên chính xác của giá trị tham chiếu dựa trên chuỗi tương đương
     * @param {string} type - Loại tham chiếu
     * @param {string} value - Giá trị tìm kiếm
     * @returns {string|null} Tên chính xác của giá trị hoặc null nếu không tìm thấy
     */
    findExactReference(type, value) {
        if (!movieReferences[type]) {
            return null;
        }

        const normalizedValue = this.normalizeString(value);
        const foundItem = movieReferences[type].find(item =>
            this.normalizeString(item) === normalizedValue
        );

        return foundItem || null;
    }

    /**
     * Kiểm tra và tự động thêm giá trị mới vào danh sách tham chiếu nếu chưa tồn tại
     * @param {string} type - Loại tham chiếu (actors, directors, etc.)
     * @param {string} value - Giá trị cần thêm
     * @returns {boolean} true nếu thêm mới thành công, false nếu đã tồn tại hoặc không hợp lệ
     */
    addToReferenceIfNotExists(type, value) {
        if (!movieReferences[type] || !value) {
            return false;
        }

        // Chuẩn hóa chuỗi trước khi so sánh
        const normalizedValue = this.normalizeString(value);

        // Kiểm tra xem đã có giá trị tương tự (sau khi chuẩn hóa) chưa
        const exists = movieReferences[type].some(item =>
            this.normalizeString(item) === normalizedValue
        );

        if (exists) {
            return false; // Đã tồn tại giá trị tương tự
        }

        // Nếu chưa tồn tại, thêm giá trị với định dạng Title Case
        const titleCasedValue = this.toTitleCase(value);
        movieReferences[type].push(titleCasedValue);

        // Lưu vào file movieReferences.js
        try {
            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(__dirname, '../constants/movieReferences.js');

            // Đọc nội dung file
            let content = fs.readFileSync(filePath, 'utf8');

            // Tìm vị trí của mảng cần cập nhật
            const regexPattern = new RegExp(`${type}:\\s*\\[([^\\]]*)\\]`, 's');
            const match = content.match(regexPattern);

            if (match) {
                let currentArray = match[1].trim();
                // Nếu mảng rỗng, thêm giá trị đầu tiên
                if (!currentArray) {
                    const newArrayContent = `    ${type}: [\n        '${titleCasedValue}'\n    ]`;
                    content = content.replace(regexPattern, newArrayContent);
                } else {
                    // Nếu mảng đã có giá trị, thêm giá trị mới vào cuối
                    const lastBracketPos = match[0].lastIndexOf(']');
                    const arrayStart = match.index + match[0].indexOf('[');
                    const insertPos = match.index + lastBracketPos;

                    // Kiểm tra xem mảng có phần tử cuối cùng đã có dấu phẩy chưa
                    const needsComma = !currentArray.trim().endsWith(',') && currentArray.trim().length > 0;

                    // Thêm giá trị mới vào mảng
                    const valueToInsert = needsComma
                        ? `,\n        '${titleCasedValue}'`
                        : `\n        '${titleCasedValue}'`;

                    content = content.slice(0, insertPos) + valueToInsert + content.slice(insertPos);
                }

                // Ghi file đã cập nhật
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`Đã thêm "${titleCasedValue}" vào danh sách ${type} trong file`);
            } else {
                console.error(`Không tìm thấy mảng ${type} trong file movieReferences.js`);
            }
        } catch (error) {
            console.error(`Lỗi khi cập nhật file movieReferences.js: ${error.message}`);
        }

        return true;
    }

    /**
     * Tìm giá trị gần nhất trong danh sách tham chiếu
     * @param {string} type - Loại tham chiếu
     * @param {string} value - Giá trị cần tìm
     * @returns {Array} Mảng các giá trị gần giống
     */
    findSimilarReferences(type, value) {
        if (!movieReferences[type] || !value) {
            return [];
        }

        const normalizedValue = this.normalizeString(value);

        // Tìm các giá trị có chứa chuỗi tìm kiếm
        return movieReferences[type].filter(item =>
            this.normalizeString(item).includes(normalizedValue)
        );
    }
}

module.exports = new ReferenceService(); 