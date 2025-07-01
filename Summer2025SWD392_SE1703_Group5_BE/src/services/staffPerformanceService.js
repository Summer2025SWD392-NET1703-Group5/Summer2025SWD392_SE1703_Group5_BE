'use strict';

const { User, TicketBooking } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

class StaffPerformanceService {
    async getAllStaffPerformanceReport(staffId = null) {
        try {
            // Lấy danh sách nhân viên (role Staff hoặc Admin)
            let staffQuery = {
                where: {
                    Role: { [Op.in]: ['Staff', 'Admin'] },
                },
            };

            if (staffId) {
                staffQuery.where.User_ID = staffId;
            }

            const staffList = await User.findAll(staffQuery);

            if (!staffList.length) {
                return [];
            }

            // Lấy tất cả booking đã xác nhận
            const confirmedBookings = await TicketBooking.findAll({
                where: {
                    Status: 'Confirmed',
                },
                include: [
                    {
                        model: User,
                        as: 'Customer',
                        attributes: ['Full_Name'],
                    },
                ],
            });

            // Nhóm bookings theo người tạo
            const bookingsByCreator = confirmedBookings.reduce((acc, booking) => {
                const creatorId = booking.Created_By;
                if (!acc[creatorId]) {
                    acc[creatorId] = [];
                }
                acc[creatorId].push(booking);
                return acc;
            }, {});

            // Tạo báo cáo hiệu suất
            const result = staffList.map((staff) => {
                const staffPerformance = {
                    StaffId: staff.User_ID,
                    StaffName: staff.Full_Name || 'Không xác định',
                    Department: staff.Department || 'Không xác định',
                    TotalBookingsHandled: 0,
                    TotalRevenue: 0,
                    CounterBookings: 0,
                    OnlineBookings: 0,
                    AverageRevenuePerBooking: 0,
                    BookingsData: [],
                };

                const staffBookings = bookingsByCreator[staff.User_ID] || [];
                staffPerformance.TotalBookingsHandled = staffBookings.length;
                staffPerformance.TotalRevenue = staffBookings.reduce((sum, b) => sum + (b.Total_Amount || 0), 0);

                staffPerformance.BookingsData = staffBookings.map((booking) => ({
                    BookingId: booking.Booking_ID,
                    BookingDate: booking.Booking_Date,
                    TicketCount: booking.Tickets ? booking.Tickets.length : 0, // Giả định Tickets là một mảng
                    TotalAmount: booking.Total_Amount,
                    Status: booking.Status,
                    CustomerName: booking.Customer ? booking.Customer.Full_Name : 'Khách vãng lai',
                }));

                staffPerformance.CounterBookings = staffBookings.filter(
                    (b) => !b.User_ID || b.User_ID !== b.Created_By
                ).length;
                staffPerformance.OnlineBookings = staffPerformance.TotalBookingsHandled - staffPerformance.CounterBookings;

                if (staffPerformance.TotalBookingsHandled > 0) {
                    staffPerformance.AverageRevenuePerBooking =
                        staffPerformance.TotalRevenue / staffPerformance.TotalBookingsHandled;
                }

                return staffPerformance;
            });

            return result.sort((a, b) => b.TotalRevenue - a.TotalRevenue);
        } catch (error) {
            logger.error(`Lỗi khi tạo báo cáo hiệu suất nhân viên: ${error.message}`);
            throw error;
        }
    }

    async getAllStaffPerformanceDetails(staffId) {
        try {
            // Kiểm tra nhân viên
            const staffUser = await User.findOne({
                where: {
                    User_ID: staffId,
                    Role: { [Op.in]: ['Staff', 'Admin'] },
                },
            });

            if (!staffUser) {
                throw new Error(`Không tìm thấy nhân viên với ID ${staffId}`);
            }

            const reports = await this.getAllStaffPerformanceReport(staffId);
            return (
                reports[0] || {
                    StaffId: staffId,
                    StaffName: staffUser.Full_Name || 'Không xác định',
                    Department: staffUser.Department || 'Không xác định',
                    TotalBookingsHandled: 0,
                    TotalRevenue: 0,
                    CounterBookings: 0,
                    OnlineBookings: 0,
                    AverageRevenuePerBooking: 0,
                    BookingsData: [],
                }
            );
        } catch (error) {
            logger.error(`Lỗi khi lấy chi tiết hiệu suất của nhân viên ${staffId}: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new StaffPerformanceService();