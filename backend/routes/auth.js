const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

router.post('/login', authController.login);
router.get('/me', authenticateToken, authController.getCurrentUser);
router.get('/roles', authenticateToken, authController.getRoles);
router.post('/register', authenticateToken, authorizeRole('Admin'), authController.register);

module.exports = router;
