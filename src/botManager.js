"use strict";

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const qrcodeTerminal = require("qrcode-terminal");
const path = require("path");
const os = require("os");
const fs = require("fs");

const db = require("./db");
const Router = require("./router");

/**
 * Manager-Bot Ana Yöneticisi
 */
class BotManager {
  constructor(config) {
    this.config = config;
    this.clients = new Map(); // clientId -> Client
    this.db = db;
    this.router = null;
    this.qrCodes = new Map(); // clientId -> dataUrl
    this.io = null;

    // chatId bazlı sıraya alma (aynı kişiye aynı anda iki cevap yazma)
    this.chatLocks = new Map(); // chatId -> Promise

    // runtime cache
    this._settingsCache = new Map();
    this._settingsCacheAt = 0;
  }

  setIO(io) {
    this.io = io;
  }

  async init() {
    // 1. Veritabanına Bağlan
    await this.db.connect();
    // NOT: this.db.ensureSchema() çağrısı kaldırıldı çünkü connect() içinde yapılıyor.

    // 2. Router'ı başlat
    this.router = new Router(this);

    // 3. Kayıtlı botları yükle (Eğer clients tablosu varsa)
    const botClients = await this.db.getClients();
    console.log(`📱 ${botClients.length} bot yükleniyor...`);

    // Eğer hiç bot yoksa varsayılan botu oluştur
    if (botClients.length === 0) {
        console.log("⚠️ Kayıtlı bot bulunamadı, varsayılan 'default' bot oluşturuluyor...");
        await this.db.createClient("default", "Ana Bot");
        await this.addClient("default", "Ana Bot");
    } else {
        for (const bot of botClients) {
            await this.addClient(bot.id, bot.name);
        }
    }
  }

