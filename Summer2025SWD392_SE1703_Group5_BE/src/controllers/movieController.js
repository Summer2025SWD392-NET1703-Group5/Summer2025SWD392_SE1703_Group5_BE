// controllers/movieController.js
const movieService = require('../services/movieService');
const cloudinaryService = require('../services/cloudinaryService');
const { validationResult } = require('express-validator');


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
                return res.status(401).json({ message: 'User is not authenticated' });
            }


            // Kiểm tra ngày phát hành phải trong tương lai
            if (new Date(req.body.Release_Date) <= new Date()) {
                return res.status(400).json({
                    message: 'Release date must be in the future'
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
                        message: `Error uploading poster: ${uploadError.message}`
                    });
                }
            }


            const movieData = {
                ...req.body,
                Poster_URL: posterUrl || req.body.Poster_URL,
                Created_By: userId
            };


            const movie = await movieService.createMovie(movieData);


            res.status(201).json(movie);
        } catch (error) {
            console.error('Error creating movie:', error);
            if (error.message.includes('đã tồn tại')) {
                return res.status(400).json({ message: error.message });
            }
            res.status(500).json({
                message: 'Internal server error: ' + error.message
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
                        message: `Error uploading poster: ${uploadError.message}`
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


            const updatedMovie = await movieService.updateMovie(updateData);
            res.json(updatedMovie);
        } catch (error) {
            console.error('Error updating movie:', error);
            if (error.message.includes('không tìm thấy')) {
                return res.status(404).json({ message: error.message });
            }
            if (error.message.includes('đã tồn tại')) {
                return res.status(400).json({ message: error.message });
            }
            res.status(500).json({
                message: 'Internal server error: ' + error.message
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
            console.error('Error deleting movie:', error);
            if (error.message.includes('không tìm thấy')) {
                return res.status(404).json({ message: error.message });
            }
            if (error.message.includes('Cannot delete')) {
                return res.status(400).json({ message: error.message });
            }
            res.status(500).json({
                message: 'Internal server error: ' + error.message
            });
        }
    }


    // Lấy tất cả phim
    async getAllMovies(req, res) {
        try {
            const { status, filter } = req.query;
            const movies = await movieService.getAllMovies(status, filter);


            if (!movies || movies.length === 0) {
                return res.status(404).json({ message: 'No movies found' });
            }


            res.json(movies);
        } catch (error) {
            console.error('Error getting movies:', error);
            res.status(500).json({
                message: 'Internal server error: ' + error.message
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
                    message: `Movie with ID ${movieId} not found`
                });
            }


            res.json(movie);
        } catch (error) {
            console.error('Error getting movie by ID:', error);
            res.status(500).json({
                message: 'Internal server error: ' + error.message
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
            console.error('Error rating movie:', error);
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


    // Tìm kiếm phim nâng cao - THÊM METHOD NÀY
    async searchMovies(req, res) {
        try {
            const searchParams = req.query;
            const movies = await movieService.searchMovies(searchParams);


            res.json({
                data: movies,
                total: movies.length,
                query: searchParams
            });
        } catch (error) {
            console.error('Error searching movies:', error);
            if (error.message.includes('No movies found')) {
                return res.status(404).json({ message: error.message });
            }
            res.status(500).json({
                message: 'Có lỗi xảy ra khi tìm kiếm phim'
            });
        }
    }


    // Lấy phim tương tự - THÊM METHOD NÀY
    async getSimilarMovies(req, res) {
        try {
            const movieId = req.params.id;
            const limit = req.query.limit || 5;


            const movies = await movieService.getSimilarMovies(movieId, limit);
            res.json(movies);
        } catch (error) {
            console.error('Error getting similar movies:', error);
            if (error.message.includes('không tìm thấy')) {
                return res.status(404).json({ message: error.message });
            }
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
}


module.exports = new MovieController();



