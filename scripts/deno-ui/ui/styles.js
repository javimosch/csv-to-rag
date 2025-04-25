export const styles = `
    /* Tab Styles */
    .tab-button {
        padding: 0.75rem 1.5rem;
        font-weight: 600;
        border-bottom: 2px solid transparent;
        transition: all 0.3s ease;
        color: #4B5563;
        background-color: transparent;
        cursor: pointer;
    }
    
    .tab-button:hover {
        color: #2563EB;
    }
    
    .active-tab {
        color: #2563EB;
        border-bottom: 2px solid #2563EB;
    }
    
    .tab-content {
        display: block;
        transition: opacity 0.3s ease;
    }
    
    .tab-content.hidden {
        display: none;
        opacity: 0;
    }
    
    /* Legacy accordion styles (keeping for backward compatibility) */
    .section-content {
        transition: max-height 0.3s ease-out;
        overflow: hidden;
        max-height: 500px;
        overflow-y: auto;
    }
    .section-content.collapsed {
        max-height: 0 !important;
    }
    .section-toggle {
        transition: transform 0.3s ease;
    }
    .section-toggle.collapsed {
        transform: rotate(-90deg);
    }
    #logsSection {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: white;
        z-index: 50;
        box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
        max-height: 500px;
    }
    body {
        padding-bottom: 550px; /* Space for fixed logs section + margin */
    }
    .main-content {
        max-width: 1200px;
        margin: 0 auto;
    }
`;
