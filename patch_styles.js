const fs = require('fs');
const filepath = 'todoghost/src/styles.scss';
let content = fs.readFileSync(filepath, 'utf8');

// add overscroll-behavior-x: none to html, body
content = content.replace(/touch-action: pan-y; \/\* Allow vertical scroll, disable pinch-zoom \*\//, 'touch-action: pan-y; /* Allow vertical scroll, disable pinch-zoom */\n    overscroll-behavior-x: none; /* Prevent swipe navigation */');

// add cdk drag placeholder override
content += `\n/* Hide the original card while dragging, show only preview */\n.cdk-drag-placeholder { opacity: 0 !important; }\n`;

fs.writeFileSync(filepath, content);
