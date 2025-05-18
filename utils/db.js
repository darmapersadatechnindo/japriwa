// db.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host:     'localhost',
    user:     'root',
    password: '',
    database: 'whatsapp',
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
});


module.exports = pool;