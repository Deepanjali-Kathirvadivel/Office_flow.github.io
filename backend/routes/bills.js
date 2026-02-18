const express = require('express');
const router = express.Router();
const billController = require('../controllers/billController');
const { authenticateToken, authorizeRole, canApproveAtLevel } = require('../middleware/auth');

router.post('/upload', authenticateToken, billController.upload.single('image'), billController.uploadBillImage);
router.post('/', authenticateToken, billController.createBill);
router.get('/', authenticateToken, billController.getBills);
router.get('/:id', authenticateToken, billController.getBillById);
router.post('/:id/approve', authenticateToken, canApproveAtLevel, billController.approveBill);

module.exports = router;
