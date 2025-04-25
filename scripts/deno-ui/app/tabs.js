// All files under /deno-ui/app are compiled and combined into main.js (All functions are available globally)

// Tab switching functionality
function switchTab(tabName) {
    // scripts/deno-ui/app/tabs.js switchTab switching to tab
    console.log('tabs.js switchTab switching to tab', {data: {tabName}});
    
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
        content.classList.add('hidden');
    });
    
    // Remove active class from all tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.classList.remove('active-tab');
    });
    
    // Show the selected tab content
    const selectedTab = document.getElementById(`${tabName}-tab`);
    if (selectedTab) {
        selectedTab.classList.remove('hidden');
    }
    
    // Add active class to the clicked tab button
    const selectedButton = document.getElementById(`tab-${tabName}`);
    if (selectedButton) {
        selectedButton.classList.add('active-tab');
    }
    
    // Special handling for logs section if needed
    if (tabName === 'logs') {
        startLogFetching();
    } else {
        // Consider if you want to stop log fetching when not on logs tab
        // stopLogFetching();
    }
}

// Initialize tabs on page load
function initializeTabs() {
    // Default to the upload tab on page load
    switchTab('upload');
    
    // scripts/deno-ui/app/tabs.js initializeTabs tabs initialized
    console.log('tabs.js initializeTabs tabs initialized', {data: {}});
}
