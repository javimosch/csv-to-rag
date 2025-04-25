import { template as mainTemplate } from './ui/template.js';
import { styles } from './ui/styles.js';
import { template as backendTemplate } from './ui/backend.js';
import { template as uploadTemplate } from './ui/upload.js';
import { template as fileListTemplate } from './ui/fileList.js';
import { template as queryTemplate } from './ui/query.js';
import { template as logsTemplate } from './ui/logs.js';

// Combine all templates
export const template = ()=>mainTemplate.replace(
    '</head>',
    `<style>${styles}</style>
</head>`
).replace(
    '<div id="error" class="text-red-600 mt-4 mb-4"></div>',
    `<div id="error" class="text-red-600 mt-4 mb-4"></div>
    
    <!-- Tab Content -->
    <div id="upload-tab" class="tab-content active">
        ${uploadTemplate}
    </div>
    <div id="files-tab" class="tab-content hidden">
        ${fileListTemplate}
    </div>
    <div id="query-tab" class="tab-content hidden">
        ${queryTemplate}
    </div>
    <div id="backend-tab" class="tab-content hidden">
        ${backendTemplate()}
    </div>
    </div>
    ${logsTemplate}`
);
