'use strict';

const PDFDocument = require('pdfkit');
const logger = require('../utils/logger');
const puppeteer = require('puppeteer');
const TicketHtmlGenerator = require('./ticketHtmlGenerator');

class PdfGenerator {
    /**
     * Tạo file PDF từ mã HTML
     * @param {string} htmlContent - Nội dung HTML
     * @returns {Promise<Buffer>} - Buffer chứa PDF
     */
    async generatePdfFromHtml(htmlContent) {
        try {
            logger.info('Generating PDF from HTML content');
            
            const browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            
            const page = await browser.newPage();
            await page.setContent(htmlContent, { 
                waitUntil: 'networkidle0',
                timeout: 30000 
            });
            
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '10mm',
                    right: '10mm',
                    bottom: '10mm',
                    left: '10mm'
                }
            });
            
            await browser.close();
            logger.info('PDF successfully generated from HTML');
            
            return pdfBuffer;
        } catch (error) {
            logger.error(`Error generating PDF from HTML: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new PdfGenerator();