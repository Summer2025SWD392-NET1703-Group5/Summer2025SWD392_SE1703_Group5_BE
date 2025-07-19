'use strict';

const StaffPerformanceService = require('../services/staffPerformanceService');
const logger = require('../utils/logger');

class StaffPerformanceController {
    async getStaffPerformanceReport(req, res) {
        try {
            const { startDate, endDate } = req.query;
            const report = await StaffPerformanceService.getAllStaffPerformanceReport();
            res.status(200).json(report);
        } catch (error) {
            logger.error(`Lỗi khi tạo báo cáo hiệu suất nhân viên: ${error.message}`);
            res.status(500).json({ message: 'Đã xảy ra lỗi khi tạo báo cáo hiệu suất nhân viên.' });
        }
    }

    async getStaffPerformanceDetails(req, res) {
        try {
            const { staffId } = req.params;
            const parsedStaffId = parseInt(staffId, 10);

            if (isNaN(parsedStaffId) || parsedStaffId <= 0) {
                return res.status(400).json({ message: 'Mã nhân viên không hợp lệ' });
            }

            const details = await StaffPerformanceService.getAllStaffPerformanceDetails(parsedStaffId);
            res.status(200).json(details);
        } catch (error) {
            if (error.message.includes('Không tìm thấy nhân viên')) {
                logger.warn(error.message);
                res.status(404).json({ message: error.message });
            } else {
                logger.error(`Lỗi khi lấy chi tiết hiệu suất của nhân viên ${req.params.staffId}: ${error.message}`);
                res.status(500).json({ message: 'Đã xảy ra lỗi khi lấy chi tiết hiệu suất nhân viên.' });
            }
        }
    }

    async exportStaffPerformanceReport(req, res) {
        try {
            const { startDate, endDate, staffId, format = 'excel' } = req.query;
            const parsedStaffId = staffId ? parseInt(staffId, 10) : null;

            if (parsedStaffId && (isNaN(parsedStaffId) || parsedStaffId <= 0)) {
                return res.status(400).json({ message: 'Mã nhân viên không hợp lệ' });
            }

            if (!['excel', 'pdf'].includes(format.toLowerCase())) {
                return res.status(400).json({ message: "Định dạng phải là 'excel' hoặc 'pdf'" });
            }

            const report = await StaffPerformanceService.getAllStaffPerformanceReport(parsedStaffId);

            const staffInfo = parsedStaffId ? `_NhanVien${parsedStaffId}` : '_TatCaNhanVien';
            const startDateStr = startDate ? new Date(startDate).toISOString().split('T')[0].replace(/-/g, '') : 'all';
            const endDateStr = endDate ? new Date(endDate).toISOString().split('T')[0].replace(/-/g, '') : 'all';
            const fileName = `BaoCaoHieuSuatNhanVien${staffInfo}_${startDateStr}_${endDateStr}.${format.toLowerCase() === 'excel' ? 'xlsx' : 'pdf'}`;

            res.status(200).json({
                message: `Đã xuất báo cáo thành file ${fileName}`,
                reportData: report,
            });
        } catch (error) {
            logger.error(`Lỗi khi xuất báo cáo hiệu suất nhân viên: ${error.message}`);
            res.status(500).json({ message: 'Đã xảy ra lỗi khi xuất báo cáo hiệu suất nhân viên.' });
        }
    }
}

module.exports = new StaffPerformanceController();  