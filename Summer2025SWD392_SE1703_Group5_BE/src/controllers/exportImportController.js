const exportImportService = require('../services/exportImportService');
const logger = require('../utils/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

/**
 * Export Import Controller - OPTIMIZED VERSION
 * Xử lý các API export và import với performance tối ưu
 */
class ExportImportController {
  constructor() {
    this.logger = logger;
    this.setupMulter();
    
    // Bind các methods để giữ context 'this' khi được gọi từ router
    this.exportMovies = this.exportMovies.bind(this);
    this.importMovies = this.importMovies.bind(this);
    this.exportCinemaRooms = this.exportCinemaRooms.bind(this);
    this.importCinemaRooms = this.importCinemaRooms.bind(this);
    this.downloadMovieTemplate = this.downloadMovieTemplate.bind(this);
    this.downloadCinemaTemplate = this.downloadCinemaTemplate.bind(this);
    this.getUploadMiddleware = this.getUploadMiddleware.bind(this);
    this.handleMulterError = this.handleMulterError.bind(this);
  }

  /**
   * Cấu hình multer cho upload file
   */
  setupMulter() {
    const storage = multer.diskStorage({
      destination: async (req, file, cb) => {
        const tempDir = path.join(__dirname, '../../uploads/temp');
        try {
          await fs.access(tempDir);
        } catch {
          await fs.mkdir(tempDir, { recursive: true });
        }
        cb(null, tempDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `import_${uniqueSuffix}${path.extname(file.originalname)}`);
      }
    });

    const fileFilter = (req, file, cb) => {
      const allowedExtensions = ['.xlsx', '.xls'];
      const ext = path.extname(file.originalname).toLowerCase();
      
      if (allowedExtensions.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Chỉ cho phép file Excel (.xlsx, .xls)'), false);
      }
    };

    this.upload = multer({
      storage,
      fileFilter,
      limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
      }
    });
  }

  // ==================== MOVIE EXPORT/IMPORT ====================

  /**
   * Export tất cả movies ra Excel - OPTIMIZED
   */
  async exportMovies(req, res) {
    const startTime = Date.now();
    
    try {
      this.logger.info('[exportMovies] API được gọi');

      // OPTIMIZATION 1: Gọi service đã được tối ưu hóa
      const result = await exportImportService.exportMovies();

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: 'Lỗi khi export movies',
          error_code: 'EXPORT_FAILED'
        });
      }

      // OPTIMIZATION 2: Set headers cho download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${result.data.fileName}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

      // OPTIMIZATION 3: Performance monitoring
      const responseTime = Date.now() - startTime;
      this.logger.info(`[exportMovies] Hoàn thành trong ${responseTime}ms`);

      // OPTIMIZATION 4: Stream file để tối ưu memory
      const fileStream = require('fs').createReadStream(result.data.filePath);
      
      fileStream.pipe(res);

      // OPTIMIZATION 5: Cleanup file sau khi download
      fileStream.on('end', async () => {
        try {
          await exportImportService.cleanupTempFile(result.data.filePath);
        } catch (error) {
          this.logger.warn(`Không thể xóa file temp: ${error.message}`);
        }
      });

      fileStream.on('error', (error) => {
        this.logger.error(`Lỗi khi stream file: ${error.message}`);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Lỗi khi tải file',
            error_code: 'DOWNLOAD_ERROR'
          });
        }
      });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error('[exportMovies] Lỗi:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Lỗi server khi export movies',
        error_code: 'INTERNAL_SERVER_ERROR',
        _performance: {
          response_time_ms: responseTime,
          api_name: 'exportMovies',
          error: true
        }
      });
    }
  }

  /**
   * Import movies từ Excel - OPTIMIZED
   */
  async importMovies(req, res) {
    const startTime = Date.now();
    let tempFilePath = null;

    try {
      this.logger.info('[importMovies] API được gọi');

      // OPTIMIZATION 1: Validate file upload
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng chọn file Excel để import',
          error_code: 'NO_FILE_UPLOADED'
        });
      }

      tempFilePath = req.file.path;
      const createdBy = req.user?.User_ID || 1;

      this.logger.info(`[importMovies] Bắt đầu import từ file: ${req.file.originalname}`);

      // OPTIMIZATION 2: Gọi service đã được tối ưu hóa
      const result = await exportImportService.importMovies(tempFilePath, createdBy);

      // OPTIMIZATION 3: Cleanup temp file
      await exportImportService.cleanupTempFile(tempFilePath);

      const responseTime = Date.now() - startTime;
      this.logger.info(`[importMovies] Hoàn thành trong ${responseTime}ms`);

      // Tạo thông báo chi tiết về số lượng phim được tạo và cập nhật
      const created = result.data?.created || 0;
      const updated = result.data?.updated || 0;
      const totalImported = created + updated;
      const errors = result.data?.errors || result.errors || [];

      // Kiểm tra nếu có lỗi trong quá trình import
      if (errors && errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Có lỗi trong quá trình import phim',
          errors: errors,
          data: {
            created,
            updated,
            totalProcessed: totalImported,
            _metadata: result.data?._metadata
          },
          error_code: 'IMPORT_ERRORS'
        });
      }

      // Nếu không có lỗi và không có phim nào được import
      if (totalImported === 0) {
        return res.status(400).json({
          success: false,
          message: 'Không có phim nào được import. Vui lòng kiểm tra dữ liệu đầu vào.',
          data: {
            created,
            updated,
            totalProcessed: 0,
            _metadata: result.data?._metadata
          },
          error_code: 'NO_MOVIES_IMPORTED'
        });
      }

      // Nếu import thành công
      return res.status(200).json({
        success: true,
        data: {
          created,
          updated,
          totalProcessed: totalImported,
          _metadata: result.data?._metadata
        },
        message: `Import thành công ${totalImported} phim (tạo mới: ${created}, cập nhật: ${updated})`,
        _performance: {
          response_time_ms: responseTime,
          api_name: 'importMovies',
          optimized: true
        }
      });

    } catch (error) {
      // Cleanup temp file nếu có lỗi
      if (tempFilePath) {
        try {
          await exportImportService.cleanupTempFile(tempFilePath);
        } catch (cleanupError) {
          this.logger.warn(`Không thể xóa temp file: ${cleanupError.message}`);
        }
      }

      const responseTime = Date.now() - startTime;
      this.logger.error('[importMovies] Lỗi:', error);
      
      return res.status(500).json({
        success: false,
        message: `Lỗi server khi import movies: ${error.message}`,
        error_code: 'INTERNAL_SERVER_ERROR',
        _performance: {
          response_time_ms: responseTime,
          api_name: 'importMovies',
          error: true
        }
      });
    }
  }

  // ==================== CINEMA EXPORT/IMPORT ====================

  /**
   * Export cinema rooms và seat layouts - OPTIMIZED
   */
  async exportCinemaRooms(req, res) {
    const startTime = Date.now();
    
    try {
      const { cinemaId } = req.params;

      // OPTIMIZATION 1: Validate cinema ID
      if (!cinemaId || isNaN(parseInt(cinemaId))) {
        return res.status(400).json({
          success: false,
          message: 'Cinema ID không hợp lệ',
          error_code: 'INVALID_CINEMA_ID'
        });
      }

      this.logger.info(`[exportCinemaRooms] Export cinema ${cinemaId}`);

      // OPTIMIZATION 2: Gọi service đã được tối ưu hóa
      const result = await exportImportService.exportCinemaRooms(parseInt(cinemaId));

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: 'Lỗi khi export cinema rooms',
          error_code: 'EXPORT_FAILED'
        });
      }

      // OPTIMIZATION 3: Set headers cho download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${result.data.fileName}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

      const responseTime = Date.now() - startTime;
      this.logger.info(`[exportCinemaRooms] Hoàn thành trong ${responseTime}ms`);

      // OPTIMIZATION 4: Stream file
      const fileStream = require('fs').createReadStream(result.data.filePath);
      fileStream.pipe(res);

      // OPTIMIZATION 5: Cleanup
      fileStream.on('end', async () => {
        await exportImportService.cleanupTempFile(result.data.filePath);
      });

      fileStream.on('error', (error) => {
        this.logger.error(`Lỗi khi stream file: ${error.message}`);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Lỗi khi tải file',
            error_code: 'DOWNLOAD_ERROR'
          });
        }
      });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error('[exportCinemaRooms] Lỗi:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Lỗi server khi export cinema rooms',
        error_code: 'INTERNAL_SERVER_ERROR',
        _performance: {
          response_time_ms: responseTime,
          api_name: 'exportCinemaRooms',
          error: true
        }
      });
    }
  }

  /**
   * Import cinema rooms và seat layouts - OPTIMIZED
   */
  async importCinemaRooms(req, res) {
    const startTime = Date.now();
    let tempFilePath = null;

    try {
      const { cinemaId } = req.params;

      // OPTIMIZATION 1: Validate inputs
      if (!cinemaId || isNaN(parseInt(cinemaId))) {
        return res.status(400).json({
          success: false,
          message: 'Cinema ID không hợp lệ',
          error_code: 'INVALID_CINEMA_ID'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng chọn file Excel để import',
          error_code: 'NO_FILE_UPLOADED'
        });
      }

      tempFilePath = req.file.path;
      this.logger.info(`[importCinemaRooms] Import cho cinema ${cinemaId} từ file: ${req.file.originalname}`);

      // OPTIMIZATION 2: Gọi service đã được tối ưu hóa
      const result = await exportImportService.importCinemaRooms(parseInt(cinemaId), tempFilePath);

      // OPTIMIZATION 3: Cleanup temp file
      await exportImportService.cleanupTempFile(tempFilePath);

      const responseTime = Date.now() - startTime;
      this.logger.info(`[importCinemaRooms] Hoàn thành trong ${responseTime}ms`);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message || 'Import thất bại',
          data: result.data || {},
          error_code: 'IMPORT_FAILED'
        });
      }

      return res.status(200).json({
        success: true,
        data: result.data,
        message: `Import thành công cho rạp ${result.data.cinemaName}`,
        _performance: {
          response_time_ms: responseTime,
          api_name: 'importCinemaRooms',
          optimized: true
        }
      });

    } catch (error) {
      // Cleanup temp file nếu có lỗi
      if (tempFilePath) {
        try {
          await exportImportService.cleanupTempFile(tempFilePath);
        } catch (cleanupError) {
          this.logger.warn(`Không thể xóa temp file: ${cleanupError.message}`);
        }
      }

      const responseTime = Date.now() - startTime;
      this.logger.error('[importCinemaRooms] Lỗi:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Lỗi server khi import cinema rooms',
        error_code: 'INTERNAL_SERVER_ERROR',
        _performance: {
          response_time_ms: responseTime,
          api_name: 'importCinemaRooms',
          error: true
        }
      });
    }
  }

  // ==================== TEMPLATE DOWNLOADS ====================

  /**
   * Download template Excel cho movie import
   */
  async downloadMovieTemplate(req, res) {
    try {
      this.logger.info('[downloadMovieTemplate] Tạo template Excel cho movie import');

      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Movies Template');

      // Định nghĩa columns
      worksheet.columns = [
        { header: 'Tên Phim*', key: 'Movie_Name', width: 30 },
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
        { header: 'Trạng Thái', key: 'Status', width: 15 }
      ];

      // Thêm data mẫu
      worksheet.addRow([
        'Tên Phim Mẫu',
        '2024-12-01',
        '2024-12-05',
        '2024-12-31',
        'Studio ABC',
        'Đạo Diễn XYZ',
        'Diễn viên A, Diễn viên B',
        120,
        'Hành động, Phiêu lưu',
        'T13',
        'Tiếng Việt',
        'Việt Nam',
        'Mô tả phim mẫu...',
        'https://example.com/poster.jpg',
        'https://youtube.com/watch?v=example',
        'Coming Soon'
      ]);

      // Apply styling
      exportImportService.applyExcelStyling(worksheet, 'Movie Import Template');

      // Set headers và send file
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="movie_import_template.xlsx"');

      await workbook.xlsx.write(res);
      res.end();

    } catch (error) {
      this.logger.error('[downloadMovieTemplate] Lỗi:', error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi khi tạo template',
        error_code: 'TEMPLATE_CREATION_FAILED'
      });
    }
  }

  /**
   * Download template Excel cho cinema rooms import
   */
  async downloadCinemaTemplate(req, res) {
    try {
      this.logger.info('[downloadCinemaTemplate] Tạo template Excel cho cinema import');

      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();

      // Sheet 1: Rooms
      const roomsSheet = workbook.addWorksheet('Rooms');
      roomsSheet.columns = [
        { header: 'Tên Phòng*', key: 'Room_Name', width: 20 },
        { header: 'Số Lượng Ghế*', key: 'Seat_Quantity', width: 15 },
        { header: 'Loại Phòng', key: 'Room_Type', width: 15 },
        { header: 'Trạng Thái', key: 'Status', width: 15 },
        { header: 'Ghi Chú', key: 'Notes', width: 30 }
      ];

      roomsSheet.addRow(['Phòng 1', 100, '2D', 'Active', 'Phòng chiếu 2D tiêu chuẩn']);
      roomsSheet.addRow(['Phòng 2', 80, '3D', 'Active', 'Phòng chiếu 3D']);

      // Sheet 2: Seat Layouts
      const layoutsSheet = workbook.addWorksheet('Seat Layouts');
      layoutsSheet.columns = [
        { header: 'Cinema_Room_ID*', key: 'Cinema_Room_ID', width: 15 },
        { header: 'Hàng*', key: 'Row_Label', width: 10 },
        { header: 'Cột*', key: 'Column_Number', width: 10 },
        { header: 'Loại Ghế', key: 'Seat_Type', width: 15 },
        { header: 'Hoạt Động', key: 'Is_Active', width: 12 }
      ];

      // Thêm mẫu layout cho 5 hàng, 10 cột
      for (let row = 1; row <= 5; row++) {
        for (let col = 1; col <= 10; col++) {
          const rowLabel = String.fromCharCode(64 + row); // A, B, C, D, E
          const seatType = row <= 2 ? 'VIP' : 'Standard';
          layoutsSheet.addRow([1, rowLabel, col, seatType, true]);
        }
      }

      // Apply styling
      [roomsSheet, layoutsSheet].forEach((sheet, index) => {
        const sheetNames = ['Rooms', 'Seat Layouts'];
        exportImportService.applyExcelStyling(sheet, `Cinema Import Template - ${sheetNames[index]}`);
      });

      // Set headers và send file
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="cinema_import_template.xlsx"');

      await workbook.xlsx.write(res);
      res.end();

    } catch (error) {
      this.logger.error('[downloadCinemaTemplate] Lỗi:', error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi khi tạo template',
        error_code: 'TEMPLATE_CREATION_FAILED'
      });
    }
  }

  // ==================== MIDDLEWARE ====================

  /**
   * Middleware xử lý upload file
   */
  getUploadMiddleware() {
    return this.upload.single('file');
  }

  /**
   * Error handling middleware cho multer
   */
  handleMulterError(error, req, res, next) {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File quá lớn. Giới hạn 10MB',
          error_code: 'FILE_TOO_LARGE'
        });
      }
    }

    if (error.message === 'Chỉ cho phép file Excel (.xlsx, .xls)') {
      return res.status(400).json({
        success: false,
        message: error.message,
        error_code: 'INVALID_FILE_TYPE'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Lỗi khi upload file',
      error_code: 'UPLOAD_ERROR'
    });
  }
}

module.exports = new ExportImportController(); 