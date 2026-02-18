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

// Get asset ID from URL
const urlParams = new URLSearchParams(window.location.search);
const assetId = urlParams.get('id');

if (!assetId) {
    window.location.href = '/assets.html';
}

let damageImagePath = null;

// Load asset details
async function loadAssetDetail() {
    try {
        const response = await fetch(`${API_BASE_URL}/assets/${assetId}`, {
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load asset');
        }

        displayAssetDetail(data.asset, data.transactions, data.history, data.damageReports);
    } catch (error) {
        console.error('Load asset error:', error);
        document.getElementById('assetDetailCard').innerHTML =
            `<div class="error-message show">Error loading asset: ${error.message}</div>`;
    }
}

// Display asset details
function displayAssetDetail(asset, transactions, history, damageReports) {
    const card = document.getElementById('assetDetailCard');
    const statusClass = `badge-${asset.current_status.toLowerCase()}`;

    card.innerHTML = `
        <div class="card-header">
            <h2>Asset: ${asset.asset_id}</h2>
            <span class="badge ${statusClass}">${asset.current_status}</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-top: 20px;">
            <div>
                <strong>Name:</strong><br>
                ${asset.name}
            </div>
            <div>
                <strong>Category:</strong><br>
                ${asset.category || 'N/A'}
            </div>
            <div>
                <strong>Department:</strong><br>
                ${asset.department}
            </div>
            <div>
                <strong>Status:</strong><br>
                ${asset.current_status}
            </div>
        </div>
        ${asset.description ? `
            <div style="margin-top: 20px;">
                <strong>Description:</strong><br>
                <p style="margin-top: 10px; padding: 15px; background: #f8fafc; border-radius: 6px;">${asset.description}</p>
            </div>
        ` : ''}
        ${asset.image_path ? `
            <div style="margin-top: 20px;">
                <strong>Image:</strong><br>
                <img src="/uploads/assets/${asset.image_path}" alt="Asset image" style="max-width: 100%; margin-top: 10px; border-radius: 8px;">
            </div>
        ` : ''}
    `;

    // Display transactions
    if (transactions && transactions.length > 0) {
        const transactionsCard = document.getElementById('transactionsCard');
        transactionsCard.style.display = 'block';

        const tbody = document.getElementById('transactionsTableBody');
        tbody.innerHTML = '';

        transactions.forEach(transaction => {
            const row = document.createElement('tr');
            const statusClass = `badge-${transaction.status.toLowerCase()}`;
            const canReturn = transaction.status === 'Issued' || transaction.status === 'Overdue';
            row.innerHTML = `
                <td>${transaction.employee_name}</td>
                <td>${transaction.issue_date}</td>
                <td>${transaction.due_date}</td>
                <td>${transaction.return_date || '-'}</td>
                <td><span class="badge ${statusClass}">${transaction.status}</span></td>
                <td>
                    ${canReturn && user.role === 'Admin' ?
                    `<button class="btn btn-primary btn-sm" onclick="showReturnForm(${transaction.id})">Return</button>` :
                    '-'}
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    // Display history
    if (history && history.length > 0) {
        const historyCard = document.getElementById('historyCard');
        historyCard.style.display = 'block';

        const tbody = document.getElementById('historyTableBody');
        tbody.innerHTML = '';

        history.forEach(item => {
            const row = document.createElement('tr');
            const details = item.details ? JSON.parse(item.details) : {};
            row.innerHTML = `
                <td>${new Date(item.created_at).toLocaleString()}</td>
                <td>${item.action}</td>
                <td>${item.performed_by_name || 'System'}</td>
                <td>${JSON.stringify(details)}</td>
            `;
            tbody.appendChild(row);
        });
    }
}

// Show return form
window.showReturnForm = function (transactionId) {
    document.getElementById('returnTransactionId').value = transactionId;
    document.getElementById('returnFormCard').style.display = 'block';
};

// File upload handler for damage image
document.getElementById('damageImageFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        try {
            const formData = new FormData();
            formData.append('image', file);

            const response = await fetch(`${API_BASE_URL}/assets/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getAuthToken()}`
                },
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                damageImagePath = data.imagePath;
                const preview = document.getElementById('damageImagePreview');
                preview.src = `/uploads/assets/${data.imagePath}`;
                preview.style.display = 'block';
            } else {
                alert('Upload failed: ' + data.error);
            }
        } catch (error) {
            alert('Upload error: ' + error.message);
        }
    }
});

// Submit return form
document.getElementById('returnForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const transactionId = document.getElementById('returnTransactionId').value;
    const returnData = {
        transaction_id: parseInt(transactionId),
        condition_on_return: document.getElementById('condition_on_return').value,
        damage_description: document.getElementById('damage_description').value || null,
        damage_image_path: damageImagePath || null
    };

    try {
        const response = await fetch(`${API_BASE_URL}/assets/return`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(returnData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to return asset');
        }

        alert('Asset returned successfully!');
        e.target.reset();
        document.getElementById('damageImagePreview').style.display = 'none';
        damageImagePath = null;
        document.getElementById('returnFormCard').style.display = 'none';
        loadAssetDetail();
    } catch (error) {
        const messageDiv = document.getElementById('returnMessage');
        messageDiv.textContent = error.message;
        messageDiv.classList.add('show');
    }
});

// Load asset detail on page load
loadAssetDetail();
