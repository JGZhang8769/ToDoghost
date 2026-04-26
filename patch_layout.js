const fs = require('fs');
const filepath = 'todoghost/src/app/features/main-view/main-view.component.ts';
let content = fs.readFileSync(filepath, 'utf8');

// 1. Revert safe-area-inset
content = content.replace(/pt-\[env\(safe-area-inset-top,12px\)\]/, '');
content = content.replace(/pb-\[calc\(1rem\+env\(safe-area-inset-bottom,0px\)\)\]/g, 'pb-4');
content = content.replace(/pb-\[calc\(8rem\+env\(safe-area-inset-bottom,0px\)\)\]/, 'pb-32');
content = content.replace(/pb-\[env\(safe-area-inset-bottom,0px\)\]/, '');
content = content.replace(/'translateY\(calc\(100% - 60px - env\(safe-area-inset-bottom,0px\)\)\)'/, "'translateY(calc(100% - 60px))'");

// 2. Add sticky top and bg to month view
content = content.replace(/<div class="flex justify-between items-center mb-4">/, '<div class="flex justify-between items-center mb-4 sticky top-0 bg-milktea-50 z-20 pb-2">');
content = content.replace(/<div class="grid grid-cols-7 gap-1 text-center mb-2 text-sm text-milktea-500 font-bold">/, '<div class="grid grid-cols-7 gap-1 text-center mb-2 text-sm text-milktea-500 font-bold sticky top-12 bg-milktea-50 z-20 pb-2">');
// Note: actually let's just make the top part match weekly and keep it simple.

// 3. Remove border-b from daily view header
content = content.replace(/<div class="flex justify-between items-center mb-4 sticky top-0 bg-milktea-50 z-30 pb-2 border-b border-milktea-100">/, '<div class="flex justify-between items-center mb-4 sticky top-0 bg-milktea-50 z-30 pb-2">');

// 4. Ensure Month view has pb-32 to match Week/Day and avoid drawer covering
content = content.replace(/<div \*ngIf="viewMode === 'month'" class="p-4 h-full flex flex-col relative">/, '<div *ngIf="viewMode === \'month\'" class="p-4 h-full flex flex-col relative pb-32">');

fs.writeFileSync(filepath, content);
