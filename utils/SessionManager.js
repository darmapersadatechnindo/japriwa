const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { success } = require('toastr');


class SessionManager {
    constructor(io) {
        this.sessions = new Map()
        this.groups = new Map()
        this.sessionStatus = {};
        this.io = io;
        this.eventLogs = new Map();
    }

    ensureDirExists(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
    waitForNestedObject(rootObj, nestedPath, maxWaitTime = 10000, interval = 100) {
        const start = Date.now()
        return new Promise((resolve, reject) => {
            const checkObject = () => {
                const nestedObj = nestedPath.split('.').reduce((obj, key) => obj ? obj[key] : undefined, rootObj)
                if (nestedObj) {
                    // Nested object exists, resolve the promise
                    resolve()
                } else if (Date.now() - start > maxWaitTime) {
                    // Maximum wait time exceeded, reject the promise
                    console.log('Timed out waiting for nested object')
                    reject(new Error('Timeout waiting for nested object'))
                } else {
                    // Nested object not yet created, continue waiting
                    setTimeout(checkObject, interval)
                }
            }
            checkObject()
        })
    }
    async validateSession(sessionId) {
        try {
            const returnData = { success: false, state: null, message: '' }
            if (!this.sessions.has(sessionId) || !this.sessions.get(sessionId)) {
                returnData.message = 'Not Found'
                return returnData
            }

            const client = this.sessions.get(sessionId)
            await this.waitForNestedObject(client, 'pupPage')
                .catch((err) => { return { success: false, state: null, message: err.message } })
            let maxRetry = 0
            while (true) {
                try {
                    if (client.pupPage.isClosed()) {
                        return { success: false, state: null, message: 'Browser Tab Closed' }
                    }
                    await Promise.race([
                        client.pupPage.evaluate('1'),
                        new Promise(resolve => setTimeout(resolve, 1000))
                    ])
                    break
                } catch (error) {
                    if (maxRetry === 2) {
                        return { success: false, state: null, message: 'Session Closed' }
                    }
                    maxRetry++
                }
            }

            const state = await client.getState()

            returnData.state = state
            if (state !== 'CONNECTED') {
                returnData.message = 'Not Connected'

                return returnData
            }

            returnData.success = true
            returnData.message = 'Connected'

            return returnData
        } catch (error) {
            console.log(error)
            return { success: false, state: null, message: error.message }
        }
    }
    restoreSessions = () => {
        try {
            if (!fs.existsSync("./sessions")) {
                fs.mkdirSync("./sessions")
            }
            // Read the contents of the folder
            fs.readdir("./sessions", (_, files) => {
                // Iterate through the files in the parent folder
                for (const file of files) {
                    // Use regular expression to extract the string from the folder name
                    const match = file.match(/^session-(.+)$/)
                    if (match) {
                        const sessionId = match[1]
                        console.log('existing session detected', sessionId)
                        this.sessions.delete(sessionId)
                        this.createSession(sessionId)
                    }
                }
            })
        } catch (error) {
            console.log(error)
            console.error('Failed to restore sessions:', error)
        }
    }

    async createSession(sessionId) {
        if (this.sessions.has(sessionId)) {
            return { success: false, message: `Session already exists for: ${sessionId}` }
        }

        const localAuth = new LocalAuth({ clientId: sessionId, dataPath: "./sessions" })
        const clientOptions = {
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ],
                //executablePath: '/usr/bin/google-chrome-stable',
                //executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
            },
            userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
            authStrategy: localAuth
        }
        clientOptions.waitForLoginTimeout = 5000;
        clientOptions.webVersion = "2.2407.4"
        clientOptions.webVersionCache = {
            type: 'none'
        }

        clientOptions.waitForLoginTimeout = 10000

        const client = new Client(clientOptions)
        client.initialize().catch(err => console.log('Initialize error:', err.message))



        // Event handling
        const events = [
            'authenticated',
            'auth_failure',
            'change_battery',
            'chat_archived',
            'chat_removed',
            'disconnected',
            'group_admin_changed',
            'group_join',
            'group_leave',
            'group_membership_request',
            'group_update',
            'incoming_call',
            'message_ack',
            'message',
            'message_ciphertext',
            'message_create',
            'message_edit',
            'message_reaction',
            'message_revoke_everyone',
            'message_revoke_me',
            'vote_update',
            'qr',
            'change_state',
            'contact_changed',
            'ready',
        ];

