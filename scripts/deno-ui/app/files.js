// All files under /deno-ui/app are compiled and combined into main.js (All functions are available globally)

// Toast utility
function showToast(message, type = 'info', duration = 3000) {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.style.position = 'fixed';
        toast.style.top = '24px';
        toast.style.right = '24px';
        toast.style.zIndex = '9999';
        toast.style.minWidth = '220px';
        toast.style.padding = '12px 20px';
        toast.style.borderRadius = '6px';
        toast.style.fontSize = '16px';
        toast.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
        toast.style.transition = 'opacity 0.3s';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.backgroundColor = type === 'warn' ? '#fbbf24' : '#4b5563';
    toast.style.color = type === 'warn' ? '#7c4700' : '#fff';
    toast.style.border = type === 'warn' ? '1px solid #f59e42' : 'none';
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => { toast.style.display = 'none'; }, 300);
    }, duration);
}

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
                    <div class="flex flex-col md:flex-row justify-between items-start">
                        <div class="w-full md:w-3/4 break-words">
                            <strong>${file.fileName}</strong>
                            <span class="ml-2 text-xs bg-blue-100 text-blue-800 px-1 py-0.5 rounded">${file.namespace}</span>
                            <div class="flex flex-wrap items-center gap-2 mt-1">
                                <span>MongoDB: ${file.rowCount} rows</span>
                                <span class="hidden md:inline">|</span>
                                <span>Pinecone: ${file.vectorCount} vectors</span>
                                <span class="px-2 py-0.5 rounded text-sm ${file.isInSync 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-red-100 text-red-800'}"
                                >
                                    ${file.isInSync ? 'In Sync' : 'Out of Sync'}
                                </span>
                            </div>
                            <div class="mt-1">Last Updated: ${new Date(file.lastUpdated).toLocaleString()}</div>
                            <div class="mt-1 overflow-hidden text-ellipsis">Sample Code: ${file.sampleMetadata.code}</div>
                            <div class="mt-1 overflow-hidden text-ellipsis">Sample Metadata: ${file.sampleMetadata.metadata_small}</div>
                        </div>
                        <div class="flex flex-col gap-2 mt-2 md:mt-0">
                            <button 
                                onclick="deleteFile('${file.fileName}')"
                                class="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded text-sm"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
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

