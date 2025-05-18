const { MessageMedia } = require('whatsapp-web.js');
const axios = require('axios');
const mime = require('mime-types');

module.exports = (io, socket, sessionManager) => {
    const DEFAULT_PROFILE_PIC = "https://i.pinimg.com/736x/16/18/20/1618201e616f4a40928c403f222d7562.jpg";

    socket.on('start', async ({ sessionId }) => {
        if (!sessionId) return socket.emit('waClient', { action: 'start', success: false, message: "sessionId is required" });
        const status = sessionManager.createSession(sessionId);
        socket.emit('waClient', { action: 'start',sessionId, success: true, message: `Session ${sessionId} created`, data: status });
    });

    socket.on('status', async ({ sessionId }) => {
        const data = await sessionManager.validateSession(sessionId);
        socket.emit('waClient', { action: 'status',sessionId, success: true, data });
    });

    socket.on('group', async ({ sessionId }) => {
        const client = sessionManager.getSession(sessionId);
        if (!client) return socket.emit('waClient', { action: 'group',sessionId, success: false, message: `Session ${sessionId} not found` });
        try {
            const chats = await client.getChats();
            const groups = chats.filter(c => c.isGroup);
            socket.emit('waClient', { action: 'group',sessionId, success: true, data: groups });
        } catch (error) {
            socket.emit('waClient', { action: 'group',sessionId, success: false, message: 'Failed to fetch group chats' });
        }
    });

    socket.on('getContactById', async ({ sessionId, contactId }) => {
        const client = sessionManager.getSession(sessionId);
        if (!client) return socket.emit('waClient', { action: 'getContactById', success: false, message: `Session ${sessionId} not found` });
        try {
            const contact = await client.getContactById(contactId);
            socket.emit('waClient', { action: 'getContactById',sessionId, success: true, data: contact });
        } catch (error) {
            socket.emit('waClient', { action: 'getContactById',sessionId, success: false, message: 'Failed to fetch contact' });
        }
    });

    socket.on('info', async ({ sessionId }) => {
        const client = sessionManager.getSession(sessionId);
        if (!client) return socket.emit('waClient', { action: 'info', success: false, message: `Session ${sessionId} not found` });
        try {
            const info = client.info;
            const profilPic = await client.getProfilePicUrl(info.me._serialized);
            socket.emit('waClient', { action: 'info',sessionId, success: true, data: { ...info, profilPic } });
        } catch (error) {
            socket.emit('waClient', { action: 'info',sessionId, success: false, message: 'Failed to fetch info' });
        }
    });

    socket.on('contact', async ({ sessionId }) => {
        const client = sessionManager.getSession(sessionId);
        if (!client) return socket.emit('waClient', { action: 'contact', success: false, message: `Session ${sessionId} not found` });
        try {
            const contacts = await client.getContacts();
            const rows = contacts
                .filter(c => c.isMyContact && c.id.server === 'c.us')
                .map(c => ({
                    sessionId,
                    phone: c.id.user,
                    name: c.name,
                    pushname: c.pushname
                }));
            socket.emit('waClient', { action: 'contact',sessionId, success: true, data: rows });
        } catch (error) {
            socket.emit('waClient', { action: 'contact',sessionId, success: false, message: 'Failed to fetch contacts' });
        }
    });

    socket.on('chatList', async ({ sessionId }) => {
        const client = sessionManager.getSession(sessionId);
        if (!client) return socket.emit('waClient', { action: 'chatList', success: false, message: `Session ${sessionId} not found` });
        try {
            const chats = await client.getChats();
            socket.emit('waClient', { action: 'chatList',sessionId, success: true, data: chats });
        } catch (error) {
            socket.emit('waClient', { action: 'chatList',sessionId, success: false, message: error.message });
        }
    });

    socket.on('profilPic', async ({ sessionId, contactId }) => {
        const client = sessionManager.getSession(sessionId);
        if (!client) return socket.emit('waClient', { action: 'profilPic', success: false, message: `Session ${sessionId} not found` });
        try {
            const contact = await client.getContactById(contactId);
            let profilePicUrl = DEFAULT_PROFILE_PIC;
            if (contact) {
                profilePicUrl = await contact.getProfilePicUrl().catch(() => DEFAULT_PROFILE_PIC);
            }
            socket.emit('waClient', { action: 'profilPic',sessionId, success: true, data: { profilePicUrl } });
        } catch (error) {
            socket.emit('waClient', { action: 'profilPic',sessionId, success: false, message: 'Failed to fetch profile pic' });
        }
    });

    socket.on('logout', async ({ sessionId }) => {
        const client = sessionManager.getSession(sessionId);
        if (!client) return socket.emit('waClient', { action: 'logout', success: false, message: `Session ${sessionId} not found` });
        try {
            await client.logout();
            await client.authStrategy.logout();
            sessionManager.deleteMapSession(sessionId);
            socket.emit('waClient', { action: 'logout',sessionId, success: true, message: "Logout berhasil" });
        } catch (error) {
            socket.emit('waClient', { action: 'logout',sessionId, success: false, message: 'Gagal logout' });
        }
    });

    socket.on('sendMessage', async ({ sessionId, to, message }) => {
        const client = sessionManager.getSession(sessionId);
        if (!client) return socket.emit('waClient', { action: 'sendMessage', success: false, message: `Session ${sessionId} not found` });
        if (!to || !message) return socket.emit('waClient', { action: 'sendMessage', success: false, message: "'to' dan 'message' wajib diisi" });
        try {
            await client.sendMessage(`${to}@c.us`, message);
            socket.emit('waClient', { action: 'sendMessage',sessionId, success: true, message: "Pesan berhasil dikirim" });
        } catch (error) {
            socket.emit('waClient', { action: 'sendMessage',sessionId, success: false, message: "Gagal mengirim pesan", error: error.message });
        }
    });

    socket.on('sendMedia', async ({ sessionId, to, fileUrl, caption }) => {
        const client = sessionManager.getSession(sessionId);
        if (!client) return socket.emit('waClient', { action: 'sendMedia', success: false, message: `Session ${sessionId} not found` });
        if (!to || !fileUrl) return socket.emit('waClient', { action: 'sendMedia', success: false, message: "'to' dan 'fileUrl' wajib diisi" });
        try {
            const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
            const contentType = mime.lookup(fileUrl) || 'application/octet-stream';
            const base64 = Buffer.from(response.data).toString('base64');
            const media = new MessageMedia(contentType, base64, fileUrl.split('/').pop());
            await client.sendMessage(`${to}@c.us`, media, { caption });
            socket.emit('waClient', { action: 'sendMedia',sessionId, success: true, message: "Media berhasil dikirim" });
        } catch (error) {
            socket.emit('waClient', { action: 'sendMedia',sessionId, success: false, message: "Gagal mengirim media", error: error.message });
        }
    });

    socket.on('getEvents', ({ sessionId }) => {
        const events = sessionManager.getSessionEvents(sessionId);
        socket.emit('waClient', { action: 'getEvents',sessionId, success: true, data: events });
    });

    socket.on('whatsapp:getQr', ({ sessionId }) => {
        const events = sessionManager.getSessionEvents(sessionId);
        const qrEvent = events.reverse().find(e => e.event === 'qr');
        if (!qrEvent) {
            return socket.emit('waClient', { action: 'whatsapp:getQr',sessionId, success: false, message: 'QR belum tersedia atau sudah expired' });
        }
        socket.emit('waClient', { action: 'whatsapp:getQr',sessionId, success: true, data: { qrCodeUrl: qrEvent.qrCodeUrl } });
    });

    socket.on('showMessage', async ({ sessionId, chatId }) => {
        const client = sessionManager.getSession(sessionId);
        if (!client) return socket.emit('waClient', { action: 'showMessage', success: false, message: `Session ${sessionId} not found` });
        try {
            const chat = await client.getChatById(chatId);
            const messages = await chat.fetchMessages({ limit: 50 });
            await chat.sendSeen();
            const messageData = await Promise.all(messages.map(async msg => ({
                id: msg.id._serialized,
                from: msg.from,
                to: msg.to,
                type: msg.type,
                body: msg.body || null,
                timestamp: msg.timestamp,
                fromMe: msg.fromMe,
                hasMedia: msg.hasMedia,
                caption: msg._data.caption || null,
                ack: msg.ack,
                links: msg.links,
                data: msg._data,
                author: msg.author
            })));
            socket.emit('waClient', { action: 'showMessage',sessionId, success: true, data: messageData });
        } catch (error) {
            socket.emit('waClient', { action: 'showMessage',sessionId, success: false, message: 'Failed to fetch messages' });
        }
    });

    socket.on('downloadMedia', async ({ sessionId, messageId }) => {
        const client = sessionManager.getSession(sessionId);
        if (!client) return socket.emit('waClient', { action: 'downloadMedia', success: false, message: `Session ${sessionId} not found` });
        try {
            const message = await client.getMessageById(messageId);
            const media = await message.downloadMedia();
            socket.emit('waClient', { action: 'downloadMedia',sessionId, success: true, data: media });
        } catch (error) {
            socket.emit('waClient', { action: 'downloadMedia',sessionId, success: false, message: 'Failed to download media' });
        }
    });
};
