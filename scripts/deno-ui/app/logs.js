// All files under /deno-ui/app are compiled and combined into main.js (All functions are available globally)

// Log management
let logs = [];
let lastFetchTime = Date.now() - 10000; // default to now - 10 seconds
let logsVisible = true;
let logFetchInterval = null;
const MAX_LOGS = 1000;
const LOG_FETCH_INTERVAL = 5000;

function getAuthHeaders() {
    const apiKey = document.getElementById('apiKey').value;
    return {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    };
}

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
        if (error.message.includes('QuotaExceededError')) {
            console.warn('Local storage quota exceeded. Pruning logs.');
            logs = [];
            // Attempt to save again after pruning
            try {
                localStorage.setItem('logs', JSON.stringify(logs));
                console.log('Logs saved successfully after pruning.');
            } catch (retryError) {
                console.error('Error saving logs after pruning:', retryError);
            }
        }
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
        const response = await fetch(`${baseUrl}/api/logs?timestamp=${lastFetchTime}`, {
            headers: getAuthHeaders()
        });
        
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
    // Save the user's scroll position for later
    localStorage.setItem('logsScrollPosition', event.target.scrollTop);
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
        fetchLogs(); // Initial fetch
        logFetchInterval = setInterval(fetchLogs, LOG_FETCH_INTERVAL);
    }
}

// Stop log fetching
function stopLogFetching() {
    if (logFetchInterval) {
        clearInterval(logFetchInterval);
        logFetchInterval = null;
    }
}

function appendLog(message, level = 'info') {
    const log = {
        timestamp: Date.now(),
        level,
        message
    };
    logs = [log, ...logs].slice(0, MAX_LOGS);
    saveLogsToStorage();
    displayLogs();
}

startLogFetching()
