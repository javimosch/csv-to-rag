
// All files under /deno-ui/app are compiled and combined into main.js (All functions are available globally)

function getAuthHeaders() {
    const apiKey = document.getElementById('apiKey').value;
    return {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    };
}

async function submitQuery() {
    const queryInput = document.getElementById('queryInput');
    const query = queryInput.value.trim();
    
    if (!query) {
        appendLog('Please enter a query', 'error');
        return;
    }
    
    const baseUrl = document.getElementById('baseUrl').value;
    const queryResult = document.getElementById('queryResult');
    const error = document.getElementById('error');
    
    try {
        error.textContent = '';
        queryResult.innerHTML = 'Processing query...';
        
        const response = await fetch(`${baseUrl}/api/query`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ query })
        });
        
        if (response.ok) {
            const result = await response.json();
            displayQueryResult(result);
            appendLog('Query executed successfully');
        } else {
            const error = await response.text();
            appendLog(`Query failed: ${error}`, 'error');
        }
    } catch (error) {
        appendLog(`Query failed: ${error.message}`, 'error');
    }
}

function computeCurl() {
    const queryInput = document.getElementById('queryInput');
    const query = queryInput.value.trim();
    const baseUrl = document.getElementById('baseUrl').value;
    const apiKey = document.getElementById('apiKey').value;
    
    if (!query) {
        appendLog('Please enter a query first', 'error');
        return;
    }
    
    const curlCommand = `curl -X POST "${baseUrl}/api/query" \\
     -H "Content-Type: application/json" \\
     -H "Authorization: Bearer ${apiKey}" \\
     -d '{"query": "${query.replace(/'/g, "\\'")}"}'`;
    
    const curlDiv = document.getElementById('curlCommand');
    curlDiv.classList.remove('hidden');
    curlDiv.querySelector('pre').textContent = curlCommand;
}

function displayQueryResult(result) {
    const queryResult = document.getElementById('queryResult');
    queryResult.innerHTML = '';
    
    if (Array.isArray(result)) {
        const table = document.createElement('table');
        table.className = 'min-w-full divide-y divide-gray-200';
        
        // Create table header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        Object.keys(result[0] || {}).forEach(key => {
            const th = document.createElement('th');
            th.className = 'px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider';
            th.textContent = key;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Create table body
        const tbody = document.createElement('tbody');
        result.forEach((row, i) => {
            const tr = document.createElement('tr');
            tr.className = i % 2 === 0 ? 'bg-white' : 'bg-gray-50';
            
            Object.values(row).forEach(value => {
                const td = document.createElement('td');
                td.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-900';
                td.textContent = value;
                tr.appendChild(td);
            });
            
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        
        queryResult.appendChild(table);
    } else {
        queryResult.textContent = JSON.stringify(result, null, 2);
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        const button = document.querySelector('#curlCommand button');
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => {
            button.textContent = originalText;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy text:', err);
        appendLog('Failed to copy to clipboard', 'error');
    });
}
