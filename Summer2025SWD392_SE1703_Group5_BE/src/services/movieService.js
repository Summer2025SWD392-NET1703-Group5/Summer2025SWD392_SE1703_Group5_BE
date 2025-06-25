// services/movieService.js
const { Movie, MovieRating, Showtime, CinemaRoom, User, sequelize } = require('../models');
const { Op } = require('sequelize');
const cloudinaryService = require('./cloudinaryService');

class MovieService {
    // Lấy tất cả phim
    async getAllMovies(status = null, filter = null) {
        let whereClause = {};

        if (status) {
            whereClause.Status = status;
        }

        if (filter) {
            const lowerFilter = filter.toLowerCase();
            whereClause[Op.or] = [
                { Movie_Name: { [Op.like]: `%${filter}%` } },
                { Director: { [Op.like]: `%${filter}%` } },
                { Genre: { [Op.like]: `%${filter}%` } },
                { Cast: { [Op.like]: `%${filter}%` } }
            ];
        }

        const movies = await Movie.findAll({
            where: whereClause,
            include: [
                {
                    model: MovieRating,
                    as: 'MovieRatings',
                    required: false
                },
                {
                    model: Showtime,
                    as: 'Showtimes',
                    required: false,
                    where: {
                        Show_Date: { [Op.gte]: new Date() }
                    }
                }
            ],
            order: [['Release_Date', 'DESC']]
        });

        return movies.map(movie => ({
            Movie_ID: movie.Movie_ID,
            Movie_Name: movie.Movie_Name,
            Release_Date: movie.Release_Date,
            Premiere_Date: movie.Premiere_Date,
            End_Date: movie.End_Date,
            Director: movie.Director,
            Cast: movie.Cast,
            Duration: movie.Duration,
            Genre: movie.Genre,
            Rating: movie.Rating,
            Language: movie.Language,
            Country: movie.Country,
            Synopsis: movie.Synopsis,
            Poster_URL: movie.Poster_URL,
            Trailer_Link: movie.Trailer_Link,
            Status: movie.Status,
            Average_Rating: movie.MovieRatings?.length > 0
                ? movie.MovieRatings.reduce((sum, r) => sum + r.Rating, 0) / movie.MovieRatings.length
                : 0,
            Rating_Count: movie.MovieRatings?.length || 0,
            Showtimes_Count: movie.Showtimes?.length || 0
        }));
    }

