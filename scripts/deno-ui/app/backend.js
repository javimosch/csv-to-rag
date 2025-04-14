// All files under /deno-ui/app are compiled and combined into main.js (All functions are available globally)

// Backend state
let backendRunning = false;

// Initialize backend settings from localStorage
window.addEventListener('load', () => {
    const savedApiKey = localStorage.getItem('apiKey');
    const savedBaseUrl = localStorage.getItem('baseUrl');
    
    if (savedApiKey) {
        document.getElementById('apiKey').value = savedApiKey;
    }
    
    if (savedBaseUrl) {
        document.getElementById('baseUrl').value = savedBaseUrl;
    }
});

function handleApiKeyChange(value) {
    localStorage.setItem('apiKey', value);
}

function handleBaseUrlChange(value) {
    localStorage.setItem('baseUrl', value);
}

function getAuthHeaders() {
    const apiKey = document.getElementById('apiKey').value;
    return {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    };
}

async function checkBackendState() {
    const button = document.getElementById('backendToggle');
    const status = document.getElementById('backendStatus');
    
    try {
        const response = await fetch('/api/backend/state', {
            headers: getAuthHeaders()
        });
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
        
        const response = await fetch(`/api/backend/${action}`, {
            headers: getAuthHeaders()
        });
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
