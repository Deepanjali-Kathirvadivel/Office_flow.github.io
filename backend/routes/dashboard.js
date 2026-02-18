const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticateToken } = require('../middleware/auth');

router.get('/stats', authenticateToken, dashboardController.getDashboardStats);
router.get('/complaints/category', authenticateToken, dashboardController.getComplaintsByCategory);
router.get('/complaints/priority', authenticateToken, dashboardController.getComplaintsByPriority);
router.get('/couriers/monthly', authenticateToken, dashboardController.getMonthlyParcelCount);
router.get('/couriers/vendor-performance', authenticateToken, dashboardController.getVendorPerformance);

module.exports = router;
