const pool = require('../config/database');
const bcrypt = require('bcryptjs');

class UserModel {
    // Role constants
    static ROLE_USER = 1;
    static ROLE_MODERATOR = 2;
    static ROLE_ADMIN = 3;

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

    // Get all users (admin only)
    static async findAll() {
        const [users] = await pool.execute('SELECT id, email, role_id FROM app_users ORDER BY id ASC');
        return users;
    }

    // Create new user (default role = user)
    static async create(email, password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.execute(
            'INSERT INTO app_users (email, password, role_id) VALUES (?, ?, ?)',
            [email, hashedPassword, this.ROLE_USER]
        );
        return { id: result.insertId, email, role_id: this.ROLE_USER };
    }

    // Verify password
    static async verifyPassword(plainPassword, hashedPassword) {
        return bcrypt.compare(plainPassword, hashedPassword);
    }

    // Check if user is admin (role_id = 3)
    static async isAdmin(userId) {
        const [users] = await pool.execute('SELECT role_id FROM app_users WHERE id = ?', [userId]);
        console.log(`[UserModel] isAdmin check for ${userId}:`, users[0]);
        return users[0]?.role_id === this.ROLE_ADMIN;
    }

    // Update password
    static async updatePassword(userId, newPassword) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.execute('UPDATE app_users SET password = ? WHERE id = ?', [hashedPassword, userId]);
        return true;
    }

    // Update user role (admin only)
    static async updateRole(userId, roleId) {
        await pool.execute('UPDATE app_users SET role_id = ? WHERE id = ?', [roleId, userId]);
        return true;
    }

    // Delete user (admin only)
    static async delete(userId) {
        await pool.execute('DELETE FROM app_users WHERE id = ?', [userId]);
        return true;
    }
}

module.exports = UserModel;
