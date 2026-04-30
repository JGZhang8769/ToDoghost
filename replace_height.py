import re

with open('todoghost/src/app/features/main-view/main-view.component.html', 'r') as f:
    content = f.read()

content = content.replace('class="bg-white p-6 rounded-2xl w-full max-w-sm shadow-xl relative max-h-[90vh] flex flex-col"', 'class="bg-white p-6 rounded-2xl w-full max-w-sm shadow-xl relative max-h-screen flex flex-col"')

content = content.replace('h-[50vh]', 'flex-1')

with open('todoghost/src/app/features/main-view/main-view.component.html', 'w') as f:
    f.write(content)
