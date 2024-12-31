// app.js
// Initialize everything when the page loads
window.addEventListener('load', () => {
    initializeSections();
    loadLogsFromStorage();
    displayLogs();
    checkBackendState();
    
    // Set up log scroll handler
    const logsContent = document.getElementById('logsContent');
    if (logsContent) {
        logsContent.addEventListener('scroll', handleLogsScroll);
    }
});

// Clean up on page unload
window.addEventListener('unload', () => {
    stopLogFetching();
});

// files.js
async function listFiles() {
    const baseUrl = document.getElementById('baseUrl').value;
    const fileList = document.getElementById('fileList');
    const error = document.getElementById('error');
    
    try {
        error.textContent = '';
        fileList.innerHTML = 'Loading...';
        
        const response = await fetch(`${baseUrl}/api/csv/list`);
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

function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}


// logs.js
// Log management
let logs = [];
let lastFetchTime = Date.now() - 10000; // default to now - 10 seconds
let logsVisible = true;
let logFetchInterval = null;
const MAX_LOGS = 1000;
const LOG_FETCH_INTERVAL = 5000;

// Load logs from localStorage
function loadLogsFromStorage() {
    try {
        const storedLogs = localStorage.getItem('logs');
        if (storedLogs) {
            logs = JSON.parse(storedLogs);
        }
    } catch (error) {
        console.error('Error loading logs from storage:', error);
    }
}

// Save logs to localStorage
function saveLogsToStorage() {
    try {
        localStorage.setItem('logs', JSON.stringify(logs));
    } catch (error) {
        console.error('Error saving logs to storage:', error);
    }
}

// Format log entry
function formatLogEntry(log) {
    const date = new Date(log.timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const millis = date.getMilliseconds().toString().padStart(3, '0');
    const time = `${hours}:${minutes}:${seconds}.${millis}`;

    let levelClass = 'text-gray-800';
    let icon = '';
    
    switch (log.level.toLowerCase()) {
        case 'error':
            levelClass = 'text-red-600';
            icon = '❌';
            break;
        case 'warn':
            levelClass = 'text-yellow-600';
            icon = '⚠️';
            break;
        case 'info':
            levelClass = 'text-blue-600';
            icon = 'ℹ️';
            break;
        case 'debug':
            levelClass = 'text-gray-600';
            icon = '🔍';
            break;
    }
    
    return `<div class="log-entry mb-1">
        <span class="text-gray-500">[${time}]</span>
        <span class="${levelClass}">${icon} [${log.level.toUpperCase()}]</span>
        <span class="ml-2">${log.message}</span>
    </div>`;
}

// Check if user is at bottom of logs
function isUserAtBottom() {
    const logsContent = document.getElementById('logsContent');
    if (!logsContent) return false;
    return Math.abs(logsContent.scrollHeight - logsContent.scrollTop - logsContent.clientHeight) < 10;
}

// Display logs
function displayLogs(append = false) {
    const logsContent = document.getElementById('logsContent');
    if (!logsContent) return;
    
    const wasAtBottom = isUserAtBottom();
    const shouldAutoScroll = document.getElementById('autoScroll')?.checked && wasAtBottom;
    
    if (append) {
        const fragment = document.createDocumentFragment();
        const tempDiv = document.createElement('div');
        logs.slice(-10).forEach(log => {
            tempDiv.innerHTML = formatLogEntry(log);
            fragment.appendChild(tempDiv.firstChild);
        });
        logsContent.appendChild(fragment);
    } else {
        logsContent.innerHTML = logs.map(formatLogEntry).join('');
    }
    
    if (shouldAutoScroll) {
        logsContent.scrollTop = logsContent.scrollHeight;
    }
}

// Fetch new logs
async function fetchLogs() {
    const baseUrl = document.getElementById('baseUrl').value;
    
    try {
        const response = await fetch(`${baseUrl}/api/logs?timestamp=${lastFetchTime}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.logs && data.logs.length > 0) {
            // Update lastFetchTime to the newest timestamp from the response
            lastFetchTime = data.newestTimestamp;
            
            // Add new logs and remove duplicates
            const newLogs = data.logs.filter(newLog => 
                !logs.some(existingLog => 
                    existingLog.timestamp === newLog.timestamp && 
                    existingLog.message === newLog.message
                )
            );

            if (newLogs.length > 0) {
                logs = [...newLogs, ...logs]
                    .sort((a, b) => b.timestamp - a.timestamp) // Sort by timestamp descending
                    .slice(0, MAX_LOGS); // Keep only the latest MAX_LOGS entries
                
                saveLogsToStorage();
                displayLogs();
            }
        }
    } catch (error) {
        console.error('Error fetching logs:', error);
    }
}

// Handle infinite scrolling and track user scroll
function handleLogsScroll(event) {
    // Implementation can be added if needed
}

// Clear logs
function clearLogs() {
    logs = [];
    saveLogsToStorage();
    displayLogs();
}

// Start log fetching
function startLogFetching() {
    if (!logFetchInterval) {
        logFetchInterval = setInterval(fetchLogs, LOG_FETCH_INTERVAL);
        fetchLogs(); // Fetch immediately
    }
}

// Stop log fetching
function stopLogFetching() {
    if (logFetchInterval) {
        clearInterval(logFetchInterval);
        logFetchInterval = null;
    }
}

startLogFetching()

// sections.js
// Section visibility state
const sectionStates = {
    backend: true,
    upload: true,
    list: true,
    query: true,
    logs: true
};

// Toggle section visibility
function toggleSection(sectionName) {
    const content = document.getElementById(`${sectionName}Content`);
    const toggle = document.getElementById(`${sectionName}Toggle`);
    
    if (!content || !toggle) return;
    
    sectionStates[sectionName] = !content.classList.contains('collapsed');
    content.classList.toggle('collapsed');
    toggle.classList.toggle('collapsed');
    
    // Special handling for logs section
    if (sectionName === 'logs') {
        if (sectionStates[sectionName]) {
            stopLogFetching();
        } else {
            startLogFetching(); 
        }
    }
}

// Initialize section states
function initializeSections() {
    Object.keys(sectionStates).forEach(section => {
        const content = document.getElementById(`${section}Content`);
        const toggle = document.getElementById(`${section}Toggle`);
        
        // Skip if elements don't exist
        if (!content || !toggle) return;
        
        if (sectionStates[section]) {
            content.classList.remove('collapsed');
            toggle.classList.remove('collapsed');
        } else {
            content.classList.add('collapsed');
            toggle.classList.add('collapsed');
        }
    });
}


// query.js
async function submitQuery() {
    const baseUrl = document.getElementById('baseUrl').value;
    const queryInput = document.getElementById('queryInput');
    const queryResult = document.getElementById('queryResult');
    const error = document.getElementById('error');
    
    try {
        error.textContent = '';
        queryResult.innerHTML = 'Processing query...';
        
        const response = await fetch(`${baseUrl}/api/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: queryInput.value
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.answer) {
            queryResult.innerHTML = `
                <div class="mt-4 space-y-4">
                    <div class="bg-white p-4 rounded-lg shadow">
                        <div class="prose max-w-none">
                            ${data.answer}
                        </div>
                    </div>
                    ${data.sources && data.sources.length > 0 ? `
                        <div class="mt-6">
                            <h3 class="text-lg font-semibold mb-3">Sources</h3>
                            <div class="space-y-3">
                                ${data.sources.map(source => `
                                    <div class="bg-gray-50 p-4 rounded-lg">
                                        <div class="font-medium text-gray-700 mb-2">${source.fileName}</div>
                                        <pre class="text-sm bg-gray-100 p-2 rounded overflow-x-auto">${JSON.stringify(JSON.parse(source.context), null, 2)}</pre>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>`;
        } else {
            queryResult.innerHTML = '<div class="text-gray-600">No results found</div>';
        }
    } catch (err) {
        error.textContent = `Error: ${err.message}`;
        queryResult.innerHTML = '';
    }
}

function computeCurl() {
    const baseUrl = document.getElementById('baseUrl').value;
    const queryInput = document.getElementById('queryInput');
    const curlCommand = document.getElementById('curlCommand');
    
    const curl = `curl -X POST "${baseUrl}/api/query" \\
     -H "Content-Type: application/json" \\
     -d '{"query": "${queryInput.value.replace(/"/g, '\\"')}"}'`;
    
    curlCommand.classList.remove('hidden');
    curlCommand.querySelector('pre').textContent = curl;
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        // Optional: Add visual feedback
    } catch (err) {
        console.error('Failed to copy text:', err);
    }
}


// backend.js
// Backend state
let backendRunning = false;

async function checkBackendState() {
    const button = document.getElementById('backendToggle');
    const status = document.getElementById('backendStatus');
    
    try {
        const response = await fetch('/api/backend/state');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'running') {
            backendRunning = true;
            button.textContent = 'Stop Backend';
            button.classList.remove('bg-green-600', 'hover:bg-green-500');
            button.classList.add('bg-red-600', 'hover:bg-red-500');
            status.innerHTML = `<span class="text-green-600">${data.message || 'Backend is running'}</span>`;
        } else {
            backendRunning = false;
            button.textContent = 'Start Backend';
            button.classList.remove('bg-red-600', 'hover:bg-red-500');
            button.classList.add('bg-green-600', 'hover:bg-green-500');
            status.innerHTML = `<span class="text-gray-600">${data.message || 'Backend is stopped'}</span>`;
        }
    } catch (error) {
        console.error('Error checking backend state:', error);
        status.innerHTML = `<span class="text-red-600">Error checking backend state</span>`;
    }
}

async function toggleBackend() {
    const button = document.getElementById('backendToggle');
    const status = document.getElementById('backendStatus');
    
    try {
        button.disabled = true;
        const action = backendRunning ? 'stop' : 'start';
        status.innerHTML = `<span class="text-blue-600">${action === 'start' ? 'Starting' : 'Stopping'} backend...</span>`;
        
        const response = await fetch(`/api/backend/${action}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            backendRunning = !backendRunning;
            button.textContent = backendRunning ? 'Stop Backend' : 'Start Backend';
            button.classList.toggle('bg-green-600');
            button.classList.toggle('bg-red-600');
            button.classList.toggle('hover:bg-green-500');
            button.classList.toggle('hover:bg-red-500');
            status.innerHTML = `<span class="text-green-600">${data.message || (backendRunning ? 'Backend is running' : 'Backend is stopped')}</span>`;
        } else {
            status.innerHTML = `<span class="text-red-600">${data.message || 'Failed to toggle backend'}</span>`;
        }
    } catch (error) {
        console.error('Error:', error);
        status.innerHTML = `<span class="text-red-600">Error: ${error.message}</span>`;
    } finally {
        button.disabled = false;
    }
}
