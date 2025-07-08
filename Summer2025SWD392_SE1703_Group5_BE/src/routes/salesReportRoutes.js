const express = require('express');
const router = express.Router();
const salesReportController = require('../controllers/salesReportController');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');




// Test realtime data without auth
router.get('/test-realtime', salesReportController.getRealtimeSales);

/**
 * @swagger
 * tags:
 *   name: Sales Reports
 *   description: Sales reporting and analytics system
 */

// All routes require authentication and admin/staff/manager role
router.use(authMiddleware);
router.use(authorizeRoles('Admin', 'Staff', 'Manager'));

/**
 * @swagger
 * /api/sales-report:
 *   get:
 *     summary: Lấy báo cáo doanh thu (Chỉ Admin/Staff/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin, Staff hoặc Manager xem báo cáo doanh thu trong khoảng thời gian chỉ định.
 *       Báo cáo có thể được tùy chỉnh theo ngày, tuần hoặc tháng và bao gồm thông tin chi tiết về doanh thu, số lượng đơn hàng,
 *       tỷ lệ chuyển đổi và các chỉ số kinh doanh khác. API này thường được sử dụng trong trang quản trị báo cáo.
 *     tags: [Sales Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD)
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *           default: daily
 *         description: Report period
 *     responses:
 *       200:
 *         description: Sales report generated successfully
 *       400:
 *         description: Invalid parameters
 *       403:
 *         description: Access denied
 */
router.get('/', salesReportController.getSalesReport);

/**
 * @swagger
 * /api/sales-report/export:
 *   get:
 *     summary: Xuất báo cáo doanh thu (Chỉ Admin/Staff/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin, Staff hoặc Manager xuất báo cáo doanh thu ra các định dạng khác nhau.
 *       Người dùng có thể lựa chọn khoảng thời gian, chu kỳ báo cáo và định dạng xuất (JSON hoặc CSV).
 *       Báo cáo xuất ra có thể được sử dụng cho mục đích lưu trữ hoặc phân tích nâng cao bên ngoài hệ thống.
 *     tags: [Sales Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD)
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *           default: daily
 *         description: Report period
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *         description: Export format
 *     responses:
 *       200:
 *         description: Report exported successfully
 *       400:
 *         description: Invalid parameters
 *       403:
 *         description: Access denied
 */
router.get('/export', salesReportController.exportSalesReport);

/**
 * @swagger
 * /api/sales-report/export-excel:
 *   get:
 *     summary: Xuất báo cáo ra file Excel (Chỉ Admin/Staff/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin, Staff hoặc Manager xuất báo cáo doanh thu ra file Excel (.xlsx).
 *       Người dùng có thể chọn loại báo cáo (sales, movies, cinemas, payments, categories), khoảng thời gian và chu kỳ.
 *       File Excel được tạo với định dạng chuyên nghiệp, bao gồm header styling và auto-fit columns.
 *     tags: [Sales Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: reportType
 *         schema:
 *           type: string
 *           enum: [sales, movies, cinemas, payments, categories]
 *           default: sales
 *         description: Type of report to export
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD)
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *           default: daily
 *         description: Report period
 *     responses:
 *       200:
 *         description: Excel file generated and downloaded successfully
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Invalid parameters
 *       403:
 *         description: Access denied
 */
router.get('/export-excel', salesReportController.exportReportToExcel);
/**
 * @swagger
 * /api/sales-report/movies:
 *   get:
 *     summary: Lấy báo cáo doanh thu theo phim (Chỉ Admin/Staff/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin, Staff hoặc Manager xem báo cáo doanh thu chi tiết theo từng phim.
 *       Kết quả bao gồm thông tin về doanh thu, số lượng vé bán ra, tỉ lệ lấp đầy và các chỉ số khác cho mỗi phim
 *       trong khoảng thời gian được chỉ định. Báo cáo này giúp đánh giá hiệu quả doanh thu của từng phim.
 *     tags: [Sales Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Movie revenue report generated successfully
 *       400:
 *         description: Missing required parameters
 *       403:
 *         description: Access denied
 */
router.get('/movies', salesReportController.getMovieRevenueReport);

/**
 * @swagger
 * /api/sales-report/cinemas:
 *   get:
 *     summary: Lấy báo cáo doanh thu theo rạp phim (Chỉ Admin/Staff/Manager)
 *     description: >
 *       API này cho phép người dùng có vai trò Admin, Staff hoặc Manager xem báo cáo doanh thu chi tiết theo từng rạp phim.
 *       Kết quả bao gồm thông tin về doanh thu, số lượng vé bán ra, tỉ lệ lấp đầy và các chỉ số khác cho mỗi rạp phim
 *       trong khoảng thời gian được chỉ định. Báo cáo này giúp so sánh hiệu quả kinh doanh giữa các rạp phim.
 *     tags: [Sales Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Cinema revenue report generated successfully
 *       400:
 *         description: Missing required parameters
 *       403:
 *         description: Access denied
 */
router.get('/cinemas', salesReportController.getCinemaRevenueReport);

module.exports = router;
