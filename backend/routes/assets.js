const express = require('express');
const router = express.Router();
const assetController = require('../controllers/assetController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

router.post('/upload', authenticateToken, authorizeRole('Admin'), assetController.upload.single('image'), assetController.uploadImage);
router.post('/register', authenticateToken, authorizeRole('Admin'), assetController.registerAsset);
router.post('/issue', authenticateToken, authorizeRole('Admin'), assetController.issueAsset);
router.post('/return', authenticateToken, authorizeRole('Admin'), assetController.returnAsset);
router.get('/', authenticateToken, assetController.getAssets);
router.get('/:id', authenticateToken, assetController.getAssetById);

module.exports = router;
