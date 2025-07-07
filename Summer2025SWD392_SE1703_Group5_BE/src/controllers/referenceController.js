// controllers/referenceController.js
const movieReferences = require('../constants/movieReferences');
const referenceService = require('../services/referenceService');

class ReferenceController {
    // Lấy tất cả danh sách tham chiếu
    getAllReferences(req, res) {
        try {
            res.status(200).json({
                success: true,
                data: movieReferences
            });
        } catch (error) {
            console.error('Error getting references:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi lấy danh sách tham chiếu'
            });
        }
    }

    // Lấy danh sách diễn viên
    getActors(req, res) {
        try {
            res.status(200).json({
                success: true,
                data: movieReferences.actors
            });
        } catch (error) {
            console.error('Error getting actors:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi lấy danh sách diễn viên'
            });
        }
    }

    // Lấy danh sách công ty sản xuất
    getProductionCompanies(req, res) {
        try {
            res.status(200).json({
                success: true,
                data: movieReferences.productionCompanies
            });
        } catch (error) {
            console.error('Error getting production companies:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi lấy danh sách công ty sản xuất'
            });
        }
    }

    // Lấy danh sách đạo diễn
    getDirectors(req, res) {
        try {
            res.status(200).json({
                success: true,
                data: movieReferences.directors
            });
        } catch (error) {
            console.error('Error getting directors:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi lấy danh sách đạo diễn'
            });
        }
    }

    // Lấy danh sách ngôn ngữ
    getLanguages(req, res) {
        try {
            res.status(200).json({
                success: true,
                data: movieReferences.languages
            });
        } catch (error) {
            console.error('Error getting languages:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi lấy danh sách ngôn ngữ'
            });
        }
    }

    // Lấy danh sách quốc gia
    getCountries(req, res) {
        try {
            res.status(200).json({
                success: true,
                data: movieReferences.countries
            });
        } catch (error) {
            console.error('Error getting countries:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi lấy danh sách quốc gia'
            });
        }
    }

    // Lấy danh sách thể loại
    getGenres(req, res) {
        try {
            res.status(200).json({
                success: true,
                data: movieReferences.genres
            });
        } catch (error) {
            console.error('Error getting genres:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi lấy danh sách thể loại'
            });
        }
    }

    // Lấy danh sách xếp hạng
    getRatings(req, res) {
        try {
            res.status(200).json({
                success: true,
                data: movieReferences.ratings
            });
        } catch (error) {
            console.error('Error getting ratings:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi lấy danh sách xếp hạng'
            });
        }
    }

    // Lấy danh sách trạng thái phim
    getStatuses(req, res) {
        try {
            res.status(200).json({
                success: true,
                data: movieReferences.statuses
            });
        } catch (error) {
            console.error('Error getting statuses:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi lấy danh sách trạng thái'
            });
        }
    }

    // Thêm giá trị mới vào danh sách tham chiếu
    addReference(req, res) {
        try {
            const { type, value } = req.body;

            if (!type || !value) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin loại tham chiếu hoặc giá trị'
                });
            }

            if (!movieReferences[type]) {
                return res.status(400).json({
                    success: false,
                    message: `Loại tham chiếu '${type}' không tồn tại`
                });
            }

            // Kiểm tra giá trị đã tồn tại chưa (sử dụng phương thức chuẩn hóa)
            const normalizedValue = referenceService.normalizeString(value);
            const existingValue = referenceService.findExactReference(type, value);

            if (existingValue) {
                return res.status(400).json({
                    success: false,
                    message: `Giá trị tương đương '${existingValue}' đã tồn tại trong danh sách ${type}`,
                    existingValue: existingValue
                });
            }

            // Thêm giá trị mới vào danh sách (đã được chuẩn hóa và viết hoa chữ cái đầu)
            const titleCasedValue = referenceService.toTitleCase(value);
            movieReferences[type].push(titleCasedValue);

            res.status(201).json({
                success: true,
                message: `Đã thêm '${titleCasedValue}' vào danh sách ${type}`,
                data: movieReferences[type]
            });
        } catch (error) {
            console.error('Error adding reference:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi thêm giá trị tham chiếu'
            });
        }
    }

    // Xóa giá trị khỏi danh sách tham chiếu
    removeReference(req, res) {
        try {
            const { type, value } = req.params;

            if (!type || !value) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin loại tham chiếu hoặc giá trị'
                });
            }

            if (!movieReferences[type]) {
                return res.status(400).json({
                    success: false,
                    message: `Loại tham chiếu '${type}' không tồn tại`
                });
            }

            // Tìm giá trị chính xác trong danh sách
            const exactValue = referenceService.findExactReference(type, value);

            // Nếu giá trị không tồn tại
            if (!exactValue) {
                // Tìm các giá trị gần giống để gợi ý
                const similarValues = referenceService.findSimilarReferences(type, value);

                return res.status(404).json({
                    success: false,
                    message: `Giá trị '${value}' không tồn tại trong danh sách ${type}`,
                    suggestions: similarValues.length > 0 ? similarValues : undefined
                });
            }

            // Tìm chỉ số của giá trị chính xác cần xóa
            const index = movieReferences[type].indexOf(exactValue);

            // Xóa giá trị khỏi danh sách
            movieReferences[type].splice(index, 1);

            res.status(200).json({
                success: true,
                message: `Đã xóa '${exactValue}' khỏi danh sách ${type}`,
                data: movieReferences[type]
            });
        } catch (error) {
            console.error('Error removing reference:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi xóa giá trị tham chiếu'
            });
        }
    }

    // Tìm kiếm giá trị tương tự trong danh sách tham chiếu
    findSimilar(req, res) {
        try {
            const { type, query } = req.query;

            if (!type || !query) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin loại tham chiếu hoặc từ khóa tìm kiếm'
                });
            }

            if (!movieReferences[type]) {
                return res.status(400).json({
                    success: false,
                    message: `Loại tham chiếu '${type}' không tồn tại`
                });
            }

            // Tìm các giá trị gần giống
            const similarValues = referenceService.findSimilarReferences(type, query);

            res.status(200).json({
                success: true,
                query: query,
                count: similarValues.length,
                data: similarValues
            });
        } catch (error) {
            console.error('Error finding similar references:', error);
            res.status(500).json({
                success: false,
                message: 'Có lỗi xảy ra khi tìm kiếm giá trị tương tự'
            });
        }
    }
}

module.exports = new ReferenceController(); 