export const template = `
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
            <div>
                <label for="namespace">Namespace:</label>
                <input type="text" id="namespace" name="namespace" placeholder="Enter namespace (default: 'default')" />
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
`;
