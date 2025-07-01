const express = require('express');
const router = express.Router();
const exportImportController = require('../controllers/exportImportController');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');

/**
 * @swagger
 * components:
 *   schemas:
 *     ExportResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         data:
 *           type: object
 *           properties:
 *             fileName:
 *               type: string
 *             totalRecords:
 *               type: integer
 *             _metadata:
 *               type: object
 *               properties:
 *                 export_time_ms:
 *                   type: number
 *                 optimized:
 *                   type: boolean
 *     
 *     ImportResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         data:
 *           type: object
 *           properties:
 *             created:
 *               type: integer
 *             updated:
 *               type: integer
 *             totalProcessed:
 *               type: integer
 *             errors:
 *               type: array
 *               items:
 *                 type: string
 *             _metadata:
 *               type: object
 *               properties:
 *                 import_time_ms:
 *                   type: number
 *                 optimized:
 *                   type: boolean
 *         message:
 *           type: string
 *     
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *         error_code:
 *           type: string
 *         _performance:
 *           type: object
 *           properties:
 *             response_time_ms:
 *               type: number
 *             api_name:
 *               type: string
 *             error:
 *               type: boolean
 */

// ==================== MOVIE EXPORT/IMPORT ====================

/**
 * @swagger
 * /api/export-import/movies/export:
 *   get:
 *     summary: Export tất cả movies ra Excel (OPTIMIZED)
 *     description: |
 *       Export tất cả phim trong hệ thống ra file Excel với performance tối ưu.
 *       
 *       **Performance Optimizations:**
 *       - Parallel queries (2 queries thay vì N+1)
 *       - Bulk data processing
 *       - Memory-efficient file streaming
 *       - Auto cleanup temp files
 *       
 *       **Estimated Response Time:** < 2000ms cho 1000+ movies
 *     tags: [Export/Import]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: File Excel được tải xuống thành công
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Disposition:
 *             description: Tên file download
 *             schema:
 *               type: string
 *               example: 'attachment; filename="movies_export_1703123456789.xlsx"'
 *       500:
 *         description: Lỗi server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/movies/export', 
  authMiddleware,
  authorizeRoles('Admin'),
  exportImportController.exportMovies
);

/**
 * @swagger
 * /api/export-import/movies/import:
 *   post:
 *     summary: Import movies từ Excel (OPTIMIZED)
 *     description: |
 *       Import danh sách phim từ file Excel với validation và bulk operations.
 *       
 *       **Performance Optimizations:**
 *       - Bulk validation và data processing
 *       - Transaction-based imports
 *       - Bulk create/update operations
 *       - Memory-efficient file processing
 *       
 *       **File Requirements:**
 *       - Format: .xlsx hoặc .xls
 *       - Max size: 10MB
 *       - Required columns: Tên Phim
 *       
 *       **Estimated Response Time:** < 3000ms cho 500+ movies
 *     tags: [Export/Import]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: File Excel chứa dữ liệu movies
 *             required:
 *               - file
 *     responses:
 *       200:
 *         description: Import thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ImportResponse'
 *             example:
 *               success: true
 *               data:
 *                 created: 15
 *                 updated: 5
 *                 totalProcessed: 20
 *                 errors: []
 *                 _metadata:
 *                   import_time_ms: 1200
 *                   optimized: true
 *               message: "Import thành công 20 phim"
 *       400:
 *         description: Lỗi validation hoặc file không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *                 error_code:
 *                   type: string
 *                   enum: [NO_FILE_UPLOADED, INVALID_FILE_TYPE, FILE_TOO_LARGE, IMPORT_VALIDATION_FAILED]
 *       500:
 *         description: Lỗi server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/movies/import',
  authMiddleware,
  authorizeRoles('Admin'),
  exportImportController.getUploadMiddleware(),
  exportImportController.handleMulterError,
  exportImportController.importMovies
);

/**
 * @swagger
 * /api/export-import/movies/template:
 *   get:
 *     summary: Download template Excel cho movie import
 *     description: |
 *       Tải xuống file template Excel mẫu cho việc import movies.
 *       Template bao gồm:
 *       - Tất cả columns cần thiết với header tiếng Việt
 *       - Dữ liệu mẫu để tham khảo
 *       - Ghi chú về các trường bắt buộc (*)
 *     tags: [Export/Import]
 *     responses:
 *       200:
 *         description: File template được tải xuống thành công
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Disposition:
 *             description: Tên file template
 *             schema:
 *               type: string
 *               example: 'attachment; filename="movie_import_template.xlsx"'
 *       500:
 *         description: Lỗi khi tạo template
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/movies/template', exportImportController.downloadMovieTemplate);

// ==================== CINEMA EXPORT/IMPORT ====================

/**
 * @swagger
 * /api/export-import/cinemas/{cinemaId}/export:
 *   get:
 *     summary: Export cinema rooms và seat layouts (OPTIMIZED)
 *     description: |
 *       Export tất cả phòng chiếu và sơ đồ ghế của một rạp ra Excel với performance tối ưu.
 *       
 *       **Excel Structure:**
 *       - Sheet 1: Cinema Info - Thông tin rạp phim
 *       - Sheet 2: Rooms - Danh sách phòng chiếu
 *       - Sheet 3: Seat Layouts - Sơ đồ ghế ngồi
 *       - Sheet 4: Seats - Chi tiết từng ghế
 *       
 *       **Performance Optimizations:**
 *       - Parallel queries (4 queries thay vì N+1)
 *       - Bulk data processing
 *       - Multiple worksheet optimization
 *       - Memory-efficient file streaming
 *       
 *       **Estimated Response Time:** < 3000ms cho 10+ phòng với 1000+ ghế
 *     tags: [Export/Import]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cinemaId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của rạp phim cần export
 *         example: 1
 *     responses:
 *       200:
 *         description: File Excel được tải xuống thành công
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Disposition:
 *             description: Tên file download
 *             schema:
 *               type: string
 *               example: 'attachment; filename="cinema_1_export_1703123456789.xlsx"'
 *       400:
 *         description: Cinema ID không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Cinema ID không hợp lệ"
 *                 error_code:
 *                   type: string
 *                   example: "INVALID_CINEMA_ID"
 *       404:
 *         description: Không tìm thấy rạp phim
 *       500:
 *         description: Lỗi server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/cinemas/:cinemaId/export',
  authMiddleware,
  authorizeRoles('Admin'),
  exportImportController.exportCinemaRooms
);

/**
 * @swagger
 * /api/export-import/cinemas/{cinemaId}/import:
 *   post:
 *     summary: Import cinema rooms và seat layouts (OPTIMIZED)
 *     description: |
 *       Import phòng chiếu và sơ đồ ghế từ Excel vào một rạp cụ thể.
 *       
 *       **Import Process:**
 *       1. Rooms - Tạo/cập nhật phòng chiếu
 *       2. Seat Layouts - Tạo/cập nhật sơ đồ ghế
 *       3. Seats - Tạo/cập nhật từng ghế ngồi
 *       
 *       **Performance Optimizations:**
 *       - Transaction-based imports
 *       - Bulk upsert operations
 *       - Parallel processing between sheets
 *       - Memory-efficient file processing
 *       
 *       **File Requirements:**
 *       - Format: .xlsx hoặc .xls (với multiple sheets)
 *       - Max size: 10MB
 *       - Required sheets: Rooms, Seat Layouts
 *       
 *       **Estimated Response Time:** < 5000ms cho 10+ phòng với 1000+ ghế
 *     tags: [Export/Import]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cinemaId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của rạp phim cần import
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: File Excel chứa dữ liệu cinema rooms và seat layouts
 *             required:
 *               - file
 *     responses:
 *       200:
 *         description: Import thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     rooms:
 *                       type: object
 *                       properties:
 *                         created:
 *                           type: integer
 *                         updated:
 *                           type: integer
 *                         errors:
 *                           type: array
 *                           items:
 *                             type: string
 *                     layouts:
 *                       type: object
 *                       properties:
 *                         created:
 *                           type: integer
 *                         updated:
 *                           type: integer
 *                         errors:
 *                           type: array
 *                           items:
 *                             type: string
 *                     seats:
 *                       type: object
 *                       properties:
 *                         created:
 *                           type: integer
 *                         updated:
 *                           type: integer
 *                         errors:
 *                           type: array
 *                           items:
 *                             type: string
 *                     cinemaName:
 *                       type: string
 *                     _metadata:
 *                       type: object
 *                       properties:
 *                         import_time_ms:
 *                           type: number
 *                         optimized:
 *                           type: boolean
 *                 message:
 *                   type: string
 *             example:
 *               success: true
 *               data:
 *                 rooms:
 *                   created: 3
 *                   updated: 2
 *                   errors: []
 *                 layouts:
 *                   created: 150
 *                   updated: 50
 *                   errors: []
 *                 seats:
 *                   created: 200
 *                   updated: 0
 *                   errors: []
 *                 cinemaName: "Galaxy Cinema Landmark"
 *                 _metadata:
 *                   import_time_ms: 2800
 *                   optimized: true
 *               message: "Import thành công cho rạp Galaxy Cinema Landmark"
 *       400:
 *         description: Lỗi validation hoặc file không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                 error_code:
 *                   type: string
 *                   enum: [INVALID_CINEMA_ID, NO_FILE_UPLOADED, INVALID_FILE_TYPE, FILE_TOO_LARGE, IMPORT_FAILED]
 *       500:
 *         description: Lỗi server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/cinemas/:cinemaId/import',
  authMiddleware,
  authorizeRoles('Admin'),
  exportImportController.getUploadMiddleware(),
  exportImportController.handleMulterError,
  exportImportController.importCinemaRooms
);

/**
 * @swagger
 * /api/export-import/cinemas/template:
 *   get:
 *     summary: Download template Excel cho cinema rooms import
 *     description: |
 *       Tải xuống file template Excel mẫu cho việc import cinema rooms và seat layouts.
 *       
 *       **Template Structure:**
 *       - Sheet 1: Rooms - Template cho phòng chiếu với dữ liệu mẫu
 *       - Sheet 2: Seat Layouts - Template cho sơ đồ ghế với layout mẫu 5x10
 *       
 *       **Sample Data:**
 *       - 2 phòng chiếu mẫu (2D và 3D)
 *       - Layout 5 hàng x 10 cột với ghế VIP và Standard
 *       - Ghi chú về các trường bắt buộc (*)
 *     tags: [Export/Import]
 *     responses:
 *       200:
 *         description: File template được tải xuống thành công
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Disposition:
 *             description: Tên file template
 *             schema:
 *               type: string
 *               example: 'attachment; filename="cinema_import_template.xlsx"'
 *       500:
 *         description: Lỗi khi tạo template
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/cinemas/template', exportImportController.downloadCinemaTemplate);

module.exports = router; 