    // Lấy phim theo ID
    async getMovieById(id) {
        const movie = await Movie.findByPk(id, {
            include: [
                {
                    model: MovieRating,
                    as: 'MovieRatings',
                    include: [{ model: User, as: 'User' }],
                    required: false
                },
                {
                    model: Showtime,
                    as: 'Showtimes',
                    where: { Show_Date: { [Op.gte]: new Date() } },
                    include: [{ model: CinemaRoom, as: 'CinemaRoom' }],
                    required: false
                }
            ]
        });

        if (!movie) {
            throw new Error(`Không tìm thấy phim có ID ${id}`);
        }

        const ratings = movie.MovieRatings.map(r => ({
            Rating_ID: r.Rating_ID,
            Full_Name: r.User.Full_Name,
            Rating: r.Rating,
            Comment: r.Comment,
            Rating_Date: r.Rating_Date,
            Is_Verified: r.Is_Verified
        })).sort((a, b) => new Date(b.Rating_Date) - new Date(a.Rating_Date));

        const showtimesByDate = movie.Showtimes
            .reduce((acc, showtime) => {
                // Kiểm tra và chuyển đổi Show_Date nếu không phải là Date object
                let dateKey;
                try {
                    if (showtime.Show_Date instanceof Date) {
                        dateKey = showtime.Show_Date.toDateString();
                    } else {
                        // Chuyển đổi sang Date object
                        const dateObj = new Date(showtime.Show_Date);
                        dateKey = dateObj.toDateString();
                    }
                } catch (error) {
                    console.error('Lỗi xử lý Show_Date:', showtime.Show_Date);
                    console.error(error);
                    // Sử dụng ngày hiện tại làm giá trị mặc định nếu không thể chuyển đổi
                    dateKey = new Date().toDateString();
                }

                if (!acc[dateKey]) {
                    acc[dateKey] = [];
                }
                acc[dateKey].push({
                    Showtime_ID: showtime.Showtime_ID,
                    Start_Time: showtime.Start_Time,
                    End_Time: showtime.End_Time,
                    Price_Tier: showtime.Price_Tier,
                    Base_Price: showtime.Base_Price,
                    Capacity_Available: showtime.Capacity_Available,
                    Room: {
                        Cinema_Room_ID: showtime.CinemaRoom.Cinema_Room_ID,
                        Room_Name: showtime.CinemaRoom.Room_Name,
                        Room_Type: showtime.CinemaRoom.Room_Type
                    }
                });
                return acc;
            }, {});

        const showtimes = Object.entries(showtimesByDate)
            .map(([date, times]) => ({
                Show_Date: new Date(date),
                Showtimes: times.sort((a, b) => {
                    // Kiểm tra kiểu dữ liệu và chuyển đổi nếu cần
                    const startTimeA = typeof a.Start_Time === 'string' ? a.Start_Time : String(a.Start_Time);
                    const startTimeB = typeof b.Start_Time === 'string' ? b.Start_Time : String(b.Start_Time);
                    return startTimeA.localeCompare(startTimeB);
                })
            }))
            .sort((a, b) => a.Show_Date - b.Show_Date);

        const ratingDistribution = [1, 2, 3, 4, 5].map(star =>
            movie.MovieRatings.filter(r => r.Rating === star).length
        );

        return {
            Movie_ID: movie.Movie_ID,
            Movie_Name: movie.Movie_Name,
            Release_Date: movie.Release_Date,
            Premiere_Date: movie.Premiere_Date,
            End_Date: movie.End_Date,
            Production_Company: movie.Production_Company,
            Director: movie.Director,
            Cast: movie.Cast,
            Duration: movie.Duration,
            Genre: movie.Genre,
            Rating: movie.Rating,
            Language: movie.Language,
            Country: movie.Country,
            Synopsis: movie.Synopsis,
            Poster_URL: movie.Poster_URL,
            Trailer_Link: movie.Trailer_Link,
            Status: movie.Status,
            Created_At: movie.Created_At,
            Updated_At: movie.Updated_At,
            Rating_Summary: {
                Average_Rating: movie.MovieRatings.length > 0
                    ? movie.MovieRatings.reduce((sum, r) => sum + r.Rating, 0) / movie.MovieRatings.length
                    : 0,
                Rating_Count: movie.MovieRatings.length,
                Rating_Distribution: ratingDistribution
            },
            Ratings: ratings,
            Showtimes: showtimes
        };
    }

    // Tạo phim mới
    async createMovie(data) {
        if (!data) {
            throw new Error('Dữ liệu không hợp lệ');
        }

        // Kiểm tra phim đã tồn tại
        const existingMovie = await Movie.findOne({
            where: { Movie_Name: data.Movie_Name }
        });

        if (existingMovie) {
            throw new Error(`Phim '${data.Movie_Name}' đã tồn tại`);
        }

        // Không cho phép tạo phim với status Ended hoặc Cancelled
        if (data.Status && (data.Status === 'Ended' || data.Status === 'Cancelled')) {
            throw new Error(`Không thể tạo phim mới với trạng thái ${data.Status}. Chỉ cho phép trạng thái 'Coming Soon', 'Now Showing' hoặc 'Inactive'.`);
        }

        const movieData = {
            Movie_Name: data.Movie_Name,
            Release_Date: data.Release_Date,
            Premiere_Date: data.Premiere_Date,
            End_Date: data.End_Date,
            Production_Company: data.Production_Company,
            Director: data.Director,
            Cast: data.Cast,
            Duration: data.Duration,
            Genre: data.Genre,
            Rating: data.Rating,
            Language: data.Language,
            Country: data.Country,
            Synopsis: data.Synopsis,
            Poster_URL: data.Poster_URL,
            Trailer_Link: data.Trailer_Link,
            Status: data.Status || 'Coming Soon',
            Created_By: data.Created_By,
            Created_At: sequelize.fn('GETDATE'),
            Updated_At: sequelize.fn('GETDATE')
        };

        // Xóa các trường undefined để tránh lỗi Sequelize
        Object.keys(movieData).forEach(key => movieData[key] === undefined && delete movieData[key]);

        const movie = await Movie.create(movieData);

        return this.mapMovieToResponseDTO(movie);
    }

