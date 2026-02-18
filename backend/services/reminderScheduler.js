const { pool } = require('../db');
const emailService = require('./emailService');

// Check for unacknowledged couriers > 24 hours
async function checkUnacknowledgedCouriers() {
  try {
    const [couriers] = await pool.query(
      `SELECT c.* 
       FROM couriers c 
       LEFT JOIN courier_acknowledgements ca ON c.id = ca.courier_id 
       WHERE ca.id IS NULL 
       AND c.created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`
    );

    for (const courier of couriers) {
      await emailService.sendCourierReminder(courier.id);
    }
  } catch (error) {
    console.error('Unacknowledged couriers check error:', error);
  }
}

// Check for overdue assets
async function checkOverdueAssets() {
  try {
    const [transactions] = await pool.query(
      `SELECT at.* 
       FROM asset_transactions at 
       WHERE at.status = 'Issued' 
       AND at.due_date < CURDATE() 
       AND at.return_date IS NULL`
    );

    for (const transaction of transactions) {
      // Update status to Overdue if not already
      await pool.query(
        `UPDATE asset_transactions SET status = 'Overdue' WHERE id = ?`,
        [transaction.id]
      );
      
      await pool.query(
        `UPDATE assets SET current_status = 'Overdue' WHERE id = ?`,
        [transaction.asset_id]
      );

      await emailService.sendAssetOverdueReminder(transaction.id);
    }
  } catch (error) {
    console.error('Overdue assets check error:', error);
  }
}

// Start scheduler - runs daily at midnight
function start() {
  console.log('Reminder scheduler started');
  
  // Run immediately
  checkUnacknowledgedCouriers();
  checkOverdueAssets();
  
  // Then run daily
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const msUntilMidnight = tomorrow.getTime() - now.getTime();
  
  setTimeout(() => {
    checkUnacknowledgedCouriers();
    checkOverdueAssets();
    setInterval(() => {
      checkUnacknowledgedCouriers();
      checkOverdueAssets();
    }, 24 * 60 * 60 * 1000); // Daily
  }, msUntilMidnight);
}

module.exports = {
  start,
  checkUnacknowledgedCouriers,
  checkOverdueAssets
};
