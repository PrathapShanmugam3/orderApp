const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'datacode-datacode.d.aivencloud.com',
    port: 15555,
    user: 'avnadmin',
    password: 'AVNS_8E64xznbT9AA1SAok9F',
    database: 'defaultdb',
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        console.log('Checking app_users...');
        const [users] = await pool.execute('SELECT * FROM app_users');
        console.log('Users:', users);

        console.log('Checking roles table...');
        const [roles] = await pool.execute('SELECT * FROM roles');
        console.log('Roles:', roles);

        console.log('Checking expense table...');
        const [tables] = await pool.execute("SHOW TABLES LIKE 'expense'");
        if (tables.length === 0) {
            console.log('Expense table does NOT exist.');
            // Try creating it
            const createTable = `
            CREATE TABLE IF NOT EXISTS expense (
              id INT AUTO_INCREMENT PRIMARY KEY,
              user_id INT NOT NULL,
              amount DECIMAL(10,2) NOT NULL,
              category VARCHAR(50) NOT NULL,
              date DATETIME NOT NULL,
              notes TEXT,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
            );
        `;
            await pool.execute(createTable);
            console.log('Expense table created.');
        } else {
            console.log('Expense table exists.');
            const [columns] = await pool.execute("SHOW COLUMNS FROM expense");
            console.log('Columns:', columns.map(c => c.Field));
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        pool.end();
    }
}

check();
