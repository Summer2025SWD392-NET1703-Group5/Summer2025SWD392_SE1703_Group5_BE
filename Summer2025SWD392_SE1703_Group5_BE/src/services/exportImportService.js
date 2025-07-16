const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const cloudinaryService = require('./cloudinaryService');
const { 
  Movie, 
  Cinema, 
  CinemaRoom, 
  SeatLayout, 
  Seat, 
  Showtime,
  sequelize 
} = require('../models');
const { Op } = require('sequelize');

/**
 * Export Import Service - OPTIMIZED VERSION
 * Xử lý export và import dữ liệu Excel với performance tối ưu
 */
class ExportImportService {
  constructor() {
    this.logger = logger;
    this.tempDir = path.join(__dirname, '../../uploads/temp');
  }

  /**
   * Đảm bảo thư mục temp tồn tại
   */
  async ensureTempDir() {
    try {
      await fs.access(this.tempDir);
    } catch {
      await fs.mkdir(this.tempDir, { recursive: true });
      this.logger.info('[ExportImportService] Đã tạo thư mục temp');
    }
  }

  // ==================== MOVIE EXPORT/IMPORT ====================

  /**
   * Export tất cả movies ra Excel - OPTIMIZED
   */
  async exportMovies() {
    const startTime = Date.now();
    
    try {
      this.logger.info('[exportMovies] Bắt đầu export movies');

      // OPTIMIZATION 1: Lấy dữ liệu song song
      const [movies, showtimeCounts] = await Promise.all([
        // Lấy tất cả movies với thông tin cần thiết
        Movie.findAll({
          order: [['Created_At', 'DESC']],
          raw: true
        }),

        // Đếm số lượng showtimes cho mỗi movie
        Showtime.findAll({
          attributes: [
            'Movie_ID',
            [sequelize.fn('COUNT', sequelize.col('Showtime_ID')), 'showtime_count']
          ],
          group: ['Movie_ID'],
          raw: true
        })
      ]);

      // OPTIMIZATION 2: Tạo map để lookup nhanh
      const showtimeCountMap = new Map(
        showtimeCounts.map(item => [item.Movie_ID, parseInt(item.showtime_count)])
      );

      // OPTIMIZATION 3: Tạo workbook và worksheet
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Movies');

      // OPTIMIZATION 4: Định nghĩa columns một lần
      worksheet.columns = [
        { header: 'Movie_ID', key: 'Movie_ID', width: 10 },
        { header: 'Tên Phim', key: 'Movie_Name', width: 30 },
        { header: 'Ngày Phát Hành', key: 'Release_Date', width: 15 },
        { header: 'Ngày Khởi Chiếu', key: 'Premiere_Date', width: 15 },
        { header: 'Ngày Kết Thúc', key: 'End_Date', width: 15 },
        { header: 'Công Ty SX', key: 'Production_Company', width: 20 },
        { header: 'Đạo Diễn', key: 'Director', width: 20 },
        { header: 'Diễn Viên', key: 'Cast', width: 30 },
        { header: 'Thời Lượng (phút)', key: 'Duration', width: 15 },
        { header: 'Thể Loại', key: 'Genre', width: 20 },
        { header: 'Xếp Hạng', key: 'Rating', width: 10 },
        { header: 'Ngôn Ngữ', key: 'Language', width: 15 },
        { header: 'Quốc Gia', key: 'Country', width: 15 },
        { header: 'Tóm Tắt', key: 'Synopsis', width: 50 },
        { header: 'Poster URL', key: 'Poster_URL', width: 60 },
        { header: 'Trailer Link', key: 'Trailer_Link', width: 60 },
        { header: 'Trạng Thái', key: 'Status', width: 15 },
        { header: 'Số Suất Chiếu', key: 'Showtime_Count', width: 15 },
        { header: 'Người Tạo', key: 'Created_By', width: 15 },
        { header: 'Ngày Tạo', key: 'Created_At', width: 20 },
        { header: 'Ngày Cập Nhật', key: 'Updated_At', width: 20 }
      ];

      // OPTIMIZATION 5: Bulk add rows
      const processedMovies = movies.map(movie => ({
        ...movie,
        Showtime_Count: showtimeCountMap.get(movie.Movie_ID) || 0,
        Release_Date: movie.Release_Date ? new Date(movie.Release_Date) : null,
        Premiere_Date: movie.Premiere_Date ? new Date(movie.Premiere_Date) : null,
        End_Date: movie.End_Date ? new Date(movie.End_Date) : null,
        Created_At: movie.Created_At ? new Date(movie.Created_At) : null,
        Updated_At: movie.Updated_At ? new Date(movie.Updated_At) : null
      }));

      worksheet.addRows(processedMovies);

      // OPTIMIZATION 6: Apply styling
      this.applyExcelStyling(worksheet, 'Movies Export');

      // OPTIMIZATION 7: Lưu file
      await this.ensureTempDir();
      const fileName = `movies_export_${Date.now()}.xlsx`;
      const filePath = path.join(this.tempDir, fileName);
      
      await workbook.xlsx.writeFile(filePath);

      const responseTime = Date.now() - startTime;
      this.logger.info(`[exportMovies] Hoàn thành export ${movies.length} movies trong ${responseTime}ms`);

      return {
        success: true,
        data: {
          fileName,
          filePath,
          totalMovies: movies.length,
          _metadata: {
            export_time_ms: responseTime,
            total_queries: 2,
            optimized: true
          }
        }
      };

    } catch (error) {
      this.logger.error('[exportMovies] Lỗi:', error);
      throw new Error(`Lỗi khi export movies: ${error.message}`);
    }
  }

