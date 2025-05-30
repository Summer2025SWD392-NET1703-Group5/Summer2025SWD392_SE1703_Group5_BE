// src/routes/movieRoutes.js
const express = require('express');
const router = express.Router();
const movieController = require('../controllers/movieController');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload');
const { movieValidation } = require('../middlewares/validation');


// Thêm middleware xử lý validation errors
const { validationResult } = require('express-validator');


const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);


    if (!errors.isEmpty()) {
        // Xóa file upload nếu có lỗi validation
        if (req.file) {
            const fs = require('fs');
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
        }


        return res.status(400).json({
            message: 'Dữ liệu không hợp lệ',
            errors: errors.array().map(error => ({
                field: error.path || error.param,
                message: error.msg,
                value: error.value
            }))
        });
    }


    next();
};


/**
 * @swagger
 * components:
 *   schemas:
 *     Movie:
 *       type: object
 *       required:
 *         - Movie_Name
 *         - Release_Date
 *         - Director
 *         - Duration
 *         - Genre
 *         - Rating
 *       properties:
 *         Movie_ID:
 *           type: integer
 *           description: ID duy nhất của phim
 *         Movie_Name:
 *           type: string
 *           description: Tên phim
 *         Release_Date:
 *           type: string
 *           format: date
 *           description: Ngày phát hành
 *         End_Date:
 *           type: string
 *           format: date
 *           description: Ngày kết thúc chiếu
 *         Production_Company:
 *           type: string
 *           description: Công ty sản xuất
 *         Director:
 *           type: string
 *           description: Đạo diễn
 *         Cast:
 *           type: string
 *           description: Diễn viên
 *         Duration:
 *           type: integer
 *           minimum: 60
 *           description: Thời lượng phim (phút)
 *         Genre:
 *           type: string
 *           description: Thể loại
 *         Rating:
 *           type: string
 *           enum: [G, PG, PG-13, R, NC-17]
 *           description: Xếp hạng độ tuổi
 *         Language:
 *           type: string
 *           description: Ngôn ngữ
 *         Country:
 *           type: string
 *           description: Quốc gia sản xuất
 *         Synopsis:
 *           type: string
 *           description: Tóm tắt nội dung
 *         Poster_URL:
 *           type: string
 *           description: URL poster phim
 *         Trailer_Link:
 *           type: string
 *           description: Link trailer
 *         Status:
 *           type: string
 *           enum: [Coming Soon, Now Showing, Ended, Cancelled, Inactive]
 *           description: Trạng thái phim
 *         Created_At:
 *           type: string
 *           format: date-time
 *           description: Thời gian tạo
 *         Updated_At:
 *           type: string
 *           format: date-time
 *           description: Thời gian cập nhật
 *
 *     MovieRating:
 *       type: object
 *       required:
 *         - Rating
 *       properties:
 *         Rating:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *           description: Điểm đánh giá (1-5 sao)
 *         Comment:
 *           type: string
 *           description: Bình luận
 *
 *     ApiResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *         data:
 *           type: object
 *         errors:
 *           type: array
 *           items:
 *             type: object
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */


/**
 * @swagger
 * /api/movies:
 *   get:
 *     summary: Lấy danh sách tất cả phim
 *     tags: [Movies]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Coming Soon, Now Showing, Ended, Cancelled, Inactive]
 *         description: Lọc theo trạng thái phim
 *       - in: query
 *         name: filter
 *         schema:
 *           type: string
 *         description: Tìm kiếm theo tên phim, đạo diễn, thể loại, diễn viên
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Số trang
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Số lượng phim mỗi trang
 *     responses:
 *       200:
 *         description: Danh sách phim
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Movie'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       404:
 *         description: Không tìm thấy phim nào
 *       500:
 *         description: Lỗi server
 */
router.get('/', movieController.getAllMovies);