        events.forEach((event) => {
            client.on(event, async (data) => {
                const response = { action: event, success:true, sessionId, data };
                console.log(`Event ${event} triggered for session ${sessionId}:`);

                // Emit event to the client via Socket.IO
                this.io.emit('waClient', response);
                // Handle specific events with additional logic
                if (event === 'qr') {
                    QRCode.toDataURL(data, async (err, url) => {
                        if (err) {
                            console.error(`Failed to generate QR code for session ${sessionId}:`, err);
                            return;
                        }
                        const qrEvent = { timestamp: new Date().toISOString(), event: 'qr', qrCodeUrl: url };
                        if (!this.eventLogs.has(sessionId)) this.eventLogs.set(sessionId, []);
                        this.eventLogs.get(sessionId).push(qrEvent);

                        this.io.emit('waClient', { action: 'qr', uccess:true, sessionId, qrCodeUrl: url });

                    });
                }

            });
        });
        return this.sessions.set(sessionId, client)
    }
    async deleteSessionFolder(sessionId) {
        try {
            const targetDirPath = path.join("./sessions", `session-${sessionId}`)
            const resolvedTargetDirPath = await fs.promises.realpath(targetDirPath)
            const resolvedSessionPath = await fs.promises.realpath("./sessions")

            const safeSessionPath = `${resolvedSessionPath}${path.sep}`

            if (!resolvedTargetDirPath.startsWith(safeSessionPath)) {
                console.log('Invalid path: Directory traversal detected')
            }
            await fs.promises.rm(resolvedTargetDirPath, { recursive: true, force: true })

        } catch (error) {
            console.log('Folder deletion error', error)
        }
    }
    async reloadSession(sessionId) {
        try {
            const client = this.sessions.get(sessionId)
            if (!client) {
                return
            }
            client.pupPage.removeAllListeners('close')
            client.pupPage.removeAllListeners('error')
            try {
                const pages = await client.pupBrowser.pages()
                await Promise.all(pages.map((page) => page.close()))
                await Promise.race([
                    client.pupBrowser.close(),
                    new Promise(resolve => setTimeout(resolve, 5000))
                ])
            } catch (e) {
                const childProcess = client.pupBrowser.process()
                if (childProcess) {
                    childProcess.kill(9)
                }
            }
            this.createSession(sessionId)
        } catch (error) {
            console.log(error)
        }
    }

    async deleteSession(sessionId, validation) {
        try {
            const client = this.sessions.get(sessionId)
            if (!client) {
                return
            }
            client.pupPage.removeAllListeners('close')
            client.pupPage.removeAllListeners('error')
            if (validation.success) {
                console.log(`Logging out session ${sessionId}`)
                await client.logout()
            } else if (validation.message === 'Not Connected') {
                console.log(`Destroying session ${sessionId}`)
                await client.destroy()
            }
            let maxDelay = 0
            while (client.pupBrowser.isConnected() && (maxDelay < 10)) {
                await new Promise(resolve => setTimeout(resolve, 1000))
                maxDelay++
            }
            await this.deleteSessionFolder(sessionId)
            this.sessions.delete(sessionId)

        } catch (error) {
            console.log(error)
        }
    }

    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    deleteMapSession(sessionId) {
        return this.sessions.delete(sessionId);
    }
    getGroup(sessionId) {
        return this.groups.get(sessionId);
    }
    getSessionEvents(sessionId) {
        return this.eventLogs.get(sessionId) || [];
    }
    getDevice = () => {
        try {
            const dir = "./sessions";
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir);
            }

            const device = fs.readdirSync(dir)
                .map(file => {
                    const match = file.match(/^session-(.+)$/);
                    return match ? { sessionId: match[1] } : null;
                })
                .filter(Boolean);

            console.log(device);
            return device;
        } catch (error) {
            console.error('Failed to restore sessions:', error);
            return [];
        }
    }

}

module.exports = SessionManager;