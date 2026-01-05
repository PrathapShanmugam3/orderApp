const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'datacode-datacode.d.aivencloud.com',
    port: 15555,
    user: 'avnadmin',
    password: 'AVNS_8E64xznbT9AA1SAok9F',
    database: 'defaultdb',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: false
    },
    decimalNumbers: true
});

// Test connection
pool.getConnection()
    .then(connection => {
        console.log('✅ Connected to MySQL Database');
        connection.release();
    })
    .catch(err => {
        console.error('❌ Error connecting to MySQL', err);
    });

module.exports = pool;
