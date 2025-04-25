export const template = `
<!-- Query Section -->
<div class="bg-white rounded shadow p-4">
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
</div>`;
