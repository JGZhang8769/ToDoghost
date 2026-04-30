import re

with open('todoghost/src/app/features/main-view/main-view.component.html', 'r') as f:
    content = f.read()

content = content.replace('class="w-3 h-3 bg-red-500 rounded-full shadow-lg z-[9999]"', 'class="w-4 h-4 bg-red-500 rounded-full shadow-xl z-[9999]"')

with open('todoghost/src/app/features/main-view/main-view.component.html', 'w') as f:
    f.write(content)
