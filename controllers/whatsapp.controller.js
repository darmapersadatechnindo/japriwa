const pool = require('../utils/db');
const SessionManager = require("../utils/SessionManager")
const { MessageMedia } = require('whatsapp-web.js');

class WaClient {

    constructor(io,sessionManager) {
        this.sessionmanager = sessionManager
        this.DEFAULT_PROFILE_PIC = "https://i.pinimg.com/736x/16/18/20/1618201e616f4a40928c403f222d7562.jpg";
    }
    start = async (req, res) => {
        const { sessionId } = req.params;
        if (!sessionId) {
            return res.json({ success: false, message: "sessionId is required" });
        }
        const status = this.sessionmanager.createSession(sessionId);
        return res.json({ success: true, message: `Session ${sessionId} created`, status });
    }
    status = async (req, res) => {
        const { sessionId } = req.params
        const data = await  this.sessionmanager.validateSession(sessionId);
        return res.json({ success: true, data });
    }
    group = async (req, res) => {
        const { sessionId } = req.params;
        const client = this.sessionmanager.getSession(sessionId);
        if (!client) {
            return res.json({ success: false, message: `Session ${sessionId} not found` });
        }
        try {
            const chats = await client.getChats();
            const groups = chats.filter(c => c.isGroup);
            
            res.json({ success: true, groups });
        } catch (error) {
            console.log(error)
            res.json({ success: false, message: 'Failed to fetch group chats' });
        }
    }
    getContactById = async (req, res) => {
        const { sessionId,contactId } = req.params;
        const client = this.sessionmanager.getSession(sessionId);
        if (!client) {
            return res.json({ success: false, message: `Session ${sessionId} not found` });
        }
        try {
            const contact = await client.getContactById(contactId)
            res.json({ success: true, contact });
        } catch (error) {
            console.log(error)
            res.json({ success: false, message: 'Failed to fetch group chats' });
        }
    }
    info = async (req, res) => {
        const { sessionId } = req.params;
        const client = this.sessionmanager.getSession(sessionId);
        if (!client) {
            return res.json({ success: false, message: `Session ${sessionId} not found` });
        }
        try {
            const info = client.info
            const profilPic = await client.getProfilePicUrl(info.me._serialized);
            const data = { ...info, profilPic }
            res.json({ success: true, data });
        } catch (error) {
            res.json({ success: false, message: 'Failed to fetch group chats' });
        }
    }
    contact = async (req, res) => {
        const { sessionId } = req.params;
        const client = this.sessionmanager.getSession(sessionId);
        if (!client) {
            return res.json({ success: false, message: `Session ${sessionId} not found` });
        }
        try {
            const contacts = await client.getContacts();
            const rows = [];
            for (const c of contacts) {
                if (c.isMyContact && c.id.server === 'c.us') {
                    rows.push(
                        {sessionId,
                        phone:c.id.user,
                        name:c.name,
                        pushname:c.pushname}
                    );
                }
            }
            res.json({ success: true, rows });
        } catch (error) {
            res.json({ success: false, message: 'Failed to fetch group chats' });
        }
    }
    chatList = async (req, res) => {
        const { sessionId } = req.params;
        const client = this.sessionmanager.getSession(sessionId);

        if (!client) {
            return res.json({ success: false, message: `Session ${sessionId} not found` });
        }

        try {
            const chats = await client.getChats();
            res.json({ success: true, chats });
        } catch (error) {
            res.json({ success: false, message: 'Gagal mengambil daftar chat', error: error.message });
        }
    }
    profilPic = async (req, res) => {
        const { sessionId,contactId } = req.params;
        const client = this.sessionmanager.getSession(sessionId);
        if (!client) {
            return res.json({ success: false, message: `Session ${sessionId} not found` });
        }
        try {
            const contact = await client.getContactById(contactId);
            let profilePicUrl = "https://i.pinimg.com/736x/16/18/20/1618201e616f4a40928c403f222d7562.jpg"
    
            if (contact) {
                profilePicUrl = await contact.getProfilePicUrl().catch(() => "https://i.pinimg.com/736x/16/18/20/1618201e616f4a40928c403f222d7562.jpg");
            }
            res.json({ success: true, sessionId,contactId, profilePicUrl });
        } catch (error) {
            res.json({ success: false, message: 'Failed to fetch group chats' });
        }
    }
    logout = async (req, res) => {
        const { sessionId } = req.params;
        const client = this.sessionmanager.getSession(sessionId);
        if (!client) {
            return res.json({ success: false, message: `Session ${sessionId} not found` });
        }
        try {

            await client.logout()
            await client.authStrategy.logout();
            this.sessionmanager.deleteMapSession(sessionId);
            //this.sessionmanager.reloadSession(sessionId);
            res.json({ success: true, message: "Success" });
        } catch (error) {
            res.json({ success: false, message: 'Failed to fetch group chats' });
        }
    }
    sendMessage = async (req, res) => {
        const { sessionId } = req.params;
        const { to, message } = req.body;

        if (!to || !message) {
            return res.json({ success: false, message: "Parameter 'to' dan 'message' wajib diisi" });
        }

        const client = this.sessionmanager.getSession(sessionId);
        if (!client) {
            return res.json({ success: false, message: `Session ${sessionId} not found` });
        }

        try {
            await client.sendMessage(`${to}@c.us`, message);
            res.json({ success: true, message: "Pesan berhasil dikirim" });
        } catch (error) {
            res.json({ success: false, message: "Gagal mengirim pesan", error: error.message });
        }
    }