/**
 * @swagger
 * /api/movies/coming-soon:
 *   get:
 *     summary: Lấy danh sách phim sắp chiếu
 *     tags: [Movies]
 *     responses:
 *       200:
 *         description: Danh sách phim sắp chiếu
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Movie'
 *       404:
 *         description: Không có phim sắp chiếu
 *       500:
 *         description: Lỗi server
 */
router.get('/coming-soon', movieController.getComingSoonMovies);


/**
 * @swagger
 * /api/movies/now-showing:
 *   get:
 *     summary: Lấy danh sách phim đang chiếu
 *     tags: [Movies]
 *     responses:
 *       200:
 *         description: Danh sách phim đang chiếu
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Movie'
 *       404:
 *         description: Không có phim đang chiếu
 *       500:
 *         description: Lỗi server
 */
router.get('/now-showing', movieController.getNowShowingMovies);


/**
 * @swagger
 * /api/movies/genres:
 *   get:
 *     summary: Lấy danh sách thể loại phim
 *     tags: [Movies]
 *     responses:
 *       200:
 *         description: Danh sách thể loại
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *       404:
 *         description: Không tìm thấy thể loại nào
 *       500:
 *         description: Lỗi server
 */
router.get('/genres', movieController.getMovieGenres);


/**
 * @swagger
 * /api/movies/search:
 *   get:
 *     summary: Tìm kiếm phim nâng cao
 *     tags: [Movies]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Từ khóa tìm kiếm
 *       - in: query
 *         name: genre
 *         schema:
 *           type: string
 *         description: Lọc theo thể loại
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Lọc theo năm phát hành
 *       - in: query
 *         name: rating
 *         schema:
 *           type: string
 *           enum: [G, PG, PG-13, R, NC-17]
 *         description: Lọc theo xếp hạng độ tuổi
 *       - in: query
 *         name: duration_min
 *         schema:
 *           type: integer
 *         description: Thời lượng tối thiểu (phút)
 *       - in: query
 *         name: duration_max
 *         schema:
 *           type: integer
 *         description: Thời lượng tối đa (phút)
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [name_asc, name_desc, date_asc, date_desc, rating_asc, rating_desc]
 *           default: date_desc
 *         description: Sắp xếp kết quả
 *     responses:
 *       200:
 *         description: Kết quả tìm kiếm
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Movie'
 *                 total:
 *                   type: integer
 *                 query:
 *                   type: object
 *       404:
 *         description: Không tìm thấy kết quả nào
 *       500:
 *         description: Lỗi server
 */
router.get('/search', movieController.searchMovies);


/**
 * @swagger
 * /api/movies/genre/{genre}:
 *   get:
 *     summary: Lấy phim theo thể loại
 *     tags: [Movies]
 *     parameters:
 *       - in: path
 *         name: genre
 *         required: true
 *         schema:
 *           type: string
 *         description: Tên thể loại phim
 *     responses:
 *       200:
 *         description: Danh sách phim theo thể loại
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Movie'
 *       404:
 *         description: Không tìm thấy phim nào cho thể loại này
 *       500:
 *         description: Lỗi server
 */
router.get('/genre/:genre', movieController.getMoviesByGenre);


