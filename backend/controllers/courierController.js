const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { pool } = require('../db');
const emailService = require('../services/emailService');

// Configure multer for courier slip uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/couriers');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'courier-' + uniqueSuffix + path.extname(file.originalname));
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

// Create courier entry
async function createCourier(req, res) {
  try {
    const { tracking_number, vendor_id, assigned_to, slip_image_path } = req.body;

    if (!tracking_number || !vendor_id || !assigned_to) {
      return res.status(400).json({ error: 'Tracking number, vendor, and assigned employee required' });
    }

    // Check if tracking number already exists
    const [existing] = await pool.query(
      'SELECT id FROM couriers WHERE tracking_number = ?',
      [tracking_number]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Tracking number already exists' });
    }

    const [result] = await pool.query(
      `INSERT INTO couriers (tracking_number, vendor_id, assigned_to, slip_image_path, created_by) 
       VALUES (?, ?, ?, ?, ?)`,
      [tracking_number, vendor_id, assigned_to, slip_image_path, req.user.id]
    );

    // Log audit
    await pool.query(
      'INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, 'CREATE_COURIER', 'COURIER', result.insertId, JSON.stringify({ tracking_number })]
    );

    res.status(201).json({ message: 'Courier entry created successfully', courierId: result.insertId });
  } catch (error) {
    console.error('Create courier error:', error);
    res.status(500).json({ error: 'Failed to create courier entry' });
  }
}

// Get all couriers
async function getCouriers(req, res) {
  try {
    const { status } = req.query;
    let query = `
      SELECT c.*, 
             cv.name as vendor_name,
             u1.full_name as assigned_to_name,
             u1.email as assigned_to_email,
             u2.full_name as created_by_name,
             ca.id as acknowledgement_id,
             ca.acknowledged_at
      FROM couriers c
      JOIN courier_vendors cv ON c.vendor_id = cv.id
      JOIN users u1 ON c.assigned_to = u1.id
      JOIN users u2 ON c.created_by = u2.id
      LEFT JOIN courier_acknowledgements ca ON c.id = ca.courier_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND c.status = ?';
      params.push(status);
    }

    // Filter by user role
    if (req.user.role_name === 'Employee') {
      query += ' AND c.assigned_to = ?';
      params.push(req.user.id);
    } else if (req.user.role_name === 'Reception') {
      query += ' AND c.created_by = ?';
      params.push(req.user.id);
    }

    query += ' ORDER BY c.created_at DESC';

    const [couriers] = await pool.query(query, params);
    res.json({ couriers });
  } catch (error) {
    console.error('Get couriers error:', error);
    res.status(500).json({ error: 'Failed to get couriers' });
  }
}

// Get courier by ID
async function getCourierById(req, res) {
  try {
    const { id } = req.params;

    const [couriers] = await pool.query(
      `SELECT c.*, 
              cv.name as vendor_name,
              u1.full_name as assigned_to_name,
              u1.email as assigned_to_email,
              u2.full_name as created_by_name
       FROM couriers c
       JOIN courier_vendors cv ON c.vendor_id = cv.id
       JOIN users u1 ON c.assigned_to = u1.id
       JOIN users u2 ON c.created_by = u2.id
       WHERE c.id = ?`,
      [id]
    );

    if (couriers.length === 0) {
      return res.status(404).json({ error: 'Courier not found' });
    }

    const [acknowledgements] = await pool.query(
      `SELECT ca.*, u.full_name as employee_name
       FROM courier_acknowledgements ca
       JOIN users u ON ca.employee_id = u.id
       WHERE ca.courier_id = ?
       ORDER BY ca.acknowledged_at DESC`,
      [id]
    );

    res.json({
      courier: couriers[0],
      acknowledgements
    });
  } catch (error) {
    console.error('Get courier error:', error);
    res.status(500).json({ error: 'Failed to get courier' });
  }
}

// Acknowledge courier
async function acknowledgeCourier(req, res) {
  try {
    const { id } = req.params;
    const { signature_data } = req.body;

    if (!signature_data) {
      return res.status(400).json({ error: 'Signature required' });
    }

    // Check if courier exists and is assigned to user
    const [couriers] = await pool.query(
      'SELECT * FROM couriers WHERE id = ? AND assigned_to = ?',
      [id, req.user.id]
    );

    if (couriers.length === 0) {
      return res.status(404).json({ error: 'Courier not found or not assigned to you' });
    }

    // Check if already acknowledged
    const [existing] = await pool.query(
      'SELECT id FROM courier_acknowledgements WHERE courier_id = ? AND employee_id = ?',
      [id, req.user.id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Courier already acknowledged' });
    }

    // Create acknowledgement
    await pool.query(
      `INSERT INTO courier_acknowledgements (courier_id, employee_id, signature_data) 
       VALUES (?, ?, ?)`,
      [id, req.user.id, signature_data]
    );

    // Update courier status
    await pool.query(
      'UPDATE couriers SET status = "Collected", received_at = NOW() WHERE id = ?',
      [id]
    );

    // Log audit
    await pool.query(
      'INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, 'ACKNOWLEDGE_COURIER', 'COURIER', id, JSON.stringify({})]
    );

    res.json({ message: 'Courier acknowledged successfully' });
  } catch (error) {
    console.error('Acknowledge courier error:', error);
    res.status(500).json({ error: 'Failed to acknowledge courier' });
  }
}

// Get courier vendors
async function getVendors(req, res) {
  try {
    const [vendors] = await pool.query(
      'SELECT * FROM courier_vendors WHERE is_active = TRUE ORDER BY name'
    );
    res.json({ vendors });
  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({ error: 'Failed to get vendors' });
  }
}

// Upload courier slip
async function uploadSlip(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    res.json({
      imagePath: req.file.filename,
      message: 'Slip uploaded successfully'
    });
  } catch (error) {
    console.error('Slip upload error:', error);
    res.status(500).json({ error: 'Failed to upload slip' });
  }
}

module.exports = {
  createCourier,
  getCouriers,
  getCourierById,
  acknowledgeCourier,
  getVendors,
  uploadSlip,
  upload
};
