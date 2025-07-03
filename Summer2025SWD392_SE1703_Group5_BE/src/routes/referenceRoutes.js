const express = require('express');
const router = express.Router();
const referenceController = require('../controllers/referenceController');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');

/**
 * @swagger
 * /api/references:
 *   get:
 *     summary: Lấy tất cả danh sách tham chiếu (Public)
 *     description: >
 *       API này cung cấp tất cả các danh sách tham chiếu cho phim (diễn viên, đạo diễn, ngôn ngữ...)
 *     tags: [References]
 *     responses:
 *       200:
 *         description: Danh sách tham chiếu thành công
 *       500:
 *         description: Lỗi server
 */
router.get('/', referenceController.getAllReferences);

/**
 * @swagger
 * /api/references/actors:
 *   get:
 *     summary: Lấy danh sách diễn viên (Public)
 *     description: >
 *       API này cung cấp danh sách diễn viên có sẵn để lựa chọn khi tạo/cập nhật phim
 *     tags: [References]
 *     responses:
 *       200:
 *         description: Danh sách diễn viên
 *       500:
 *         description: Lỗi server
 */
router.get('/actors', referenceController.getActors);

/**
 * @swagger
 * /api/references/directors:
 *   get:
 *     summary: Lấy danh sách đạo diễn (Public)
 *     description: >
 *       API này cung cấp danh sách đạo diễn có sẵn để lựa chọn khi tạo/cập nhật phim
 *     tags: [References]
 *     responses:
 *       200:
 *         description: Danh sách đạo diễn
 *       500:
 *         description: Lỗi server
 */
router.get('/directors', referenceController.getDirectors);

/**
 * @swagger
 * /api/references/production-companies:
 *   get:
 *     summary: Lấy danh sách công ty sản xuất (Public)
 *     description: >
 *       API này cho phép người dùng lấy danh sách tất cả công ty sản xuất phim
 *     tags: [References]
 *     responses:
 *       200:
 *         description: Danh sách công ty sản xuất
 *       500:
 *         description: Lỗi server
 */
router.get('/production-companies', referenceController.getProductionCompanies);

/**
 * @swagger
 * /api/references/productionCompanies:
 *   get:
 *     summary: Lấy danh sách công ty sản xuất (Public) - Định dạng camelCase
 *     description: >
 *       API này cho phép người dùng lấy danh sách tất cả công ty sản xuất phim.
 *       Đường dẫn này giống với '/api/references/production-companies' nhưng sử dụng ký hiệu camelCase.
 *     tags: [References]
 *     responses:
 *       200:
 *         description: Danh sách công ty sản xuất
 *       500:
 *         description: Lỗi server
 */
router.get('/productionCompanies', referenceController.getProductionCompanies);

/**
 * @swagger
 * /api/references/languages:
 *   get:
 *     summary: Lấy danh sách ngôn ngữ (Public)
 *     description: >
 *       API này cung cấp danh sách ngôn ngữ có sẵn để lựa chọn khi tạo/cập nhật phim
 *     tags: [References]
 *     responses:
 *       200:
 *         description: Danh sách ngôn ngữ
 *       500:
 *         description: Lỗi server
 */
router.get('/languages', referenceController.getLanguages);

/**
 * @swagger
 * /api/references/countries:
 *   get:
 *     summary: Lấy danh sách quốc gia (Public)
 *     description: >
 *       API này cung cấp danh sách quốc gia có sẵn để lựa chọn khi tạo/cập nhật phim
 *     tags: [References]
 *     responses:
 *       200:
 *         description: Danh sách quốc gia
 *       500:
 *         description: Lỗi server
 */
router.get('/countries', referenceController.getCountries);

/**
 * @swagger
 * /api/references/genres:
 *   get:
 *     summary: Lấy danh sách thể loại (Public)
 *     description: >
 *       API này cung cấp danh sách thể loại có sẵn để lựa chọn khi tạo/cập nhật phim
 *     tags: [References]
 *     responses:
 *       200:
 *         description: Danh sách thể loại
 *       500:
 *         description: Lỗi server
 */
router.get('/genres', referenceController.getGenres);

