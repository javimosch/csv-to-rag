export const template = `
<!-- File List Section -->
<div class="bg-white rounded shadow p-4">
        <div class="p-4">
            <button onclick="listFiles()" 
                    class="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-500 mb-4">
                Refresh File List
            </button>
            <div id="fileList" class="break-words"></div>
        </div>
</div>
`;
