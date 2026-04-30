import re

with open('todoghost/src/app/features/main-view/main-view.component.html', 'r') as f:
    content = f.read()

content = content.replace('w-6 h-6 flex items-center justify-center cursor-move z-20 text-milktea-400 hover:bg-milktea-200 rounded', 'w-8 h-8 flex items-center justify-center cursor-move z-20 text-milktea-400 hover:bg-milktea-200 rounded')
content = content.replace('w-6 h-6 flex items-center justify-center cursor-move z-20 text-milktea-400 hover:bg-milktea-100 rounded', 'w-8 h-8 flex items-center justify-center cursor-move z-20 text-milktea-400 hover:bg-milktea-100 rounded')
content = content.replace('w-6 h-6 flex items-center justify-center cursor-move z-20 text-milktea-500 bg-white/50 rounded', 'w-8 h-8 flex items-center justify-center cursor-move z-20 text-milktea-500 bg-white/50 rounded')
content = content.replace('class="material-icons text-sm">drag_indicator</span>', 'class="material-icons text-lg">drag_indicator</span>')


with open('todoghost/src/app/features/main-view/main-view.component.html', 'w') as f:
    f.write(content)
