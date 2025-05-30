// src/services/cloudinaryService.js
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');


class CloudinaryService {
    constructor() {
        // Cấu hình Cloudinary
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET
        });
    }


    async uploadPoster(file, folder = 'posters') {
        if (!file) {
            return null;
        }


        try {
            // Upload file lên Cloudinary
            const result = await cloudinary.uploader.upload(file.path, {
                folder: folder,
                resource_type: 'image',
                transformation: [
                    { width: 800, height: 1200, crop: 'fill' },
                    { quality: 'auto' }
                ]
            });


            // Xóa file tạm sau khi upload
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }


            return result.secure_url;
        } catch (error) {
            // Xóa file tạm nếu có lỗi
            if (file.path && fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
            throw new Error(`Lỗi upload hình ảnh: ${error.message}`);
        }
    }


    async deleteImage(publicId) {
        try {
            const result = await cloudinary.uploader.destroy(publicId);
            return result;
        } catch (error) {
            throw new Error(`Lỗi xóa hình ảnh: ${error.message}`);
        }
    }


    // Lấy public_id từ URL
    getPublicIdFromUrl(url) {
        try {
            const parts = url.split('/');
            const filename = parts[parts.length - 1];
            return filename.split('.')[0];
        } catch (error) {
            return null;
        }
    }
}


module.exports = new CloudinaryService();



