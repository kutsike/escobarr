"use strict";
const DocGenerator = require("./docGenerator");

class ManagerFlow {
  constructor(db, aiChat) {
    this.db = db;
    this.aiChat = aiChat;
    this.docGen = new DocGenerator(db);
  }

  async processMessage(chatId, clientId, message, context) {
    let profile = await this.db.getProfile(chatId);
    if (!profile) profile = await this.db.createProfile(chatId, context.name);

    // Müşterinin olduğu aşamayı bul
    const currentStageOrder = profile.current_stage_id || 1;
    const stage = await this.db.getStage(currentStageOrder);
    
    if (!stage) return { reply: "Tüm işlemleriniz tamamlanmıştır." };

    const lowerMsg = message.toLowerCase();

    // 1. DURUM: Müşteri henüz ikna edilmedi (Giriş)
    // Eğer bot en son bu aşamayla ilgili konuşmadıysa, konuyu açsın.
    if (profile.last_question_key !== `stage_${stage.stage_order}`) {
       await this.db.updateProfile(chatId, { last_question_key: `stage_${stage.stage_order}` });
       
       // Evrak varsa üret ve gönder
       if (stage.doc_template_id) {
          // Burada PDF üretip gönderme kodu olacak (BotManager tarafında media handle edilir)
          // Şimdilik metin dönelim, media entegrasyonu ayrıca yapılır.
          return { 
             reply: `${stage.script_initial}\n\n📄 Tarafınıza düzenlenen resmi evrak ektedir. Lütfen inceleyiniz.`,
             // action: 'send_media', mediaPath: ...
          };
       }
       return { reply: stage.script_initial };
    }

    // 2. DURUM: İtiraz / Soru (AI İkna Modu)
    if (lowerMsg.includes("neden") || lowerMsg.includes("yok") || lowerMsg.includes("olmaz")) {
       return { reply: stage.script_persuasion }; // Veya AI'ya ürettir
    }

    // 3. DURUM: Ödeme İsteği (IBAN)
    if (lowerMsg.includes("iban") || lowerMsg.includes("at") || lowerMsg.includes("gönder")) {
       const bank = await this.db.getAvailableBank(stage.amount);
       return {
         reply: `Ödemeniz gereken tutar: ${stage.amount} TL\n\n🏦 ${bank.bank_name}\n👤 ${bank.account_holder}\n🔢 ${bank.iban}\n\nLütfen açıklamaya sadece ADINIZI yazın.`
       };
    }

    // 4. DURUM: "Ödedim" onayı -> Sonraki Aşamaya Geç
    if (lowerMsg.includes("ödedim") || lowerMsg.includes("yattı") || lowerMsg.includes("dekont")) {
       // Aşamayı artır (1 -> 2)
       const nextOrder = currentStageOrder + 1;
       await this.db.updateProfile(chatId, { current_stage_id: nextOrder, last_question_key: null });
       
       const nextStage = await this.db.getStage(nextOrder);
       if (nextStage) {
          return { reply: `Ödemeniz onaylandı. ✅\n\nAncak sistemde ${nextStage.name} uyarısı aldık. Bunun için ${nextStage.amount} TL daha gerekmektedir.` };
       } else {
          return { reply: "Tebrikler! Tüm işlemler bitti, paranız 15 dk içinde hesabınızda." };
       }
    }

    return { reply: "İşleminizi bekliyorum." };
  }
}
module.exports = { ConversationFlow: ManagerFlow };