  /**
   * Import movies từ Excel - OPTIMIZED
   */
  async importMovies(filePath, createdBy) {
    const startTime = Date.now();
    const transaction = await sequelize.transaction();

    try {
      this.logger.info(`[importMovies] Bắt đầu import từ file: ${filePath}`);

      // OPTIMIZATION 1: Đọc Excel file
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.getWorksheet(1);

      if (!worksheet) {
        throw new Error('Không tìm thấy worksheet trong file Excel');
      }

      const importData = [];
      const errors = [];

      // OPTIMIZATION 2: Process rows efficiently
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= 2) return; // Skip title (row 1) and header (row 2)

        try {
          // DEBUG: Log raw cell values before parsing
          const rawRelease = this.getCellValue(row, 2);
          const rawPremiere = this.getCellValue(row, 3);
          const rawEnd = this.getCellValue(row, 4);
          
          this.logger.info(`[importMovies] DEBUG Row ${rowNumber} raw dates:`, {
            Release_Date_raw: rawRelease,
            Release_Date_type: typeof rawRelease,
            Premiere_Date_raw: rawPremiere,
            Premiere_Date_type: typeof rawPremiere,
            End_Date_raw: rawEnd,
            End_Date_type: typeof rawEnd
          });

          // Parse dates với Sequelize literal để tránh timezone issues
          const parsedReleaseDate = this.parseExcelDate(rawRelease);
          const parsedPremiereDate = this.parseExcelDate(rawPremiere);
          const parsedEndDate = this.parseExcelDate(rawEnd);

          // Lấy dữ liệu và đảm bảo Movie_Name là string
          const rawMovieName = this.getCellValue(row, 1);
          const movieName = rawMovieName !== null ? String(rawMovieName) : null;

          const movieData = {
            Movie_Name: movieName,
            Release_Date: parsedReleaseDate ? sequelize.literal(`'${parsedReleaseDate}'`) : null,
            Premiere_Date: parsedPremiereDate ? sequelize.literal(`'${parsedPremiereDate}'`) : null,
            End_Date: parsedEndDate ? sequelize.literal(`'${parsedEndDate}'`) : null,
            Production_Company: this.getCellValue(row, 5),
            Director: this.getCellValue(row, 6),
            Cast: this.getCellValue(row, 7),
            Duration: this.getCellValue(row, 8),
            Genre: this.getCellValue(row, 9),
            Rating: this.getCellValue(row, 10),
            Language: this.getCellValue(row, 11),
            Country: this.getCellValue(row, 12),
            Synopsis: this.getCellValue(row, 13),
            Poster_URL: this.getCellValue(row, 14),
            Trailer_Link: this.getCellValue(row, 15),
            Status: this.getCellValue(row, 16) || 'Coming Soon',
            Created_By: createdBy
          };
          
                     // DEBUG: Log parsed movieData
           this.logger.info(`[importMovies] DEBUG Row ${rowNumber} parsed movieData:`, {
             Movie_Name: movieData.Movie_Name,
             Release_Date: parsedReleaseDate,
             Release_Date_literal: movieData.Release_Date ? movieData.Release_Date.val : null,
             Premiere_Date: parsedPremiereDate,
             Premiere_Date_literal: movieData.Premiere_Date ? movieData.Premiere_Date.val : null,
             End_Date: parsedEndDate,
             End_Date_literal: movieData.End_Date ? movieData.End_Date.val : null,
             Status: movieData.Status
           });

          // OPTIMIZATION 3: Validation
          const validation = this.validateMovieData(movieData, rowNumber);
          
          if (!validation.isValid) {
            this.logger.warn(`[importMovies] Validation failed for row ${rowNumber}:`, validation.errors);
            errors.push(...validation.errors);
            return;
          }

          importData.push(movieData);
        } catch (error) {
          errors.push(`Dòng ${rowNumber}: ${error.message}`);
        }
      });

      if (errors.length > 0) {
        try {
          if (transaction && !transaction.finished) {
            await transaction.rollback();
          }
        } catch (rollbackError) {
          this.logger.warn(`[importMovies] Lỗi khi rollback transaction: ${rollbackError.message}`);
        }
        return {
          success: false,
          errors,
          message: 'Có lỗi trong dữ liệu import'
        };
      }

      // OPTIMIZATION 4: Bulk operations
      const results = {
        created: 0,
        updated: 0,
        errors: []
      };

      // Check existing movies
      const existingMovies = await Movie.findAll({
        where: {
          Movie_Name: { [Op.in]: importData.map(m => m.Movie_Name) }
        },
        attributes: ['Movie_ID', 'Movie_Name'],
        transaction
      });

      const existingMovieNames = new Set(existingMovies.map(m => m.Movie_Name));

      // OPTIMIZATION 5: Separate new and update data
      const newMovies = importData.filter(m => !existingMovieNames.has(m.Movie_Name));
      const updateMovies = importData.filter(m => existingMovieNames.has(m.Movie_Name));

      // OPTIMIZATION 6: Sử dụng RAW SQL để tránh Sequelize date issues
      if (newMovies.length > 0) {
        for (const movieData of newMovies) {
          try {
            // Parse dates trở lại để có giá trị string thuần túy
            const releaseDate = movieData.Release_Date ? movieData.Release_Date.val.replace(/'/g, '') : null;
            const premiereDate = movieData.Premiere_Date ? movieData.Premiere_Date.val.replace(/'/g, '') : null;
            const endDate = movieData.End_Date ? movieData.End_Date.val.replace(/'/g, '') : null;
            
            // DEBUG: Log data trước khi insert
            this.logger.info(`[importMovies] DEBUG: Raw SQL insert data:`, {
              Movie_Name: movieData.Movie_Name,
              Release_Date: releaseDate,
              Premiere_Date: premiereDate,
              End_Date: endDate,
              Status: movieData.Status
            });
            
            // Kiểm tra xem Movie_Name có phải là chuỗi rỗng không
            if (!movieData.Movie_Name || movieData.Movie_Name.trim() === '') {
              throw new Error('Tên phim không được để trống');
            }
            
            // Raw SQL INSERT với prepared statement
            const insertQuery = `
              INSERT INTO Movies (
                Movie_Name, Release_Date, Premiere_Date, End_Date,
                Production_Company, Director, Cast, Duration, Genre, Rating,
                Language, Country, Synopsis, Poster_URL, Trailer_Link, Status, Created_By, Created_At
              ) VALUES (
                :Movie_Name, 
                ${releaseDate ? `CONVERT(DATE, :Release_Date, 23)` : 'NULL'},
                ${premiereDate ? `CONVERT(DATE, :Premiere_Date, 23)` : 'NULL'}, 
                ${endDate ? `CONVERT(DATE, :End_Date, 23)` : 'NULL'},
                :Production_Company, :Director, :Cast, :Duration, :Genre, :Rating,
                :Language, :Country, :Synopsis, :Poster_URL, :Trailer_Link, :Status, :Created_By, GETDATE()
              )
            `;
            
            const replacements = {
              Movie_Name: movieData.Movie_Name,
              Release_Date: releaseDate,
              Premiere_Date: premiereDate,
              End_Date: endDate,
              Production_Company: movieData.Production_Company,
              Director: movieData.Director,
              Cast: movieData.Cast,
              Duration: movieData.Duration,
              Genre: movieData.Genre,
              Rating: movieData.Rating,
              Language: movieData.Language,
              Country: movieData.Country,
              Synopsis: movieData.Synopsis,
              Poster_URL: movieData.Poster_URL,
              Trailer_Link: movieData.Trailer_Link,
              Status: movieData.Status,
              Created_By: movieData.Created_By
            };
            
            await sequelize.query(insertQuery, {
              replacements,
              type: sequelize.QueryTypes.INSERT,
              transaction
            });
            
            results.created++;
            this.logger.info(`[importMovies] Successfully created movie: ${movieData.Movie_Name}`);
            
          } catch (createError) {
            this.logger.error(`[importMovies] Lỗi tạo movie với raw SQL:`, createError);
            
            // Xử lý lỗi và làm rõ thông báo lỗi
            let errorMessage = createError.message;
            
            // Xử lý lỗi "Must declare the scalar variable..."
            if (errorMessage.includes("Must declare the scalar variable")) {
              errorMessage = "Lỗi cú pháp SQL trong tên phim hoặc các trường khác. Vui lòng kiểm tra và loại bỏ các ký tự đặc biệt.";
            }
            
            // Xử lý lỗi giá trị null
            if (errorMessage.includes("cannot be null")) {
              errorMessage = "Có trường bắt buộc bị bỏ trống. Vui lòng điền đầy đủ thông tin.";
            }
            
            // Xử lý lỗi định dạng ngày tháng
            if (errorMessage.includes("date") && errorMessage.includes("conversion")) {
              errorMessage = "Lỗi định dạng ngày tháng. Vui lòng sử dụng định dạng YYYY-MM-DD.";
            }
            
            results.errors.push(`Phim "${movieData.Movie_Name || 'Không có tên'}": ${errorMessage}`);
          }
        }
      }

      // OPTIMIZATION 7: Bulk update existing movies
      for (const movieData of updateMovies) {
        await Movie.update(movieData, {
          where: { Movie_Name: movieData.Movie_Name },
          transaction
        });
        results.updated++;
      }

      // Only commit if transaction is still active
      if (transaction && !transaction.finished) {
        await transaction.commit();
      }

      const responseTime = Date.now() - startTime;
      this.logger.info(`[importMovies] Hoàn thành import ${importData.length} movies trong ${responseTime}ms`);

      return {
        success: true,
        data: {
          ...results,
          totalProcessed: importData.length,
          _metadata: {
            import_time_ms: responseTime,
            optimized: true
          }
        }
      };

    } catch (error) {
      try {
        if (transaction && !transaction.finished) {
          await transaction.rollback();
        }
      } catch (rollbackError) {
        this.logger.warn(`[importMovies] Lỗi khi rollback transaction trong catch: ${rollbackError.message}`);
      }
      this.logger.error('[importMovies] Lỗi:', error);
      throw new Error(`Lỗi khi import movies: ${error.message}`);
    }
  }

  // ==================== CINEMA EXPORT/IMPORT ====================

  /**
   * Export cinema rooms và seat layouts - OPTIMIZED
   */
  async exportCinemaRooms(cinemaId) {
    const startTime = Date.now();

    try {
      this.logger.info(`[exportCinemaRooms] Bắt đầu export cho cinema ${cinemaId}`);

      // OPTIMIZATION 1: Parallel queries (không bao gồm seats)
      const [cinema, rooms, seatLayouts] = await Promise.all([
        Cinema.findByPk(cinemaId, { raw: true }),
        
        CinemaRoom.findAll({
          where: { Cinema_ID: cinemaId },
          raw: true
        }),

        SeatLayout.findAll({
          include: [{
            model: CinemaRoom,
            as: 'CinemaRoom',
            where: { Cinema_ID: cinemaId },
            attributes: []
          }],
          raw: true
        })
      ]);

      if (!cinema) {
        throw new Error(`Không tìm thấy cinema với ID ${cinemaId}`);
      }

      // OPTIMIZATION 2: Tạo workbook với multiple sheets (không bao gồm seats)
      const workbook = new ExcelJS.Workbook();

      // Sheet 1: Cinema Info
      const cinemaSheet = workbook.addWorksheet('Cinema Info');
      cinemaSheet.columns = [
        { header: 'Thuộc Tính', key: 'attribute', width: 20 },
        { header: 'Giá Trị', key: 'value', width: 40 }
      ];

      const cinemaInfo = [
        { attribute: 'Cinema_ID', value: cinema.Cinema_ID },
        { attribute: 'Tên Rạp', value: cinema.Cinema_Name },
        { attribute: 'Địa Chỉ', value: cinema.Address },
        { attribute: 'Thành Phố', value: cinema.City },
        { attribute: 'Số Điện Thoại', value: cinema.Phone_Number },
        { attribute: 'Email', value: cinema.Email },
        { attribute: 'Trạng Thái', value: cinema.Status },
        { attribute: 'Mô Tả', value: cinema.Description }
      ];
      cinemaSheet.addRows(cinemaInfo);

      // Sheet 2: Rooms
      const roomsSheet = workbook.addWorksheet('Rooms');
      roomsSheet.columns = [
        { header: 'Cinema_Room_ID', key: 'Cinema_Room_ID', width: 15 },
        { header: 'Tên Phòng', key: 'Room_Name', width: 20 },
        { header: 'Sức Chứa', key: 'Seat_Quantity', width: 15 },
        { header: 'Loại Phòng', key: 'Room_Type', width: 15 },
        { header: 'Trạng Thái', key: 'Status', width: 15 },
        { header: 'Mô Tả', key: 'Notes', width: 30 }
      ];
      roomsSheet.addRows(rooms);

      // Sheet 3: Seat Layouts
      const layoutsSheet = workbook.addWorksheet('Seat Layouts');
      layoutsSheet.columns = [
        { header: 'Layout_ID', key: 'Layout_ID', width: 12 },
        { header: 'Cinema_Room_ID', key: 'Cinema_Room_ID', width: 15 },
        { header: 'Hàng', key: 'Row_Label', width: 10 },
        { header: 'Cột', key: 'Column_Number', width: 10 },
        { header: 'Loại Ghế', key: 'Seat_Type', width: 15 },
        { header: 'Hoạt Động', key: 'Is_Active', width: 12 }
      ];
      layoutsSheet.addRows(seatLayouts);

      // OPTIMIZATION 3: Apply styling to all sheets (không bao gồm seats)
      [cinemaSheet, roomsSheet, layoutsSheet].forEach((sheet, index) => {
        const sheetNames = ['Cinema Info', 'Rooms', 'Seat Layouts'];
        this.applyExcelStyling(sheet, `${cinema.Cinema_Name} - ${sheetNames[index]}`);
      });

      // OPTIMIZATION 4: Save file
      await this.ensureTempDir();
      const fileName = `cinema_${cinemaId}_export_${Date.now()}.xlsx`;
      const filePath = path.join(this.tempDir, fileName);
      
      await workbook.xlsx.writeFile(filePath);

      const responseTime = Date.now() - startTime;
      this.logger.info(`[exportCinemaRooms] Hoàn thành export cinema ${cinemaId} trong ${responseTime}ms`);

              return {
          success: true,
          data: {
            fileName,
            filePath,
            cinemaName: cinema.Cinema_Name,
            totalRooms: rooms.length,
            totalLayouts: seatLayouts.length,
            _metadata: {
              export_time_ms: responseTime,
              total_queries: 3,
              optimized: true
            }
          }
        };

    } catch (error) {
      this.logger.error('[exportCinemaRooms] Lỗi:', error);
      throw new Error(`Lỗi khi export cinema rooms: ${error.message}`);
    }
  }

  /**
   * Import cinema rooms và seat layouts - OPTIMIZED
   */
  async importCinemaRooms(cinemaId, filePath) {
    const startTime = Date.now();
    const transaction = await sequelize.transaction();

    try {
      this.logger.info(`[importCinemaRooms] Bắt đầu import cho cinema ${cinemaId}`);

      // OPTIMIZATION 1: Validate cinema exists
      const cinema = await Cinema.findByPk(cinemaId, { transaction });
      if (!cinema) {
        throw new Error(`Không tìm thấy cinema với ID ${cinemaId}`);
      }

      // OPTIMIZATION 2: Read Excel file
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      const results = {
        rooms: { created: 0, updated: 0, errors: [] },
        layouts: { created: 0, updated: 0, errors: [] }
      };

      // OPTIMIZATION 3: Process sheets in order (Rooms -> Layouts only, không bao gồm Seats)
      
      // Import Rooms
      const roomsSheet = workbook.getWorksheet('Rooms');
      if (roomsSheet) {
        const roomResults = await this.processRoomsImport(roomsSheet, cinemaId, transaction);
        results.rooms = roomResults;
      }

      // Import Seat Layouts
      const layoutsSheet = workbook.getWorksheet('Seat Layouts');
      if (layoutsSheet) {
        const layoutResults = await this.processLayoutsImport(layoutsSheet, cinemaId, transaction);
        results.layouts = layoutResults;
      }

      await transaction.commit();

      const responseTime = Date.now() - startTime;
      this.logger.info(`[importCinemaRooms] Hoàn thành import cho cinema ${cinemaId} trong ${responseTime}ms`);

      return {
        success: true,
        data: {
          ...results,
          cinemaName: cinema.Cinema_Name,
          _metadata: {
            import_time_ms: responseTime,
            optimized: true
          }
        }
      };

    } catch (error) {
      await transaction.rollback();
      this.logger.error('[importCinemaRooms] Lỗi:', error);
      throw new Error(`Lỗi khi import cinema rooms: ${error.message}`);
    }
  }

  // ==================== HELPER METHODS ====================

  /**
   * Áp dụng styling cho Excel worksheet
   */
  applyExcelStyling(worksheet, title) {
    // Header styling
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '366092' }
    };

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      if (column.eachCell) {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
          const columnLength = cell.value ? cell.value.toString().length : 10;
          if (columnLength > maxLength) {
            maxLength = columnLength;
          }
        });
        column.width = Math.min(maxLength + 2, 50);
      }
    });

    // Add title
    worksheet.insertRow(1, [title]);
    worksheet.mergeCells(1, 1, 1, worksheet.columnCount);
    worksheet.getCell(1, 1).font = { bold: true, size: 14 };
    worksheet.getCell(1, 1).alignment = { horizontal: 'center' };
  }

  /**
   * Lấy giá trị cell an toàn
   */
  getCellValue(row, columnIndex) {
    const cell = row.getCell(columnIndex);
    return cell.value || null;
  }

  /**
   * Parse Excel date thành SQL Server compatible format
   */
  parseExcelDate(dateValue) {
    if (!dateValue) {
      return null;
    }
    
    try {
      let parsedDate = null;
      
      // Xử lý Date object
      if (dateValue instanceof Date) {
        parsedDate = dateValue;
      }
      // Xử lý string format
      else if (typeof dateValue === 'string') {
        const dateStr = dateValue.trim();
        
        // Handle YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          const [year, month, day] = dateStr.split('-').map(Number);
          parsedDate = new Date(year, month - 1, day);
        } else {
          // Fallback parsing
          parsedDate = new Date(dateValue);
        }
      }
      // Xử lý number (Excel serial date)
      else if (typeof dateValue === 'number') {
        // Excel serial date to JavaScript Date
        parsedDate = new Date((dateValue - 25569) * 86400 * 1000);
      }
      
      // Validate parsed date
      if (!parsedDate || isNaN(parsedDate.getTime())) {
        return null;
      }
      
      // Tạo DATETIME string cho SQL Server (YYYY-MM-DD)
      const year = parsedDate.getFullYear();
      const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
      const day = String(parsedDate.getDate()).padStart(2, '0');
      
      return `${year}-${month}-${day}`;
      
    } catch (error) {
      this.logger.error(`[parseExcelDate] Lỗi parse date:`, error);
      return null;
    }
  }

  /**
   * Validate dữ liệu movie
   */
  validateMovieData(movieData, rowNumber) {
    const errors = [];

    // Kiểm tra an toàn cho Movie_Name trước khi gọi trim()
    if (!movieData.Movie_Name || typeof movieData.Movie_Name !== 'string' || movieData.Movie_Name.trim() === '') {
      errors.push(`Dòng ${rowNumber}: Tên phim không được để trống hoặc không hợp lệ`);
    }

    if (movieData.Duration && (isNaN(movieData.Duration) || movieData.Duration <= 0)) {
      errors.push(`Dòng ${rowNumber}: Thời lượng phim không hợp lệ`);
    }

    if (movieData.Status && !['Coming Soon', 'Now Showing', 'Ended', 'Cancelled'].includes(movieData.Status)) {
      errors.push(`Dòng ${rowNumber}: Trạng thái phim không hợp lệ`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Process rooms import
   */
  async processRoomsImport(worksheet, cinemaId, transaction) {
    const results = { created: 0, updated: 0, errors: [] };
    const roomsData = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 2) return; // Skip title (row 1) and header (row 2)

      const roomData = {
        // Chỉ lưu Room_ID nội bộ làm tham chiếu, không sử dụng để import
        _originalRoomId: this.getCellValue(row, 1),
        Room_Name: this.getCellValue(row, 2),
        // Chuyển đổi đúng định dạng dữ liệu
        Seat_Quantity: parseInt(this.getCellValue(row, 3)) || 0,
        Room_Type: this.getCellValue(row, 4) || '2D',
        Status: this.getCellValue(row, 5) || 'Active',
        Notes: this.getCellValue(row, 6),
        Cinema_ID: cinemaId
      };

      if (roomData.Room_Name) {
        roomsData.push(roomData);
      }
    });

    // Kiểm tra và tìm phòng chiếu trùng tên (nếu có)
    const existingRooms = await CinemaRoom.findAll({
      where: {
        Cinema_ID: cinemaId,
        Room_Name: { [Op.in]: roomsData.map(room => room.Room_Name) }
      },
      transaction
    });
    
    const existingRoomNames = new Set(existingRooms.map(room => room.Room_Name));
    this.logger.info(`[processRoomsImport] Phòng trùng tên tại rạp ${cinemaId}: ${Array.from(existingRoomNames).join(', ') || 'Không có'}`);

    // Tạo map từ tên phòng -> room object để truy xuất nhanh
    const roomsByName = {};
    existingRooms.forEach(room => {
      roomsByName[room.Room_Name] = room;
    });

    // Bulk create/update rooms
    for (const roomData of roomsData) {
      try {
        // Loại bỏ trường tham chiếu nội bộ
        const { _originalRoomId, ...roomToSave } = roomData;
        
        // Kiểm tra phòng trùng tên
        if (existingRoomNames.has(roomData.Room_Name)) {
          // Nếu đã có phòng trùng tên, cập nhật thông tin
          const existingRoom = roomsByName[roomData.Room_Name];
          await CinemaRoom.update(roomToSave, { 
            where: { Cinema_Room_ID: existingRoom.Cinema_Room_ID },
            transaction
          });
          results.updated++;
          this.logger.info(`[processRoomsImport] Cập nhật phòng '${roomData.Room_Name}' tại rạp ${cinemaId}`);
        } else {
          // Nếu chưa có phòng, tạo mới
          await CinemaRoom.create(roomToSave, { transaction });
          results.created++;
          this.logger.info(`[processRoomsImport] Tạo mới phòng '${roomData.Room_Name}' tại rạp ${cinemaId}`);
        }
      } catch (error) {
        results.errors.push(`Phòng ${roomData.Room_Name}: ${error.message}`);
        this.logger.error(`[processRoomsImport] Lỗi khi xử lý phòng '${roomData.Room_Name}':`, error);
      }
    }

    return results;
  }

  /**
   * Process layouts import
   */
  async processLayoutsImport(worksheet, cinemaId, transaction) {
    const results = { created: 0, updated: 0, errors: [] };
    const layoutsData = [];

    // Step 1: Thu thập tất cả thông tin layout từ worksheet
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 2) return; // Skip title (row 1) and header (row 2)

      const layoutData = {
        Layout_ID: this.getCellValue(row, 1),
        Original_Cinema_Room_ID: this.getCellValue(row, 2), // Giữ ID phòng gốc để mapping sau
        Row_Label: this.getCellValue(row, 3),
        Column_Number: this.getCellValue(row, 4),
                  Seat_Type: this.getCellValue(row, 5) || 'Thường',
        Is_Active: this.getCellValue(row, 6) !== false
      };

      // Chỉ thu thập dữ liệu đầy đủ
      if (layoutData.Original_Cinema_Room_ID && layoutData.Row_Label && layoutData.Column_Number) {
        layoutsData.push(layoutData);
      }
    });

    if (layoutsData.length === 0) {
      this.logger.warn(`[processLayoutsImport] Không có dữ liệu layout hợp lệ để import`);
      return results;
    }
    
    try {
      // Step 2: Tìm tất cả các phòng của rạp đích
      const targetRooms = await CinemaRoom.findAll({
        where: { Cinema_ID: cinemaId },
        attributes: ['Cinema_Room_ID', 'Room_Name'],
        raw: true,
        transaction
      });
      
      if (!targetRooms || targetRooms.length === 0) {
        throw new Error(`Không tìm thấy phòng nào thuộc rạp ${cinemaId}`);
      }
      
      // Step 3: Tạo mapping từ ID phòng cũ sang tên phòng
      const originalRoomIds = [...new Set(layoutsData.map(layout => layout.Original_Cinema_Room_ID))];
      
      // Tìm thông tin phòng gốc để lấy tên
      const originalRooms = await CinemaRoom.findAll({
        where: { 
          Cinema_Room_ID: { [Op.in]: originalRoomIds }
        },
        attributes: ['Cinema_Room_ID', 'Room_Name'],
        raw: true,
        transaction
      });
      
      // Tạo mapping ID gốc => Tên phòng
      const originalIdToName = {};
      originalRooms.forEach(room => {
        originalIdToName[room.Cinema_Room_ID] = room.Room_Name;
      });
      
      // Tạo mapping Tên phòng => ID mới
      const roomNameToNewId = {};
      targetRooms.forEach(room => {
        roomNameToNewId[room.Room_Name] = room.Cinema_Room_ID;
      });
      
      // Step 4: Xử lý từng layout, gán Cinema_Room_ID mới dựa trên tên phòng
      const layoutsToProcess = [];
      const skippedLayouts = [];
      
      for (const layout of layoutsData) {
        const originalRoomName = originalIdToName[layout.Original_Cinema_Room_ID];
        
        // Bỏ qua nếu không tìm thấy tên phòng gốc
        if (!originalRoomName) {
          skippedLayouts.push(`Layout ${layout.Row_Label}${layout.Column_Number}: Không tìm thấy phòng gốc với ID ${layout.Original_Cinema_Room_ID}`);
          continue;
        }
        
        // Tìm ID phòng mới dựa trên tên phòng
        const newRoomId = roomNameToNewId[originalRoomName];
        
        // Bỏ qua nếu không tìm thấy phòng mới có cùng tên
        if (!newRoomId) {
          skippedLayouts.push(`Layout ${layout.Row_Label}${layout.Column_Number}: Không tìm thấy phòng '${originalRoomName}' trong rạp đích`);
          continue;
        }
        
        // Tạo layout mới với Cinema_Room_ID đã được cập nhật
        const { Layout_ID, Original_Cinema_Room_ID, ...layoutToSave } = layout;
        layoutToSave.Cinema_Room_ID = newRoomId;
        
        layoutsToProcess.push(layoutToSave);
      }
      
      if (skippedLayouts.length > 0) {
        this.logger.warn(`[processLayoutsImport] Bỏ qua ${skippedLayouts.length} layouts do không tìm thấy phòng tương ứng`);
        results.errors = [...results.errors, ...skippedLayouts];
      }
      
      // Step 5: Nếu import cho phòng đã có sẵn, cần xóa layout hiện tại để tránh xung đột
      if (layoutsToProcess.length > 0) {
        const roomIdsToUpdate = [...new Set(layoutsToProcess.map(layout => layout.Cinema_Room_ID))];
        
        // Đếm số lượng layout hiện tại để ghi log
        const existingLayoutsCount = await SeatLayout.count({
          where: { Cinema_Room_ID: { [Op.in]: roomIdsToUpdate } },
          transaction
        });
        
        if (existingLayoutsCount > 0) {
          this.logger.info(`[processLayoutsImport] Xóa ${existingLayoutsCount} layouts hiện tại trước khi import`);
          
          // Xóa tất cả layout hiện tại của các phòng liên quan
          await SeatLayout.destroy({
            where: { Cinema_Room_ID: { [Op.in]: roomIdsToUpdate } },
            transaction
          });
        }
        
        // Step 6: Tạo tất cả layout mới
        if (layoutsToProcess.length > 0) {
          await SeatLayout.bulkCreate(layoutsToProcess, { transaction });
          results.created = layoutsToProcess.length;
          
          this.logger.info(`[processLayoutsImport] Đã tạo ${layoutsToProcess.length} layouts mới cho ${roomIdsToUpdate.length} phòng`);
        }
        } else {
        this.logger.warn(`[processLayoutsImport] Không có layout nào để xử lý sau khi mapping`);
        }
      
      } catch (error) {
      this.logger.error(`[processLayoutsImport] Lỗi xử lý layout:`, error);
      results.errors.push(`Lỗi xử lý layout: ${error.message}`);
    }

    return results;
    }

  /**
   * Cleanup temp files
   */
  async cleanupTempFile(filePath) {
    try {
      await fs.unlink(filePath);
      this.logger.info(`[cleanupTempFile] Đã xóa file temp: ${filePath}`);
    } catch (error) {
      this.logger.warn(`[cleanupTempFile] Không thể xóa file temp: ${error.message}`);
    }
  }
}

module.exports = new ExportImportService(); 