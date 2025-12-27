"use strict";
const mysql = require("mysql2/promise");

class Database {
  constructor() {
    this.pool = null;
  }
async connect() {
    // Veritabanı bilgileri .env dosyasından alınmalı
    if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_PASSWORD) {
      console.warn("⚠️ MySQL ortam değişkenleri eksik! .env dosyasını kontrol edin.");
    }

    this.pool = mysql.createPool({
      host: process.env.MYSQL_HOST || "127.0.0.1",
      user: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE || "botmanager",
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: "utf8mb4"
    });
    console.log("✅ Veritabanı Bağlantısı Başarılı");
    await this.ensureSchemaUpgrades();
  }

async ensureSchemaUpgrades() {
    const queries = [
      // Clients (Botlar)
      `CREATE TABLE IF NOT EXISTS clients (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100),
        status VARCHAR(50),
        frozen TINYINT(1) DEFAULT 0,
        frozen_message TEXT,
        redirect_phone VARCHAR(20),
        qr TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      // Profiles (Müşteriler & Karakterler)
      `CREATE TABLE IF NOT EXISTS profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chat_id VARCHAR(50),
        full_name VARCHAR(100),
        status VARCHAR(50) DEFAULT 'new',
        current_stage_id INT DEFAULT 1,
        username VARCHAR(100),
        transaction_type VARCHAR(100),
        last_message_at DATETIME,
        msg_count INT DEFAULT 0,
        is_blocked TINYINT(1) DEFAULT 0,
        ai_analysis TEXT,
        profile_photo_url TEXT,
        UNIQUE KEY(chat_id)
      )`,
      // Messages
      `CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chat_id VARCHAR(50),
        direction ENUM('incoming','outgoing'),
        content TEXT,
        message_wweb_id VARCHAR(255) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      // Service Stages (Hizmet Aşamaları - Danışmanlık süreç takibi)
      `CREATE TABLE IF NOT EXISTS payment_stages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        stage_order INT NOT NULL,
        name VARCHAR(100),
        amount DECIMAL(15,2) DEFAULT 0,
        script_initial TEXT COMMENT 'Karşılama mesajı',
        script_persuasion TEXT COMMENT 'Açıklama mesajı',
        doc_template_id INT NULL,
        UNIQUE KEY(stage_order)
      )`,
      // Doc Templates (Evraklar)
      `CREATE TABLE IF NOT EXISTS doc_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100),
        html_content TEXT
      )`,
      // Shortcuts (Kısayollar)
      `CREATE TABLE IF NOT EXISTS shortcuts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        keyword VARCHAR(50),
        message_content TEXT,
        category VARCHAR(50) DEFAULT 'genel',
        UNIQUE KEY(keyword)
      )`,
      // Bot Personas (Yönetici Karakterleri)
      `CREATE TABLE IF NOT EXISTS bot_profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100),
        title VARCHAR(255),
        short_description VARCHAR(255),
        slogan VARCHAR(255),
        prompt_description TEXT,
        UNIQUE KEY(name)
      )`,
      // Settings
      `CREATE TABLE IF NOT EXISTS settings (
        \`key\` VARCHAR(100) PRIMARY KEY,
        value TEXT
      )`,
      // Appointments (Randevular)
      `CREATE TABLE IF NOT EXISTS appointments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chat_id VARCHAR(50),
        client_id VARCHAR(50),
        note TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const sql of queries) {
      try { await this.pool.execute(sql); } catch (e) {}
    }
  }

// Başlangıç verileri
  async seedInitialData() {
    try {
        // Bot Karakterleri (Dini Rehberlik için uygun profiller)
        const [pCount] = await this.pool.execute("SELECT COUNT(*) as c FROM bot_profiles");
        if (pCount[0].c === 0) {
            console.log("🔄 Bot karakterleri yükleniyor...");
            const profiles = [
                ['Yardımcı Asistan', 'Dini Rehberlik Asistanı', 'Samimi, Yardımsever', 'Her zaman yanınızdayız.', 'Sen, samimi ve yardımsever bir dini rehberlik asistanısın. İnsanlara nazikçe yardımcı olursun.'],
                ['Bilgi Danışmanı', 'İslami Bilgi Danışmanı', 'Bilgili, Saygılı', 'Doğru bilgiyle hizmetinizde.', 'Sen, İslami konularda bilgi veren saygılı bir danışmansın.'],
                ['Randevu Koordinatörü', 'Hoca Randevu Asistanı', 'Düzenli, Profesyonel', 'Randevunuz bizim önceliğimiz.', 'Sen, hoca ile görüşme randevularını organize eden düzenli bir asistansın.']
            ];
            for (const p of profiles) await this.pool.execute("INSERT INTO bot_profiles (name, title, short_description, slogan, prompt_description) VALUES (?,?,?,?,?)", p);
        }
        // Hizmet Türleri (Meşru randevu/danışmanlık hizmetleri)
        const [sCount] = await this.pool.execute("SELECT COUNT(*) as c FROM payment_stages");
        if (sCount[0].c === 0) {
            console.log("🔄 Hizmet türleri yükleniyor...");
            const stages = [
                [1, 'İlk Görüşme', 0, 'Hoş geldiniz! Size nasıl yardımcı olabiliriz?', 'İlk tanışma ve ihtiyaç belirleme.'],
                [2, 'Danışmanlık Randevusu', 0, 'Hocamızla görüşme randevusu ayarlayabiliriz.', 'Detaylı görüşme için randevu.'],
                [3, 'Takip Görüşmesi', 0, 'Durumunuzu takip etmek için tekrar görüşebiliriz.', 'Süreç takibi ve destek.']
            ];
            for (const s of stages) await this.pool.execute("INSERT INTO payment_stages (stage_order, name, amount, script_initial, script_persuasion) VALUES (?,?,?,?,?)", s);
        }
        // Kısayollar (Yardımcı mesaj şablonları)
        const [shCount] = await this.pool.execute("SELECT COUNT(*) as c FROM shortcuts");
        if (shCount[0].c === 0) {
             console.log("🔄 Kısayollar yükleniyor...");
             await this.pool.execute("INSERT INTO shortcuts (keyword, message_content, category) VALUES ('hosgeldin', 'Hoş geldiniz! Size nasıl yardımcı olabilirim?', 'genel')");
             await this.pool.execute("INSERT INTO shortcuts (keyword, message_content, category) VALUES ('randevu', 'Hocamızla görüşme için randevu ayarlayabiliriz. Uygun olduğunuz gün ve saati belirtir misiniz?', 'randevu')");
             await this.pool.execute("INSERT INTO shortcuts (keyword, message_content, category) VALUES ('tesekkur', 'Rica ederim, her zaman yardımcı olmaktan memnuniyet duyarız. Allah razı olsun.', 'genel')");
             await this.pool.execute("INSERT INTO shortcuts (keyword, message_content, category) VALUES ('namaz_vakti', 'Namaz vakitleri için: https://namazvakti.diyanet.gov.tr adresini ziyaret edebilirsiniz.', 'bilgi')");
        }
    } catch (e) { console.error("Seed hatası:", e); }
  }

  // --- CLIENTS (BOTLAR) ---
  async getClients() {
    try { const [rows] = await this.pool.execute("SELECT * FROM clients"); return rows; } catch(e) { return []; }
  }
  async getClient(id) {
    try { const [rows] = await this.pool.execute("SELECT * FROM clients WHERE id = ?", [id]); return rows[0]; } catch(e) { return null; }
  }
  async createClient(id, name) {
    await this.pool.execute("INSERT IGNORE INTO clients (id, name, status) VALUES (?, ?, 'initializing')", [id, name]);
  }
  async updateClient(id, data) {
    const keys = Object.keys(data); if(keys.length === 0) return;
    const fields = keys.map(k => `${k} = ?`).join(", ");
    await this.pool.execute(`UPDATE clients SET ${fields} WHERE id = ?`, [...Object.values(data), id]);
  }
  async removeClient(id) { await this.pool.execute("DELETE FROM clients WHERE id = ?", [id]); }
  async freezeClient(id, msg, phone) { await this.updateClient(id, { frozen: 1, frozen_message: msg, redirect_phone: phone }); }
  async unfreezeClient(id) { await this.updateClient(id, { frozen: 0 }); }

  // --- PROFILES (MÜŞTERİLER) ---
  async getProfiles() {
    // Sadece chat_id'si olan (müşteri) profilleri getir
    try {
        const [rows] = await this.pool.execute("SELECT * FROM profiles WHERE chat_id IS NOT NULL ORDER BY last_message_at DESC");
        return rows;
    } catch(e) { return []; }
  }
  async getProfile(chatId) {
    try { const [rows] = await this.pool.execute("SELECT * FROM profiles WHERE chat_id = ?", [chatId]); return rows[0]; } catch(e) { return null; }
  }
  async createProfile(chatId, name) {
    await this.pool.execute("INSERT IGNORE INTO profiles (chat_id, full_name, status, current_stage_id) VALUES (?, ?, 'new', 1)", [chatId, name]);
    return this.getProfile(chatId);
  }
  async updateProfile(chatId, data) {
    const keys = Object.keys(data); if(keys.length === 0) return;
    const fields = keys.map(k => `${k} = ?`).join(", ");
    await this.pool.execute(`UPDATE profiles SET ${fields} WHERE chat_id = ?`, [...Object.values(data), chatId]);
  }
  async updateProfileStatus(chatId, status) { await this.updateProfile(chatId, { status }); }
  async toggleBlockProfile(chatId, block) { await this.updateProfile(chatId, { is_blocked: block ? 1 : 0 }); }
  async saveAiAnalysis(chatId, analysis) { await this.updateProfile(chatId, { ai_analysis: analysis }); }

  // --- MESSAGES ---
  async saveMessage(data) {
    const { chatId, direction, content, wwebId } = data;
    if (wwebId) {
        const [exist] = await this.pool.execute("SELECT id FROM messages WHERE message_wweb_id = ?", [wwebId]);
        if (exist.length > 0) return;
    }
    await this.pool.execute("INSERT INTO messages (chat_id, direction, content, message_wweb_id) VALUES (?, ?, ?, ?)", [chatId, direction, content, wwebId || null]);
    if(direction === 'incoming') await this.pool.execute("UPDATE profiles SET msg_count = COALESCE(msg_count,0) + 1, last_message_at = NOW() WHERE chat_id = ?", [chatId]);
  }
  async getChatMessages(chatId, limit = 50) {
    try { const [rows] = await this.pool.execute("SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?", [chatId, limit]); return rows; } catch(e) { return []; }
  }

  // --- APPOINTMENTS (RANDEVULAR) ---
  async getAppointments() {
    try { 
        // Basitçe tüm randevuları çekelim, gerekirse JOIN eklenebilir
        const [rows] = await this.pool.execute("SELECT * FROM appointments ORDER BY created_at DESC"); 
        return rows; 
    } catch(e) { return []; }
  }
  async createAppointment(chatId, clientId, note) {
      await this.pool.execute("INSERT INTO appointments (chat_id, client_id, note) VALUES (?,?,?)", [chatId, clientId, note]);
  }

  // --- SETTINGS (İNSANLAŞTIRMA & CONFIG) ---
  async getSettings() {
    try { const [rows] = await this.pool.execute("SELECT * FROM settings"); return rows; } catch(e) { return []; }
  }
  async getSetting(key) {
    try { const [rows] = await this.pool.execute("SELECT value FROM settings WHERE `key` = ?", [key]); return rows[0]?.value; } catch(e) { return null; }
  }
  async setSetting(key, value) {
    await this.pool.execute("INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?", [key, value, value]);
  }

  // --- STATS (DASHBOARD) ---
  async getStats() {
    let totalProfiles = 0;
    let totalMessages = 0;
    try { 
        totalProfiles = (await this.pool.execute("SELECT COUNT(*) as c FROM profiles WHERE chat_id IS NOT NULL"))[0][0].c; 
        totalMessages = (await this.pool.execute("SELECT COUNT(*) as c FROM messages"))[0][0].c;
    } catch(e){}
    return { 
        totalProfiles, 
        totalMessages, 
        activeBots: 1 
    };
  }

  // --- MANAGER ÖZELLİKLERİ (STAGES, SHORTCUTS, BOT PROFILES) ---
  async getStages() { try { const [rows] = await this.pool.execute("SELECT * FROM payment_stages ORDER BY stage_order ASC"); return rows; } catch(e){ return []; } }
  async getStage(order) { try { const [rows] = await this.pool.execute("SELECT * FROM payment_stages WHERE stage_order=?", [order]); return rows[0]; } catch(e){ return null; } }
  async createStage(data) { const [m]=await this.pool.execute("SELECT MAX(stage_order) as m FROM payment_stages"); await this.pool.execute("INSERT INTO payment_stages (stage_order,name,amount,script_initial,script_persuasion,doc_template_id) VALUES (?,?,?,?,?,?)", [(m[0].m||0)+1, data.name, data.amount, data.script_initial, data.script_persuasion, data.doc_template_id||null]); }
  async updateStage(id, data) { let u=[],p=[]; for(const[k,v]of Object.entries(data)){if(k!=='id'){u.push(`${k}=?`);p.push(v);}} p.push(id); await this.pool.execute(`UPDATE payment_stages SET ${u.join(',')} WHERE id=?`, p); }

  async getShortcuts() { try { const [rows] = await this.pool.execute("SELECT * FROM shortcuts ORDER BY category, keyword"); return rows; } catch(e){ return []; } }
  async createShortcut(data) { await this.pool.execute("INSERT INTO shortcuts (keyword,message_content,category) VALUES (?,?,?)", [data.keyword,data.message_content,data.category||'genel']); }
  async updateShortcut(id, data) { await this.pool.execute("UPDATE shortcuts SET keyword=?,message_content=?,category=? WHERE id=?", [data.keyword,data.message_content,data.category,id]); }
  async deleteShortcut(id) { await this.pool.execute("DELETE FROM shortcuts WHERE id=?",[id]); }

  async getBotProfiles() { try { const [rows] = await this.pool.execute("SELECT * FROM bot_profiles ORDER BY id ASC"); return rows; } catch(e){ return []; } }
  async getActiveBotProfile() { const id = await this.getSetting("active_profile_id"); if(id){ const[r]=await this.pool.execute("SELECT * FROM bot_profiles WHERE id=?",[id]); if(r.length)return r[0]; } const[r]=await this.pool.execute("SELECT * FROM bot_profiles LIMIT 1"); return r[0]; }
  async setActiveBotProfile(id) { await this.setSetting("active_profile_id", id); }
  async createBotProfile(data) { await this.pool.execute("INSERT INTO bot_profiles (name,title,short_description,slogan,prompt_description) VALUES (?,?,?,?,?)", Object.values(data)); }
  async updateBotProfile(id, data) { await this.pool.execute("UPDATE bot_profiles SET name=?,title=?,short_description=?,slogan=?,prompt_description=? WHERE id=?", [...Object.values(data), id]); }
  async deleteBotProfile(id) { await this.pool.execute("DELETE FROM bot_profiles WHERE id=?",[id]); }

  async getDocTemplates() { try { const [rows] = await this.pool.execute("SELECT * FROM doc_templates"); return rows; } catch(e){ return []; } }
  async getDocTemplate(id) { try { const [rows] = await this.pool.execute("SELECT * FROM doc_templates WHERE id=?",[id]); return rows[0]; } catch(e){ return null; } }
  async saveDocTemplate(data) { if(data.id) { await this.pool.execute("UPDATE doc_templates SET name=?, html_content=? WHERE id=?",[data.name,data.html_content,data.id]); return data.id; } else { const[r]=await this.pool.execute("INSERT INTO doc_templates (name,html_content) VALUES (?,?)",[data.name,data.html_content]); return r.insertId; } }

  // Sohbet geçmişi (AI için)
  async getChatHistory(chatId, limit = 10) {
    try {
      const [rows] = await this.pool.execute(
        "SELECT direction, content FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?",
        [chatId, limit]
      );
      return rows.reverse();
    } catch (e) {
      return [];
    }
  }

  // Rastgele dua getir
  async getRandomDua(category = null) {
    try {
      const duas = await this.getDuas(category);
      if (duas.length === 0) return null;
      return duas[Math.floor(Math.random() * duas.length)];
    } catch (e) {
      return null;
    }
  }

  // Dualar tablosu (opsiyonel)
  async getDuas(category = null) {
    try {
      if (category) {
        const [rows] = await this.pool.execute("SELECT * FROM duas WHERE category = ?", [category]);
        return rows;
      }
      const [rows] = await this.pool.execute("SELECT * FROM duas");
      return rows;
    } catch (e) {
      return [];
    }
  }

  // Aktivite logu
  async logActivity(data) {
    try {
      // Aktivite loglama opsiyonel - tablo yoksa sessizce geç
      await this.pool.execute(
        "INSERT INTO activity_logs (chat_id, profile_id, client_id, action, details, performed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
        [data.chatId, data.profileId, data.clientId, data.action, JSON.stringify(data.details || {}), data.performedBy || 'bot']
      );
    } catch (e) {
      // Tablo yoksa hata verme
    }
  }

  // Bad words listesi (content filter için)
  async getBadWords() {
    try {
      const [rows] = await this.pool.execute("SELECT word, severity FROM bad_words");
      return rows;
    } catch (e) {
      return []; // Varsayılan listeyi kullan
    }
  }
}

module.exports = new Database();