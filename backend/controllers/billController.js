const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { pool } = require('../db');
const ocrService = require('../services/ocrService');
const emailService = require('../services/emailService');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/bills');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'bill-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test((file.mimetype || '').toLowerCase());
    
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files (jpeg, jpg, png) are allowed'));
  }
});

// Upload bill image and process OCR
async function uploadBillImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const imagePath = req.file.path;
    const result = await ocrService.processBillImage(imagePath);

    res.json({
      imagePath: req.file.filename,
      ocrText: result.ocrText,
      parsedData: result.parsedData
    });
  } catch (error) {
    console.error('Bill upload error:', error);
    res.status(500).json({ error: 'Failed to process bill image' });
  }
}

// Create bill
async function createBill(req, res) {
  try {
    const {
      bill_number,
      vendor_name,
      vendor_gst,
      bill_date,
      amount,
      gst_amount,
      total_amount,
      image_path,
      ocr_text
    } = req.body;

    if (!vendor_name || !bill_date || !total_amount) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Insert bill
      const [billResult] = await connection.query(
        `INSERT INTO bills 
         (bill_number, vendor_name, vendor_gst, bill_date, amount, gst_amount, total_amount, 
          uploaded_by, image_path, ocr_text, final_status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft')`,
        [
          bill_number,
          vendor_name,
          vendor_gst,
          bill_date,
          amount || 0,
          gst_amount || 0,
          total_amount,
          req.user.id,
          image_path,
          ocr_text
        ]
      );

      const billId = billResult.insertId;

      // Determine approval workflow based on amount
      const [rules] = await connection.query(
        `SELECT wr.*, r.name as role_name 
         FROM workflow_rules wr 
         JOIN roles r ON wr.role_id = r.id 
         WHERE wr.min_amount <= ? AND (wr.max_amount IS NULL OR wr.max_amount >= ?)
         ORDER BY wr.approval_level ASC`,
        [total_amount, total_amount]
      );

      // Create approval records
      for (const rule of rules) {
        // Find users with this role
        const [approvers] = await connection.query(
          'SELECT id FROM users WHERE role_id = ? AND is_active = TRUE LIMIT 1',
          [rule.role_id]
        );

        if (approvers.length > 0) {
          await connection.query(
            `INSERT INTO bill_approvals (bill_id, approver_id, approval_level, status) 
             VALUES (?, ?, ?, 'Pending')`,
            [billId, approvers[0].id, rule.approval_level]
          );
        }
      }

      // Update bill status
      if (rules.length > 0) {
        await connection.query(
          `UPDATE bills SET final_status = 'Pending', current_approval_level = 1 WHERE id = ?`,
          [billId]
        );

        // Send notification to first approver
        const [firstApproval] = await connection.query(
          `SELECT approver_id FROM bill_approvals WHERE bill_id = ? ORDER BY approval_level ASC LIMIT 1`,
          [billId]
        );

        if (firstApproval.length > 0) {
          await emailService.sendBillApprovalNotification(billId, firstApproval[0].approver_id, 'assigned');
        }
      }

      await connection.commit();

      // Log audit
      await pool.query(
        'INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, 'CREATE_BILL', 'BILL', billId, JSON.stringify({ bill_number, total_amount })]
      );

      res.status(201).json({ message: 'Bill created successfully', billId });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Create bill error:', error);
    res.status(500).json({ error: 'Failed to create bill' });
  }
}

