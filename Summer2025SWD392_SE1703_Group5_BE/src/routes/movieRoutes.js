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
 *         Premiere_Date:
 *           type: string
 *           format: date
 *           description: Ngày công chiếu
 *         End_Date:
 *           type: string
 *           format: date
 *           description: Ngày kết thúc chiếu
 *         Production_Company:
 *           type: string
 *           description: Công ty sản xuất
 *         Director:
 *           type: string
 *           description: Ğạo diễn
 *         Cast:
 *           type: string
 *           description: Diễn viên
 *         Duration:
 *           type: integer
 *           minimum: 60
 *           description: ThỞi lượng phim (phút)
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
 *           description: ThỞi gian tạo
 *         Updated_At:
 *           type: string
 *           format: date-time
 *           description: ThỞi gian cập nhật
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
 *           description: Ğiểm đánh giá (1-5 sao)
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
 *     summary: Lấy danh sách tất cả phim (Public)
 *     description: >
 *       API này cho phép tất cả ngưỞi dùng (kể cả chưa đăng nhập) xem danh sách phim đang có trong hệ thống.
 *       Có thể lỞc theo trạng thái phim (đang chiếu, sắp chiếu, v.v.) và tìm kiếm theo tên phim, đạo diễn, thể loại hoặc diễn viên.
 *       Kết quả được phân trang để tối ưu hiệu suất.
 *     tags: [Movies]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Coming Soon, Now Showing, Ended, Cancelled, Inactive]
 *         description: LỞc theo trạng thái phim
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
 *         description: Trả vỞ danh sách phim theo các tiêu chí lỞc
 *       500:
 *         description: Lỗi server
 */
router.get('/', movieController.getAllMovies);