    // Cập nhật phim
    async updateMovie(data) {
        if (!data) {
            throw new Error('Dữ liệu không hợp lệ');
        }

        const movie = await Movie.findByPk(data.Movie_ID);
        if (!movie) {
            throw new Error(`Không tìm thấy phim có ID ${data.Movie_ID}`);
        }

        // Kiểm tra tên phim trùng lặp
        if (data.Movie_Name !== movie.Movie_Name) {
            const existingMovie = await Movie.findOne({
                where: {
                    Movie_Name: data.Movie_Name,
                    Movie_ID: { [Op.ne]: data.Movie_ID }
                }
            });

            if (existingMovie) {
                throw new Error(`Phim '${data.Movie_Name}' đã tồn tại`);
            }
        }

        const updateData = {
            Movie_Name: data.Movie_Name,
            Release_Date: data.Release_Date,
            Premiere_Date: data.Premiere_Date,
            End_Date: data.End_Date,
            Production_Company: data.Production_Company,
            Director: data.Director,
            Cast: data.Cast,
            Duration: data.Duration,
            Genre: data.Genre,
            Rating: data.Rating,
            Language: data.Language,
            Country: data.Country,
            Synopsis: data.Synopsis,
            Poster_URL: data.Poster_URL,
            Trailer_Link: data.Trailer_Link,
            Status: data.Status,
            Updated_At: sequelize.fn('GETDATE')
        };

        // Xóa các trường undefined để tránh lỗi Sequelize, trừ Poster_URL vì nó có thể null
        for (const key in updateData) {
            if (updateData[key] === undefined && key !== 'Poster_URL') {
                delete updateData[key];
            }
        }
        // Nếu Poster_URL không được cung cấp trong data, nó sẽ là undefined, giữ nguyên giá trị cũ trong DB
        // Nếu Poster_URL được cung cấp là null hoặc chuỗi rỗng, nó sẽ được cập nhật tương ứng.
        if (data.Poster_URL === undefined) {
            delete updateData.Poster_URL; // Không cập nhật nếu không có trong data
        }

        await movie.update(updateData);

        return this.mapMovieToResponseDTO(movie);
    }

    // Xóa phim (soft delete)
    async deleteMovie(id) {
        const movie = await Movie.findByPk(id);
        if (!movie) {
            throw new Error(`Không tìm thấy phim có ID ${id}`);
        }

        // Lấy tham chiếu sequelize từ model để sử dụng hàm GETDATE()
        const { sequelize } = require('../models');

        // Kiểm tra có suất chiếu không
        const hasShowtimes = await Showtime.findOne({
            where: { Movie_ID: id }
        });

        if (hasShowtimes) {
            await movie.update({
                Status: 'Cancelled',
                Updated_At: sequelize.fn('GETDATE')
            });
            return {
                status: 'deactivated',
                message: 'Phim đã có suất chiếu, đã đánh dấu là đã hủy thay vì xóa'
            };
        }

        // Đánh dấu phim là đã xóa
        await movie.update({
            Status: 'Inactive',
            Updated_At: sequelize.fn('GETDATE')
        });

        // Ẩn các đánh giá
        await MovieRating.update(
            { Is_Verified: false },
            { where: { Movie_ID: id } }
        );

        return {
            status: 'deleted',
            message: 'Phim đã được đánh dấu là đã xóa'
        };
    }

