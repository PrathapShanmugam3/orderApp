const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');

// POST /auth/register
router.post('/register', AuthController.register);

// POST /auth/login
router.post('/login', AuthController.login);

// PUT /auth/password/:id
router.put('/password/:id', AuthController.changePassword);

module.exports = router;
