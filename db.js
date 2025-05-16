// db.js - switched from single connection to connection pool to gracefully handle idle timeouts
const mysql = require('mysql2');

// Build pool configuration from env (fallback to previous hard-coded values for dev)
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'lamp-mysql8',
    user: process.env.DB_USER || 'viralvalor',
    password: process.env.DB_PASS || 'yourpassword',
    database: process.env.DB_NAME || 'viralvalor',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // Keep-alive helps during shorter idle periods
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Optional: test initial connection & log useful info
pool.getConnection((err, connection) => {
    if (err) {
        console.error('[DB] Failed to establish initial connection:', err.message);
    } else {
        console.log('[DB] Connection pool created – MySQL thread id', connection.threadId);
        connection.release();
    }
});

// Export the pool under the same property name so existing code (`const { db } = require('./db')`) keeps working
module.exports = { db: pool };

