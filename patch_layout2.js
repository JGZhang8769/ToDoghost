const fs = require('fs');
const filepath = 'todoghost/src/app/features/main-view/main-view.component.ts';
let content = fs.readFileSync(filepath, 'utf8');

// The first pass made the header of month view sticky but the grid underneath it needs adjustments to not overlap with sticky header when scrolling
// Actually, let's remove the sticky from the grid of days since it makes it weird, and just keep the month header sticky and give it the same background
content = content.replace(/<div class="grid grid-cols-7 gap-1 text-center mb-2 text-sm text-milktea-500 font-bold sticky top-12 bg-milktea-50 z-20 pb-2">/, '<div class="grid grid-cols-7 gap-1 text-center mb-2 text-sm text-milktea-500 font-bold">');

fs.writeFileSync(filepath, content);