async function deleteFile(fileName) {
    if (!confirm(`Are you sure you want to delete ${fileName}?`)) {
        return;
    }

    const baseUrl = document.getElementById('baseUrl').value;
    const error = document.getElementById('error');
    
    try {
        error.textContent = '';
        
        const response = await fetch(`${baseUrl}/api/csv/file/${encodeURIComponent(fileName)}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.success) {
            // Refresh the file list
            await listFiles();
        } else {
            throw new Error(result.error || 'Delete operation failed');
        }
    } catch (err) {
        error.textContent = `Error deleting file: ${err.message}`;
    }
}

async function uploadFile() {
    // Get all UI elements upfront to avoid reference errors
    const baseUrl = document.getElementById('baseUrl').value;
    const fileInput = document.getElementById('csvFile');
    const namespaceInput = document.getElementById('namespace');
    const error = document.getElementById('error');
    const progress = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('uploadProgressBar');
    const status = document.getElementById('uploadStatus');
    
    try {
        // scripts/deno-ui/app/files.js uploadFile Upload attempt
        console.log('files.js uploadFile Upload attempt',{data:{}});
        
        error.textContent = '';
        
        // Validate namespace is provided
        if (!namespaceInput.value || namespaceInput.value.trim() === '') {
            // scripts/deno-ui/app/files.js uploadFile no namespace
            console.log('files.js uploadFile no namespace',{data:{}});
            error.textContent = 'Please specify a namespace for the upload';
            error.style.display = '';
            error.classList.add('bg-red-100');
            setTimeout(() => error.classList.remove('bg-red-100'), 800);
            showToast('Namespace is required', 'warn');
            return;
        }
        
        if (!fileInput.files || fileInput.files.length === 0) {
            // scripts/deno-ui/app/files.js uploadFile no file selected
            console.log('files.js uploadFile no file selected',{data:{}});
            error.textContent = 'Please select a CSV file';
            error.style.display = '';
            error.classList.add('bg-red-100');
            setTimeout(() => error.classList.remove('bg-red-100'), 800);
            showToast('Please select a CSV file', 'warn');
            return;
        }

        const file = fileInput.files[0];

        // Validate file type
        if (!file.name.toLowerCase().endsWith('.csv')) {
            // scripts/deno-ui/app/files.js uploadFile invalid file type
            console.log('files.js uploadFile invalid file type',{data:{fileName: file.name}});
            error.textContent = 'File must have a .csv extension.';
            error.style.display = '';
            error.classList.add('bg-red-100');
            setTimeout(() => error.classList.remove('bg-red-100'), 800);
            showToast('File must have a .csv extension.', 'warn');
            return;
        }
        
        // Validate CSV header by reading the file and checking its structure
        let isValid = false;
        let validationDetails = {};
        
        try {
            // Read the file to check header format
            const text = await file.text();
            const firstLine = text.split(/\r?\n/)[0].trim();
            
            // Detect the delimiter used in the file
            let detectedDelimiter = ',';
            if (firstLine.includes(';')) detectedDelimiter = ';';
            else if (firstLine.includes('\t')) detectedDelimiter = '\t';
            else if (firstLine.includes('|')) detectedDelimiter = '|';
            
            // Get the column names regardless of delimiter
            const columns = firstLine.split(detectedDelimiter).map(col => col.trim());
            
            // Expected column structure (regardless of delimiter)
            const expectedColumns = ['code', 'metadata_small', 'metadata_big_1', 'metadata_big_2'];
            const expectedColumnsWithBig3 = [...expectedColumns, 'metadata_big_3'];
            
            // Check if columns match either expected structure
            isValid = JSON.stringify(columns) === JSON.stringify(expectedColumns) || 
                      JSON.stringify(columns) === JSON.stringify(expectedColumnsWithBig3);
            
            if (!isValid) {
                // Store validation details for logging if invalid
                validationDetails = {
                    foundHeader: firstLine,
                    foundColumns: columns,
                    expectedColumns: [expectedColumns, expectedColumnsWithBig3],
                    detectedDelimiter: detectedDelimiter === ';' ? 'semicolon (;)' : 
                                      detectedDelimiter === '\t' ? 'tab' : 
                                      detectedDelimiter === '|' ? 'pipe (|)' : 'comma (,)',
                    possibleIssue: columns.includes('code') ? 
                                  'wrong column structure' : 
                                  'missing required columns'
                };
            }
        } catch (err) {
            console.log('files.js uploadFile CSV validation error',{message:err.message,stack:err.stack});
            isValid = false;
            validationDetails = { possibleIssue: 'Error reading file: ' + err.message };
        }
        
        if (!isValid) {
            // scripts/deno-ui/app/files.js uploadFile invalid csv header
            // scripts/deno-ui/app/files.js uploadFile invalid csv header with details
            console.log('files.js uploadFile invalid csv header', {
                data: {
                    fileName: file.name,
                    foundHeader: validationDetails.foundHeader || 'unknown',
                    foundColumns: validationDetails.foundColumns || [],
                    expectedColumns: validationDetails.expectedColumns || [['code', 'metadata_small', 'metadata_big_1', 'metadata_big_2'], ['code', 'metadata_small', 'metadata_big_1', 'metadata_big_2', 'metadata_big_3']],
                    detectedDelimiter: validationDetails.detectedDelimiter || 'unknown',
                    possibleIssue: validationDetails.possibleIssue || 'unknown format'
                }
            });
            error.textContent = `CSV does not match required format (${validationDetails.detectedDelimiter} delimiter detected). See documentation.`;
            error.style.display = '';
            error.classList.add('bg-red-100');
            setTimeout(() => error.classList.remove('bg-red-100'), 800);
            showToast('CSV does not match required format. See documentation.', 'warn');
            return;
        }
        const formData = new FormData();
        // Use 'csvFile' as the field name to match backend expectation
        formData.append('csvFile', file);
        formData.append('delimiter', document.getElementById('delimiter').value);
        formData.append('namespace', namespaceInput.value.trim());
        
        // scripts/deno-ui/app/files.js uploadFile form data prepared
        console.log('files.js uploadFile form data prepared',{data:{fileName: file.name, namespace: namespaceInput.value.trim()}});

        progress.classList.remove('hidden');
        status.textContent = 'Uploading...';
        progressBar.style.width = '0%';

        const response = await fetch(`${baseUrl}/api/csv/upload`, {
            method: 'POST',
            headers: {
                'Authorization': getAuthHeaders().Authorization
                // Don't set Content-Type for FormData, browser will set it with boundary
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
        // scripts/deno-ui/app/files.js uploadFile upload try/catch
        console.log('files.js uploadFile upload try/catch',{message:err.message,stack:err.stack});
        error.textContent = `Error: ${err.message}`;
        status.textContent = 'Upload failed';
        progressBar.style.width = '0%';
    }
}