  async addClient(id, name) {
    if (this.clients.has(id)) {
      console.log(`⚠️ Bot ${id} zaten mevcut`);
      return;
    }

    console.log(`🔄 Bot ${id} başlatılıyor...`);

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: id,
        dataPath: path.join(this.config.dataDir, "sessions"),
      }),
      puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
        ],
      },
    });

    // QR Code
    client.on("qr", async (qr) => {
      try {
        console.log(`📱 Bot ${id} için QR kod oluşturuldu`);
        qrcodeTerminal.generate(qr, { small: true });

        const qrImage = await qrcode.toDataURL(qr);
        this.qrCodes.set(id, qrImage);
        
        // Clients tablosu varsa güncelle
        try { await this.db.updateClient(id, this._sanitizeValues({ status: "qr_pending", qr: qrImage })); } catch(e){}

        if (this.io) this.io.emit("qr", { clientId: id, qr: qrImage });
      } catch (err) {
        console.error(`❌ Bot ${id} QR işleme hatası:`, err?.message || err);
      }
    });

    // Ready
    client.on("ready", async () => {
      try {
        const phone = client.info?.wid?.user || "Bilinmiyor";
        console.log(`✅ Bot ${name || id} (${phone}) hazır`);
        
        try { await this.db.updateClient(id, this._sanitizeValues({ status: "ready", phone, qr: null })); } catch(e){}
        
        this.qrCodes.delete(id);
        if (this.io) this.io.emit("clientReady", { clientId: id, phone });
      } catch (err) {
        console.error(`❌ Bot ${id} ready handler hatası:`, err?.message || err);
      }
    });

    // Incoming message
    client.on("message", async (msg) => {
      // Kendi mesajlarımızı atla
      if (msg.fromMe) return;

      // ÇİFT MESAJ KONTROLÜ
      // Veritabanında loglanmış mı? (wwebId kontrolü)
      // Ancak db.js'deki saveMessage zaten bu kontrolü yapıyor, burada erken çıkış yapabiliriz.
      // Şimdilik db.js'e bırakalım.

      // Grup mesajlarını atla
      if (String(msg.from || "").includes("@g.us")) return;

      const chatId = msg.from;
      const work = async () => {
        try {
          // Bot dondurma / yönlendirme (clients tablosunda frozen alanı varsa)
          // Manager-bot'da bu özellik opsiyonel, hata vermemesi için try-catch
          let botRow = null;
          try { botRow = (await this.db.getClients()).find(c => c.id === id); } catch(e){}
          
          if (botRow?.frozen) {
            const frozenMessage = botRow?.frozen_message || "Şu anda müsait değilim.";
            const redirectPhone = botRow?.redirect_phone;
            const out = redirectPhone ? `${frozenMessage}\n\nGüncel numara: ${redirectPhone}` : frozenMessage;
            await this._humanSend(client, chatId, out);
            return;
          }

          // Mesaj içeriği
          const inbound = await this._extractInboundText(msg);
          const body = (inbound || "").trim();

          if (!body) return;
          console.log(`[${id}] Gelen: ${body.substring(0, 70)}...`);

          // Profil/Müşteri al
          let profile = await this.db.getProfile(chatId);
          // Profil yoksa Router içinde oluşturulacak

          // Ad bilgisini contact'tan almaya çalış
          let contactName = "Misafir";
          try {
            const contact = await msg.getContact();
            contactName = contact?.pushname || contact?.name || "Misafir";
            
            // Profil fotosu al (Varsa güncelle)
            const picUrl = await contact.getProfilePicUrl();
            if(picUrl && profile) {
                await this.db.updateProfile(chatId, { profile_photo_url: picUrl });
            }
          } catch (_) {}

          // Mesajı kaydet (Gelen)
          await this.db.saveMessage({
              chatId,
              direction: "incoming",
              content: body,
              wwebId: msg.id.id,
              // Diğer alanlar db.js'de otomatik halledilir veya null geçer
          });

          // Panel'e bildir
          if (this.io) {
            this.io.emit("newMessage", {
              clientId: id,
              chatId,
              from: contactName,
              body,
              direction: "incoming",
              timestamp: Date.now(),
            });
          }
          
          // ENGELLEME KONTROLÜ
          if (profile && profile.is_blocked) {
              console.log(`🚫 Engelli kullanıcı (${chatId}), cevap verilmiyor.`);
              return;
          }

          // Router (Cevap Üretimi)
          const response = await this.router.handleMessage(msg, client, id, {
            name: contactName,
            profile,
            inboundText: body,
          });

          if (!response) return;

          // Cevap Objesini İşle (Metin veya Medya)
          let replyText = "";
          let media = null;

          if (typeof response === "string") replyText = response;
          else if (typeof response === "object") {
              replyText = response.reply || "";
              media = response.media || null;
          }

          if (!replyText && !media) return;

          // İnsansı Bekleme (Sadece metin varsa)
          if (!media) {
              const delayService = this.router.messageDelay;
              if (delayService && delayService.calculateDelays) {
                const delays = await delayService.calculateDelays(body, replyText);
                if (delays.readDelay > 0) await new Promise(r => setTimeout(r, delays.readDelay));
                // Yazıyor efekti _humanSend içinde
              }
          }

          // Gönder
          if (media) {
              // Medya + Caption gönder
              await client.sendMessage(chatId, media, { caption: replyText });
          } else {
              // Sadece metin (insansı)
              await this._humanSend(client, chatId, replyText);
          }

          // Mesajı Kaydet (Giden)
          await this.db.saveMessage({
              chatId,
              direction: "outgoing",
              content: replyText || "[MEDYA DOSYASI]",
              wwebId: null
          });
          
          console.log(`[${id}] Yanıt gönderildi.`);

        } catch (err) {
          console.error(`[${id}] Mesaj işleme hatası:`, err?.message || err);
        }
      };

      // Chat bazlı lock
      const prev = this.chatLocks.get(chatId) || Promise.resolve();
      const next = prev
        .catch(() => {})
        .then(work)
        .finally(() => {
          if (this.chatLocks.get(chatId) === next) this.chatLocks.delete(chatId);
        });
      this.chatLocks.set(chatId, next);
    });

    // Disconnected
    client.on("disconnected", async (reason) => {
      console.log(`⚠️ Bot ${id} bağlantısı kesildi:`, reason);
      try { await this.db.updateClient(id, { status: "disconnected" }); } catch (_) {}
      if (this.io) this.io.emit("clientDisconnected", { clientId: id, reason });
      this.clients.delete(id);
      setTimeout(() => {
        console.log(`🔄 Bot ${id} yeniden bağlanıyor...`);
        this.addClient(id, name);
      }, 10000);
    });

    client.on("auth_failure", async (msg) => {
      console.error(`❌ Bot ${id} kimlik doğrulama hatası:`, msg);
    });

    this.clients.set(id, client);
    try {
      await client.initialize();
    } catch (err) {
      console.error(`❌ Bot ${id} başlatma hatası:`, err?.message || err);
    }
  }

  async removeClient(id) {
    const client = this.clients.get(id);
    if (client) {
      try { await client.destroy(); } catch (_) {}
      this.clients.delete(id);
    }
    await this.db.deleteClient(id);
    this.qrCodes.delete(id);
    console.log(`🗑️ Bot ${id} silindi`);
  }

  // --- Helpers ---

  async sendMessage(clientId, chatId, message) {
    const client = this.clients.get(clientId);
    if (!client) throw new Error("Bot bulunamadı");
    await client.sendMessage(chatId, message);
    await this.db.saveMessage({
        chatId,
        direction: "outgoing",
        content: message,
        wwebId: null
    });
    return true;
  }

  getQRCode(id) { return this.qrCodes.get(id); }

  getClientStatus(id) {
    const client = this.clients.get(id);
    if (!client) return "not_found";
    return client.info ? "ready" : "initializing";
  }

  _sanitizeValues(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      out[k] = v === undefined ? null : v;
    }
    return out;
  }

  async _humanSend(client, chatId, text) {
    // Basit insansı gönderim
    try {
        const chat = await client.getChatById(chatId);
        await chat.sendStateTyping();
    } catch(e) {}
    
    // Yazma hızı simülasyonu (Karakter başına 50ms)
    const delay = Math.min((text || "").length * 50, 5000); 
    await new Promise(r => setTimeout(r, delay));
    
    await client.sendMessage(chatId, text);
  }

  async _extractInboundText(msg) {
    if (msg.type === "chat") return msg.body || "";
    // Medya işleme gerekirse buraya eklenir (transcribe vs.)
    return msg.body || "";
  }
}

module.exports = BotManager;