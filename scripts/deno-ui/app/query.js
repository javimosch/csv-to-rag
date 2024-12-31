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
