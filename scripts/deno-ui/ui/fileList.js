export const template = `
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
`;
