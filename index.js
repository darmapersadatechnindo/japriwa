const SessionManager = require("./utils/SessionManager");
const express = require('express');
const bodyParser = require('body-parser');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./whatsapp.yaml');
const apiKeyMiddleware = require('./middleware/apiKey');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const whatsappSocketHandler = require('./utils/whatsappSocketHandler');
const path = require('path');
const app = express();
app.use(bodyParser.json());
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

const sessionManager = new SessionManager(io);
sessionManager.restoreSessions()

const routes = require('./routes')(io, sessionManager)
app.use("/api", apiKeyMiddleware, routes)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get('/socket-docs', (req, res) => {
    res.sendFile(path.join(__dirname, 'socket.html'));
});
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

io.on('connection', (socket) => {
    console.log('connected:', socket.id);
    whatsappSocketHandler(io, socket, sessionManager);
    socket.on('disconnect', () => {
        console.log('A client disconnected:', socket.id);
    });
});