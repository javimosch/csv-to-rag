// All files under /deno-ui/app are compiled and combined into main.js (All functions are available globally)

// Initialize everything when the page loads
window.addEventListener('load', () => {
    initializeSections();
    loadLogsFromStorage();
    displayLogs();
    checkBackendState();
    
    // Set up log scroll handler
    const logsContent = document.getElementById('logsContent');
    if (logsContent) {
        logsContent.addEventListener('scroll', handleLogsScroll);
    }
});

// Clean up on page unload
window.addEventListener('unload', () => {
    stopLogFetching();
});