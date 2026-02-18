const API_BASE_URL = '/api';

// Check authentication
if (!checkAuth()) {
    window.location.href = '/login.html';
}

// Display user info
const user = getCurrentUser();
if (user) {
    document.getElementById('userName').textContent = `${user.full_name} (${user.role})`;
}

// Load dashboard data
async function loadDashboard() {
    try {
        // Load statistics
        const statsResponse = await fetch(`${API_BASE_URL}/dashboard/stats`, {
            headers: getAuthHeaders()
        });
        const statsData = await statsResponse.json();

        if (statsResponse.ok) {
            document.getElementById('totalBills').textContent = statsData.bills.total || 0;
            document.getElementById('pendingBills').textContent = statsData.bills.pending || 0;
            document.getElementById('totalCouriers').textContent = statsData.couriers.total || 0;
            document.getElementById('delayedPickups').textContent = statsData.couriers.delayed || 0;
            document.getElementById('totalAssets').textContent = statsData.assets.total || 0;
            document.getElementById('overdueAssets').textContent = statsData.assets.overdue || 0;
            document.getElementById('openComplaints').textContent = statsData.complaints.open || 0;
            const avgHours = statsData.complaints.avg_resolution_hours 
                ? Math.round(statsData.complaints.avg_resolution_hours) 
                : 0;
            document.getElementById('avgResolution').textContent = `${avgHours}h`;
        }

        // Load charts
        await loadCharts();
    } catch (error) {
        console.error('Dashboard load error:', error);
    }
}

// Load charts
async function loadCharts() {
    try {
        // Monthly parcel count
        const parcelResponse = await fetch(`${API_BASE_URL}/dashboard/couriers/monthly`, {
            headers: getAuthHeaders()
        });
        const parcelData = await parcelResponse.json();
        if (parcelResponse.ok) {
            drawBarChart('parcelChart', parcelData.data, 'Month', 'Parcels', 'Monthly Parcel Count');
        }

        // Complaints by category
        const categoryResponse = await fetch(`${API_BASE_URL}/dashboard/complaints/category`, {
            headers: getAuthHeaders()
        });
        const categoryData = await categoryResponse.json();
        if (categoryResponse.ok) {
            drawPieChart('complaintsCategoryChart', categoryData.data, 'Complaints by Category');
        }

        // Complaints by priority
        const priorityResponse = await fetch(`${API_BASE_URL}/dashboard/complaints/priority`, {
            headers: getAuthHeaders()
        });
        const priorityData = await priorityResponse.json();
        if (priorityResponse.ok) {
            drawBarChart('complaintsPriorityChart', priorityData.data, 'Priority', 'Count', 'Complaints by Priority');
        }
    } catch (error) {
        console.error('Charts load error:', error);
    }
}

// Draw bar chart
function drawBarChart(canvasId, data, xLabel, yLabel, title) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !data || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = 400;
    const padding = 60;
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Find max value
    const maxValue = Math.max(...data.map(d => d.count || d[yLabel.toLowerCase()] || 0));

    // Draw axes
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Draw bars
    const barWidth = chartWidth / data.length;
    const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    data.forEach((item, index) => {
        const value = item.count || item[yLabel.toLowerCase()] || 0;
        const barHeight = (value / maxValue) * chartHeight;
        const x = padding + index * barWidth + barWidth * 0.1;
        const y = height - padding - barHeight;
        const w = barWidth * 0.8;

        // Draw bar
        ctx.fillStyle = colors[index % colors.length];
        ctx.fillRect(x, y, w, barHeight);

        // Draw label
        ctx.fillStyle = '#1e293b';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        const label = item[xLabel.toLowerCase()] || item.category || item.priority || index + 1;
        ctx.fillText(label, x + w / 2, height - padding + 20);

        // Draw value
        ctx.fillText(value.toString(), x + w / 2, y - 5);
    });

    // Draw title
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, width / 2, 30);
}

// Draw pie chart
function drawPieChart(canvasId, data, title) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !data || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = 400;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 60;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate total
    const total = data.reduce((sum, item) => sum + (item.count || 0), 0);
    if (total === 0) return;

    // Draw pie slices
    let currentAngle = -Math.PI / 2;
    const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

    data.forEach((item, index) => {
        const value = item.count || 0;
        const sliceAngle = (value / total) * 2 * Math.PI;

        // Draw slice
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = colors[index % colors.length];
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw label
        const labelAngle = currentAngle + sliceAngle / 2;
        const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
        const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);
        ctx.fillStyle = '#1e293b';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(item.category || item.priority || `Item ${index + 1}`, labelX, labelY);

        // Draw percentage
        const percent = ((value / total) * 100).toFixed(1);
        ctx.fillText(`${percent}%`, labelX, labelY + 15);

        currentAngle += sliceAngle;
    });

    // Draw title
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, centerX, 30);
}

// Load dashboard on page load
loadDashboard();
