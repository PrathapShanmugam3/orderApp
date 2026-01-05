const UserModel = require('../models/userModel');

// Admin check middleware (role_id = 3)
const isAdmin = async (req, res, next) => {
    const userId = req.headers['x-user-id'];
    console.log(`[AuthMiddleware] Admin check for userId: ${userId}`);

    if (!userId) {
        console.log('[AuthMiddleware] No user ID provided');
        return res.status(401).json({ error: 'Unauthorized - No user ID provided', headers: req.headers });
    }

    try {
        const isAdminUser = await UserModel.isAdmin(userId);
        console.log(`[AuthMiddleware] User ${userId} is admin: ${isAdminUser}`);

        if (!isAdminUser) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    } catch (err) {
        console.error('Admin check error:', err);
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
};

// Auth check middleware (just checks if user ID is provided)
const isAuthenticated = (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized - No user ID provided' });
    }
    req.userId = userId;
    next();
};

module.exports = { isAdmin, isAuthenticated };
