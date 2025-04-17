const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

const sessions = {}; // Menyimpan semua sesi WhatsApp
const sessionStatus = {}; // Menyimpan status QR Code dan koneksi

// Fungsi untuk memastikan direktori ada
const ensureDirExists = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

// Fungsi untuk membuat sesi baru
const createSession = (sessionId) => {
    if (sessions[sessionId]) {
        return sessionStatus[sessionId]; // Kembalikan status jika sesi sudah ada
    }

    const sessionDir = path.join(__dirname, `../sessions/${sessionId}`);
    ensureDirExists(sessionDir); // Pastikan direktori sesi ada

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: sessionId, dataPath: sessionDir }),
    });

    sessions[sessionId] = client;
    sessionStatus[sessionId] = { qr: null, connected: false };

    client.on('qr', (qr) => {
        sessionStatus[sessionId].qr = qr; // Simpan QR Code
        sessionStatus[sessionId].connected = false;
        console.log(`QR Code for session ${sessionId}:`, qr);
    });

    client.on('ready', () => {
        sessionStatus[sessionId].connected = true; // Tandai sebagai terhubung
        sessionStatus[sessionId].qr = null; // Hapus QR Code setelah login
        console.log(`Session ${sessionId} connected`);
    });

    client.on('disconnected', async (reason) => {
        sessionStatus[sessionId].connected = false;
        console.log(`Session ${sessionId} disconnected: ${reason}`);

        // Restart sesi secara otomatis
        try {
            await client.destroy(); // Hancurkan sesi lama
            delete sessions[sessionId]; // Hapus sesi dari memori
            createSession(sessionId); // Buat ulang sesi
        } catch (error) {
            console.error(`Failed to restart session ${sessionId}:`, error);
        }
    });

    client.initialize();
    return sessionStatus[sessionId];
};

// Fungsi untuk memuat semua sesi yang tersimpan
const loadAllSessions = () => {
    const sessionsDir = path.join(__dirname, '../sessions');
    ensureDirExists(sessionsDir); // Pastikan direktori sesi ada

    const sessionIds = fs.readdirSync(sessionsDir); // Ambil semua folder sesi
    sessionIds.forEach((sessionId) => {
        console.log(`Loading session: ${sessionId}`);
        createSession(sessionId); // Inisialisasi setiap sesi
    });
};

// Fungsi untuk mendapatkan sesi
const getSession = (sessionId) => sessions[sessionId];

// Fungsi untuk mendapatkan status sesi
const getSessionStatus = (sessionId) => sessionStatus[sessionId];

module.exports = { createSession, getSession, getSessionStatus, loadAllSessions, sessions, sessionStatus };