    // Đánh giá phim
    async rateMovie(movieId, userId, ratingData) {
        if (!ratingData || ratingData.Rating < 1 || ratingData.Rating > 5) {
            throw new Error('Dữ liệu không hợp lệ. Đánh giá phải từ 1-5 sao');
        }

        const movie = await Movie.findByPk(movieId);
        if (!movie) {
            throw new Error(`Không tìm thấy phim có ID ${movieId}`);
        }

        // Kiểm tra đánh giá đã tồn tại
        const existingRating = await MovieRating.findOne({
            where: { Movie_ID: movieId, User_ID: userId }
        });

        // Sử dụng hàm GETDATE() của SQL Server cho timestamp
        const { sequelize } = require('../models');

        if (existingRating) {
            // Cập nhật đánh giá hiện tại
            await existingRating.update({
                Rating: ratingData.Rating,
                Comment: ratingData.Comment,
                Rating_Date: sequelize.fn('GETDATE')
            });

            return {
                rating_id: existingRating.Rating_ID,
                movie_id: existingRating.Movie_ID,
                user_id: existingRating.User_ID,
                rating: existingRating.Rating,
                comment: existingRating.Comment,
                rating_date: existingRating.Rating_Date,
                is_updated: true
            };
        }

        // Tạo đánh giá mới
        const rating = await MovieRating.create({
            Movie_ID: movieId,
            User_ID: userId,
            Rating: ratingData.Rating,
            Comment: ratingData.Comment,
            Rating_Date: sequelize.fn('GETDATE'),
            Is_Verified: await this.hasUserBookedMovie(userId, movieId)
        });

        return {
            rating_id: rating.Rating_ID,
            movie_id: rating.Movie_ID,
            user_id: rating.User_ID,
            rating: rating.Rating,
            comment: rating.Comment,
            rating_date: rating.Rating_Date,
            is_verified: rating.Is_Verified,
            is_updated: false
        };
    }

    // Lấy phim sắp chiếu
    async getComingSoonMovies() {
        const today = new Date();

        return await Movie.findAll({
            where: {
                Status: 'Coming Soon',
                Release_Date: { [Op.gt]: today }
            },
            order: [['Release_Date', 'ASC']],
            attributes: [
                'Movie_ID', 'Movie_Name', 'Release_Date', 'Premiere_Date', 'Director',
                'Duration', 'Genre', 'Rating', 'Synopsis', 'Poster_URL',
                'Trailer_Link'
            ]
        });
    }

    // Lấy phim đang chiếu
    async getNowShowingMovies() {
        const today = new Date();

        return await Movie.findAll({
            where: {
                Status: 'Now Showing',
                [Op.and]: [
                    {
                        [Op.or]: [
                            { End_Date: null },
                            { End_Date: { [Op.gte]: today } }
                        ]
                    },
                    { Release_Date: { [Op.lte]: today } }
                ]
            },
            include: [
                {
                    model: MovieRating,
                    as: 'MovieRatings',
                    required: false
                },
                {
                    model: Showtime,
                    as: 'Showtimes',
                    required: false
                }
            ],
            order: [['Release_Date', 'DESC']]
        });
    }

    // Lấy phim theo thể loại
    async getMoviesByGenre(genre) {
        const today = new Date();

        const movies = await Movie.findAll({
            where: {
                [Op.and]: [
                    {
                        Genre: {
                            [Op.like]: `%${genre}%`
                        }
                    },
                    { Status: 'Now Showing' },
                    {
                        [Op.or]: [
                            { End_Date: null },
                            { End_Date: { [Op.gte]: today } }
                        ]
                    }
                ]
            }
        });

        if (!movies || movies.length === 0) {
            console.log(`[MovieService] Không tìm thấy phim thuộc thể loại: ${genre}`);
            throw new Error(`Không tìm thấy phim thuộc thể loại: ${genre}`);
        }

        return movies.map(movie => this.mapMovieToResponseDTO(movie));
    }

