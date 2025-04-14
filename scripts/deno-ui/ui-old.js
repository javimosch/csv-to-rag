export const template = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CSV to RAG UI</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    <style>
        .section-content {
            transition: max-height 0.3s ease-out;
            overflow: hidden;
            max-height: 500px;
            overflow-y: auto;
        }
        .section-content.collapsed {
            max-height: 0 !important;
        }
        .section-toggle {
            transition: transform 0.3s ease;
        }
        .section-toggle.collapsed {
            transform: rotate(-90deg);
        }
        #logsSection {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: white;
            z-index: 50;
            box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
            max-height: 500px;
        }
        body {
            padding-bottom: 550px; /* Space for fixed logs section + margin */
        }
        .main-content {
            max-width: 1200px;
            margin: 0 auto;
        }
    </style>
</head>
<body class="bg-gray-100">
    <div class="container mx-auto p-8 main-content">
        <h1 class="text-3xl text-blue-600 mb-8">CSV to RAG UI</h1>
        
        <div class="mb-4">
            <label for="baseUrl" class="block mb-1">Base URL:</label>
            <input type="text" id="baseUrl" value="${Deno.env.get('UI_BACKEND_URL')||"http://localhost:3000"}" 
                   placeholder="Enter base URL (e.g., http://localhost:3000)"
                   class="w-full p-2 border border-gray-300 rounded">
        </div>

        <!-- Backend Control Section -->
<div id="backendSection" class="mb-6 bg-white rounded shadow hidden">
    <button onclick="toggleSection('backend')" 
            class="w-full p-4 text-left font-semibold flex items-center justify-between">
        <span>Backend Control</span>
        <span id="backendSectionToggle" class="section-toggle">▼</span>
    </button>
    <div id="backendContent" class="section-content p-4">
        <div class="flex items-center justify-between">
            <button id="backendToggle" 
                    onclick="toggleBackend()" 
                    class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500">
                Start Backend
            </button>
            <div id="backendStatus" class="text-gray-600">Backend is stopped</div>
        </div>
    </div>
</div>

        <!-- Upload Section -->
        <div class="mb-6 bg-white rounded shadow">
            <button onclick="toggleSection('upload')" 
                    class="w-full p-4 text-left font-semibold flex items-center justify-between">
                <span>Upload CSV</span>
                <span id="uploadToggle" class="section-toggle">▼</span>
            </button>
            <div id="uploadContent" class="section-content">
                <div class="p-4 space-y-3">
                    <div>
                        <input type="file" 
                               id="csvFile" 
                               accept=".csv"
                               class="block w-full text-sm text-gray-500
                                      file:mr-4 file:py-2 file:px-4
                                      file:rounded file:border-0
                                      file:text-sm file:font-semibold
                                      file:bg-blue-50 file:text-blue-700
                                      hover:file:bg-blue-100">
                    </div>
                    <div>
                        <label for="delimiter" class="block text-sm font-medium text-gray-700 mb-1">Delimiter:</label>
                        <select id="delimiter" 
                                class="block w-full p-2 border border-gray-300 rounded">
                            <option value=",">Comma (,)</option>
                            <option value=";">Semicolon (;)</option>
                            <option value="|">Pipe (|)</option>
                            <option value="\\t">Tab</option>
                        </select>
                    </div>
                    <button onclick="uploadFile()" 
                            class="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-500">
                        Upload
                    </button>
                    <div id="uploadProgress" class="hidden">
                        <div class="w-full bg-gray-200 rounded-full h-2.5">
                            <div id="uploadProgressBar" 
                                 class="bg-blue-600 h-2.5 rounded-full" 
                                 style="width: 0%"></div>
                        </div>
                        <div id="uploadStatus" class="text-sm text-gray-600 mt-1"></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- File List Section -->
        <div class="mb-6 bg-white rounded shadow">
            <button onclick="toggleSection('list')" 
                    class="w-full p-4 text-left font-semibold flex items-center justify-between">
                <span>File List</span>
                <span id="listToggle" class="section-toggle">▼</span>
            </button>
            <div id="listContent" class="section-content">
                <div class="p-4">
                    <button onclick="listFiles()" 
                            class="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-500 mb-4">
                        Refresh File List
                    </button>
                    <div id="fileList" class="break-words"></div>
                </div>
            </div>
        </div>

        <!-- Query Section -->
        <div class="mb-6 bg-white rounded shadow">
            <button onclick="toggleSection('query')" 
                    class="w-full p-4 text-left font-semibold flex items-center justify-between">
                <span>Query</span>
                <span id="queryToggle" class="section-toggle">▼</span>
            </button>
            <div id="queryContent" class="section-content">
                <div class="p-4 space-y-3">
                    <div>
                        <textarea id="queryInput" 
                                  placeholder="Enter your query here..."
                                  class="w-full p-2 border border-gray-300 rounded"
                                  rows="3"></textarea>
                    </div>
                    <div class="flex space-x-2">
                        <button onclick="submitQuery()" 
                                class="flex-1 bg-blue-600 text-white p-2 rounded hover:bg-blue-500">
                            Submit Query
                        </button>
                        <button onclick="computeCurl()" 
                                class="bg-gray-600 text-white p-2 rounded hover:bg-gray-500 flex items-center">
                            <span>Compute cURL</span>
                        </button>
                    </div>
                    <div id="curlCommand" class="hidden">
                        <div class="bg-gray-100 p-3 rounded-lg text-sm font-mono relative">
                            <pre class="whitespace-pre-wrap break-all"></pre>
                            <button onclick="copyToClipboard(this.previousElementSibling.textContent)" 
                                    class="absolute top-2 right-2 bg-gray-700 text-white px-2 py-1 rounded text-xs hover:bg-gray-600">
                                Copy
                            </button>
                        </div>
                    </div>
                    <div id="queryResult" class="mt-4"></div>
                </div>
            </div>
        </div>

        <div id="error" class="text-red-600 mt-4 mb-4"></div>
    </div>

    <!-- Logs Section (Fixed) -->
    <div id="logsSection" class="w-full px-4 md:px-8">
        <div class="max-w-7xl mx-auto">
            <div class="flex items-center justify-between py-2">
                <button onclick="toggleSection('logs')" 
                        class="text-lg font-semibold flex items-center">
                    <span id="logsToggle" class="section-toggle">▼</span>
                    <span class="ml-2">Logs</span>
                </button>
                <div class="flex items-center space-x-4">
                    <div class="flex items-center">
                        <input type="checkbox" 
                               id="autoScroll" 
                               checked
                               class="mr-2">
                        <label for="autoScroll">Auto-scroll</label>
                    </div>
                    <button onclick="clearLogs()" 
                            class="text-red-600 hover:text-red-800">
                        Clear Logs
                    </button>
                </div>
            </div>
            <div id="logsContent" class="section-content bg-white border border-gray-300 rounded overflow-y-auto font-mono text-sm p-4"
                 style="height: 400px;"
                 onscroll="handleLogsScroll(event)">
            </div>
        </div>
    </div>

    <script>
        // Initialize on page load
        document.addEventListener('DOMContentLoaded', async () => {
            // Check if internal backend is available
            try {
                const response = await fetch('/api/backend/available');
                if (response.ok) {
                    const data = await response.json();
                    if (data.available) {
                        document.getElementById('backendSection').classList.remove('hidden');
                        checkBackendState();
                    }
                }
            } catch (error) {
                console.error('Error checking backend availability:', error);
            }
        });
    </script>
    <script src="/static/main.js"></script>
</body>
</html>`;
