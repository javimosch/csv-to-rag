// All files under /deno-ui/app are compiled and combined into main.js (All functions are available globally)

// Tab switching functionality
function switchTab(tabName) {
    // scripts/deno-ui/app/tabs.js switchTab switching to tab
    console.log('tabs.js switchTab switching to tab', {data: {tabName}});
    
    // scripts/deno-ui/app/tabs.js switchTab switching tabs
    console.log('tabs.js switchTab switching tabs', {data: {tabName}});
    try {
        // Hide all tab contents
        const tabContents = document.querySelectorAll('.tab-content');
        tabContents.forEach(content => {
            content.classList.add('hidden');
        });

        // Remove DaisyUI active class from all tab buttons
        const tabButtons = document.querySelectorAll('.tab');
        tabButtons.forEach(button => {
            button.classList.remove('tab-active');
        });

        // Show the selected tab content
        const selectedTab = document.getElementById(`${tabName}-tab`);
        if (selectedTab) {
            selectedTab.classList.remove('hidden');
        }

        // Add DaisyUI active class to the clicked tab button
        const selectedButton = document.getElementById(`tab-${tabName}`);
        if (selectedButton) {
            selectedButton.classList.add('tab-active');
        }

        // Special handling for logs section if needed
        if (tabName === 'logs') {
            if (typeof startLogFetching === 'function') startLogFetching();
        } else {
            // Optionally stop log fetching
            // if (typeof stopLogFetching === 'function') stopLogFetching();
        }
    } catch (err) {
        // scripts/deno-ui/app/tabs.js switchTab try/catch
        console.log('tabs.js switchTab try/catch', {message: err?.message, stack: err?.stack});
    }
}

// Initialize tabs on page load
function initializeTabs() {
    // Default to the upload tab on page load
    switchTab('upload');
    
    // scripts/deno-ui/app/tabs.js initializeTabs tabs initialized
    console.log('tabs.js initializeTabs tabs initialized', {data: {}});
}
