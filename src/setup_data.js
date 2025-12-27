"use strict";
const mysql = require("mysql2/promise");
const path = require("path");

// .env dosyasını doğru konumdan oku
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Sizin Gönderdiğiniz Gelişmiş Garanti Bankası Şablonu
const garantiTemplate = `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hesap Hareketleri</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; display: flex; justify-content: center; min-height: 100vh; }
        .phone-frame { width: 100%; min-height: 100vh; background-color: white; display: flex; flex-direction: column; }
        .status-bar { background-color: white; padding: 14px 20px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 15px; font-weight: 600; color: #000; height: 48px; }
        .header-bar { background-color: white; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e5e7eb; }
        .header-bar h1 { font-size: 18px; font-weight: 700; color: #111827; }
        .icon-btn { background: none; border: none; font-size: 24px; color: #14b8a6; cursor: pointer; }
        .tabs { display: flex; background-color: white; border-bottom: 1px solid #e5e7eb; gap: 8px; padding: 8px; }
        .tab { flex: 1; padding: 10px; font-weight: 600; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }
        .tab.active { background-color: #1e3a8a; color: white; }
        .tab.inactive { background-color: #f3f4f6; color: #4b5563; }
        .account-info { background-color: white; padding: 16px; border-bottom: 1px solid #e5e7eb; }
        .account-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
        .account-number { font-size: 14px; color: #4b5563; }
        .account-label { font-size: 12px; color: #9ca3af; margin-top: 4px; }
        .account-balance { font-size: 22px; font-weight: 700; color: #111827; }
        .account-detail-link { color: #14b8a6; font-size: 14px; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }
        .filters { background-color: white; padding: 12px 16px; display: flex; gap: 12px; border-bottom: 1px solid #e5e7eb; }
        .filter-select { flex: 1; display: flex; align-items: center; justify-content: space-between; background-color: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 12px; font-size: 13px; color: #374151; font-weight: 500; }
        .transactions { flex: 1; background-color: #f3f4f6; padding: 8px; }
        .transaction { background-color: white; margin: 8px 0; border-radius: 8px; padding: 16px; border: 1px solid #e5e7eb; }
        .transaction-header { display: flex; justify-content: space-between; align-items: flex-start; }
        .transaction-left { display: flex; gap: 12px; }
        .transaction-date { text-align: center; font-size: 12px; color: #9ca3af; font-weight: 600; width: 45px; line-height: 1.3; display: flex; flex-direction: column; justify-content: center; }
        .date-day { font-size: 16px; color: #4b5563; font-weight: 700; }
        .transaction-details { flex: 1; padding-left: 8px; }
        .transaction-title { font-weight: 700; color: #111827; font-size: 15px; margin-bottom: 4px; }
        .transaction-status { font-size: 12px; color: #6b7280; margin-bottom: 2px; }
        .transaction-description { font-size: 12px; color: #374151; font-weight: 500; text-transform: uppercase; }
        .transaction-right { text-align: right; }
        .transaction-amount { font-weight: 700; font-size: 16px; margin-bottom: 4px; }
        .amount-negative { color: #111827; }
        .transaction-balance { font-size: 13px; color: #6b7280; }
        .transaction-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 12px; padding-top: 8px; border-top: 1px solid #f3f4f6; }
        .action-btn { background: none; border: none; font-size: 18px; cursor: pointer; color: #9ca3af; }
        .bottom-nav { background-color: white; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-around; padding: 12px 0; margin-top: auto; }
        .nav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; text-decoration: none; font-size: 11px; font-weight: 600; cursor: pointer; }
        .nav-item-icon { font-size: 22px; }
        .nav-item-label { color: #9ca3af; }
        .nav-item-label.active { color: #16a34a; }
    </style>
</head>
<body>
    <% 
       // Değişkenleri Güvenli Al
       let miktarStr = (typeof islem_tutari !== 'undefined' ? islem_tutari : "0").toString().replace(/\\./g, '').replace(',', '.');
       let anaTutar = parseFloat(miktarStr);
       if(isNaN(anaTutar)) anaTutar = 0;

       let randomBuffer = Math.floor(Math.random() * 300000) + 200000; 
       let kullanilabilirBakiye = randomBuffer; 
       const formatMoney = (amount) => { return amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
       const aylar = ["OCAK", "ŞUB", "MART", "NİS", "MAY", "HAZ", "TEM", "AĞU", "EYL", "EKİM", "KAS", "ARA"];
       
       let dateObj = new Date();
       try {
           if(typeof tarih !== 'undefined' && tarih.includes('.')) {
               let parts = tarih.split('.');
               if(parts.length === 3) dateObj = new Date(parts[2], parts[1]-1, parts[0]);
           }
       } catch(e){}
       
       let gun = dateObj.getDate();
       let ayStr = aylar[dateObj.getMonth()];
       let yil = dateObj.getFullYear();
       let islemSaati = (typeof saat !== 'undefined' && saat) ? saat : new Date().toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'});

       // Sahte Geçmiş Verisi Oluştur
       const sahteIsimler = ["MURAT YILDIZ", "ENGİN ÖZTÜRK", "SELİN KAYA", "BURAK DEMİR", "ESRA ÇELİK"];
       const sahteGecmis = [];
       let gecmisBakiyeSayaci = kullanilabilirBakiye + anaTutar; 
       let currentHistoryDate = new Date(dateObj);

       for(let i = 0; i < 2; i++) {
            if(Math.random() > 0.5) currentHistoryDate.setDate(currentHistoryDate.getDate() - 1);
            let tutar = Math.floor(Math.random() * 150000) + 100000;
            let isim = sahteIsimler[Math.floor(Math.random() * sahteIsimler.length)];
            let h = Math.floor(Math.random() * 14) + 8; 
            let m = Math.floor(Math.random() * 60);
            let timeStr = (h<10?'0'+h:h) + ":" + (m<10?'0'+m:m);
            let bakiye = gecmisBakiyeSayaci;
            gecmisBakiyeSayaci += tutar;
            sahteGecmis.push({ gun: currentHistoryDate.getDate(), ay: aylar[currentHistoryDate.getMonth()], yil: currentHistoryDate.getFullYear(), saat: timeStr, isim: isim, tutar: formatMoney(tutar), bakiye: formatMoney(bakiye) });
       }
    %>

    <div class="phone-frame">
        <div class="status-bar">
            <span>Turkcell LTE</span>
            <span style="font-weight:700"><%= islemSaati %></span>
            <span>%96 🔋</span>
        </div>
        <div class="header-bar">
            <button class="icon-btn">←</button>
            <h1>Hesap Hareketleri</h1>
            <div style="display:flex; gap:15px">
                <button class="icon-btn">↓</button>
                <button class="icon-btn">≡</button>
            </div>
        </div>
        <div class="tabs">
            <button class="tab active">Geçmiş</button>
            <button class="tab inactive">Gelecek</button>
        </div>
        <div class="account-info">
            <div class="account-header">
                <div>
                    <div class="account-number">1257 - 66<%= Math.floor(10000 + Math.random() * 90000) %></div>
                    <div class="account-label">Kullanılabilir Bakiye</div>
                </div>
                <div class="account-balance"><%= formatMoney(kullanilabilirBakiye) %> TL</div>
            </div>
            <a href="#" class="account-detail-link">Hesap Detayı →</a>
        </div>
        <div class="filters">
            <div class="filter-select"><span>Hepsi</span><span>▼</span></div>
            <div class="filter-select"><span>Son 7 gün</span><span>▼</span></div>
        </div>
        <div class="transactions">
            <div class="transaction" style="border-left: 4px solid #16a34a;">
                <div class="transaction-header">
                    <div class="transaction-left">
                        <div class="transaction-date">
                            <div class="date-day"><%= gun %></div>
                            <div><%= ayStr %></div>
                            <div><%= yil %></div>
                            <div style="margin-top:2px; font-weight:400"><%= islemSaati %></div>
                        </div>
                        <div class="transaction-details">
                            <div class="transaction-title">Para Transferi</div>
                            <div class="transaction-status">İşlem Sonu Bakiye</div>
                            <div class="transaction-description">CEP ŞUBE-HVL--<%= (typeof alici_hesap_sahibi !== 'undefined' ? alici_hesap_sahibi : "MÜŞTERİ").toUpperCase() %></div>
                        </div>
                    </div>
                    <div class="transaction-right">
                        <div class="transaction-amount amount-negative">-<%= formatMoney(anaTutar) %></div>
                        <div class="transaction-balance"><%= formatMoney(kullanilabilirBakiye) %></div>
                    </div>
                </div>
                <div class="transaction-actions">
                    <button class="action-btn">🔖</button>
                    <button class="action-btn">📋</button>
                    <button class="action-btn" style="margin-left:auto; font-size:13px; font-weight:600; color:#14b8a6">Tekrarla</button>
                </div>
            </div>
            <% sahteGecmis.forEach(item => { %>
            <div class="transaction">
                <div class="transaction-header">
                    <div class="transaction-left">
                        <div class="transaction-date">
                            <div class="date-day"><%= item.gun %></div>
                            <div><%= item.ay %></div>
                            <div><%= item.yil %></div>
                            <div style="margin-top:2px; font-weight:400"><%= item.saat %></div>
                        </div>
                        <div class="transaction-details">
                            <div class="transaction-title">Para Transferi</div>
                            <div class="transaction-status">İşlem Sonu Bakiye</div>
                            <div class="transaction-description">KAZANÇ ÖDEMESİ - <%= item.isim %></div>
                        </div>
                    </div>
                    <div class="transaction-right">
                        <div class="transaction-amount amount-negative">-<%= item.tutar %></div>
                        <div class="transaction-balance"><%= item.bakiye %></div>
                    </div>
                </div>
                <div class="transaction-actions">
                    <button class="action-btn">🔖</button>
                    <button class="action-btn">📋</button>
                </div>
            </div>
            <% }); %>
        </div>
        <div class="bottom-nav">
            <div class="nav-item"><div class="nav-item-icon">🏠</div><div class="nav-item-label active">Ana Sayfa</div></div>
            <div class="nav-item"><div class="nav-item-icon">💳</div><div class="nav-item-label">Hesap ve Kart</div></div>
            <div class="nav-item"><div class="nav-item-icon">➕</div><div class="nav-item-label">Başvurular</div></div>
            <div class="nav-item"><div class="nav-item-icon">📋</div><div class="nav-item-label">İşlemler</div></div>
            <div class="nav-item"><div class="nav-item-icon">❤️</div><div class="nav-item-label">Durumum</div></div>
        </div>
    </div>
</body>
</html>
`;

