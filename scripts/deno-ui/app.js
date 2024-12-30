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
        if (!file.name.toLowerCase().endsWith('.csv')) {
            throw new Error('Please select a valid CSV file');
        }

        // Show progress bar
        progress.classList.remove('hidden');
        progressBar.style.width = '0%';
        status.textContent = 'Preparing upload...';

        const formData = new FormData();
        formData.append('file', file);
        formData.append('delimiter', delimiter);

        const response = await fetch(`${baseUrl}/api/csv/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `Upload failed with status: ${response.status}`);
        }

        // Update progress bar to show completion
        progressBar.style.width = '100%';
        status.textContent = 'Upload complete!';

        // Clear the file input
        fileInput.value = '';

        // Refresh the file list
        await listFiles();

        // Hide progress bar after a delay
        setTimeout(() => {
            progress.classList.add('hidden');
            progressBar.style.width = '0%';
            status.textContent = '';
        }, 3000);

    } catch (err) {
        error.textContent = `Error: ${err.message}`;
        progress.classList.add('hidden');
        progressBar.style.width = '0%';
        status.textContent = '';
    }
}

async function submitQuery() {
    const baseUrl = document.getElementById('baseUrl').value;
    const queryInput = document.getElementById('queryInput');
    const queryResult = document.getElementById('queryResult');
    const error = document.getElementById('error');
    
    try {
        error.textContent = '';
        if (!queryInput.value.trim()) {
            throw new Error('Please enter a query');
        }

        queryResult.innerHTML = 'Loading...';
        
        const response = await fetch(`${baseUrl}/api/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: queryInput.value.trim()
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.answer) {
            queryResult.innerHTML = `
                <div class="space-y-4">
                    <div>
                        <strong class="text-gray-700">Answer:</strong>
                        <div class="mt-2 text-gray-800">${data.answer}</div>
                    </div>
                    ${data.sources ? `
                        <div>
                            <strong class="text-gray-700">Sources:</strong>
                            <div class="mt-2 text-sm text-gray-600">
                                ${data.sources.map(source => `
                                    <div class="mb-2">
                                        <div>File: ${source.fileName}</div>
                                        ${source.context ? `<div class="pl-4 border-l-2 border-gray-300 mt-1">${source.context}</div>` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>`;
        } else {
            queryResult.innerHTML = '<div class="text-gray-600">No answer available</div>';
        }
    } catch (err) {
        error.textContent = `Error: ${err.message}`;
        queryResult.innerHTML = '';
    }
}

function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Section visibility state
const sectionStates = {
    upload: true,
    list: true,
    query: true,
    logs: true
};

// Toggle section visibility
function toggleSection(sectionName) {
    const content = document.getElementById(`${sectionName}Content`);
    const toggle = document.getElementById(`${sectionName}Toggle`);
    sectionStates[sectionName] = !sectionStates[sectionName];
    
    if (sectionStates[sectionName]) {
        content.classList.remove('collapsed');
        toggle.classList.remove('collapsed');
        
        // Special handling for logs section
        if (sectionName === 'logs') {
            startLogFetching();
        }
    } else {
        content.classList.add('collapsed');
        toggle.classList.add('collapsed');
        
        // Special handling for logs section
        if (sectionName === 'logs') {
            stopLogFetching();
        }
    }
}

// Initialize section states
function initializeSections() {
    Object.keys(sectionStates).forEach(section => {
        const content = document.getElementById(`${section}Content`);
        const toggle = document.getElementById(`${section}Toggle`);
        
        if (sectionStates[section]) {
            content.classList.remove('collapsed');
            toggle.classList.remove('collapsed');
        } else {
            content.classList.add('collapsed');
            toggle.classList.add('collapsed');
        }
    });
}

// Start log fetching
function startLogFetching() {
    if (!logsFetchInterval) {
        lastFetchTime = Date.now() - 10000;
        userHasScrolled = false;
        fetchLogs();
        logsFetchInterval = setInterval(fetchLogs, 5000);
    }
}

// Stop log fetching
function stopLogFetching() {
    if (logsFetchInterval) {
        clearInterval(logsFetchInterval);
        logsFetchInterval = null;
    }
}

// Log management
let logs = [];
let lastFetchTime = 0;
let logsVisible = true;
let logsFetchInterval;
const MAX_LOGS = 1000;
const DISPLAY_LOGS = 100;
let displayedLogsCount = 0;
let userHasScrolled = false;

// Load logs from localStorage
function loadLogsFromStorage() {
    try {
        const storedLogs = localStorage.getItem('logs');
        if (storedLogs) {
            logs = JSON.parse(storedLogs);
            logs.sort((a, b) => b.timestamp - a.timestamp); // Sort by timestamp descending
            lastFetchTime = Date.now() - 10000; // Start fetching from 10 seconds ago
            displayLogs();
        }
    } catch (error) {
        console.error('Error loading logs from storage:', error);
    }
}

