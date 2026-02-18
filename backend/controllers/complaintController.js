const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { pool } = require('../db');

// Configure multer for complaint attachments
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/complaints');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'complaint-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedExt = /\.(jpeg|jpg|png|pdf|doc|docx)$/i;
    const extname = allowedExt.test(path.extname(file.originalname).toLowerCase());
    
    // MIME types vary across browsers for docs; extension validation is the primary gate here.
    if (extname) {
      return cb(null, true);
    }
    cb(new Error('Invalid file type'));
  }
});

// Auto-assign complaint based on category
async function autoAssignComplaint(category) {
  const categoryToRole = {
    IT: 'IT Team',
    Maintenance: 'Facilities',
    HR: 'HR Team',
    Security: 'Security Team'
  };

  const roleName = categoryToRole[category];
  if (!roleName) return null;

  // Get a user from the mapped role
  const [users] = await pool.query(
    `SELECT u.id FROM users u 
     JOIN roles r ON u.role_id = r.id 
     WHERE r.name = ? AND u.is_active = TRUE 
     LIMIT 1`,
    [roleName]
  );

  return users.length > 0 ? users[0].id : null;
}

// Generate ticket number
function generateTicketNumber() {
  const prefix = 'TKT';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${timestamp}-${random}`;
}

// Submit complaint
async function submitComplaint(req, res) {
  try {
    const { category, priority, description, attachment_path } = req.body;

    if (!category || !priority || !description) {
      return res.status(400).json({ error: 'Category, priority, and description required' });
    }

    const ticketNumber = generateTicketNumber();
    const assignedTo = await autoAssignComplaint(category);

    const [result] = await pool.query(
      `INSERT INTO complaints 
       (ticket_number, category, priority, description, attachment_path, submitted_by, assigned_to, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Open')`,
      [ticketNumber, category, priority, description, attachment_path, req.user.id, assignedTo]
    );

    // Create assignment record if auto-assigned
    if (assignedTo) {
      await pool.query(
        `INSERT INTO complaint_assignments (complaint_id, assigned_to, assigned_by) 
         VALUES (?, ?, ?)`,
        [result.insertId, assignedTo, req.user.id]
      );
    }

    // Log history
    await pool.query(
      `INSERT INTO complaint_history (complaint_id, action, performed_by, new_status) 
       VALUES (?, ?, ?, ?)`,
      [result.insertId, 'CREATED', req.user.id, 'Open']
    );

    // Log audit
    await pool.query(
      'INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, 'SUBMIT_COMPLAINT', 'COMPLAINT', result.insertId, JSON.stringify({ ticket_number: ticketNumber, category })]
    );

    res.status(201).json({ message: 'Complaint submitted successfully', complaintId: result.insertId, ticketNumber });
  } catch (error) {
    console.error('Submit complaint error:', error);
    res.status(500).json({ error: 'Failed to submit complaint' });
  }
}

// Get all complaints
async function getComplaints(req, res) {
  try {
    const { status, category, priority } = req.query;
    let query = `
      SELECT c.*, 
             u1.full_name as submitted_by_name,
             u2.full_name as assigned_to_name
      FROM complaints c
      JOIN users u1 ON c.submitted_by = u1.id
      LEFT JOIN users u2 ON c.assigned_to = u2.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND c.status = ?';
      params.push(status);
    }

    if (category) {
      query += ' AND c.category = ?';
      params.push(category);
    }

    if (priority) {
      query += ' AND c.priority = ?';
      params.push(priority);
    }

    // Filter by user role
    if (req.user.role_name === 'Employee') {
      query += ' AND c.submitted_by = ?';
      params.push(req.user.id);
    } else if (['IT Team', 'Facilities', 'HR Team', 'Security Team'].includes(req.user.role_name)) {
      query += ' AND c.assigned_to = ?';
      params.push(req.user.id);
    }

    query += ' ORDER BY c.created_at DESC';

    const [complaints] = await pool.query(query, params);
    res.json({ complaints });
  } catch (error) {
    console.error('Get complaints error:', error);
    res.status(500).json({ error: 'Failed to get complaints' });
  }
}

// Get complaint by ID
async function getComplaintById(req, res) {
  try {
    const { id } = req.params;

    const [complaints] = await pool.query(
      `SELECT c.*, 
              u1.full_name as submitted_by_name,
              u1.email as submitted_by_email,
              u2.full_name as assigned_to_name,
              u2.email as assigned_to_email
       FROM complaints c
       JOIN users u1 ON c.submitted_by = u1.id
       LEFT JOIN users u2 ON c.assigned_to = u2.id
       WHERE c.id = ?`,
      [id]
    );

    if (complaints.length === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const [history] = await pool.query(
      `SELECT ch.*, u.full_name as performed_by_name
       FROM complaint_history ch
       LEFT JOIN users u ON ch.performed_by = u.id
       WHERE ch.complaint_id = ?
       ORDER BY ch.created_at ASC`,
      [id]
    );

    const [assignments] = await pool.query(
      `SELECT ca.*, u.full_name as assigned_to_name, u2.full_name as assigned_by_name
       FROM complaint_assignments ca
       JOIN users u ON ca.assigned_to = u.id
       JOIN users u2 ON ca.assigned_by = u2.id
       WHERE ca.complaint_id = ?
       ORDER BY ca.assigned_at DESC`,
      [id]
    );

    res.json({
      complaint: complaints[0],
      history,
      assignments
    });
  } catch (error) {
    console.error('Get complaint error:', error);
    res.status(500).json({ error: 'Failed to get complaint' });
  }
}

// Update complaint status
async function updateComplaintStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, comments, resolution_note } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status required' });
    }

    if (!['Open', 'In Progress', 'Closed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Check if user can update this complaint
    const [complaints] = await pool.query(
      'SELECT * FROM complaints WHERE id = ?',
      [id]
    );

    if (complaints.length === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const complaint = complaints[0];

    // Check authorization
    if (complaint.assigned_to !== req.user.id && complaint.submitted_by !== req.user.id && req.user.role_name !== 'Admin') {
      return res.status(403).json({ error: 'Not authorized to update this complaint' });
    }

    // Require resolution note for closing
    if (status === 'Closed' && !resolution_note) {
      return res.status(400).json({ error: 'Resolution note required when closing complaint' });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      const oldStatus = complaint.status;

      // Update complaint
      await connection.query(
        `UPDATE complaints 
         SET status = ?, resolution_note = ?, closed_at = ${status === 'Closed' ? 'NOW()' : 'NULL'}
         WHERE id = ?`,
        [status, resolution_note || complaint.resolution_note, id]
      );

      // Log history
      await connection.query(
        `INSERT INTO complaint_history 
         (complaint_id, action, performed_by, old_status, new_status, comments) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, 'STATUS_UPDATE', req.user.id, oldStatus, status, comments]
      );

      await connection.commit();

      // Log audit
      await pool.query(
        'INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, 'UPDATE_COMPLAINT', 'COMPLAINT', id, JSON.stringify({ oldStatus, newStatus: status })]
      );

      res.json({ message: 'Complaint status updated successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Update complaint error:', error);
    res.status(500).json({ error: 'Failed to update complaint' });
  }
}

// Upload attachment
async function uploadAttachment(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    res.json({
      attachmentPath: req.file.filename,
      message: 'Attachment uploaded successfully'
    });
  } catch (error) {
    console.error('Attachment upload error:', error);
    res.status(500).json({ error: 'Failed to upload attachment' });
  }
}

module.exports = {
  submitComplaint,
  getComplaints,
  getComplaintById,
  updateComplaintStatus,
  uploadAttachment,
  upload
};
