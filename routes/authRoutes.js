const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const { isAdmin } = require('../middleware/authMiddleware');

// POST /auth/register
router.post('/register', AuthController.register);

// POST /auth/login
router.post('/login', AuthController.login);

// PUT /auth/password/:id
router.put('/password/:id', AuthController.changePassword);

// Admin only routes
// GET /auth/users - Get all users
router.get('/users', isAdmin, AuthController.getAllUsers);

// PUT /auth/users/:id/role - Update user role
router.put('/users/:id/role', isAdmin, AuthController.updateUserRole);

// DELETE /auth/users/:id - Delete user
router.delete('/users/:id', isAdmin, AuthController.deleteUser);

module.exports = router;
