const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { pool } = require('../db');
const emailService = require('../services/emailService');

// Configure multer for asset images
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/assets');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'asset-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files (jpeg, jpg, png) are allowed'));
  }
});

// Register asset
async function registerAsset(req, res) {
  try {
    const { asset_id, name, category, description, department, image_path } = req.body;

    if (!asset_id || !name || !department) {
      return res.status(400).json({ error: 'Asset ID, name, and department required' });
    }

    // Check if asset ID already exists
    const [existing] = await pool.query(
      'SELECT id FROM assets WHERE asset_id = ?',
      [asset_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Asset ID already exists' });
    }

    const [result] = await pool.query(
      `INSERT INTO assets (asset_id, name, category, description, department, image_path) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [asset_id, name, category, description, department, image_path]
    );

    // Log history
    await pool.query(
      `INSERT INTO asset_history (asset_id, action, performed_by, details) 
       VALUES (?, ?, ?, ?)`,
      [result.insertId, 'REGISTERED', req.user.id, JSON.stringify({ asset_id, name })]
    );

    // Log audit
    await pool.query(
      'INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, 'REGISTER_ASSET', 'ASSET', result.insertId, JSON.stringify({ asset_id })]
    );

    res.status(201).json({ message: 'Asset registered successfully', assetId: result.insertId });
  } catch (error) {
    console.error('Register asset error:', error);
    res.status(500).json({ error: 'Failed to register asset' });
  }
}

// Issue asset
async function issueAsset(req, res) {
  try {
    const { asset_id, employee_id, due_date, signature_data, condition_on_issue } = req.body;

    if (!asset_id || !employee_id || !due_date) {
      return res.status(400).json({ error: 'Asset ID, employee, and due date required' });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Get asset
      const [assets] = await connection.query(
        'SELECT * FROM assets WHERE id = ?',
        [asset_id]
      );

      if (assets.length === 0) {
        return res.status(404).json({ error: 'Asset not found' });
      }

      const asset = assets[0];

      if (asset.current_status !== 'Available') {
        return res.status(400).json({ error: 'Asset is not available' });
      }

      // Create transaction
      const [result] = await connection.query(
        `INSERT INTO asset_transactions 
         (asset_id, employee_id, issued_by, issue_date, due_date, signature_data, condition_on_issue, status) 
         VALUES (?, ?, ?, CURDATE(), ?, ?, ?, 'Issued')`,
        [asset_id, employee_id, req.user.id, due_date, signature_data, condition_on_issue || 'Good']
      );

      // Update asset status
      await connection.query(
        'UPDATE assets SET current_status = "Issued" WHERE id = ?',
        [asset_id]
      );

      // Log history
      await connection.query(
        `INSERT INTO asset_history (asset_id, transaction_id, action, performed_by, details) 
         VALUES (?, ?, ?, ?, ?)`,
        [asset_id, result.insertId, 'ISSUED', req.user.id, JSON.stringify({ employee_id, due_date })]
      );

      await connection.commit();

      // Log audit
      await pool.query(
        'INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, 'ISSUE_ASSET', 'ASSET_TRANSACTION', result.insertId, JSON.stringify({ asset_id, employee_id })]
      );

      res.status(201).json({ message: 'Asset issued successfully', transactionId: result.insertId });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Issue asset error:', error);
    res.status(500).json({ error: 'Failed to issue asset' });
  }
}

// Return asset
async function returnAsset(req, res) {
  try {
    const { transaction_id, condition_on_return, damage_description, damage_image_path } = req.body;

    if (!transaction_id) {
      return res.status(400).json({ error: 'Transaction ID required' });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Get transaction
      const [transactions] = await connection.query(
        'SELECT * FROM asset_transactions WHERE id = ?',
        [transaction_id]
      );

      if (transactions.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      const transaction = transactions[0];

      if (transaction.status === 'Returned') {
        return res.status(400).json({ error: 'Asset already returned' });
      }

      // Update transaction
      await connection.query(
        `UPDATE asset_transactions 
         SET return_date = CURDATE(), condition_on_return = ?, status = 'Returned' 
         WHERE id = ?`,
        [condition_on_return || 'Good', transaction_id]
      );

      // Update asset status
      await connection.query(
        'UPDATE assets SET current_status = "Available" WHERE id = ?',
        [transaction.asset_id]
      );

      // Create damage report if needed
      if (damage_description) {
        await connection.query(
          `INSERT INTO damage_reports (transaction_id, description, image_path, reported_by) 
           VALUES (?, ?, ?, ?)`,
          [transaction_id, damage_description, damage_image_path, req.user.id]
        );
      }

      // Log history
      await connection.query(
        `INSERT INTO asset_history (asset_id, transaction_id, action, performed_by, details) 
         VALUES (?, ?, ?, ?, ?)`,
        [transaction.asset_id, transaction_id, 'RETURNED', req.user.id, JSON.stringify({ condition_on_return })]
      );

      await connection.commit();

      // Log audit
      await pool.query(
        'INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, 'RETURN_ASSET', 'ASSET_TRANSACTION', transaction_id, JSON.stringify({})]
      );

      res.json({ message: 'Asset returned successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Return asset error:', error);
    res.status(500).json({ error: 'Failed to return asset' });
  }
}

// Get all assets
async function getAssets(req, res) {
  try {
    const { status, department } = req.query;
    let query = `
      SELECT a.*, 
             (SELECT COUNT(*) FROM asset_transactions at WHERE at.asset_id = a.id AND at.status IN ('Issued', 'Overdue')) as active_transactions
      FROM assets a
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND a.current_status = ?';
      params.push(status);
    }

    if (department) {
      query += ' AND a.department = ?';
      params.push(department);
    }

    query += ' ORDER BY a.created_at DESC';

    const [assets] = await pool.query(query, params);
    res.json({ assets });
  } catch (error) {
    console.error('Get assets error:', error);
    res.status(500).json({ error: 'Failed to get assets' });
  }
}

// Get asset by ID
async function getAssetById(req, res) {
  try {
    const { id } = req.params;

    const [assets] = await pool.query(
      'SELECT * FROM assets WHERE id = ?',
      [id]
    );

    if (assets.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const [transactions] = await pool.query(
      `SELECT at.*, u.full_name as employee_name, u2.full_name as issued_by_name
       FROM asset_transactions at
       JOIN users u ON at.employee_id = u.id
       JOIN users u2 ON at.issued_by = u2.id
       WHERE at.asset_id = ?
       ORDER BY at.created_at DESC`,
      [id]
    );

    const [history] = await pool.query(
      `SELECT ah.*, u.full_name as performed_by_name
       FROM asset_history ah
       LEFT JOIN users u ON ah.performed_by = u.id
       WHERE ah.asset_id = ?
       ORDER BY ah.created_at DESC`,
      [id]
    );

    const [damageReports] = await pool.query(
      `SELECT dr.*, u.full_name as reported_by_name
       FROM damage_reports dr
       JOIN users u ON dr.reported_by = u.id
       JOIN asset_transactions at ON dr.transaction_id = at.id
       WHERE at.asset_id = ?
       ORDER BY dr.reported_at DESC`,
      [id]
    );

    res.json({
      asset: assets[0],
      transactions,
      history,
      damageReports
    });
  } catch (error) {
    console.error('Get asset error:', error);
    res.status(500).json({ error: 'Failed to get asset' });
  }
}

// Upload asset image
async function uploadImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    res.json({
      imagePath: req.file.filename,
      message: 'Image uploaded successfully'
    });
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
}

module.exports = {
  registerAsset,
  issueAsset,
  returnAsset,
  getAssets,
  getAssetById,
  uploadImage,
  upload
};