    sendMedia = async (req, res) => {
        const { sessionId } = req.params;
        const { to, fileUrl, caption } = req.body;

        if (!to || !fileUrl) {
            return res.json({ success: false, message: "Parameter 'to' dan 'fileUrl' wajib diisi" });
        }

        const client = this.sessionmanager.getSession(sessionId);
        if (!client) {
            return res.json({ success: false, message: `Session ${sessionId} not found` });
        }

        try {
            const axios = require('axios');
            const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });

            const mime = require('mime-types');
            const contentType = mime.lookup(fileUrl) || 'application/octet-stream';
            const base64 = Buffer.from(response.data).toString('base64');
            const media = new MessageMedia(contentType, base64, fileUrl.split('/').pop());
            await client.sendMessage(`${to}@c.us`, media, { caption });

            res.json({ success: true, message: "Media berhasil dikirim" });
        } catch (error) {
            res.json({ success: false, message: "Gagal mengirim media", error: error.message });
        }
    }
    getEvents = async (req, res) => {
        const { sessionId } = req.params;
        const events = this.sessionmanager.getSessionEvents(sessionId);
        res.json({ success: true, events });
    }
    getQr = async (req, res) => {
        const { sessionId } = req.params;
        const events = this.sessionmanager.getSessionEvents(sessionId);
        const qrEvent = events.reverse().find(e => e.event === 'qr');
        if (!qrEvent) {
            return res.json({ success: false, message: 'QR belum tersedia atau sudah expired' });
        }
    
        res.json({ success: true, qrCodeUrl: qrEvent.qrCodeUrl });
    }
    getDevice = async (req, res) => {
        const device = this.sessionmanager.getDevice();
        res.json({ success: true, device });
    }
    showMessage = async (req, res) => {
        const { sessionId,chatId } = req.params;
        const client = this.sessionmanager.getSession(sessionId);
        if (!client) {
            return res.json({ success: false, message: `Session ${sessionId} not found` });
        }
        try {
            const chat = await client.getChatById(chatId);
            const message = await chat.fetchMessages({limit:50})
            await chat.sendSeen();
            const messageData = await Promise.all(message.map(async (msg) => {
                
                return {
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
                    data:msg._data,
                    author:msg.author,
                    
                };
            }));
            res.json({ success: true, messageData });
        } catch (error) {
            res.json({ success: false, message: 'Failed to fetch group chats' });
        }
    }
    downloadMedia = async(req, res)=>{
        const { sessionId,messageId } = req.params;
        const client = this.sessionmanager.getSession(sessionId);
        if (!client) {
            return res.json({ success: false, message: `Session ${sessionId} not found` });
        }
        try {
            const message = await client.getMessageById(messageId);
            const media = await message.downloadMedia();
            res.json({ success: true, messageId, media});
        } catch (error) {
            res.json({ success: false, message: 'Failed to fetch group chats' });
        }
    }      
}

module.exports = WaClient;
