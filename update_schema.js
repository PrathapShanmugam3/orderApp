const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'datacode-datacode.d.aivencloud.com',
    port: 15555,
    user: 'avnadmin',
    password: 'AVNS_8E64xznbT9AA1SAok9F',
    database: 'defaultdb',
    ssl: { rejectUnauthorized: false }
});

async function updateSchema() {
    try {
        // 1. Check/Create expense_categories
        console.log('Checking expense_categories...');
        const createCategories = `
      CREATE TABLE IF NOT EXISTS expense_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        icon VARCHAR(10) NOT NULL DEFAULT '📦',
        color VARCHAR(10) NOT NULL DEFAULT '#6B7280',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
        await pool.execute(createCategories);
        console.log('expense_categories table ensured.');

        // Insert default categories if empty
        const [cats] = await pool.execute('SELECT count(*) as count FROM expense_categories');
        if (cats[0].count === 0) {
            console.log('Inserting default categories...');
            const insertDefaults = `
            INSERT IGNORE INTO expense_categories (name, icon, color) VALUES
              ('Food', '🍔', '#FF6B6B'),
              ('Travel', '✈️', '#4ECDC4'),
              ('Rent', '🏠', '#45B7D1'),
              ('Shopping', '🛍️', '#FF8ED4'),
              ('Bills', '💳', '#F59E0B'),
              ('Entertainment', '🎬', '#8B5CF6'),
              ('Health', '💊', '#10B981'),
              ('Education', '📚', '#EC4899'),
              ('Groceries', '🛒', '#059669'),
              ('Fuel', '⛽', '#EA580C'),
              ('Subscriptions', '📺', '#6366F1'),
              ('Other', '📦', '#6B7280');
        `;
            await pool.execute(insertDefaults);
        }

        // 1.2 Create roles table
        console.log('Checking roles table...');
        const createRoles = `
            CREATE TABLE IF NOT EXISTS roles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(50) NOT NULL,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );
        `;
        await pool.execute(createRoles);
        console.log('roles table ensured.');

        // Insert default roles
        const [rolesCount] = await pool.execute('SELECT count(*) as count FROM roles');
        if (rolesCount[0].count === 0) {
            console.log('Inserting default roles...');
            const insertRoles = `
                INSERT INTO roles (id, name) VALUES
                (1, 'user'),
                (2, 'moderator'),
                (3, 'admin');
            `;
            await pool.execute(insertRoles);
            console.log('Default roles inserted.');
        }

        // 1.5 Create app_users table if not exists
        console.log('Checking app_users table...');
        const createAppUsers = `
            CREATE TABLE IF NOT EXISTS app_users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role_id INT DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await pool.execute(createAppUsers);
        console.log('app_users table ensured.');

        // 2. Add role_id to app_users
        console.log('Checking app_users columns...');
        const [columns] = await pool.execute("SHOW COLUMNS FROM app_users");
        const hasRoleId = columns.some(c => c.Field === 'role_id');

        if (!hasRoleId) {
            console.log('Adding role_id column to app_users...');
            await pool.execute('ALTER TABLE app_users ADD COLUMN role_id INT DEFAULT 1');
            console.log('role_id column added.');
        } else {
            console.log('role_id column already exists.');
        }

        // 3. Create Expense Table
        console.log('Checking expense table...');
        const createExpenseTable = `
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
        await pool.execute(createExpenseTable);
        console.log('expense table ensured.');

        // 4. Create Indexes
        console.log('Creating indexes...');
        try {
            await pool.execute('CREATE INDEX idx_expense_user_date ON expense(user_id, date)');
            await pool.execute('CREATE INDEX idx_expense_category ON expense(user_id, category)');
            console.log('Indexes created (or already exist).');
        } catch (e) {
            console.log('Indexes might already exist, skipping.');
        }

        // 5. Add transaction_id to expense
        console.log('Checking expense columns for transaction_id...');
        const [expColumns] = await pool.execute("SHOW COLUMNS FROM expense");
        const hasTransactionId = expColumns.some(c => c.Field === 'transaction_id');

        if (!hasTransactionId) {
            console.log('Adding transaction_id column to expense...');
            await pool.execute('ALTER TABLE expense ADD COLUMN transaction_id VARCHAR(255) DEFAULT NULL');
            await pool.execute('CREATE INDEX idx_expense_transaction_id ON expense(transaction_id)');
            console.log('transaction_id column and index added.');
        } else {
            console.log('transaction_id column already exists.');
        }

        // 3. Set admin user (optional, set user 3 as admin based on previous output)
        // User 3 is admin@gmail.co
        console.log('Setting user 3 as admin...');
        await pool.execute('UPDATE app_users SET role_id = 3 WHERE id = 3');
        console.log('User 3 updated to admin.');

    } catch (err) {
        console.error('Error updating schema:', err);
    } finally {
        pool.end();
    }
}

updateSchema();