/**
 * @swagger
 * /api/movies/coming-soon:
 *   get:
 *     summary: Lấy danh sách phim sắp chiếu (Public)
 *     description: >
 *       API này cho phép tất cả ngưỞi dùng (kể cả chưa đăng nhập) xem danh sách các phim sắp chiếu.
 *       Kết quả bao gồm thông tin chi tiết vỞ các phim có trạng thái "Coming Soon".
 *     tags: [Movies]
 *     responses:
 *       200:
 *         description: Danh sách phim sắp chiếu
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
 *     summary: Lấy danh sách phim đang chiếu (Public)
 *     description: >
 *       API này cho phép tất cả ngưỞi dùng (kể cả chưa đăng nhập) xem danh sách các phim đang chiếu.
 *       Kết quả bao gồm thông tin chi tiết vỞ các phim có trạng thái "Now Showing".
 *     tags: [Movies]
 *     responses:
 *       200:
 *         description: Danh sách phim đang chiếu
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
 *     summary: Lấy danh sách thể loại phim (Public)
 *     description: >
 *       API này cho phép tất cả ngưỞi dùng xem danh sách các thể loại phim hiện có trong hệ thống.
 *       Kết quả là một danh sách duy nhất các thể loại phim, hữu ích để hiển thị bộ lỞc hoặc menu thể loại.
 *     tags: [Movies]
 *     responses:
 *       200:
 *         description: Danh sách thể loại
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
 *     summary: Tìm kiếm phim nâng cao (Public)
 *     description: >
 *       API này cho phép tất cả ngưỞi dùng thực hiện tìm kiếm phim với nhiỞu tiêu chí lỞc khác nhau.
 *       Có thể tìm kiếm theo từ khóa, thể loại, năm phát hành, xếp hạng độ tuổi và thỞi lượng.
 *       Kết quả có thể được sắp xếp theo nhiỞu tiêu chí khác nhau.
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
 *         description: LỞc theo thể loại
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: LỞc theo năm phát hành
 *       - in: query
 *         name: rating
 *         schema:
 *           type: string
 *           enum: [G, PG, PG-13, R, NC-17]
 *         description: LỞc theo xếp hạng độ tuổi
 *       - in: query
 *         name: duration_min
 *         schema:
 *           type: integer
 *         description: ThỞi lượng tối thiểu (phút)
 *       - in: query
 *         name: duration_max
 *         schema:
 *           type: integer
 *         description: ThỞi lượng tối đa (phút)
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
 *     summary: Lấy phim theo thể loại (Public)
 *     description: >
 *       API này cho phép tất cả ngưỞi dùng xem danh sách các phim thuộc một thể loại cụ thể.
 *       Kết quả bao gồm tất cả thông tin chi tiết vỞ các phim phù hợp với thể loại được chỉ định.
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
 *     summary: Lấy thống kê tổng quan phim (Chỉ Admin/Manager)
 *     description: >
 *       API này cho phép ngưỞi dùng có vai trò Admin, Manager xem thống kê tổng quan vỞ phim trong hệ thống.
 *       Kết quả bao gồm tổng số phim, số lượng phim theo từng trạng thái, số lượng đánh giá, và phân bố thể loại phổ biến.
 *       API này hữu ích cho việc theo dõi và báo cáo tình hình kinh doanh.
 *     tags: [Movies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thống kê tổng quan
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyỞn truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/stats/overview',
    authMiddleware,
    authorizeRoles('Admin', 'Manager'),
    movieController.getMovieStats
);

/**
 * @swagger
 * /api/movies/{id}:
 *   get:
 *     summary: Lấy thông tin chi tiết phim theo ID (Public)
 *     description: >
 *       API này cho phép tất cả ngưỞi dùng xem thông tin chi tiết của một phim cụ thể dựa trên ID.
 *       Kết quả bao gồm đầy đủ thông tin vỞ phim, đánh giá từ ngưỞi xem, và thông tin vỞ các suất chiếu sắp tới.
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
 *     summary: Lấy danh sách phim tương tự (Public)
 *     description: >
 *       API này cho phép tất cả ngưỞi dùng xem danh sách các phim tương tự với một phim cụ thể dựa trên ID.
 *       Hệ thống sẽ đỞ xuất các phim có thể loại, đạo diễn hoặc diễn viên tương tự với phim được chỉ định.
 *       ThưỞng được sử dụng để hiển thị phần "Phim liên quan" hoặc "Có thể bạn cũng thích".
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
 *     summary: Ğánh giá phim (Yêu cầu đăng nhập)
 *     description: >
 *       API này cho phép ngưỞi dùng đã đăng nhập đánh giá và bình luận vỞ một phim cụ thể.
 *       NgưỞi dùng có thể cho điểm từ 1-5 sao và thêm nhận xét vỞ phim.
 *       Mỗi ngưỞi dùng chỉ có thể đánh giá một phim một lần, nhưng có thể cập nhật đánh giá của mình sau đó.
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
 *         description: Ğánh giá thành công
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
 *     summary: Tạo phim mới (Chỉ Admin)
 *     description: >
 *       API này cho phép ngưỞi dùng có vai trò Admin tạo một phim mới trong hệ thống.
 *       NgưỞi dùng cần cung cấp thông tin đầy đủ vỞ phim, bao gồm tên, ngày phát hành, đạo diễn, thể loại và các thông tin khác.
 *       Có thể tải lên file ảnh poster hoặc cung cấp URL của poster có sẵn. API này thưỞng được sử dụng trong trang quản trị để 
 *       thêm phim mới vào hệ thống.
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
 *               Premiere_Date:
 *                 type: string
 *                 format: date
 *                 description: Ngày công chiếu 
 *               End_Date:
 *                 type: string
 *                 format: date
 *                 description: Ngày kết thúc chiếu
 *               Production_Company:
 *                 type: string
 *                 description: Công ty sản xuất
 *               Director:
 *                 type: string
 *                 description: Ğạo diễn
 *               Cast:
 *                 type: string
 *                 description: Diễn viên
 *               Duration:
 *                 type: integer
 *                 minimum: 60
 *                 description: ThỞi lượng phim (tối thiểu 60 phút)
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
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc phim đã tồn tại
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyỞn truy cập
 *       500:
 *         description: Lỗi server
 */
router.post('/',
    authMiddleware,
    authorizeRoles('Admin'),
    upload.single('posterFile'),
    movieValidation.create,
    handleValidationErrors,
    movieController.createMovie
);

/**
 * @swagger
 * /api/movies/{id}:
 *   put:
 *     summary: Cập nhật thông tin phim (Chỉ Admin)
 *     description: >
 *       API này cho phép ngưỞi dùng có vai trò Admin cập nhật thông tin của một phim cụ thể.
 *       Có thể thay đổi bất kỳ thông tin nào của phim như tên, ngày chiếu, đạo diễn, thể loại và các thông tin khác.
 *       Cũng có thể cập nhật poster bằng cách tải lên file mới hoặc cung cấp URL mới. API này thưỞng được sử dụng 
 *       trong trang quản trị để cập nhật thông tin phim khi có thay đổi.
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
 *               Premiere_Date:
 *                 type: string
 *                 format: date
 *                 description: Ngày công chiếu 
 *               End_Date:
 *                 type: string
 *                 format: date
 *                 description: Ngày kết thúc chiếu
 *               Production_Company:
 *                 type: string
 *                 description: Công ty sản xuất
 *               Director:
 *                 type: string
 *                 description: Ğạo diễn
 *               Cast:
 *                 type: string
 *                 description: Diễn viên
 *               Duration:
 *                 type: integer
 *                 minimum: 60
 *                 description: ThỞi lượng phim (tối thiểu 60 phút)
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
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyỞn truy cập
 *       404:
 *         description: Không tìm thấy phim
 *       500:
 *         description: Lỗi server
 */
