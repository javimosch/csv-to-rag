// All files under /deno-ui/app are compiled and combined into main.js (All functions are available globally)

// Initialize everything when the page loads
window.addEventListener('load', () => {
    // Initialize tabs instead of sections
    initializeTabs();
    loadLogsFromStorage();
    displayLogs();
    checkBackendState();
    loadNamespaces();
    
    // scripts/deno-ui/app/app.js load UI initialized
    console.log('app.js load UI initialized', {data:{}});
    
    // Set up log scroll handler
    const logsContent = document.getElementById('logsContent');
    if (logsContent) {
        logsContent.addEventListener('scroll', handleLogsScroll);
    }
    
    // Add keyboard shortcut for toggling logs section (ALT+L)
    document.addEventListener('keydown', (event) => {
        // Check if ALT+L was pressed
        if (event.altKey && event.key.toLowerCase() === 'l') {
            console.log('app.js keydown ALT+L detected', {data: {logsVisible}});
            event.preventDefault(); // Prevent default browser behavior
            toggleSection('logs');
        }
    });
});

// Clean up on page unload
window.addEventListener('unload', () => {
    stopLogFetching();
});