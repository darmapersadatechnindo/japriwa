const express = require('express');
const bodyParser = require('body-parser');
const qrcode = require('qrcode');
const cors = require('cors');
const { createSession, getSession, getSessionStatus, loadAllSessions,sessions,sessionStatus } = require('./utils/session.js');

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
    const { sessionId } = req.query; // Ambil sessionId dari query parameter
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
    const { sessionId, groupId } = req.query; // Ambil sessionId dan groupId dari query parameter
    const session = getSession(sessionId);
    if (!session) {
        return res.status(404).json({ message: 'Session not found' });
    }

    try {
        const chat = await session.getChatById(groupId); // Ambil chat berdasarkan groupId
        if (!chat.isGroup) {
            return res.status(400).json({ message: 'The provided ID is not a group' });
        }

        const members = chat.participants.map(participant => ({
            id: participant.id._serialized,
            isAdmin: participant.isAdmin,
            isSuperAdmin: participant.isSuperAdmin,
        }));

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
// Jalankan server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});