import re

with open('todoghost/src/app/features/main-view/main-view.component.html', 'r') as f:
    content = f.read()

# Fix the bottom drawer background (Requirement 6)
# Previously I replaced it but maybe the `bg-white/90` and `backdrop-blur-md` was removed by another script or the script failed.
# I'll replace `<div class="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-4px_15px_rgba(0,0,0,0.1)] transition-transform duration-300 z-40 max-w-3xl mx-auto flex flex-col max-h-[85vh]"`

old_unscheduled = 'class="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-4px_15px_rgba(0,0,0,0.1)] transition-transform duration-300 z-40 max-w-3xl mx-auto flex flex-col max-h-[85vh]"'
new_unscheduled = 'class="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md rounded-t-3xl shadow-[0_-4px_15px_rgba(0,0,0,0.1)] border border-milktea-200/50 transition-transform duration-300 z-40 max-w-3xl mx-auto flex flex-col max-h-[85vh]"'

old_scheduled = 'class="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-4px_15px_rgba(0,0,0,0.1)] transition-transform duration-300 z-[65] max-w-3xl mx-auto flex flex-col max-h-[85vh]"'
new_scheduled = 'class="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md rounded-t-3xl shadow-[0_-4px_15px_rgba(0,0,0,0.1)] border border-milktea-200/50 transition-transform duration-300 z-[65] max-w-3xl mx-auto flex flex-col max-h-[85vh]"'


content = content.replace(old_unscheduled, new_unscheduled)
content = content.replace(old_scheduled, new_scheduled)

# 11. Italic in week view
content = content.replace('class="text-xs text-milktea-400 italic flex items-center justify-center h-full min-h-[40px]"', 'class="text-xs text-milktea-400 flex items-center justify-center h-full min-h-[40px]"')

with open('todoghost/src/app/features/main-view/main-view.component.html', 'w') as f:
    f.write(content)
