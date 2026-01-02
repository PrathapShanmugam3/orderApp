const UserModel = require('../models/userModel');

class AuthController {
    // Register new user
    static async register(req, res) {
        const { email, password } = req.body;
        try {
            // Check if user exists
            const existingUser = await UserModel.findByEmail(email);
            if (existingUser) {
                return res.status(400).json({ error: 'Email already exists' });
            }

            const user = await UserModel.create(email, password);
            res.status(201).json(user);
        } catch (err) {
            console.error('Register error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // Login user
    static async login(req, res) {
        const { email, password } = req.body;
        try {
            const user = await UserModel.findByEmail(email);
            if (!user) {
                return res.status(400).json({ error: 'User not found' });
            }

            const isMatch = await UserModel.verifyPassword(password, user.password);
            if (!isMatch) {
                return res.status(400).json({ error: 'Invalid credentials' });
            }

            res.json({
                id: user.id,
                email: user.email,
                isAdmin: user.is_admin || false,
                message: 'Login successful'
            });
        } catch (err) {
            console.error('Login error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // Change password
    static async changePassword(req, res) {
        const { id } = req.params;
        const { currentPassword, newPassword } = req.body;
        try {
            const user = await UserModel.findById(id);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            const isMatch = await UserModel.verifyPassword(currentPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({ error: 'Current password is incorrect' });
            }

            await UserModel.updatePassword(id, newPassword);
            res.json({ message: 'Password changed successfully' });
        } catch (err) {
            console.error('Change password error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}

module.exports = AuthController;
