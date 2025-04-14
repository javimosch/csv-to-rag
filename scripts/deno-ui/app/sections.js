// All files under /deno-ui/app are compiled and combined into main.js (All functions are available globally)

// Section visibility state
const sectionStates = {
    backend: true,
    upload: true,
    list: true,
    query: true,
    logs: true
};

// Toggle section visibility
function toggleSection(sectionName) {
    const content = document.getElementById(`${sectionName}Content`);
    const toggle = document.getElementById(`${sectionName}Toggle`);
    
    if (!content || !toggle) return;
    
    sectionStates[sectionName] = !content.classList.contains('collapsed');
    content.classList.toggle('collapsed');
    toggle.classList.toggle('collapsed');
    
    // Special handling for logs section
    if (sectionName === 'logs') {
        if (sectionStates[sectionName]) {
            stopLogFetching();
        } else {
            startLogFetching(); 
        }
    }
}

// Initialize section states
function initializeSections() {
    Object.keys(sectionStates).forEach(section => {
        const content = document.getElementById(`${section}Content`);
        const toggle = document.getElementById(`${section}Toggle`);
        
        // Skip if elements don't exist
        if (!content || !toggle) return;
        
        if (sectionStates[section]) {
            content.classList.remove('collapsed');
            toggle.classList.remove('collapsed');
        } else {
            content.classList.add('collapsed');
            toggle.classList.add('collapsed');
        }
    });
}