// Save logs to localStorage
function saveLogsToStorage() {
    try {
        // Keep only the latest MAX_LOGS entries
        logs = logs.slice(0, MAX_LOGS);
        localStorage.setItem('logs', JSON.stringify(logs));
    } catch (error) {
        console.error('Error saving logs to storage:', error);
    }
}

// Format log entry
function formatLogEntry(log) {
    const date = new Date(log.timestamp);
    // Format time with milliseconds
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const millis = date.getMilliseconds().toString().padStart(3, '0');
    const time = `${hours}:${minutes}:${seconds}.${millis}`;

    const levelClass = {
        'info': 'text-blue-600',
        'error': 'text-red-600',
        'warn': 'text-yellow-600',
        'debug': 'text-gray-600'
    }[log.level] || 'text-gray-800';

    return `<div class="log-entry mb-1">
        <span class="text-gray-500">[${time}]</span>
        <span class="${levelClass}">[${log.level.toUpperCase()}]</span>
        <span>${log.message}</span>
    </div>`;
}

// Check if user is at bottom of logs
function isUserAtBottom() {
    const logsContent = document.getElementById('logsContent');
    const threshold = 50; // pixels from bottom
    return (logsContent.scrollHeight - logsContent.scrollTop - logsContent.clientHeight) <= threshold;
}

// Display logs
function displayLogs(append = false) {
    const logsContent = document.getElementById('logsContent');
    const autoScroll = document.getElementById('autoScroll').checked;
    const wasAtBottom = isUserAtBottom();
    
    if (!append) {
        displayedLogsCount = 0;
    }

    const startIndex = displayedLogsCount;
    const endIndex = Math.min(startIndex + DISPLAY_LOGS, logs.length);
    const newLogs = logs.slice(startIndex, endIndex)
        .map(formatLogEntry)
        .join('');

    if (append) {
        logsContent.innerHTML += newLogs;
    } else {
        logsContent.innerHTML = newLogs;
    }

    displayedLogsCount = endIndex;

    // Auto-scroll only if user was already at bottom or hasn't scrolled manually
    if (autoScroll && (wasAtBottom || !userHasScrolled)) {
        logsContent.scrollTop = 0;
        userHasScrolled = false;
    }
}

// Fetch new logs
async function fetchLogs() {
    const baseUrl = document.getElementById('baseUrl').value;
    const currentTime = Date.now();
    
    try {
        // Query for logs since last fetch time, but not more than 1 minute ago
        const queryTime = Math.max(lastFetchTime, currentTime - 60000);
        const response = await fetch(`${baseUrl}/api/logs?timestamp=${queryTime}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.logs && data.logs.length > 0) {
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
        
        // Update last fetch time
        lastFetchTime = currentTime;
    } catch (error) {
        console.error('Error fetching logs:', error);
    }
}

// Toggle logs visibility
function toggleLogs() {
    const logsContainer = document.getElementById('logsContainer');
    const toggleIcon = document.getElementById('logsToggleIcon');
    
    logsVisible = !logsVisible;
    logsContainer.style.display = logsVisible ? 'block' : 'none';
    toggleIcon.style.transform = logsVisible ? 'rotate(0deg)' : 'rotate(-90deg)';
    
    if (logsVisible && !logsFetchInterval) {
        lastFetchTime = Date.now() - 10000; // Start by fetching last 10 seconds
        userHasScrolled = false; // Reset scroll state when showing logs
        fetchLogs();
        logsFetchInterval = setInterval(fetchLogs, 5000);
    } else if (!logsVisible && logsFetchInterval) {
        clearInterval(logsFetchInterval);
        logsFetchInterval = null;
    }
}

// Handle infinite scrolling and track user scroll
function handleLogsScroll(event) {
    const logsContent = event.target;
    
    // Track if user has manually scrolled
    userHasScrolled = true;
    
    // Reset userHasScrolled if we're at the top
    if (logsContent.scrollTop === 0) {
        userHasScrolled = false;
    }
    
    // Load more logs when user scrolls near the bottom
    const scrollPosition = logsContent.scrollHeight - logsContent.scrollTop - logsContent.clientHeight;
    if (scrollPosition < 50 && displayedLogsCount < logs.length) {
        displayLogs(true);
    }
}

// Clear logs
function clearLogs() {
    logs = [];
    lastFetchTime = Date.now();
    displayedLogsCount = 0;
    userHasScrolled = false;
    localStorage.removeItem('logs');
    document.getElementById('logsContent').innerHTML = '';
}

// Initialize sections on load
window.addEventListener('load', () => {
    initializeSections();
    loadLogsFromStorage();
    startLogFetching();
});

// Clean up on page unload
window.addEventListener('unload', () => {
    stopLogFetching();
});
