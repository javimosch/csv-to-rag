
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
        table.className = 'min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden';
        
        // Create table header
        const thead = document.createElement('thead');
        thead.className = 'bg-gray-100';
        const headerRow = document.createElement('tr');
        Object.keys(result[0] || {}).forEach(key => {
            const th = document.createElement('th');
            th.className = 'px-6 py-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider border-b';
            th.textContent = key;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Create table body
        const tbody = document.createElement('tbody');
        result.forEach((row, i) => {
            const tr = document.createElement('tr');
            tr.className = i % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 hover:bg-gray-100';
            
            Object.values(row).forEach(value => {
                const td = document.createElement('td');
                td.className = 'px-6 py-4 text-sm text-gray-900 border-t';
                
                // Format different types of values
                if (typeof value === 'object' && value !== null) {
                    td.innerHTML = `<pre class="whitespace-pre-wrap break-words">${JSON.stringify(value, null, 2)}</pre>`;
                } else if (typeof value === 'boolean') {
                    td.innerHTML = `<span class="px-2 py-1 rounded-full text-xs ${value ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${value}</span>`;
                } else if (value === null || value === undefined) {
                    td.innerHTML = '<span class="text-gray-400 italic">null</span>';
                } else {
                    td.textContent = value;
                }
                
                tr.appendChild(td);
            });
            
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        
        queryResult.appendChild(table);
    } else {
        // Create a formatted display for non-array results
        const resultContainer = document.createElement('div');
        resultContainer.className = 'bg-white rounded-lg border border-gray-200 p-4';
        
        if (typeof result === 'object' && result !== null) {
            const pre = document.createElement('pre');
            pre.className = 'whitespace-pre-wrap break-words text-sm text-gray-800 font-mono';
            pre.textContent = JSON.stringify(result, null, 2);
            resultContainer.appendChild(pre);
        } else {
            resultContainer.textContent = result?.toString() || 'No result';
        }
        
        queryResult.appendChild(resultContainer);
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