/**
 * @swagger
 * /api/movies/stats/overview:
 *   get:
 *     summary: Lấy thống kê tổng quan phim (Admin/Staff only)
 *     tags: [Movies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thống kê tổng quan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_movies:
 *                   type: integer
 *                 coming_soon:
 *                   type: integer
 *                 now_showing:
 *                   type: integer
 *                 ended:
 *                   type: integer
 *                 cancelled:
 *                   type: integer
 *                 total_ratings:
 *                   type: integer
 *                 average_rating:
 *                   type: number
 *                   format: float
 *                 popular_genres:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       genre:
 *                         type: string
 *                       count:
 *                         type: integer
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/stats/overview',
    authMiddleware,
    authorizeRoles('Admin', 'Staff'),
    movieController.getMovieStats
);


/**
 * @swagger
 * /api/movies/{id}:
 *   get:
 *     summary: Lấy thông tin chi tiết phim theo ID
 *     tags: [Movies]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của phim
 *     responses:
 *       200:
 *         description: Thông tin chi tiết phim
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Movie'
 *                 - type: object
 *                   properties:
 *                     Rating_Summary:
 *                       type: object
 *                       properties:
 *                         Average_Rating:
 *                           type: number
 *                           format: float
 *                         Rating_Count:
 *                           type: integer
 *                         Rating_Distribution:
 *                           type: array
 *                           items:
 *                             type: integer
 *                     Ratings:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           Rating_ID:
 *                             type: integer
 *                           Full_Name:
 *                             type: string
 *                           Rating:
 *                             type: integer
 *                           Comment:
 *                             type: string
 *                           Rating_Date:
 *                             type: string
 *                             format: date-time
 *                           Is_Verified:
 *                             type: boolean
 *                     Showtimes:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           Show_Date:
 *                             type: string
 *                             format: date
 *                           Showtimes:
 *                             type: array
 *                             items:
 *                               type: object
 *       404:
 *         description: Không tìm thấy phim
 *       500:
 *         description: Lỗi server
 */
router.get('/:id', movieController.getMovieById);


/**
 * @swagger
 * /api/movies/{id}/similar:
 *   get:
 *     summary: Lấy danh sách phim tương tự
 *     tags: [Movies]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của phim
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 20
 *           default: 5
 *         description: Số lượng phim tương tự
 *     responses:
 *       200:
 *         description: Danh sách phim tương tự
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Movie'
 *       404:
 *         description: Không tìm thấy phim hoặc không có phim tương tự
 *       500:
 *         description: Lỗi server
 */
router.get('/:id/similar', movieController.getSimilarMovies);


/**
 * @swagger
 * /api/movies/{id}/rate:
 *   post:
 *     summary: Đánh giá phim
 *     tags: [Movies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của phim
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MovieRating'
 *     responses:
 *       200:
 *         description: Đánh giá thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rating_id:
 *                   type: integer
 *                 movie_id:
 *                   type: integer
 *                 user_id:
 *                   type: integer
 *                 rating:
 *                   type: integer
 *                 comment:
 *                   type: string
 *                 rating_date:
 *                   type: string
 *                   format: date-time
 *                 is_verified:
 *                   type: boolean
 *                 is_updated:
 *                   type: boolean
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       404:
 *         description: Không tìm thấy phim
 *       500:
 *         description: Lỗi server
 */
router.post('/:id/rate', authMiddleware, movieController.rateMovie);