// Get all bills
async function getBills(req, res) {
  try {
    const { status, role } = req.query;
    let query = `
      SELECT b.*, u.full_name as uploaded_by_name, 
             (SELECT COUNT(*) FROM bill_approvals ba WHERE ba.bill_id = b.id AND ba.status = 'Approved') as approved_levels
      FROM bills b
      JOIN users u ON b.uploaded_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND b.final_status = ?';
      params.push(status);
    }

    // Filter by user role
    if (role === 'Employee') {
      query += ' AND b.uploaded_by = ?';
      params.push(req.user.id);
    }

    query += ' ORDER BY b.created_at DESC';

    const [bills] = await pool.query(query, params);
    res.json({ bills });
  } catch (error) {
    console.error('Get bills error:', error);
    res.status(500).json({ error: 'Failed to get bills' });
  }
}

// Get bill by ID
async function getBillById(req, res) {
  try {
    const { id } = req.params;

    const [bills] = await pool.query(
      `SELECT b.*, u.full_name as uploaded_by_name, u.email as uploaded_by_email
       FROM bills b
       JOIN users u ON b.uploaded_by = u.id
       WHERE b.id = ?`,
      [id]
    );

    if (bills.length === 0) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const [approvals] = await pool.query(
      `SELECT ba.*, u.full_name as approver_name, r.name as approver_role
       FROM bill_approvals ba
       JOIN users u ON ba.approver_id = u.id
       JOIN roles r ON u.role_id = r.id
       WHERE ba.bill_id = ?
       ORDER BY ba.approval_level ASC`,
      [id]
    );

    res.json({
      bill: bills[0],
      approvals
    });
  } catch (error) {
    console.error('Get bill error:', error);
    res.status(500).json({ error: 'Failed to get bill' });
  }
}

// Approve/Reject bill
async function approveBill(req, res) {
  try {
    const { id } = req.params;
    const { action, comments } = req.body; // action: 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Get bill and current approval status
      const [bills] = await connection.query(
        `SELECT b.*, 
                (SELECT COUNT(*) FROM bill_approvals ba WHERE ba.bill_id = b.id AND ba.status = 'Approved') as approved_levels
         FROM bills b 
         WHERE b.id = ?`,
        [id]
      );

      if (bills.length === 0) {
        return res.status(404).json({ error: 'Bill not found' });
      }

      const bill = bills[0];
      const currentLevel = parseInt(bill.approved_levels) + 1;

      // Get approval record for current level
      const [approvals] = await connection.query(
        `SELECT * FROM bill_approvals 
         WHERE bill_id = ? AND approval_level = ? AND approver_id = ?`,
        [id, currentLevel, req.user.id]
      );

      if (approvals.length === 0) {
        return res.status(403).json({ error: 'You are not authorized to approve this bill' });
      }

      const approval = approvals[0];

      if (approval.status !== 'Pending') {
        return res.status(400).json({ error: 'Bill already processed at this level' });
      }

      // Update approval record
      const newStatus = action === 'approve' ? 'Approved' : 'Rejected';
      await connection.query(
        `UPDATE bill_approvals 
         SET status = ?, comments = ?, approved_at = NOW() 
         WHERE id = ?`,
        [newStatus, comments, approval.id]
      );

      if (action === 'reject') {
        // Reject the entire bill
        await connection.query(
          `UPDATE bills SET final_status = 'Rejected' WHERE id = ?`,
          [id]
        );

        await emailService.sendBillApprovalNotification(id, req.user.id, 'rejected');
      } else {
        // Check if this was the last approval level
        const [allRules] = await connection.query(
          `SELECT COUNT(*) as total_levels 
           FROM workflow_rules 
           WHERE min_amount <= ? AND (max_amount IS NULL OR max_amount >= ?)`,
          [bill.total_amount, bill.total_amount]
        );

        const totalLevels = allRules[0].total_levels;

        if (currentLevel >= totalLevels) {
          // All approvals complete
          await connection.query(
            `UPDATE bills SET final_status = 'Approved' WHERE id = ?`,
            [id]
          );
          await emailService.sendBillApprovalNotification(id, req.user.id, 'approved');
        } else {
          // Notify next approver
          const [nextApproval] = await connection.query(
            `SELECT approver_id FROM bill_approvals 
             WHERE bill_id = ? AND approval_level = ? AND status = 'Pending' 
             ORDER BY approval_level ASC LIMIT 1`,
            [id, currentLevel + 1]
          );

          if (nextApproval.length > 0) {
            await connection.query(
              `UPDATE bills SET current_approval_level = ? WHERE id = ?`,
              [currentLevel + 1, id]
            );
            await emailService.sendBillApprovalNotification(id, nextApproval[0].approver_id, 'assigned');
          }
        }
      }

      await connection.commit();

      // Log audit
      await pool.query(
        'INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, action.toUpperCase() + '_BILL', 'BILL', id, JSON.stringify({ comments })]
      );

      res.json({ message: `Bill ${action}d successfully` });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Approve bill error:', error);
    res.status(500).json({ error: 'Failed to process approval' });
  }
}

module.exports = {
  uploadBillImage,
  createBill,
  getBills,
  getBillById,
  approveBill,
  upload
};
