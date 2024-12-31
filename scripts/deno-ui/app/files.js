// All files under /deno-ui/app are compiled and combined into main.js (All functions are available globally)

function getAuthHeaders(contentType = 'application/json') {
    const apiKey = document.getElementById('apiKey').value;
    return {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': contentType
    };
}

async function listFiles() {
    const baseUrl = document.getElementById('baseUrl').value;
    const fileList = document.getElementById('fileList');
    const error = document.getElementById('error');
    
    try {
        error.textContent = '';
        fileList.innerHTML = 'Loading...';
        
        const response = await fetch(`${baseUrl}/api/csv/list`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.totalFiles !== undefined && Array.isArray(data.files)) {
            fileList.innerHTML = data.files.length > 0 
                ? data.files.map(file => `
                    <div class="border-b border-gray-300 py-2">
                        <strong>${file.fileName}</strong>
                        <div>Row Count: ${file.rowCount}</div>
                        <div>Last Updated: ${new Date(file.lastUpdated).toLocaleString()}</div>
                        <div>Sample Code: ${file.sampleMetadata.code}</div>
                        <div>Sample Metadata: ${file.sampleMetadata.metadata_small}</div>
                    </div>`).join('')
                : '<div>No files found</div>';
        } else {
            fileList.innerHTML = '<div>Invalid response format</div>';
        }
    } catch (err) {
        error.textContent = `Error: ${err.message}`;
        fileList.innerHTML = '';
    }
}

async function uploadFile() {
    const baseUrl = document.getElementById('baseUrl').value;
    const fileInput = document.getElementById('csvFile');
    const delimiter = document.getElementById('delimiter').value;
    const error = document.getElementById('error');
    const progress = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('uploadProgressBar');
    const status = document.getElementById('uploadStatus');

    try {
        error.textContent = '';
        
        if (!fileInput.files || fileInput.files.length === 0) {
            throw new Error('Please select a CSV file');
        }

        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('delimiter', delimiter);

        progress.classList.remove('hidden');
        status.textContent = 'Uploading...';
        progressBar.style.width = '0%';

        const response = await fetch(`${baseUrl}/api/csv/upload`, {
            method: 'POST',
            headers: {
                'Authorization': getAuthHeaders().Authorization
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        progressBar.style.width = '100%';
        status.textContent = 'Upload complete!';
        
        // Refresh the file list
        await listFiles();
        
        // Clear the file input
        fileInput.value = '';
    } catch (err) {
        error.textContent = `Error: ${err.message}`;
        status.textContent = 'Upload failed';
        progressBar.style.width = '0%';
    }
}


