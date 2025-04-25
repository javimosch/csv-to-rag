export const template = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CSV to RAG UI</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
</head>
<body class="bg-gray-100">
    <div class="container mx-auto p-8 main-content">
        <h1 class="text-5xl text-blue-600 mb-8 text-center animate-pulse">CSV to RAG UI</h1>
        
        <!-- Tab Navigation -->
        <div class="flex border-b border-gray-200 mb-6">
            <button id="tab-upload" class="tab-button active-tab" onclick="switchTab('upload')">Upload</button>
            <button id="tab-files" class="tab-button" onclick="switchTab('files')">Files</button>
            <button id="tab-query" class="tab-button" onclick="switchTab('query')">Query</button>
            <button id="tab-backend" class="tab-button" onclick="switchTab('backend')">Backend</button>
        </div>
        
        <!-- Tab Content Container -->
        <div class="tab-content-container">
            <div id="error" class="text-red-600 mt-4 mb-4"></div>
        </div>
    </div>

    <script src="/static/main.js"></script>
    <script>
    // Initialize on page load
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            // Check if internal backend is available
            const response = await fetch('/api/backend/available');
            if (response.ok) {
                const data = await response.json();
                if (data.available) {
                    document.getElementById('backendSection').classList.remove('hidden');
                    setTimeout(checkBackendState, 2000);
                }
            }
        } catch (error) {
            console.error('Error checking backend availability:', error);
            appendLog('Error checking backend availability: ' + error.message, 'error');
        }
    });
    </script>
</body>
</html>`;
