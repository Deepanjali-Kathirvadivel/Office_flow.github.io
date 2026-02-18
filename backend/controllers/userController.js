const { pool } = require('../db');

// Get all users (for dropdowns)
async function getUsers(req, res) {
  try {
    const { role } = req.query;
    let query = `
      SELECT u.id, u.username, u.full_name, u.email, r.name as role_name 
      FROM users u 
      JOIN roles r ON u.role_id = r.id 
      WHERE u.is_active = TRUE
    `;
    const params = [];

    if (role) {
      query += ' AND r.name = ?';
      params.push(role);
    }

    query += ' ORDER BY u.full_name';

    const [users] = await pool.query(query, params);
    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
}

module.exports = {
  getUsers
};