/**
 * @swagger
 * /api/movies:
 *   post:
 *     summary: Tạo phim mới (Admin/Staff only)
 *     tags: [Movies]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - Movie_Name
 *               - Release_Date
 *               - Director
 *               - Duration
 *               - Genre
 *               - Rating
 *             properties:
 *               Movie_Name:
 *                 type: string
 *                 description: Tên phim
 *               Release_Date:
 *                 type: string
 *                 format: date
 *                 description: Ngày phát hành (phải trong tương lai)
 *               End_Date:
 *                 type: string
 *                 format: date
 *                 description: Ngày kết thúc chiếu
 *               Production_Company:
 *                 type: string
 *                 description: Công ty sản xuất
 *               Director:
 *                 type: string
 *                 description: Đạo diễn
 *               Cast:
 *                 type: string
 *                 description: Diễn viên
 *               Duration:
 *                 type: integer
 *                 minimum: 60
 *                 description: Thời lượng phim (tối thiểu 60 phút)
 *               Genre:
 *                 type: string
 *                 description: Thể loại
 *               Rating:
 *                 type: string
 *                 enum: [G, PG, PG-13, R, NC-17]
 *                 description: Xếp hạng độ tuổi
 *               Language:
 *                 type: string
 *                 description: Ngôn ngữ
 *               Country:
 *                 type: string
 *                 description: Quốc gia sản xuất
 *               Synopsis:
 *                 type: string
 *                 description: Tóm tắt nội dung
 *               Poster_URL:
 *                 type: string
 *                 description: URL poster (nếu không upload file)
 *               Trailer_Link:
 *                 type: string
 *                 description: Link trailer
 *               Status:
 *                 type: string
 *                 enum: [Coming Soon, Now Showing, Ended, Cancelled]
 *                 description: Trạng thái phim
 *               posterFile:
 *                 type: string
 *                 format: binary
 *                 description: File poster phim (jpg, jpeg, png, gif, webp)
 *     responses:
 *       201:
 *         description: Tạo phim thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Movie'
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc phim đã tồn tại
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.post('/',
    authMiddleware,
    authorizeRoles('Admin', 'Staff'),
    upload.single('posterFile'),
    movieValidation.create,
    handleValidationErrors,
    movieController.createMovie
);


/**
 * @swagger
 * /api/movies/{id}:
 *   put:
 *     summary: Cập nhật thông tin phim (Admin/Staff only)
 *     tags: [Movies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của phim cần cập nhật
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               Movie_Name:
 *                 type: string
 *                 description: Tên phim
 *               Release_Date:
 *                 type: string
 *                 format: date
 *                 description: Ngày phát hành
 *               End_Date:
 *                 type: string
 *                 format: date
 *                 description: Ngày kết thúc chiếu
 *               Production_Company:
 *                 type: string
 *                 description: Công ty sản xuất
 *               Director:
 *                 type: string
 *                 description: Đạo diễn
 *               Cast:
 *                 type: string
 *                 description: Diễn viên
 *               Duration:
 *                 type: integer
 *                 minimum: 60
 *                 description: Thời lượng phim (tối thiểu 60 phút)
 *               Genre:
 *                 type: string
 *                 description: Thể loại
 *               Rating:
 *                 type: string
 *                 enum: [G, PG, PG-13, R, NC-17]
 *                 description: Xếp hạng độ tuổi
 *               Language:
 *                 type: string
 *                 description: Ngôn ngữ
 *               Country:
 *                 type: string
 *                 description: Quốc gia sản xuất
 *               Synopsis:
 *                 type: string
 *                 description: Tóm tắt nội dung
 *               Poster_URL:
 *                 type: string
 *                 description: URL poster (nếu không upload file mới)
 *               Trailer_Link:
 *                 type: string
 *                 description: Link trailer
 *               Status:
 *                 type: string
 *                 enum: [Coming Soon, Now Showing, Ended, Cancelled]
 *                 description: Trạng thái phim
 *               posterFile:
 *                 type: string
 *                 format: binary
 *                 description: File poster mới (jpg, jpeg, png, gif, webp)
 *     responses:
 *       200:
 *         description: Cập nhật phim thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Movie'
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy phim
 *       500:
 *         description: Lỗi server
 */
router.put('/:id',
    authMiddleware,
    authorizeRoles('Admin', 'Staff'),
    upload.single('posterFile'),
    movieValidation.update,
    handleValidationErrors,
    movieController.updateMovie
);


/**
 * @swagger
 * /api/movies/{id}:
 *   delete:
 *     summary: Xóa phim (Admin/Staff only)
 *     tags: [Movies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của phim cần xóa
 *     responses:
 *       200:
 *         description: Xóa phim thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [deleted, deactivated]
 *                 message:
 *                   type: string
 *       400:
 *         description: Không thể xóa phim (có suất chiếu hoặc đánh giá)
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy phim
 *       500:
 *         description: Lỗi server
 */
router.delete('/:id',
    authMiddleware,
    authorizeRoles('Admin'),
    movieController.deleteMovie
);


module.exports = router;



