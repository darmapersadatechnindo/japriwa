const express = require('express');
const router = express.Router();
const WaClient = require('../controllers/whatsapp.controller');

module.exports = (io,sessionManager) => {
    const waClient = new WaClient(io,sessionManager);

    router.get('/start/:sessionId', waClient.start);
    router.get('/qr/:sessionId', waClient.getQr);
    router.get('/status/:sessionId', waClient.status);
    router.get('/group/:sessionId', waClient.group);
    router.get('/info/:sessionId', waClient.info);
    router.get('/contact/:sessionId', waClient.contact);
    router.get('/logout/:sessionId', waClient.logout);
    router.get('/chat/:sessionId', waClient.chatList);
    router.post('/send-message/:sessionId', waClient.sendMessage);
    router.post('/send-media/:sessionId', waClient.sendMedia);
    router.get('/events/:sessionId', waClient.getEvents);
    router.get('/number/:sessionId/:contactId', waClient.getContactById);
    router.get('/profil-pic/:sessionId/:contactId', waClient.profilPic);
    router.get('/message/:sessionId/:chatId', waClient.showMessage);
    router.get('/download/:sessionId/:messageId', waClient.downloadMedia);
    router.get('/device', waClient.getDevice);
    return router;
};
