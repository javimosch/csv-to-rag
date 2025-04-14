export const template = `
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
</div>`;
