"use strict";

const express = require("express");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
const basicAuth = require("express-basic-auth");

function startPanel({ manager, port, host }) {
  const app = express();
  const server = http.createServer(app);
  const io = socketIo(server, { cors: { origin: "*" } });

  const adminUser = process.env.ADMIN_USER || "admin";
  const adminPass = process.env.ADMIN_PASS || "diyanet123";
  app.use(basicAuth({ users: { [adminUser]: adminPass }, challenge: true }));

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
  app.use(express.static(path.join(__dirname, "public")));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json({ limit: "2mb" }));

  app.use((req, res, next) => {
    res.locals.path = req.path;
    next();
  });

  // --- DASHBOARD (ANA SAYFA) ---
  app.get("/", async (req, res) => {
    try {
      const stats = await manager.db.getStats();
      const clients = await manager.db.getClients();
      const appointments = await manager.db.getAppointments();
      res.render("dashboard", {
        title: "Dashboard",
        page: "dashboard",
        stats: stats || { totalProfiles: 0, totalMessages: 0, activeBots: 0 },
        clients: clients || [],
        appointments: appointments || []
      });
    } catch (err) {
      console.error(err);
      res.render("dashboard", { title: "Dashboard", page: "dashboard", stats: {}, clients: [], appointments: [] });
    }
  });

  // --- BOTLAR ---
  app.get("/bots", async (req, res) => {
    try {
      const clients = await manager.db.getClients();
      // QR kodları ekle
      const clientsWithQr = clients.map(c => ({
          ...c,
          qrCode: manager.getQRCode(c.id),
          isFrozen: !!c.frozen
      }));
      res.render("bots", { title: "Botlar", page: "bots", clients: clientsWithQr });
    } catch (err) {
      res.render("bots", { title: "Botlar", page: "bots", clients: [] });
    }
  });

  // --- WHATSAPP ---
  app.get("/whatsapp", async (req, res) => {
    try {
      const chats = await manager.db.getProfiles();
      res.render("whatsapp", { title: "WhatsApp", page: "whatsapp", chats: chats || [] });
    } catch (err) {
      res.render("whatsapp", { title: "WhatsApp", page: "whatsapp", chats: [] });
    }
  });
  
  // Eski Sohbetler rotası -> WhatsApp'a yönlendir
  app.get("/chats", (req, res) => res.redirect("/whatsapp"));

  // --- RANDEVULAR ---
  app.get("/appointments", async (req, res) => {
    try {
        const appointments = await manager.db.getAppointments();
        res.render("appointments", { title: "Randevular", page: "appointments", appointments: appointments || [] });
    } catch(err) {
        res.render("appointments", { title: "Randevular", page: "appointments", appointments: [] });
    }
  });

  // --- İNSANLAŞTIRMA ---
  app.get("/humanization", async (req, res) => {
    const configStr = await manager.db.getSetting("humanization_config");
    let config = { enabled: true, min_response_delay: 60, max_response_delay: 600, wpm_reading: 200, cpm_typing: 300 };
    try { if(configStr) Object.assign(config, JSON.parse(configStr)); } catch(e){}
    res.render("humanization", { title: "İnsanlaştırma", page: "humanization", config, saved: req.query.saved === 'true' });
  });

  app.post("/humanization", async (req, res) => {
    const newConfig = {
      enabled: req.body.enabled === "on",
      min_response_delay: parseInt(req.body.min_response_delay) || 60,
      max_response_delay: parseInt(req.body.max_response_delay) || 600,
      wpm_reading: parseInt(req.body.wpm_reading) || 200,
      cpm_typing: parseInt(req.body.cpm_typing) || 300
    };
    await manager.db.setSetting("humanization_config", JSON.stringify(newConfig));
    res.redirect("/humanization?saved=true");
  });

  // --- DİĞER MANAGER SAYFALARI ---
  app.get("/scenarios", async (req, res) => {
    const stages = await manager.db.getStages();
    const docs = await manager.db.getDocTemplates();
    res.render("scenarios", { title: "Dümen Yönetimi", page: "scenarios", stages, docs });
  });

  app.get("/shortcuts", async (req, res) => {
    const shortcuts = await manager.db.getShortcuts();
    res.render("shortcuts", { title: "Kısayollar", page: "shortcuts", shortcuts });
  });

  app.get("/profiles-manager", async (req, res) => {
    const profiles = await manager.db.getBotProfiles();
    res.render("bot_profiles", { title: "Karakter Yönetimi", page: "profiles_manager", profiles });
  });

  app.get("/documents", async (req, res) => {
    const docs = await manager.db.getDocTemplates();
    res.render("documents", { title: "Evrak Tasarımı", page: "documents", docs });
  });

  app.get("/settings", async (req, res) => {
    const rows = await manager.db.getSettings();
    const settings = {};
    if(Array.isArray(rows)) rows.forEach(r => settings[r.key] = r.value);
    res.render("settings", { title: "Ayarlar", page: "settings", settings });
  });

  // --- API ---
  app.post("/api/clients", async (req, res) => {
    try {
        await manager.db.createClient(req.body.id, req.body.name);
        await manager.addClient(req.body.id, req.body.name);
        res.json({ success: true });
    } catch(e) { res.json({ success: false, error: e.message }); }
  });
  app.delete("/api/clients/:id", async (req, res) => {
    await manager.removeClient(req.params.id);
    res.json({ success: true });
  });
  app.post("/api/clients/:id/freeze", async (req, res) => {
      await manager.db.freezeClient(req.params.id, req.body.message, req.body.redirectPhone);
      res.json({ success: true });
  });
  app.post("/api/clients/:id/unfreeze", async (req, res) => {
      await manager.db.unfreezeClient(req.params.id);
      res.json({ success: true });
  });

  // WhatsApp Interactions
  app.get("/api/chat/:chatId/messages", async (req, res) => {
    const msgs = await manager.db.getChatMessages(req.params.chatId);
    res.json({ success: true, messages: msgs });
  });
  app.get("/api/chat/:chatId/profile", async (req, res) => {
    const p = await manager.db.getProfile(req.params.chatId);
    res.json({ success: true, profile: p });
  });
  app.post("/api/chat/:chatId/takeover", async (req, res) => {
    await manager.db.updateProfileStatus(req.params.chatId, 'admin');
    res.json({ success: true });
  });
  app.post("/api/chat/:chatId/release", async (req, res) => {
    await manager.db.updateProfileStatus(req.params.chatId, 'active');
    res.json({ success: true });
  });
  app.post("/api/send", async (req, res) => {
    try {
        const clientId = req.body.clientId || manager.clients.keys().next().value;
        await manager.sendMessage(clientId, req.body.chatId, req.body.message);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
  });

  // Scenarios & Shortcuts API
  app.post("/api/scenarios", async (req, res) => {
    if(req.body.id) await manager.db.updateStage(req.body.id, req.body);
    else await manager.db.createStage(req.body);
    res.json({ success: true });
  });
  app.post("/api/shortcuts", async (req, res) => {
    if(req.body.id) await manager.db.updateShortcut(req.body.id, req.body);
    else await manager.db.createShortcut(req.body);
    res.json({ success: true });
  });
  app.delete("/api/shortcuts/:id", async (req, res) => {
    await manager.db.deleteShortcut(req.params.id);
    res.json({ success: true });
  });
  
  // Profiles Manager API
  app.post("/api/bot-profiles", async (req, res) => {
    if(req.body.id) await manager.db.updateBotProfile(req.body.id, req.body);
    else await manager.db.createBotProfile(req.body);
    res.json({ success: true });
  });
  app.delete("/api/bot-profiles/:id", async (req, res) => {
    await manager.db.deleteBotProfile(req.params.id);
    res.json({ success: true });
  });
  app.post("/character/activate", async (req, res) => {
      await manager.db.setActiveBotProfile(req.body.id);
      res.redirect("/character?saved=true");
  });

  io.on("connection", (socket) => {});
  manager.panel = { io };
  server.listen(port, host, () => { console.log(`📊 Admin Paneli: http://${host}:${port}`); });
  return { io };
}

module.exports = { startPanel };