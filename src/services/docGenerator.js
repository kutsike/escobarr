"use strict";
const fs = require("fs");
const path = require("path");
const ejs = require("ejs"); // EJS EKLENDİ
let puppeteer;
try {
    puppeteer = require("puppeteer");
} catch (e) {
    try { puppeteer = require("puppeteer-core"); } catch(e2) {}
}

class DocGenerator {
  constructor(db) {
    this.db = db;
    this.outputDir = path.join(__dirname, "../../data/media");
    if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async generatePdf(templateId, profile) {
    if (!puppeteer) { console.error("Puppeteer yok"); return null; }

    const template = await this.db.getDocTemplate(templateId);
    if (!template) return null;

    // 1. Veri Hazırlığı
    // Template içinde kullanılan değişkenleri (islem_tutari, tarih vb.) buraya eşliyoruz
    const contextData = {
        islem_tutari: profile._lastAmount || "0",
        tarih: new Date().toLocaleDateString("tr-TR"), // "26.12.2025" formatında döner
        saat: new Date().toLocaleTimeString("tr-TR", {hour:'2-digit', minute:'2-digit'}),
        alici_hesap_sahibi: profile.full_name || "Müşteri Adı",
        // Ekstra değişkenler eklenebilir
    };

    // 2. EJS Render (HTML içindeki JS kodlarını çalıştırır)
    let htmlContent = "";
    try {
        htmlContent = ejs.render(template.html_content, contextData);
    } catch (err) {
        console.error("EJS Render Hatası:", err);
        return null;
    }

    // 3. PDF Oluşturma (Puppeteer)
    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        // Mobil görünüm için viewport ayarı
        await page.setViewport({ width: 375, height: 812 }); 
        
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        
        const filename = `evrak_${profile.chat_id}_${Date.now()}.pdf`;
        const filePath = path.join(this.outputDir, filename);
        
        await page.pdf({
            path: filePath,
            width: '375px', // Mobil genişlikte PDF
            height: '812px',
            printBackground: true,
            pageRanges: '1' // Sadece ilk sayfa
        });

        return filePath;

    } catch (err) {
        console.error("PDF Hatası:", err);
        return null;
    } finally {
        if (browser) await browser.close();
    }
  }
}

module.exports = DocGenerator;