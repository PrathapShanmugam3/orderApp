const pool = require('../config/database');
const bcrypt = require('bcryptjs');

class UserModel {
    // Find user by email
    static async findByEmail(email) {
        const [users] = await pool.execute('SELECT * FROM app_users WHERE email = ?', [email]);
        return users[0] || null;
    }

    // Find user by ID
    static async findById(id) {
        const [users] = await pool.execute('SELECT * FROM app_users WHERE id = ?', [id]);
        return users[0] || null;
    }

    // Create new user
    static async create(email, password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.execute(
            'INSERT INTO app_users (email, password) VALUES (?, ?)',
            [email, hashedPassword]
        );
        return { id: result.insertId, email };
    }

    // Verify password
    static async verifyPassword(plainPassword, hashedPassword) {
        return bcrypt.compare(plainPassword, hashedPassword);
    }

    // Check if user is admin
    static async isAdmin(userId) {
        const [users] = await pool.execute('SELECT is_admin FROM app_users WHERE id = ?', [userId]);
        return users[0]?.is_admin || false;
    }

    // Update password
    static async updatePassword(userId, newPassword) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.execute('UPDATE app_users SET password = ? WHERE id = ?', [hashedPassword, userId]);
        return true;
    }
}

module.exports = UserModel;