    // Lấy danh sách thể loại
    async getMovieGenres() {
        const movies = await Movie.findAll({
            where: { Status: 'Now Showing' },
            attributes: ['Genre']
        });

        if (!movies.length) {
            throw new Error('Không tìm thấy phim nào');
        }

        const genreSet = new Set();
        movies.forEach(movie => {
            if (movie.Genre) {
                const genres = movie.Genre.split(',').map(g => g.trim());
                genres.forEach(g => {
                    if (g) genreSet.add(g);
                });
            }
        });

        return Array.from(genreSet).sort();
    }

    // Helper methods
    async hasUserBookedMovie(userId, movieId) {
        // Logic kiểm tra user đã đặt vé phim này chưa
        // Cần implement dựa vào bảng Booking
        return false; // Placeholder
    }

    mapMovieToResponseDTO(movie) {
        return {
            Movie_ID: movie.Movie_ID,
            Movie_Name: movie.Movie_Name,
            Release_Date: movie.Release_Date,
            Premiere_Date: movie.Premiere_Date,
            End_Date: movie.End_Date,
            Production_Company: movie.Production_Company,
            Director: movie.Director,
            Cast: movie.Cast,
            Duration: movie.Duration,
            Genre: movie.Genre,
            Rating: movie.Rating,
            Language: movie.Language,
            Country: movie.Country,
            Synopsis: movie.Synopsis,
            Poster_URL: movie.Poster_URL,
            Trailer_Link: movie.Trailer_Link,
            Status: movie.Status,
            Created_By: movie.Created_By,
            Created_At: movie.Created_At,
            Updated_At: movie.Updated_At
        };
    }

