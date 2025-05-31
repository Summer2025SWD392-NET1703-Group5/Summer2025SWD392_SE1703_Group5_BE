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
                { Movie_Name: { [Op.iLike]: `%${lowerFilter}%` } },
                { Director: { [Op.iLike]: `%${lowerFilter}%` } },
                { Genre: { [Op.iLike]: `%${lowerFilter}%` } },
                { Cast: { [Op.iLike]: `%${lowerFilter}%` } }
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
                const date = showtime.Show_Date.toDateString();
                if (!acc[date]) {
                    acc[date] = [];
                }
                acc[date].push({
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
                Showtimes: times.sort((a, b) => a.Start_Time.localeCompare(b.Start_Time))
            }))
            .sort((a, b) => a.Show_Date - b.Show_Date);


        const ratingDistribution = [1, 2, 3, 4, 5].map(star =>
            movie.MovieRatings.filter(r => r.Rating === star).length
        );


        return {
            Movie_ID: movie.Movie_ID,
            Movie_Name: movie.Movie_Name,
            Release_Date: movie.Release_Date,
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


        const movieData = {
            Movie_Name: data.Movie_Name,
            Release_Date: data.Release_Date,
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


        // Kiểm tra có suất chiếu không
        const hasShowtimes = await Showtime.findOne({
            where: { Movie_ID: id }
        });


        if (hasShowtimes) {
            await movie.update({
                Status: 'Cancelled',
                Updated_At: new Date()
            });
            return {
                status: 'deactivated',
                message: 'Phim đã có suất chiếu, đã đánh dấu là đã hủy thay vì xóa'
            };
        }


        // Đánh dấu phim là đã xóa
        await movie.update({
            Status: 'Inactive',
            Updated_At: new Date()
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


        if (existingRating) {
            // Cập nhật đánh giá hiện tại
            await existingRating.update({
                Rating: ratingData.Rating,
                Comment: ratingData.Comment,
                Rating_Date: new Date()
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
            Rating_Date: new Date(),
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
                'Movie_ID', 'Movie_Name', 'Release_Date', 'Director',
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
                    sequelize.where(
                        sequelize.fn('UPPER', sequelize.col('Movie.Genre')),
                        'LIKE',
                        sequelize.fn('UPPER', `%${genre}%`)
                    ),
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
            console.log(`[MovieService] No movies found for genre: ${genre}`);
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
            throw new Error('No movies found');
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
}


module.exports = new MovieService();



