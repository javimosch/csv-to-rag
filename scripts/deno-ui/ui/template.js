export const template = `<!DOCTYPE html>
<html lang="en" data-theme="cmyk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CSV to RAG UI</title>
    <!-- DaisyUI and Tailwind CSS via CDN -->
    <link href="https://cdn.jsdelivr.net/npm/daisyui@5" rel="stylesheet" type="text/css" />
    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
    <link href="https://cdn.jsdelivr.net/npm/daisyui@5/themes.css" rel="stylesheet" type="text/css" />
   
    
</head>
<body class="bg-base-200 min-h-screen">
    <div class="w-full max-w-full px-8 py-8 main-content">
        <h1 class="text-5xl text-primary mb-8 text-center">CSV to RAG UI</h1>
        
        <!-- Tab Navigation -->
        <div class="tabs tabs-boxed mb-6">
            <a id="tab-upload" class="tab tab-active" onclick="switchTab('upload')">Upload</a>
            <a id="tab-files" class="tab" onclick="switchTab('files')">Files</a>
            <a id="tab-query" class="tab" onclick="switchTab('query')">Query</a>
            <!-- <a id="tab-backend" class="tab ml-auto" onclick="switchTab('backend')">Backend</a> -->
        </div>
        
        <!-- Tab Content Container -->
        <div class="tab-content-container">
            <div id="error" class="text-red-600 mt-4 mb-4"></div>
            <!-- Modular tab content sections -->
            <div id="upload-tab" class="tab-content">[UPLOAD CONTENT]</div>
            <div id="files-tab" class="tab-content hidden">[FILES CONTENT]</div>
            <div id="query-tab" class="tab-content hidden">[QUERY CONTENT]</div>
            <div id="backend-tab" class="tab-content hidden">[BACKEND CONTENT]</div>
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
