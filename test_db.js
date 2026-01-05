const pool = require('./config/database');

async function test() {
    try {
        console.log('Testing connection...');
        const [rows] = await pool.execute('SELECT 1 as val');
        console.log('Connection success:', rows);

        console.log('Testing isAdmin query...');
        const [users] = await pool.execute('SELECT role_id FROM app_users WHERE id = ?', [3]);
        console.log('User 3 role:', users[0]);

        console.log('Testing findAll query...');
        const [allUsers] = await pool.execute('SELECT id, email, role_id FROM app_users LIMIT 1');
        console.log('First user:', allUsers[0]);

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        process.exit();
    }
}

test();
