const express = require('express');
const router = express.Router();
const movieStatusService = require('../services/movieStatusService');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');

/**
 * @swagger
 * components:
 *   schemas:
 *     MovieStatusServiceStatus:
 *       type: object
 *       properties:
 *         isRunning:
 *           type: boolean
 *           description: Trạng thái hoạt động của service
 *         checkIntervalHours:
 *           type: number
 *           description: Khoảng thời gian kiểm tra (giờ)
 *         nextCheckTime:
 *           type: string
 *           format: date-time
 *           description: Thời gian kiểm tra tiếp theo
 */

/**
 * @swagger
 * /api/movie-status:
 *   get:
 *     summary: Lấy trạng thái của MovieStatusService
 *     description: API này cho phép Admin xem trạng thái hiện tại của service tự động cập nhật trạng thái phim
 *     tags: [MovieStatus]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trạng thái của service
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MovieStatusServiceStatus'
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập
 */
router.get('/',
    authMiddleware,
    authorizeRoles('Admin'),
    (req, res) => {
        try {
            const status = movieStatusService.getStatus();
            res.json(status);
        } catch (error) {
            console.error('Lỗi khi lấy trạng thái MovieStatusService:', error);
            res.status(500).json({
                message: 'Lỗi server khi lấy trạng thái service'
            });
        }
    }
);

/**
 * @swagger
 * /api/movie-status/start:
 *   post:
 *     summary: Bắt đầu MovieStatusService
 *     description: API này cho phép Admin bắt đầu service tự động cập nhật trạng thái phim
 *     tags: [MovieStatus]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Service đã được bắt đầu
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập
 */
router.post('/start',
    authMiddleware,
    authorizeRoles('Admin'),
    async (req, res) => {
        try {
            await movieStatusService.start();
            res.json({
                message: 'MovieStatusService đã được bắt đầu',
                status: movieStatusService.getStatus()
            });
        } catch (error) {
            console.error('Lỗi khi bắt đầu MovieStatusService:', error);
            res.status(500).json({
                message: 'Lỗi server khi bắt đầu service'
            });
        }
    }
);

/**
 * @swagger
 * /api/movie-status/stop:
 *   post:
 *     summary: Dừng MovieStatusService
 *     description: API này cho phép Admin dừng service tự động cập nhật trạng thái phim
 *     tags: [MovieStatus]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Service đã được dừng
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập
 */
router.post('/stop',
    authMiddleware,
    authorizeRoles('Admin'),
    (req, res) => {
        try {
            movieStatusService.stop();
            res.json({
                message: 'MovieStatusService đã được dừng',
                status: movieStatusService.getStatus()
            });
        } catch (error) {
            console.error('Lỗi khi dừng MovieStatusService:', error);
            res.status(500).json({
                message: 'Lỗi server khi dừng service'
            });
        }
    }
);

/**
 * @swagger
 * /api/movie-status/run-now:
 *   post:
 *     summary: Chạy kiểm tra trạng thái phim ngay lập tức
 *     description: API này cho phép Admin chạy kiểm tra và cập nhật trạng thái phim ngay lập tức
 *     tags: [MovieStatus]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Kiểm tra đã được thực hiện
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập
 */
router.post('/run-now',
    authMiddleware,
    authorizeRoles('Admin'),
    async (req, res) => {
        try {
            await movieStatusService.runCheckNow();
            res.json({
                message: 'Đã thực hiện kiểm tra và cập nhật trạng thái phim',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Lỗi khi chạy kiểm tra MovieStatusService:', error);
            res.status(500).json({
                message: 'Lỗi server khi thực hiện kiểm tra'
            });
        }
    }
);

/**
 * @swagger
 * /api/movie-status/interval:
 *   put:
 *     summary: Cập nhật khoảng thời gian kiểm tra
 *     description: API này cho phép Admin cập nhật khoảng thời gian kiểm tra của service
 *     tags: [MovieStatus]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - hours
 *             properties:
 *               hours:
 *                 type: number
 *                 description: Khoảng thời gian kiểm tra (giờ)
 *                 example: 24
 *     responses:
 *       200:
 *         description: Khoảng thời gian đã được cập nhật
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập
 */
router.put('/interval',
    authMiddleware,
    authorizeRoles('Admin'),
    (req, res) => {
        try {
            const { hours } = req.body;

            if (!hours || typeof hours !== 'number' || hours <= 0) {
                return res.status(400).json({
                    message: 'Khoảng thời gian không hợp lệ. Phải là số dương.'
                });
            }

            movieStatusService.setCheckInterval(hours);

            res.json({
                message: `Đã cập nhật khoảng thời gian kiểm tra thành ${hours} giờ`,
                status: movieStatusService.getStatus()
            });
        } catch (error) {
            console.error('Lỗi khi cập nhật khoảng thời gian MovieStatusService:', error);
            res.status(500).json({
                message: 'Lỗi server khi cập nhật khoảng thời gian'
            });
        }
    }
);

module.exports = router; 