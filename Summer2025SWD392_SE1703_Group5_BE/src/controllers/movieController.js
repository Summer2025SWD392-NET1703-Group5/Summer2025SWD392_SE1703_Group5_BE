// controllers/movieController.js
const movieService = require('../services/movieService');
const cloudinaryService = require('../services/cloudinaryService');
const referenceService = require('../services/referenceService');
const { validationResult } = require('express-validator');

// Hàm riêng để cập nhật các danh sách tham chiếu
function updateReferenceLists(movieData) {
    // Thêm đạo diễn mới vào danh sách nếu chưa tồn tại
    if (movieData.Director) {
        // Tách các đạo diễn bằng dấu phẩy
        const directorList = movieData.Director.split(',').map(director => director.trim());
        directorList.forEach(director => {
            if (director) referenceService.addToReferenceIfNotExists('directors', director);
        });
    }

    // Thêm diễn viên mới vào danh sách
    if (movieData.Cast) {
        const castList = movieData.Cast.split(',').map(actor => actor.trim());
        castList.forEach(actor => {
            if (actor) referenceService.addToReferenceIfNotExists('actors', actor);
        });
    }

    // Thêm công ty sản xuất mới
    if (movieData.Production_Company) {
        // Tách các công ty sản xuất bằng dấu phẩy
        const companyList = movieData.Production_Company.split(',').map(company => company.trim());
        companyList.forEach(company => {
            if (company) referenceService.addToReferenceIfNotExists('productionCompanies', company);
        });
    }

    // Thêm ngôn ngữ mới
    if (movieData.Language) {
        // Tách các ngôn ngữ bằng dấu phẩy
        const languageList = movieData.Language.split(',').map(language => language.trim());
        languageList.forEach(language => {
            if (language) referenceService.addToReferenceIfNotExists('languages', language);
        });
    }

    // Thêm quốc gia mới
    if (movieData.Country) {
        // Tách các quốc gia bằng dấu phẩy
        const countryList = movieData.Country.split(',').map(country => country.trim());
        countryList.forEach(country => {
            if (country) referenceService.addToReferenceIfNotExists('countries', country);
        });
    }

    // Thêm thể loại mới
    if (movieData.Genre) {
        const genreList = movieData.Genre.split(',').map(genre => genre.trim());
        genreList.forEach(genre => {
            if (genre) referenceService.addToReferenceIfNotExists('genres', genre);
        });
    }
}

