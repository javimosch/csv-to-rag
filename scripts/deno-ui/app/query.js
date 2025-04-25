
// All files under /deno-ui/app are compiled and combined into main.js (All functions are available globally)

function getAuthHeaders() {
    const apiKey = document.getElementById('apiKey').value;
    return {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    };
}

/**
 * Load available namespaces from the backend
 */
async function loadNamespaces() {
    // scripts/deno-ui/app/query.js loadNamespaces Loading available namespaces
    console.log('query.js loadNamespaces Loading available namespaces', {data: {}});
    
    const baseUrl = document.getElementById('baseUrl').value;
    const namespaceSelect = document.getElementById('queryNamespace');
    const error = document.getElementById('error');
    
    try {
        error.textContent = '';
        
        // Show loading state
        const currentSelection = namespaceSelect.value;
        namespaceSelect.innerHTML = '<option value="" disabled selected>Loading namespaces...</option>';
        
        const response = await fetch(`${baseUrl}/api/csv/namespaces`, {
            method: 'GET',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            
            // Clear and repopulate the select
            namespaceSelect.innerHTML = '<option value="" disabled selected>Select a namespace</option>';
            
            if (data.namespaces && data.namespaces.length > 0) {
                data.namespaces.forEach(namespace => {
                    const option = document.createElement('option');
                    option.value = namespace;
                    option.textContent = namespace;
                    namespaceSelect.appendChild(option);
                });
                
                // Restore previous selection if it exists
                if (currentSelection && data.namespaces.includes(currentSelection)) {
                    namespaceSelect.value = currentSelection;
                }
                
                appendLog(`Loaded ${data.namespaces.length} namespaces`);
            } else {
                appendLog('No namespaces found. Upload a CSV file first.', 'warning');
            }
        } else {
            const errorText = await response.text();
            appendLog(`Failed to load namespaces: ${errorText}`, 'error');
            namespaceSelect.innerHTML = '<option value="" disabled selected>Failed to load namespaces</option>';
        }
    } catch (error) {
        // scripts/deno-ui/app/query.js loadNamespaces Error loading namespaces
        console.log('query.js loadNamespaces Error loading namespaces', {data: {message: error.message, stack: error.stack}});
        
        appendLog(`Error loading namespaces: ${error.message}`, 'error');
        namespaceSelect.innerHTML = '<option value="" disabled selected>Error loading namespaces</option>';
    }
}

async function submitQuery() {
    // scripts/deno-ui/app/query.js submitQuery Submitting query
    console.log('query.js submitQuery Submitting query', {data: {}});
    
    const queryInput = document.getElementById('queryInput');
    const namespaceSelect = document.getElementById('queryNamespace');
    const namespaceError = document.getElementById('namespaceError');
    const query = queryInput.value.trim();
    const namespace = namespaceSelect.value;
    
    // Validate inputs
    let isValid = true;
    
    if (!query) {
        appendLog('Please enter a query', 'error');
        isValid = false;
    }
    
    if (!namespace) {
        namespaceError.classList.remove('hidden');
        appendLog('Please select a namespace', 'error');
        isValid = false;
    } else {
        namespaceError.classList.add('hidden');
    }
    
    if (!isValid) {
        return;
    }
    
    const baseUrl = document.getElementById('baseUrl').value;
    const queryResult = document.getElementById('queryResult');
    const error = document.getElementById('error');
    
    try {
        error.textContent = '';
        queryResult.innerHTML = 'Processing query...';
        
        const onlyContext = document.getElementById('onlyContextCheckbox').checked;
        // scripts/deno-ui/app/query.js submitQuery Sending query to backend
        console.log('query.js submitQuery Sending query to backend', {data: {query, namespace, onlyContext}});
        
        const response = await fetch(`${baseUrl}/api/query`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ query, namespace, onlyContext })
        });
        
        if (response.ok) {
            const result = await response.json();
            displayQueryResult(result);
            appendLog('Query executed successfully');
        } else {
            const errorText = await response.text();
            appendLog(`Query failed: ${errorText}`, 'error');
        }
    } catch (error) {
        // scripts/deno-ui/app/query.js submitQuery Error submitting query
        console.log('query.js submitQuery Error submitting query', {data: {message: error.message, stack: error.stack}});
        
        appendLog(`Query failed: ${error.message}`, 'error');
    }
}

function computeCurl() {
    // scripts/deno-ui/app/query.js computeCurl Computing curl command
    console.log('query.js computeCurl Computing curl command', {data: {}});
    
    const queryInput = document.getElementById('queryInput');
    const namespaceSelect = document.getElementById('queryNamespace');
    const namespaceError = document.getElementById('namespaceError');
    const query = queryInput.value.trim();
    const namespace = namespaceSelect.value;
    const baseUrl = document.getElementById('baseUrl').value;
    const apiKey = document.getElementById('apiKey').value;
    
    // Validate inputs
    let isValid = true;
    
    if (!query) {
        appendLog('Please enter a query first', 'error');
        isValid = false;
    }
    
    if (!namespace) {
        namespaceError.classList.remove('hidden');
        appendLog('Please select a namespace', 'error');
        isValid = false;
    } else {
        namespaceError.classList.add('hidden');
    }
    
    if (!isValid) {
        return;
    }
    
    const onlyContext = document.getElementById('onlyContextCheckbox').checked;
    // Use string concatenation instead of template literals to avoid escaping issues
    const curlCommand = 'curl -X POST "' + baseUrl + '/api/query" \\\n' +
        '     -H "Content-Type: application/json" \\\n' +
        '     -H "Authorization: Bearer ' + apiKey + '" \\\n' +
        '     -d \'{"query": "' + query.replace(/'/g, "\\'") + '", "namespace": "' + namespace + '", "onlyContext": ' + onlyContext + '}\'';
    
    const curlDiv = document.getElementById('curlCommand');
    curlDiv.classList.remove('hidden');
    curlDiv.querySelector('pre').textContent = curlCommand;
    
    // scripts/deno-ui/app/query.js computeCurl Curl command generated
    console.log('query.js computeCurl Curl command generated', {data: {namespace, onlyContext}});
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
