            
const express = require('express');
const memberService = require('../services/memberService');
const bookingService = require('../services/bookingService');
const { authMiddleware, authorizeRoles } = require('../middlewares/authMiddleware');
const logger = require('../utils/logger');

/**
 * Helper function để kiểm tra quyền truy cập thông tin thành viên
 */
const checkMemberAccess = (req, targetUserId) => {
    const currentUserId = req.user?.id || req.user?.userId;
    const currentUserRole = req.user?.role;

    
    if (currentUserRole === 'Admin' || currentUserRole === 'Staff') {
        return { hasAccess: true, reason: 'Quyền truy cập Admin/Staff' };
    }

    
    if (currentUserId && parseInt(currentUserId) === parseInt(targetUserId)) {
        return { hasAccess: true, reason: 'Tự truy cập thông tin cá nhân' };
    }

    return { hasAccess: false, reason: 'Không đủ quyền truy cập' };
};

/**
 * Tìm kiếm thành viên theo số điện thoại
 */
const lookupByPhone = async (req, res) => {
    try {
        const { phoneNumber } = req.params;

        if (!phoneNumber) {
            return res.status(400).json({ message: 'Số điện thoại không được để trống' });
        }

        const member = await memberService.findMemberByPhoneAsync(phoneNumber);
        if (!member) {
            return res.status(404).json({ message: 'Không tìm thấy thành viên với số điện thoại này' });
        }


        const currentPoints = await memberService.getCurrentPointsAsync(member.User_ID);

        const result = {
            User_ID: member.User_ID,
            Full_Name: member.Full_Name,
            Email: member.Email,
            Phone_Number: member.Phone_Number,
            CurrentPoints: currentPoints
        };

        return res.status(200).json(result);
    } catch (error) {
        logger.error(`Lỗi trong lookupByPhone: ${error.message}`);
        return res.status(500).json({ message: 'Đã xảy ra lỗi khi tìm kiếm thành viên', error: error.message });
    }
};

/**
 * Tìm kiếm thành viên theo email
 */
const lookupByEmail = async (req, res) => {
    try {
        const { email } = req.params;

        if (!email) {
            return res.status(400).json({ message: 'Email không được để trống' });
        }

        const member = await memberService.findMemberByEmailAsync(email);
        if (!member) {
            return res.status(404).json({ message: 'Không tìm thấy thành viên với email này' });
        }

        
        const currentPoints = await memberService.getCurrentPointsAsync(member.User_ID);

        const result = {
            User_ID: member.User_ID,
            Full_Name: member.Full_Name,
            Email: member.Email,
            Phone_Number: member.Phone_Number,
            CurrentPoints: currentPoints
        };

        return res.status(200).json(result);
    } catch (error) {
        logger.error(`Lỗi trong lookupByEmail: ${error.message}`);
        return res.status(500).json({ message: 'Đã xảy ra lỗi khi tìm kiếm thành viên', error: error.message });
    }
};

/**
 * Liên kết booking với thành viên
 */
const linkMember = async (req, res) => {
    try {
        const { bookingId, memberIdentifier } = req.body;
        const userId = req.user.id || req.user.userId;

        if (!userId) {
            return res.status(401).json({ message: 'Không thể xác định người dùng' });
        }

        const result = await memberService.linkBookingToMemberAsync(
            bookingId,
            memberIdentifier,
            parseInt(userId)
        );

        return res.status(200).json(result);
    } catch (error) {
        logger.error(`Lỗi trong linkMember: ${error.message}`);


        if (error.message.includes('Không tìm thấy')) {
            return res.status(404).json({ message: error.message });
        } else if (error.message.includes('đã được liên kết')) {
            return res.status(400).json({ message: error.message });
        } else if (error.message.includes('không có quyền')) {
            return res.status(401).json({ message: error.message });
        }

        return res.status(500).json({ message: 'Có lỗi xảy ra khi liên kết booking với thành viên', error: error.message });
    }
};

module.exports = {
    lookupByPhone,
    lookupByEmail,
    linkMember
};