class MovieController {
    // Tạo phim mới
    async createMovie(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    message: 'Dữ liệu không hợp lệ',
                    errors: errors.array()
                });
            }

            // Lấy user ID từ JWT token
            const userId = req.user.id;
            if (!userId) {
                return res.status(401).json({ message: 'Người dùng chưa đăng nhập' });
            }

            // Kiểm tra ngày phát hành phải trong tương lai
            if (new Date(req.body.Release_Date) <= new Date()) {
                return res.status(400).json({
                    message: 'Ngày phát hành phải trong tương lai'
                });
            }

            // Kiểm tra thời lượng phim phải từ 60 phút trở lên
            if (req.body.Duration < 60) {
                return res.status(400).json({
                    message: 'Thời lượng phim phải từ 60 phút trở lên'
                });
            }

            // Xử lý upload poster nếu có file
            let posterUrl = null;
            if (req.file) {
                try {
                    posterUrl = await cloudinaryService.uploadPoster(req.file);
                } catch (uploadError) {
                    return res.status(500).json({
                        message: `Lỗi khi tải lên poster: ${uploadError.message}`
                    });
                }
            }

            const movieData = {
                ...req.body,
                Poster_URL: posterUrl || req.body.Poster_URL,
                Created_By: userId
            };

            // Tự động thêm giá trị mới vào danh sách tham chiếu
            updateReferenceLists(movieData);

            const movie = await movieService.createMovie(movieData);

            res.status(201).json(movie);
        } catch (error) {
            console.error('Lỗi khi tạo phim:', error);
            if (error.message.includes('đã tồn tại')) {
                return res.status(400).json({ message: error.message });
            }
            res.status(500).json({
                message: 'Lỗi máy chủ: ' + error.message
            });
        }
    }

    // Cập nhật phim
    async updateMovie(req, res) {
        try {
            const movieId = req.params.id;
            const errors = validationResult(req);

            if (!errors.isEmpty()) {
                return res.status(400).json({
                    message: 'Dữ liệu không hợp lệ',
                    errors: errors.array()
                });
            }

            // Kiểm tra thời lượng phim
            if (req.body.Duration && req.body.Duration < 60) {
                return res.status(400).json({
                    message: 'Thời lượng phim phải từ 60 phút trở lên'
                });
            }

            // Xử lý upload poster mới nếu có
            let posterUrl = null;
            if (req.file) {
                try {
                    posterUrl = await cloudinaryService.uploadPoster(req.file);
                } catch (uploadError) {
                    return res.status(500).json({
                        message: `Lỗi khi tải lên poster: ${uploadError.message}`
                    });
                }
            }

            const updateData = {
                ...req.body,
                Movie_ID: movieId
            };

            if (posterUrl) {
                updateData.Poster_URL = posterUrl;
            }

            // Tự động thêm giá trị mới vào danh sách tham chiếu
            updateReferenceLists(updateData);

            const updatedMovie = await movieService.updateMovie(updateData);
            res.json(updatedMovie);
        } catch (error) {
            console.error('Lỗi khi cập nhật phim:', error);
            if (error.message.includes('không tìm thấy')) {
                return res.status(404).json({ message: error.message });
            }
            if (error.message.includes('đã tồn tại')) {
                return res.status(400).json({ message: error.message });
            }
            res.status(500).json({
                message: 'Lỗi máy chủ: ' + error.message
            });
        }
    }

    // Xóa phim (soft delete)
    async deleteMovie(req, res) {
        try {
            const movieId = req.params.id;
            const result = await movieService.deleteMovie(movieId);
            res.json(result);
        } catch (error) {
            console.error('Lỗi khi xóa phim:', error);
            if (error.message.includes('không tìm thấy')) {
                return res.status(404).json({ message: error.message });
            }
            if (error.message.includes('Cannot delete')) {
                return res.status(400).json({ message: error.message });
            }
            res.status(500).json({
                message: 'Lỗi máy chủ: ' + error.message
            });
        }
    }

    // Lấy tất cả phim
    async getAllMovies(req, res) {
        try {
            const { status, filter } = req.query;
            const movies = await movieService.getAllMovies(status, filter);

            if (!movies || movies.length === 0) {
                return res.status(404).json({ message: 'Không tìm thấy phim nào' });
            }

            res.json(movies);
        } catch (error) {
            console.error('Lỗi khi lấy danh sách phim:', error);
            res.status(500).json({
                message: 'Lỗi máy chủ: ' + error.message
            });
        }
    }

    // Lấy phim theo ID
    async getMovieById(req, res) {
        try {
            const movieId = req.params.id;
            const movie = await movieService.getMovieById(movieId);

            if (!movie) {
                return res.status(404).json({
                    message: `Không tìm thấy phim có ID ${movieId}`
                });
            }

            res.json(movie);
        } catch (error) {
            console.error('Lỗi khi lấy thông tin phim:', error);
            res.status(500).json({
                message: 'Lỗi máy chủ: ' + error.message
            });
        }
    }

    // Đánh giá phim
    async rateMovie(req, res) {
        try {
            const movieId = req.params.id;
            const userId = req.user.id;

            if (!userId) {
                return res.status(401).json({
                    message: 'Không thể xác định người dùng'
                });
            }

            const rating = await movieService.rateMovie(movieId, userId, req.body);
            res.json(rating);
        } catch (error) {
            console.error('Lỗi khi đánh giá phim:', error);
            if (error.message.includes('không hợp lệ')) {
                return res.status(400).json({ message: error.message });
            }
            if (error.message.includes('không tìm thấy')) {
                return res.status(404).json({ message: error.message });
            }
            res.status(500).json({
                message: 'Có lỗi xảy ra khi đánh giá phim'
            });
        }
    }

    // Lấy phim sắp chiếu
    async getComingSoonMovies(req, res) {
        try {
            const movies = await movieService.getComingSoonMovies();
            res.json(movies);
        } catch (error) {
            console.error('Error getting coming soon movies:', error);
            res.status(500).json({
                message: 'Có lỗi xảy ra khi lấy danh sách phim sắp chiếu'
            });
        }
    }

    // Lấy phim đang chiếu
    async getNowShowingMovies(req, res) {
        try {
            const movies = await movieService.getNowShowingMovies();
            res.json(movies);
        } catch (error) {
            console.error('Error getting now showing movies:', error);
            res.status(500).json({
                message: 'Có lỗi xảy ra khi lấy danh sách phim đang chiếu'
            });
        }
    }

    // Lấy phim theo thể loại
    async getMoviesByGenre(req, res) {
        try {
            const { genre } = req.params;
            const movies = await movieService.getMoviesByGenre(genre);
            res.json(movies);
        } catch (error) {
            console.error('Error getting movies by genre:', error);
            if (error.message.includes('No movies found')) {
                return res.status(404).json({ message: error.message });
            }
            res.status(500).json({
                message: 'Có lỗi xảy ra khi lấy phim theo thể loại'
            });
        }
    }

    // Lấy danh sách thể loại
    async getMovieGenres(req, res) {
        try {
            const genres = await movieService.getMovieGenres();
            res.json(genres);
        } catch (error) {
            console.error('Error getting movie genres:', error);
            if (error.message.includes('No movies found')) {
                return res.status(404).json({ message: error.message });
            }
            res.status(500).json({
                message: 'Có lỗi xảy ra khi lấy danh sách thể loại'
            });
        }
    }

    // Tìm kiếm phim nâng cao
    async searchMovies(req, res) {
        try {
            const searchParams = req.query;

            // Validate search params nếu cần
            if (searchParams.year && isNaN(Number(searchParams.year))) {
                return res.status(400).json({
                    success: false,
                    message: 'Năm phải là số nguyên',
                    error: 'INVALID_YEAR'
                });
            }

            const movies = await movieService.searchMovies(searchParams);

            return res.status(200).json({
                success: true,
                message: 'Tìm kiếm thành công',
                data: movies,
                total: movies.length,
                query: searchParams
            });
        } catch (error) {
            console.error('Lỗi khi tìm kiếm phim:', error);

            // Phân loại lỗi cụ thể
            if (error.name === 'SequelizeDatabaseError') {
                return res.status(400).json({
                    success: false,
                    message: 'Lỗi truy vấn cơ sở dữ liệu',
                    error: error.message,
                    errorType: error.name
                });
            }

            if (error.message && error.message.includes('No movies found')) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy phim phù hợp',
                    error: error.message
                });
            }

            return res.status(500).json({
                success: false,
                message: 'Lỗi máy chủ khi tìm kiếm phim',
                error: error.message,
                stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
            });
        }
    }

    // Lấy phim tương tự - THÊM METHOD NÀY
    async getSimilarMovies(req, res) {
        try {
            const movieId = req.params.id;
            const limit = req.query.limit || 5;

            const movies = await movieService.getSimilarMovies(movieId, limit);

            // Xử lý trường hợp không có phim tương tự
            if (!movies || movies.length === 0) {
                return res.status(200).json({
                    message: 'Không tìm thấy phim tương tự',
                    data: []
                });
            }

            res.status(200).json(movies);
        } catch (error) {
            console.error('Error getting similar movies:', error);
            res.status(500).json({
                message: 'Có lỗi xảy ra khi lấy phim tương tự'
            });
        }
    }

    // Lấy thống kê phim - THÊM METHOD NÀY
    async getMovieStats(req, res) {
        try {
            const stats = await movieService.getMovieStats();
            res.json(stats);
        } catch (error) {
            console.error('Error getting movie stats:', error);
            res.status(500).json({
                message: 'Có lỗi xảy ra khi lấy thống kê phim'
            });
        }
    }

    /**
     * Lấy danh sách suất chiếu cho một phim tại rạp phim cụ thể
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async getShowtimesByMovieAndCinema(req, res) {
        try {
            const { movieId, cinemaId } = req.params;

            // Validate movieId
            if (!movieId || isNaN(parseInt(movieId))) {
                return res.status(400).json({
                    success: false,
                    message: 'ID phim không hợp lệ'
                });
            }

            // Validate cinemaId
            if (!cinemaId || isNaN(parseInt(cinemaId))) {
                return res.status(400).json({
                    success: false,
                    message: 'ID rạp phim không hợp lệ'
                });
            }

            const parsedMovieId = parseInt(movieId);
            const parsedCinemaId = parseInt(cinemaId);

            // Kiểm tra phim có tồn tại không
            const { Movie, Showtime, CinemaRoom, Cinema } = require('../models');
            const movie = await Movie.findByPk(parsedMovieId);
            if (!movie) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy phim'
                });
            }

            // Kiểm tra rạp phim có tồn tại không
            const cinema = await Cinema.findByPk(parsedCinemaId);
            if (!cinema) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy rạp phim'
                });
            }

            console.log(`Tìm suất chiếu cho phim ${parsedMovieId} tại rạp ${parsedCinemaId}`);

            const { Op } = require('sequelize');
            const today = new Date();

            // Tìm tất cả các suất chiếu cho phim tại rạp cụ thể
            const showtimes = await Showtime.findAll({
                where: {
                    Movie_ID: parsedMovieId,
                    Show_Date: { [Op.gte]: today },
                    Status: 'Scheduled'
                },
                include: [{
                    model: CinemaRoom,
                    as: 'CinemaRoom',
                    required: true,
                    where: {
                        Cinema_ID: parsedCinemaId
                    },
                    attributes: ['Cinema_Room_ID', 'Room_Name', 'Room_Type']
                }],
                order: [
                    ['Show_Date', 'ASC'],
                    ['Start_Time', 'ASC']
                ]
            });

            // Nhóm suất chiếu theo ngày
            const showtimesByDate = {};

            showtimes.forEach(showtime => {
                // Sửa lỗi toISOString - đảm bảo Show_Date là Date object
                let dateKey;
                if (showtime.Show_Date instanceof Date) {
                    dateKey = showtime.Show_Date.toISOString().split('T')[0]; // YYYY-MM-DD
                } else {
                    // Nếu Show_Date là chuỗi, sử dụng trực tiếp nếu nó đã định dạng đúng
                    // hoặc chuyển đổi nó thành đối tượng Date
                    const dateObj = new Date(showtime.Show_Date);
                    dateKey = dateObj.toISOString().split('T')[0];
                }

                if (!showtimesByDate[dateKey]) {
                    showtimesByDate[dateKey] = [];
                }

                showtimesByDate[dateKey].push({
                    Showtime_ID: showtime.Showtime_ID,
                    Start_Time: showtime.Start_Time,
                    End_Time: showtime.End_Time,
                    Room_Name: showtime.CinemaRoom.Room_Name,
                    Room_Type: showtime.CinemaRoom.Room_Type,
                    Capacity_Available: showtime.Capacity_Available
                });
            });

            const result = {
                Movie_ID: movie.Movie_ID,
                Movie_Name: movie.Movie_Name,
                Cinema_ID: cinema.Cinema_ID,
                Cinema_Name: cinema.Cinema_Name,
                ShowtimesByDate: Object.keys(showtimesByDate).map(date => ({
                    Date: date,
                    Showtimes: showtimesByDate[date]
                }))
            };

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error(`Lỗi khi lấy suất chiếu:`, error);
            res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi lấy danh sách suất chiếu'
            });
        }
    }

    /**
     * Lấy danh sách rạp phim đang chiếu một phim cụ thể và các suất chiếu tương ứng
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async getCinemasShowingMovie(req, res) {
        try {
            const { movieId } = req.params;

            // Validate movieId
            if (!movieId || isNaN(parseInt(movieId))) {
                return res.status(400).json({
                    success: false,
                    message: 'ID phim không hợp lệ'
                });
            }

            const parsedMovieId = parseInt(movieId);

            const result = await movieService.getCinemasShowingMovie(parsedMovieId);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Lỗi khi lấy danh sách rạp phim chiếu phim:', error);

            if (error.message && error.message.includes('Không tìm thấy phim')) {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi lấy danh sách rạp phim'
            });
        }
    }

    /**
     * Lấy tất cả suất chiếu của một phim trên tất cả các rạp
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     */
    async getAllShowtimesForMovie(req, res) {
        try {
            const { movieId } = req.params;

            // Validate movieId
            if (!movieId || isNaN(parseInt(movieId))) {
                return res.status(400).json({
                    success: false,
                    message: 'ID phim không hợp lệ'
                });
            }

            const parsedMovieId = parseInt(movieId);

            const result = await movieService.getAllShowtimesForMovie(parsedMovieId);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Lỗi khi lấy tất cả suất chiếu của phim:', error);

            if (error.message && error.message.includes('Không tìm thấy phim')) {
                return res.status(404).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'Đã xảy ra lỗi khi lấy danh sách suất chiếu'
            });
        }
    }
}

module.exports = new MovieController();
