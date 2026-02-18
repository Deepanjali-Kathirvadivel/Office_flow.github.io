const { pool } = require('../db');

// Get dashboard statistics
async function getDashboardStats(req, res) {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = startDate && endDate ?
      `AND created_at BETWEEN ? AND ?` : '';

    const params = startDate && endDate ? [startDate, endDate] : [];

    // Bills statistics
    const [billStats] = await pool.query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN final_status = 'Pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN final_status = 'Approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN final_status = 'Rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN final_status = 'Approved' THEN total_amount ELSE 0 END) as total_approved_amount
       FROM bills 
       WHERE 1=1 ${dateFilter}`,
      params
    );

    // Couriers statistics
    const [courierStats] = await pool.query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Pending Pickup' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'Collected' THEN 1 ELSE 0 END) as collected,
        SUM(CASE WHEN created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR) AND id NOT IN (SELECT courier_id FROM courier_acknowledgements) THEN 1 ELSE 0 END) as delayed_count
       FROM couriers 
       WHERE 1=1 ${dateFilter}`,
      params
    );

    // Assets statistics
    const [assetStats] = await pool.query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN current_status = 'Available' THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN current_status = 'Issued' THEN 1 ELSE 0 END) as issued,
        SUM(CASE WHEN current_status = 'Overdue' THEN 1 ELSE 0 END) as overdue
       FROM assets 
       WHERE 1=1 ${dateFilter}`,
      params
    );

    // Complaints statistics
    const [complaintStats] = await pool.query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Open' THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END) as closed,
        AVG(CASE WHEN status = 'Closed' AND closed_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, created_at, closed_at) ELSE NULL END) as avg_resolution_hours
       FROM complaints 
       WHERE 1=1 ${dateFilter}`,
      params
    );

    res.json({
      bills: billStats[0],
      couriers: courierStats[0],
      assets: assetStats[0],
      complaints: complaintStats[0]
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to get dashboard statistics' });
  }
}

// Get complaints by category
async function getComplaintsByCategory(req, res) {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = startDate && endDate ?
      `AND created_at BETWEEN ? AND ?` : '';

    const params = startDate && endDate ? [startDate, endDate] : [];

    const [results] = await pool.query(
      `SELECT category, COUNT(*) as count 
       FROM complaints 
       WHERE 1=1 ${dateFilter}
       GROUP BY category 
       ORDER BY count DESC`,
      params
    );

    res.json({ data: results });
  } catch (error) {
    console.error('Get complaints by category error:', error);
    res.status(500).json({ error: 'Failed to get complaints by category' });
  }
}

// Get complaints by priority
async function getComplaintsByPriority(req, res) {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = startDate && endDate ?
      `AND created_at BETWEEN ? AND ?` : '';

    const params = startDate && endDate ? [startDate, endDate] : [];

    const [results] = await pool.query(
      `SELECT priority, COUNT(*) as count 
       FROM complaints 
       WHERE 1=1 ${dateFilter}
       GROUP BY priority 
       ORDER BY FIELD(priority, 'Critical', 'High', 'Medium', 'Low')`,
      params
    );

    res.json({ data: results });
  } catch (error) {
    console.error('Get complaints by priority error:', error);
    res.status(500).json({ error: 'Failed to get complaints by priority' });
  }
}

// Get monthly parcel count
async function getMonthlyParcelCount(req, res) {
  try {
    const { year } = req.query;
    const yearFilter = year ? `AND YEAR(created_at) = ?` : '';

    const params = year ? [year] : [];

    const [results] = await pool.query(
      `SELECT 
        MONTH(created_at) as month,
        COUNT(*) as count 
       FROM couriers 
       WHERE 1=1 ${yearFilter}
       GROUP BY MONTH(created_at) 
       ORDER BY month`,
      params
    );

    res.json({ data: results });
  } catch (error) {
    console.error('Get monthly parcel count error:', error);
    res.status(500).json({ error: 'Failed to get monthly parcel count' });
  }
}

// Get vendor performance
async function getVendorPerformance(req, res) {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = startDate && endDate ?
      `AND c.created_at BETWEEN ? AND ?` : '';

    const params = startDate && endDate ? [startDate, endDate] : [];

    const [results] = await pool.query(
      `SELECT 
        cv.name as vendor_name,
        COUNT(c.id) as total_parcels,
        SUM(CASE WHEN c.status = 'Collected' THEN 1 ELSE 0 END) as collected_count,
        SUM(CASE WHEN c.created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR) AND c.id NOT IN (SELECT courier_id FROM courier_acknowledgements) THEN 1 ELSE 0 END) as delayed_count
       FROM couriers c
       JOIN courier_vendors cv ON c.vendor_id = cv.id
       WHERE 1=1 ${dateFilter}
       GROUP BY cv.id, cv.name
       ORDER BY total_parcels DESC`,
      params
    );

    res.json({ data: results });
  } catch (error) {
    console.error('Get vendor performance error:', error);
    res.status(500).json({ error: 'Failed to get vendor performance' });
  }
}

module.exports = {
  getDashboardStats,
  getComplaintsByCategory,
  getComplaintsByPriority,
  getMonthlyParcelCount,
  getVendorPerformance
};