    // Thêm phương thức getMovieStats
    async getMovieStats() {
        const { Movie, MovieRating, sequelize } = require('../models');
        const { Op } = require('sequelize');

        // Lấy số lượng phim theo từng trạng thái
        const totalMovies = await Movie.count();
        const comingSoon = await Movie.count({ where: { Status: 'Coming Soon' } });
        const nowShowing = await Movie.count({ where: { Status: 'Now Showing' } });
        const ended = await Movie.count({ where: { Status: 'Ended' } });
        const cancelled = await Movie.count({ where: { Status: 'Cancelled' } });

        // Lấy thông tin về đánh giá
        const totalRatings = await MovieRating.count();

        // Cách an toàn để tính điểm đánh giá trung bình mà không cần sắp xếp
        let averageRating = 0;
        if (totalRatings > 0) {
            // Lấy tất cả đánh giá và tính trung bình theo cách thủ công
            const allRatings = await MovieRating.findAll({
                attributes: ['Rating'],
                raw: true
            });

            const sum = allRatings.reduce((total, item) => total + item.Rating, 0);
            averageRating = sum / totalRatings;
        }

        // Lấy thể loại phổ biến
        const movies = await Movie.findAll({
            attributes: ['Genre']
        });

        // Đếm số phim theo thể loại
        const genreCounts = {};
        movies.forEach(movie => {
            if (movie.Genre) {
                const genres = movie.Genre.split(',').map(g => g.trim());
                genres.forEach(genre => {
                    if (!genreCounts[genre]) {
                        genreCounts[genre] = 0;
                    }
                    genreCounts[genre]++;
                });
            }
        });

        // Chuyển đổi thành mảng và sắp xếp
        const popularGenres = Object.entries(genreCounts)
            .map(([genre, count]) => ({ genre, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5); // Lấy 5 thể loại phổ biến nhất

        return {
            total_movies: totalMovies,
            coming_soon: comingSoon,
            now_showing: nowShowing,
            ended,
            cancelled,
            total_ratings: totalRatings,
            average_rating: parseFloat(averageRating.toFixed(2)),
            popular_genres: popularGenres
        };
    }

    // Thêm phương thức getSimilarMovies
    async getSimilarMovies(movieId, limit = 5) {
        const { Movie, sequelize } = require('../models');
        const { Op } = require('sequelize');

        // Giới hạn số lượng phim tương tự trả về
        const maxLimit = Math.min(parseInt(limit) || 5, 20);

        // Lấy thông tin phim gốc
        const movie = await Movie.findByPk(movieId);
        if (!movie) {
            console.log(`[getSimilarMovies] Không tìm thấy phim có ID ${movieId}, trả về mảng trống`);
            return []; // Trả về mảng trống thay vì ném lỗi
        }

        // Lấy các thể loại của phim
        const genres = movie.Genre ? movie.Genre.split(',').map(g => g.trim()) : [];

        if (!genres.length) {
            // Nếu không có thể loại, trả về phim ngẫu nhiên
            return await Movie.findAll({
                where: {
                    Movie_ID: { [Op.ne]: movieId },
                    Status: 'Now Showing'
                },
                order: sequelize.random(),
                limit: maxLimit
            });
        }

        // Tìm phim tương tự dựa trên thể loại
        const similarMovies = await Movie.findAll({
            where: {
                Movie_ID: { [Op.ne]: movieId }, // Loại bỏ phim hiện tại
                Status: 'Now Showing',
                [Op.or]: genres.map(genre => ({
                    Genre: { [Op.like]: `%${genre}%` }
                }))
            },
            limit: maxLimit
        });

        // Nếu không tìm thấy phim tương tự, lấy phim mới nhất
        if (!similarMovies.length) {
            return await Movie.findAll({
                where: {
                    Movie_ID: { [Op.ne]: movieId },
                    Status: 'Now Showing'
                },
                order: [['Release_Date', 'DESC']],
                limit: maxLimit
            });
        }

        return similarMovies.map(movie => this.mapMovieToResponseDTO(movie));
    }

    // Tìm kiếm phim nâng cao
    async searchMovies(params) {
        const { genre, status, rating, year, sort, search } = params;
        const { Op } = require('sequelize');
        let whereClause = {};
        let orderClause = [];

        // Điều kiện tìm kiếm theo tên, đạo diễn, diễn viên, thể loại
        if (search) {
            const searchValue = `%${search}%`;
            whereClause[Op.or] = [
                { Movie_Name: { [Op.like]: searchValue } },
                { Director: { [Op.like]: searchValue } },
                { Cast: { [Op.like]: searchValue } },
                { Genre: { [Op.like]: searchValue } }
            ];
        }

        // Lọc theo thể loại
        if (genre) {
            whereClause.Genre = { [Op.like]: `%${genre}%` };
        }

        // Lọc theo trạng thái
        if (status) {
            whereClause.Status = status;
        }

        // Lọc theo xếp hạng
        if (rating) {
            whereClause.Rating = rating;
        }

        // Lọc theo năm phát hành
        if (year) {
            const startDate = new Date(year, 0, 1);
            const endDate = new Date(year, 11, 31);
            whereClause.Release_Date = {
                [Op.between]: [startDate, endDate]
            };
        }

        // Sắp xếp kết quả
        if (sort) {
            switch (sort) {
                case 'name_asc':
                    orderClause = [['Movie_Name', 'ASC']];
                    break;
                case 'name_desc':
                    orderClause = [['Movie_Name', 'DESC']];
                    break;
                case 'date_asc':
                    orderClause = [['Release_Date', 'ASC']];
                    break;
                case 'date_desc':
                    orderClause = [['Release_Date', 'DESC']];
                    break;
                default:
                    orderClause = [['Release_Date', 'DESC']];
            }
        } else {
            orderClause = [['Release_Date', 'DESC']];
        }

        const movies = await Movie.findAll({
            where: whereClause,
            include: [
                {
                    model: MovieRating,
                    as: 'MovieRatings',
                    required: false
                },
                {
                    model: Showtime,
                    as: 'Showtimes',
                    required: false
                }
            ],
            order: orderClause
        });

        return movies.map(movie => this.mapMovieToResponseDTO(movie));
    }

    /**
     * Lấy danh sách rạp phim đang chiếu một phim cụ thể và các suất chiếu tương ứng
     * @param {number} movieId - ID của phim cần tìm
     * @returns {Promise<Array>} Danh sách rạp phim và lịch chiếu
     */
    async getCinemasShowingMovie(movieId) {
        try {
            // Kiểm tra phim có tồn tại không
            const movie = await Movie.findByPk(movieId);
            if (!movie) {
                throw new Error(`Không tìm thấy phim có ID ${movieId}`);
            }

            // Lấy ngày hiện tại
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Tìm tất cả suất chiếu của phim từ ngày hiện tại
            const showtimes = await Showtime.findAll({
                where: {
                    Movie_ID: movieId,
                    Show_Date: { [Op.gte]: today },
                    Status: 'Scheduled'
                },
                include: [{
                    model: CinemaRoom,
                    as: 'CinemaRoom',
                    include: [{
                        model: sequelize.models.Cinema,
                        as: 'Cinema'
                    }]
                }],
                order: [
                    ['Show_Date', 'ASC'],
                    ['Start_Time', 'ASC']
                ]
            });

            // Nhóm suất chiếu theo rạp phim
            const cinemaMap = new Map();

            for (const showtime of showtimes) {
                const cinema = showtime.CinemaRoom.Cinema;
                const cinemaId = cinema.Cinema_ID;

                if (!cinemaMap.has(cinemaId)) {
                    cinemaMap.set(cinemaId, {
                        Cinema_ID: cinemaId,
                        Cinema_Name: cinema.Cinema_Name,
                        Location: cinema.Location,
                        Address: cinema.Address,
                        ShowtimesByDate: {}
                    });
                }

                const cinemaData = cinemaMap.get(cinemaId);

                // Chuyển đổi Show_Date thành chuỗi YYYY-MM-DD để dùng làm key
                let dateKey;
                try {
                    if (showtime.Show_Date instanceof Date) {
                        dateKey = showtime.Show_Date.toISOString().split('T')[0];
                    } else {
                        const dateObj = new Date(showtime.Show_Date);
                        dateKey = dateObj.toISOString().split('T')[0];
                    }
                } catch (error) {
                    console.error('Lỗi xử lý Show_Date:', showtime.Show_Date, error);
                    dateKey = new Date().toISOString().split('T')[0];
                }

                if (!cinemaData.ShowtimesByDate[dateKey]) {
                    cinemaData.ShowtimesByDate[dateKey] = [];
                }

                cinemaData.ShowtimesByDate[dateKey].push({
                    Showtime_ID: showtime.Showtime_ID,
                    Start_Time: showtime.Start_Time,
                    End_Time: showtime.End_Time,
                    Price_Tier: showtime.Price_Tier,
                    Base_Price: showtime.Base_Price,
                    Capacity_Available: showtime.Capacity_Available,
                    Room: {
                        Cinema_Room_ID: showtime.CinemaRoom.Cinema_Room_ID,
                        Room_Name: showtime.CinemaRoom.Room_Name,
                        Room_Type: showtime.CinemaRoom.Room_Type
                    }
                });
            }

            // Chuyển đổi Map thành mảng và định dạng lại ShowtimesByDate
            const result = Array.from(cinemaMap.values()).map(cinema => {
                const formattedShowtimes = Object.entries(cinema.ShowtimesByDate).map(([date, times]) => ({
                    Show_Date: date,
                    Showtimes: times.sort((a, b) => {
                        const startTimeA = typeof a.Start_Time === 'string' ? a.Start_Time : String(a.Start_Time);
                        const startTimeB = typeof b.Start_Time === 'string' ? b.Start_Time : String(b.Start_Time);
                        return startTimeA.localeCompare(startTimeB);
                    })
                })).sort((a, b) => a.Show_Date.localeCompare(b.Show_Date));

                return {
                    ...cinema,
                    ShowtimesByDate: formattedShowtimes
                };
            });

            return {
                Movie_ID: movie.Movie_ID,
                Movie_Name: movie.Movie_Name,
                Duration: movie.Duration,
                Poster_URL: movie.Poster_URL,
                Cinemas: result
            };
        } catch (error) {
            console.error('Lỗi khi lấy danh sách rạp phim chiếu phim:', error);
            throw error;
        }
    }

    /**
     * Lấy tất cả suất chiếu của một phim trên tất cả các rạp
     * @param {number} movieId - ID của phim cần tìm
     * @returns {Promise<Object>} Danh sách tất cả suất chiếu của phim
     */
    async getAllShowtimesForMovie(movieId) {
        try {
            // Kiểm tra phim có tồn tại không
            const movie = await Movie.findByPk(movieId);
            if (!movie) {
                throw new Error(`Không tìm thấy phim có ID ${movieId}`);
            }

            // Lấy ngày hiện tại
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Tìm tất cả suất chiếu của phim từ ngày hiện tại
            const showtimes = await Showtime.findAll({
                where: {
                    Movie_ID: movieId,
                    Show_Date: { [Op.gte]: today },
                    Status: 'Scheduled'
                },
                include: [{
                    model: CinemaRoom,
                    as: 'CinemaRoom',
                    include: [{
                        model: sequelize.models.Cinema,
                        as: 'Cinema'
                    }]
                }],
                order: [
                    ['Show_Date', 'ASC'],
                    ['Start_Time', 'ASC']
                ]
            });

            // Nhóm suất chiếu theo ngày
            const showtimesByDate = {};

            for (const showtime of showtimes) {
                // Chuyển đổi Show_Date thành chuỗi YYYY-MM-DD để dùng làm key
                let dateKey;
                try {
                    if (showtime.Show_Date instanceof Date) {
                        dateKey = showtime.Show_Date.toISOString().split('T')[0];
                    } else {
                        const dateObj = new Date(showtime.Show_Date);
                        dateKey = dateObj.toISOString().split('T')[0];
                    }
                } catch (error) {
                    console.error('Lỗi xử lý Show_Date:', showtime.Show_Date, error);
                    dateKey = new Date().toISOString().split('T')[0];
                }

                if (!showtimesByDate[dateKey]) {
                    showtimesByDate[dateKey] = [];
                }

                // Thêm thông tin suất chiếu vào mảng theo ngày
                showtimesByDate[dateKey].push({
                    Showtime_ID: showtime.Showtime_ID,
                    Start_Time: showtime.Start_Time,
                    End_Time: showtime.End_Time,
                    Price_Tier: showtime.Price_Tier,
                    Base_Price: showtime.Base_Price,
                    Capacity_Available: showtime.Capacity_Available,
                    Cinema: {
                        Cinema_ID: showtime.CinemaRoom.Cinema.Cinema_ID,
                        Cinema_Name: showtime.CinemaRoom.Cinema.Cinema_Name,
                        Location: showtime.CinemaRoom.Cinema.Location,
                        Address: showtime.CinemaRoom.Cinema.Address
                    },
                    Room: {
                        Cinema_Room_ID: showtime.CinemaRoom.Cinema_Room_ID,
                        Room_Name: showtime.CinemaRoom.Room_Name,
                        Room_Type: showtime.CinemaRoom.Room_Type
                    }
                });
            }

            // Chuyển đổi object thành mảng và sắp xếp theo ngày
            const formattedShowtimes = Object.entries(showtimesByDate).map(([date, showtimes]) => ({
                Show_Date: date,
                Day_Name: new Date(date).toLocaleString('vi-VN', { weekday: 'long' }),
                Is_Today: date === today.toISOString().split('T')[0],
                Showtimes: showtimes.sort((a, b) => {
                    const startTimeA = typeof a.Start_Time === 'string' ? a.Start_Time : String(a.Start_Time);
                    const startTimeB = typeof b.Start_Time === 'string' ? b.Start_Time : String(b.Start_Time);
                    return startTimeA.localeCompare(startTimeB);
                })
            })).sort((a, b) => a.Show_Date.localeCompare(b.Show_Date));

            return {
                Movie_ID: movie.Movie_ID,
                Movie_Name: movie.Movie_Name,
                Duration: movie.Duration,
                Rating: movie.Rating,
                Poster_URL: movie.Poster_URL,
                Status: movie.Status,
                Dates: formattedShowtimes
            };
        } catch (error) {
            console.error('Lỗi khi lấy tất cả suất chiếu của phim:', error);
            throw error;
        }
    }
}

module.exports = new MovieService();
