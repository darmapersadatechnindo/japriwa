const express = require('express');
const bodyParser = require('body-parser');
const qrcode = require('qrcode');
const cors = require('cors');
const { createSession, getSession, getSessionStatus, loadAllSessions, sessions, sessionStatus } = require('./utils/session.js');

const app = express();
app.use(bodyParser.json());
app.use(cors());

loadAllSessions();
// Endpoint untuk membuat sesi baru
app.post('/api/session', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
        return res.status(400).json({ message: 'Session ID is required' });
    }

    const sessionStatus = createSession(sessionId);
    if (sessionStatus.connected) {
        return res.json({ message: 'Session already connected' });
    } else if (sessionStatus.qr) {
        try {
            const qrCodeUrl = await qrcode.toDataURL(sessionStatus.qr);
            return res.json({ qrCodeUrl, message: 'Scan the QR code to connect' });
        } catch (error) {
            console.error('Error generating QR Code:', error);
            return res.status(500).json({ message: 'Failed to generate QR Code' });
        }
    } else {
        return res.json({ message: 'Initializing session' });
    }
});

// Endpoint untuk mengirim pesan
app.post('/api/send-message', async (req, res) => {
    const { sessionId, to, message } = req.body;
    const session = getSession(sessionId);
    if (!session) {
        return res.status(404).json({ message: 'Session not found' });
    }

    try {
        await session.sendMessage(to, message);
        res.json({ message: 'Message sent successfully' });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ message: 'Failed to send message' });
    }
});
// Endpoint untuk menampilkan semua grup
app.get('/api/groups', async (req, res) => {
    const { sessionId } = req.query;
    const session = getSession(sessionId);
    if (!session) {
        return res.status(404).json({ message: 'Session not found' });
    }

    try {
        const chats = await session.getChats(); // Ambil semua chat
        const groups = chats.filter(chat => chat.isGroup); // Filter hanya grup
        res.json(groups); // Kirim daftar grup sebagai respons
    } catch (error) {
        console.error('Error fetching groups:', error);
        res.status(500).json({ message: 'Failed to fetch groups' });
    }
});
// Endpoint untuk menampilkan semua anggota grup
app.get('/api/group-members', async (req, res) => {
    const { sessionId, groupId } = req.query;
    const session = getSession(sessionId);
    if (!session) {
        return res.status(404).json({ message: 'Session not found' });
    }

    try {
        const chat = await session.getChatById(groupId); // Ambil chat berdasarkan groupId
        if (!chat.isGroup) {
            return res.status(400).json({ message: 'The provided ID is not a group' });
        }
        const members = await Promise.all(
            chat.participants.map(async (participant) => {
                const contact = await session.getContactById(participant.id._serialized);
                return {
                    id: participant.id._serialized,
                    phone: participant.id.user,
                    name: contact.isMyContact ? contact.name : contact.pushname || 'Unknown',
                    isAdmin: participant.isAdmin,
                    isSuperAdmin: participant.isSuperAdmin,
                };
            })
        );

        res.json(members); // Kirim daftar anggota grup sebagai respons
    } catch (error) {
        console.error('Error fetching group members:', error);
        res.status(500).json({ message: 'Failed to fetch group members' });
    }
});
// Endpoint untuk menampilkan semua sesi
app.get('/api/sessions', (req, res) => {
    const allSessions = Object.keys(sessions).map(sessionId => ({
        sessionId,
        status: sessionStatus[sessionId]?.connected ? 'connected' : 'disconnected',
        qr: sessionStatus[sessionId]?.qr || null, // Jika QR Code masih tersedia
    }));

    res.json(allSessions); // Kirim daftar sesi sebagai respons
});
// Endpoint untuk mengirim pesan broadcast
app.post('/api/broadcast', async (req, res) => {
    const { sessionId, numbers, message } = req.body; // Ambil sessionId, daftar nomor, dan pesan dari body request
    const session = getSession(sessionId);

    if (!session) {
        return res.status(404).json({ message: 'Session not found' });
    }

    if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
        return res.status(400).json({ message: 'Numbers must be a non-empty array' });
    }

    if (numbers.length > 500) {
        return res.status(400).json({ message: 'You can only send broadcast to a maximum of 500 numbers at a time' });
    }

    if (!message || message.trim() === '') {
        return res.status(400).json({ message: 'Message is required' });
    }

    try {
        const results = await Promise.all(
            numbers.map(async (number) => {
                try {
                    await session.sendMessage(`${number}@c.us`, message);
                    return { number, status: 'success' };
                } catch (error) {
                    console.error(`Failed to send message to ${number}:`, error);
                    return { number, status: 'failed', error: error.message };
                }
            })
        );

        res.json({ message: 'Broadcast completed', results }); // Kirim hasil broadcast sebagai respons
    } catch (error) {
        console.error('Error during broadcast:', error);
        res.status(500).json({ message: 'Failed to send broadcast' });
    }
});
// Endpoint untuk mendapatkan semua kontak dari sesi
// Endpoint untuk mendapatkan semua kontak dari sesi
app.get('/api/contacts', async (req, res) => {
    const { sessionId } = req.query; // Ambil sessionId dari query parameter
    const session = getSession(sessionId);

    if (!session) {
        return res.status(404).json({ message: 'Session not found' });
    }

    try {
        const contacts = await session.getContacts(); // Ambil semua kontak dari sesi

        // Filter hanya kontak dengan server "c.us"
        const filteredContacts = contacts.filter(contact => contact.id.server === 'c.us');

        const formattedContacts = filteredContacts.map(contact => ({
            id: contact.id._serialized,
            phone: contact.id.user,
            name: contact.isMyContact ? contact.name : contact.pushname || 'Unknown',
            isBusiness: contact.isBusiness,
            isEnterprise: contact.isEnterprise,
        }));

        res.json(formattedContacts); // Kirim daftar kontak yang difilter sebagai respons
    } catch (error) {
        console.error('Error fetching contacts:', error);
        res.status(500).json({ message: 'Failed to fetch contacts' });
    }
});
// Endpoint untuk mengirim pesan dengan media
app.post('/api/send-media', async (req, res) => {
    const { sessionId, to, message, mediaUrl, fileName } = req.body; // Ambil data dari body request
    const session = getSession(sessionId);

    if (!session) {
        return res.status(404).json({ message: 'Session not found' });
    }

    if (!to || !mediaUrl) {
        return res.status(400).json({ message: 'Recipient and media URL are required' });
    }

    try {
        // Unduh media dari URL
        const axios = require('axios');
        const mime = require('mime-types');
        const response = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
        const mediaData = Buffer.from(response.data, 'binary');

        // Tentukan tipe file berdasarkan URL atau fileName
        const mimeType = mime.lookup(fileName || mediaUrl) || 'application/octet-stream';

        // Buat media
        const { MessageMedia } = require('whatsapp-web.js');
        const media = new MessageMedia(mimeType, mediaData.toString('base64'), fileName || 'file');

        // Kirim pesan dengan media
        await session.sendMessage(`${to}@c.us`, media, { caption: message });

        res.json({ message: 'Media message sent successfully' });
    } catch (error) {
        console.error('Error sending media message:', error);
        res.status(500).json({ message: 'Failed to send media message' });
    }
});
// Jalankan server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});