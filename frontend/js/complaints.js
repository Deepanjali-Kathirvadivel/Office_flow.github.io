// API_BASE_URL is defined in auth.js

// Check authentication
if (!checkAuth()) {
    window.location.href = '/login.html';
}

// Display user info
const user = getCurrentUser();
if (user) {
    document.getElementById('userName').textContent = `${user.full_name} (${user.role})`;
}

let attachmentPath = null;

// File upload handler
document.getElementById('attachmentFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        try {
            const formData = new FormData();
            formData.append('attachment', file);

            const response = await fetch(`${API_BASE_URL}/complaints/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getAuthToken()}`
                },
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                attachmentPath = data.attachmentPath;
                const preview = document.getElementById('attachmentPreview');
                preview.innerHTML = `<p>File uploaded: ${file.name}</p>`;
            } else {
                alert('Upload failed: ' + data.error);
            }
        } catch (error) {
            alert('Upload error: ' + error.message);
        }
    }
});

// Submit complaint form
document.getElementById('complaintForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const complaintData = {
        category: document.getElementById('category').value,
        priority: document.getElementById('priority').value,
        description: document.getElementById('description').value,
        attachment_path: attachmentPath
    };

    try {
        const response = await fetch(`${API_BASE_URL}/complaints`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(complaintData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to submit complaint');
        }

        alert(`Complaint submitted successfully! Ticket: ${data.ticketNumber}`);
        e.target.reset();
        document.getElementById('attachmentPreview').innerHTML = '';
        attachmentPath = null;
        loadComplaints();
    } catch (error) {
        const messageDiv = document.getElementById('complaintMessage');
        messageDiv.textContent = error.message;
        messageDiv.classList.add('show');
    }
});

// Load complaints
async function loadComplaints() {
    try {
        const response = await fetch(`${API_BASE_URL}/complaints`, {
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load complaints');
        }

        const tbody = document.getElementById('complaintsTableBody');
        tbody.innerHTML = '';

        if (data.complaints.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading">No complaints found</td></tr>';
            return;
        }

        data.complaints.forEach(complaint => {
            const row = document.createElement('tr');
            const statusClass = `badge-${complaint.status.toLowerCase().replace(' ', '-')}`;
            const priorityClass = complaint.priority === 'Critical' ? 'badge-danger' :
                complaint.priority === 'High' ? 'badge-warning' : 'badge-pending';
            row.innerHTML = `
                <td>${complaint.ticket_number}</td>
                <td>${complaint.category}</td>
                <td><span class="badge ${priorityClass}">${complaint.priority}</span></td>
                <td><span class="badge ${statusClass}">${complaint.status}</span></td>
                <td>${complaint.assigned_to_name || 'Unassigned'}</td>
                <td>${new Date(complaint.created_at).toLocaleDateString()}</td>
                <td><a href="complaint-detail.html?id=${complaint.id}">View</a></td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Load complaints error:', error);
        document.getElementById('complaintsTableBody').innerHTML =
            '<tr><td colspan="7" class="loading">Error loading complaints</td></tr>';
    }
}

// Load complaints on page load
loadComplaints();