router.put('/:id',
    authMiddleware,
    authorizeRoles('Admin'),
    upload.single('posterFile'),
    movieValidation.update,
    handleValidationErrors,
    movieController.updateMovie
);

/**
 * @swagger
 * /api/movies/{id}:
 *   delete:
 *     summary: Xóa phim (Chỉ Admin)
 *     description: >
 *       API này cho phép ngưỞi dùng có vai trò Admin xóa một phim khỞi hệ thống.
 *       Nếu phim đã có suất chiếu hoặc đánh giá, hệ thống sẽ không cho phép xóa hoàn toàn mà chỉ vô hiệu hóa phim.
 *       Phim bị vô hiệu hóa sẽ không hiển thị cho ngưỞi dùng thông thưỞng nhưng vẫn tồn tại trong cơ sở dữ liệu.
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
 *       400:
 *         description: Không thể xóa phim (có suất chiếu hoặc đánh giá)
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyỞn truy cập
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

/**
 * @swagger
 * /api/movies/{movieId}/cinemas/{cinemaId}/showtimes:
 *   get:
 *     summary: Lấy danh sách suất chiếu cho một phim tại rạp phim cụ thể (Public)
 *     description: >
 *       API này cho phép tất cả ngưỞi dùng xem danh sách suất chiếu của một phim cụ thể tại một rạp phim cụ thể.
 *       Kết quả được nhóm theo ngày và bao gồm thông tin vỞ thỞi gian bắt đầu, kết thúc, phòng chiếu và số ghế còn trống.
 *       API này thưỞng được sử dụng trong quá trình đặt vé để ngưỞi dùng lựa chỞn suất chiếu phù hợp.
 *     tags: [Movies]
 *     parameters:
 *       - in: path
 *         name: movieId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của phim
 *       - in: path
 *         name: cinemaId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của rạp phim
 *     responses:
 *       200:
 *         description: Danh sách suất chiếu phim tại rạp phim
 *       400:
 *         description: ID phim hoặc ID rạp phim không hợp lệ
 *       404:
 *         description: Không tìm thấy phim hoặc rạp phim
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/:movieId/cinemas/:cinemaId/showtimes', movieController.getShowtimesByMovieAndCinema);

/**
 * @swagger
 * /api/movies/{movieId}/cinemas:
 *   get:
 *     summary: Lấy danh sách rạp phim đang chiếu một phim cụ thể (Public)
 *     description: >
 *       API này cho phép tất cả ngưỞi dùng xem danh sách các rạp phim đang chiếu một phim cụ thể.
 *       Kết quả bao gồm thông tin vỞ rạp phim và các suất chiếu được nhóm theo ngày.
 *       API này thưỞng được sử dụng trong quá trình đặt vé để ngưỞi dùng lựa chỞn rạp phim phù hợp.
 *     tags: [Movies]
 *     parameters:
 *       - in: path
 *         name: movieId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của phim
 *     responses:
 *       200:
 *         description: Danh sách rạp phim đang chiếu phim
 *       400:
 *         description: ID phim không hợp lệ
 *       404:
 *         description: Không tìm thấy phim
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/:movieId/cinemas', movieController.getCinemasShowingMovie);

/**
 * @swagger
 * /api/movies/{movieId}/showtimes:
 *   get:
 *     summary: Lấy tất cả suất chiếu của một phim trên tất cả các rạp (Public)
 *     description: >
 *       API này cho phép tất cả ngưỞi dùng xem tất cả suất chiếu của một phim cụ thể trên tất cả các rạp.
 *       Kết quả được nhóm theo ngày và bao gồm thông tin vỞ rạp phim, phòng chiếu, thỞi gian bắt đầu, kết thúc và số ghế còn trống.
 *       API này hữu ích cho việc hiển thị lịch chiếu tổng thể của một phim.
 *     tags: [Movies]
 *     parameters:
 *       - in: path
 *         name: movieId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID của phim
 *     responses:
 *       200:
 *         description: Danh sách tất cả suất chiếu của phim
 *       400:
 *         description: ID phim không hợp lệ
 *       404:
 *         description: Không tìm thấy phim
 *       500:
 *         description: Lỗi hệ thống
 */
router.get('/:movieId/showtimes', movieController.getAllShowtimesForMovie);

module.exports = router;