/**
 * @swagger
 * /api/references/ratings:
 *   get:
 *     summary: Lấy danh sách xếp hạng độ tuổi (Public)
 *     description: >
 *       API này cung cấp danh sách xếp hạng độ tuổi có sẵn để lựa chọn khi tạo/cập nhật phim
 *     tags: [References]
 *     responses:
 *       200:
 *         description: Danh sách xếp hạng độ tuổi
 *       500:
 *         description: Lỗi server
 */
router.get('/ratings', referenceController.getRatings);

/**
 * @swagger
 * /api/references/statuses:
 *   get:
 *     summary: Lấy danh sách trạng thái phim (Public)
 *     description: >
 *       API này cung cấp danh sách trạng thái phim có sẵn để lựa chọn khi tạo/cập nhật phim
 *     tags: [References]
 *     responses:
 *       200:
 *         description: Danh sách trạng thái phim
 *       500:
 *         description: Lỗi server
 */
router.get('/statuses', referenceController.getStatuses);

/**
 * @swagger
 * /api/references/search:
 *   get:
 *     summary: Tìm kiếm giá trị tương tự trong danh sách tham chiếu (Public)
 *     description: >
 *       API này cho phép tìm kiếm các giá trị tương tự trong danh sách tham chiếu
 *     tags: [References]
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *         description: Loại danh sách tham chiếu (actors, directors, productionCompanies, languages, countries, genres)
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Từ khóa tìm kiếm
 *     responses:
 *       200:
 *         description: Danh sách các giá trị tương tự
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       500:
 *         description: Lỗi server
 */
router.get('/search', referenceController.findSimilar);

/**
 * @swagger
 * /api/references/findSimilar:
 *   get:
 *     summary: Tìm kiếm giá trị tương tự trong danh sách tham chiếu (Public) - Định dạng camelCase
 *     description: >
 *       API này cho phép tìm kiếm các giá trị tương tự trong danh sách tham chiếu.
 *       Đường dẫn này giống với '/api/references/search' nhưng sử dụng ký hiệu camelCase.
 *     tags: [References]
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *         description: Loại danh sách tham chiếu (actors, directors, productionCompanies, languages, countries, genres)
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Từ khóa tìm kiếm
 *     responses:
 *       200:
 *         description: Danh sách các giá trị tương tự
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       500:
 *         description: Lỗi server
 */
router.get('/findSimilar', referenceController.findSimilar);

/**
 * @swagger
 * /api/references:
 *   post:
 *     summary: Thêm giá trị mới vào danh sách tham chiếu (Admin only)
 *     security:
 *       - bearerAuth: []
 *     description: >
 *       API này cho phép admin thêm giá trị mới vào danh sách tham chiếu
 *     tags: [References]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - value
 *             properties:
 *               type:
 *                 type: string
 *                 description: Loại danh sách tham chiếu (actors, directors, productionCompanies, languages, countries, genres)
 *               value:
 *                 type: string
 *                 description: Giá trị cần thêm vào danh sách
 *     responses:
 *       201:
 *         description: Đã thêm giá trị mới vào danh sách
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc giá trị đã tồn tại
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền thực hiện
 *       500:
 *         description: Lỗi server
 */
router.post('/', authMiddleware, authorizeRoles('Admin'), referenceController.addReference);

/**
 * @swagger
 * /api/references/{type}/{value}:
 *   delete:
 *     summary: Xóa giá trị khỏi danh sách tham chiếu (Admin only)
 *     security:
 *       - bearerAuth: []
 *     description: >
 *       API này cho phép admin xóa giá trị khỏi danh sách tham chiếu
 *     tags: [References]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *         description: Loại danh sách tham chiếu (actors, directors, productionCompanies, languages, countries, genres)
 *       - in: path
 *         name: value
 *         required: true
 *         schema:
 *           type: string
 *         description: Giá trị cần xóa khỏi danh sách
 *     responses:
 *       200:
 *         description: Đã xóa giá trị khỏi danh sách
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền thực hiện
 *       404:
 *         description: Không tìm thấy giá trị trong danh sách
 *       500:
 *         description: Lỗi server
 */
router.delete('/:type/:value', authMiddleware, authorizeRoles('Admin'), referenceController.removeReference);

module.exports = router; 