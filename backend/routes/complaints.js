const express = require('express');
const router = express.Router();
const complaintController = require('../controllers/complaintController');
const { authenticateToken } = require('../middleware/auth');

router.post('/upload', authenticateToken, complaintController.upload.single('attachment'), complaintController.uploadAttachment);
router.post('/', authenticateToken, complaintController.submitComplaint);
router.get('/', authenticateToken, complaintController.getComplaints);
router.get('/:id', authenticateToken, complaintController.getComplaintById);
router.put('/:id/status', authenticateToken, complaintController.updateComplaintStatus);

module.exports = router;
