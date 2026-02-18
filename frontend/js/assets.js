// API_BASE_URL is defined in auth.js

// Check authentication
if (!checkAuth()) {
    window.location.href = '/login.html';
}

// Display user info
const user = getCurrentUser();
if (user) {
    document.getElementById('userName').textContent = `${user.full_name} (${user.role})`;

    // Show admin buttons
    if (user.role === 'Admin') {
        document.getElementById('newAssetBtn').style.display = 'inline-flex';
        document.getElementById('issueAssetBtn').style.display = 'inline-flex';
        document.getElementById('assetFormCard').style.display = 'block';
    }
}

let assetImagePath = null;
let issueSignatureData = null;

// Initialize signature canvas for issue form
const issueCanvas = document.getElementById('issueSignatureCanvas');
const issueCtx = issueCanvas.getContext('2d');
let isDrawing = false;

issueCanvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    const rect = issueCanvas.getBoundingClientRect();
    issueCtx.beginPath();
    issueCtx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
});

issueCanvas.addEventListener('mousemove', (e) => {
    if (isDrawing) {
        const rect = issueCanvas.getBoundingClientRect();
        issueCtx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
        issueCtx.stroke();
    }
});

issueCanvas.addEventListener('mouseup', () => {
    isDrawing = false;
    issueSignatureData = issueCanvas.toDataURL();
});

window.clearIssueSignature = () => {
    issueCtx.clearRect(0, 0, issueCanvas.width, issueCanvas.height);
    issueSignatureData = null;
};

// File upload handler
document.getElementById('assetImageFile').addEventListener('change', async (e) => {
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
                assetImagePath = data.imagePath;
                const preview = document.getElementById('assetImagePreview');
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

// New asset button
document.getElementById('newAssetBtn')?.addEventListener('click', () => {
    document.getElementById('assetFormCard').style.display = 'block';
});

// Issue asset button
document.getElementById('issueAssetBtn')?.addEventListener('click', () => {
    document.getElementById('issueFormCard').style.display = 'block';
    loadAvailableAssets();
});

// Submit asset form
document.getElementById('assetForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const assetData = {
        asset_id: document.getElementById('asset_id').value,
        name: document.getElementById('asset_name').value,
        category: document.getElementById('asset_category').value,
        description: document.getElementById('asset_description').value,
        department: document.getElementById('asset_department').value,
        image_path: assetImagePath
    };

    try {
        const response = await fetch(`${API_BASE_URL}/assets/register`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(assetData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to register asset');
        }

        alert('Asset registered successfully!');
        e.target.reset();
        document.getElementById('assetImagePreview').style.display = 'none';
        assetImagePath = null;
        loadAssets();
    } catch (error) {
        const messageDiv = document.getElementById('assetMessage');
        messageDiv.textContent = error.message;
        messageDiv.classList.add('show');
    }
});

// Submit issue form
document.getElementById('issueForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!issueSignatureData) {
        alert('Please provide employee signature');
        return;
    }

    const issueData = {
        asset_id: parseInt(document.getElementById('issue_asset_id').value),
        employee_id: parseInt(document.getElementById('issue_employee_id').value),
        due_date: document.getElementById('due_date').value,
        condition_on_issue: document.getElementById('condition_on_issue').value,
        signature_data: issueSignatureData
    };

    try {
        const response = await fetch(`${API_BASE_URL}/assets/issue`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(issueData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to issue asset');
        }

        alert('Asset issued successfully!');
        e.target.reset();
        clearIssueSignature();
        document.getElementById('issueFormCard').style.display = 'none';
        loadAssets();
    } catch (error) {
        const messageDiv = document.getElementById('issueMessage');
        messageDiv.textContent = error.message;
        messageDiv.classList.add('show');
    }
});

// Load available assets for issue
async function loadAvailableAssets() {
    try {
        const response = await fetch(`${API_BASE_URL}/assets?status=Available`, {
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (response.ok) {
            const select = document.getElementById('issue_asset_id');
            select.innerHTML = '<option value="">Select asset</option>';
            data.assets.forEach(asset => {
                const option = document.createElement('option');
                option.value = asset.id;
                option.textContent = `${asset.asset_id} - ${asset.name}`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Load available assets error:', error);
    }
}

// Load assets
async function loadAssets() {
    try {
        const response = await fetch(`${API_BASE_URL}/assets`, {
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load assets');
        }

        const tbody = document.getElementById('assetsTableBody');
        tbody.innerHTML = '';

        if (data.assets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading">No assets found</td></tr>';
            return;
        }

        data.assets.forEach(asset => {
            const row = document.createElement('tr');
            const statusClass = `badge-${asset.current_status.toLowerCase()}`;
            row.innerHTML = `
                <td>${asset.asset_id}</td>
                <td>${asset.name}</td>
                <td>${asset.category || '-'}</td>
                <td>${asset.department}</td>
                <td><span class="badge ${statusClass}">${asset.current_status}</span></td>
                <td><a href="asset-detail.html?id=${asset.id}">View</a></td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Load assets error:', error);
        document.getElementById('assetsTableBody').innerHTML =
            '<tr><td colspan="6" class="loading">Error loading assets</td></tr>';
    }
}

// Load assets on page load
loadAssets();
