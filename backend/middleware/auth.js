const jwt = require('jsonwebtoken');
const { pool } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Verify JWT token
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user details with role
    const [users] = await pool.query(
      `SELECT u.*, r.name as role_name 
       FROM users u 
       JOIN roles r ON u.role_id = r.id 
       WHERE u.id = ? AND u.is_active = TRUE`,
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid token or user not found' });
    }

    req.user = users[0];
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Role-based authorization middleware
function authorizeRole(...allowedRoles) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = req.user.role_name;
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

// Check if user can approve at specific level
async function canApproveAtLevel(req, res, next) {
  const { billId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role_name;

  try {
    const [bills] = await pool.query(
      `SELECT b.*, 
              (SELECT COUNT(*) FROM bill_approvals ba WHERE ba.bill_id = b.id AND ba.status = 'Approved') as approved_levels
       FROM bills b 
       WHERE b.id = ?`,
      [billId]
    );

    if (bills.length === 0) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const bill = bills[0];
    const nextLevel = parseInt(bill.approved_levels) + 1;

    // Get workflow rules for this amount
    const [rules] = await pool.query(
      `SELECT wr.*, r.name as role_name 
       FROM workflow_rules wr 
       JOIN roles r ON wr.role_id = r.id 
       WHERE wr.min_amount <= ? AND (wr.max_amount IS NULL OR wr.max_amount >= ?)
       ORDER BY wr.approval_level ASC`,
      [bill.total_amount, bill.total_amount]
    );

    // Check if user's role matches the required role for next level
    const requiredRule = rules.find(r => r.approval_level === nextLevel);
    
    if (!requiredRule || requiredRule.role_name !== userRole) {
      return res.status(403).json({ error: 'You are not authorized to approve at this level' });
    }

    req.bill = bill;
    req.nextLevel = nextLevel;
    next();
  } catch (error) {
    console.error('Authorization error:', error);
    return res.status(500).json({ error: 'Authorization check failed' });
  }
}

module.exports = {
  authenticateToken,
  authorizeRole,
  canApproveAtLevel
};
