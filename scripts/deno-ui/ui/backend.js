export const template = ()=>`
<!-- Backend Control Section -->
<div id="backendSection" class="mb-6 bg-white rounded shadow hidden">
    <button onclick="toggleSection('backend')" 
            class="w-full p-4 text-left font-semibold flex items-center justify-between">
        <span>Backend Control</span>
        <span id="backendSectionToggle" class="section-toggle">▼</span>
    </button>
    <div id="backendContent" class="section-content p-4">
        <div class="space-y-4">
            <div>
                <label for="baseUrl" class="block text-sm font-medium text-gray-700 mb-1">Base URL:</label>
                <input type="text" id="baseUrl" value="${Deno.env.get('UI_BACKEND_URL')||"http://localhost:3000"}" 
                       placeholder="Enter base URL (e.g., http://localhost:3000)"
                       class="w-full p-2 border border-gray-300 rounded"
                       onchange="handleBaseUrlChange(this.value)">
            </div>
            <div>
                <label for="apiKey" class="block text-sm font-medium text-gray-700 mb-1">API Key:</label>
                <input type="password" id="apiKey" 
                       placeholder="Enter your API key"
                       class="w-full p-2 border border-gray-300 rounded"
                       value="${Deno.env.get('BACKEND_API_KEY')}"
                       onchange="handleApiKeyChange(this.value)">
            </div>
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
</div>
`;