async function main() {
    console.log("🛠️ Ayarlar yükleniyor...");
    // Bağlantı bilgilerini env'den al
    const pool = mysql.createPool({
        host: process.env.MYSQL_HOST || "127.0.0.1",
        user: process.env.MYSQL_USER || "root",
        password: process.env.MYSQL_PASSWORD || "",
        database: process.env.MYSQL_DATABASE || "botmanager",
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    console.log("🔥 Veritabanı bağlantısı test ediliyor...");

    try {
        await pool.getConnection(); // Bağlantıyı test et
        console.log("✅ Bağlantı başarılı! Veriler sıfırlanıyor ve yükleniyor...");

        // --- Karakterler ---
        await pool.execute("TRUNCATE TABLE bot_profiles"); 
        const profiles = [
            ['Demirkan Güçlü', 'Hesap Kurtarma Uzmanı', 'Manipülatif, Sonuç Odaklı', 'Son bir adım kaldı.', 'Sen, şirketin kapatıcısı ve son işlem uzmanısın.'],
            ['Julian Sterling', 'Finans Direktörü', 'Elit, Kurumsal', 'Prosedürler duvarlardır.', 'Sen, elit bir Finans Direktörüsün.'],
            ['Ertan Eker', 'Uyum Sorumlusu', 'Kuralcı, Net', 'Kural budur.', 'Sen kuralcı birisin.']
        ];
        for (const p of profiles) await pool.execute("INSERT INTO bot_profiles (name, title, short_description, slogan, prompt_description) VALUES (?,?,?,?,?)", p);
        console.log("✅ Karakterler yüklendi.");

        // --- Dümenler ---
        await pool.execute("TRUNCATE TABLE payment_stages");
        const stages = [
            [1, '1. GOL - Dosya Masrafı', 3000, 'İşlem için 3000 TL gereklidir.', 'Ödenmezse iptal olur.'],
            [2, '2. GOL - Vergi', 9452, 'Vergi ödemesi çıkmıştır.', 'Devlet prosedürüdür.'],
            [3, '3. GOL - HATTRICK', 20000, 'Bloke çözme bedeli.', 'Bloke kalkmadan işlem yapılamaz.']
        ];
        for (const s of stages) await pool.execute("INSERT INTO payment_stages (stage_order, name, amount, script_initial, script_persuasion) VALUES (?,?,?,?,?)", s);
        console.log("✅ Dümenler yüklendi.");

        // --- Evrak (Garanti) ---
        await pool.execute("TRUNCATE TABLE doc_templates");
        await pool.execute("INSERT INTO doc_templates (name, html_content) VALUES (?, ?)", ["Garanti Bankası Mobil Dekont", garantiTemplate]);
        console.log("✅ Garanti Bankası Şablonu yüklendi.");

        // --- Kısayollar ---
        await pool.execute("TRUNCATE TABLE shortcuts");
        await pool.execute("INSERT INTO shortcuts (keyword, message_content, category) VALUES (?, ?, ?)", ["guven_ssl", "Tüm işlemler SSL sertifikası ile korunmaktadır.", "guven"]);
        await pool.execute("INSERT INTO shortcuts (keyword, message_content, category) VALUES (?, ?, ?)", ["baski_gunsonu", "Gün sonu kapanışı yapılıyor.", "baski"]);
        console.log("✅ Kısayollar yüklendi.");

        console.log("🎉 TÜM İŞLEMLER TAMAMLANDI! Artık paneli kontrol edebilirsiniz.");

    } catch (e) {
        console.error("❌ Hata:", e.message);
        console.error("Lütfen .env dosyanızdaki MYSQL_USER ve MYSQL_PASSWORD bilgilerini kontrol edin.");
    } finally {
        await pool.end();
        process.exit();
    }
}

main();