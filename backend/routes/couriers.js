const express = require('express');
const router = express.Router();
const courierController = require('../controllers/courierController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

router.post('/upload', authenticateToken, authorizeRole('Reception'), courierController.upload.single('slip'), courierController.uploadSlip);
router.post('/', authenticateToken, authorizeRole('Reception'), courierController.createCourier);
router.get('/', authenticateToken, courierController.getCouriers);
router.get('/vendors', authenticateToken, courierController.getVendors);
router.get('/:id', authenticateToken, courierController.getCourierById);
router.post('/:id/acknowledge', authenticateToken, courierController.acknowledgeCourier);

module.exports = router;
