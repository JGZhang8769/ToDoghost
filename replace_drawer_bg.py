import re

with open('todoghost/src/app/features/main-view/main-view.component.html', 'r') as f:
    content = f.read()

# Make the bottom drawers backgrounds transparent

# Unscheduled Drawer
old_unsched = """      <!-- Unassigned Tasks Slide-up Drawer -->
      <div class="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-4px_15px_rgba(0,0,0,0.1)] transition-transform duration-300 z-40 max-w-3xl mx-auto flex flex-col max-h-[85vh]\""""

new_unsched = """      <!-- Unassigned Tasks Slide-up Drawer -->
      <div class="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border border-milktea-200/50 rounded-t-3xl shadow-[0_-4px_15px_rgba(0,0,0,0.1)] transition-transform duration-300 z-40 max-w-3xl mx-auto flex flex-col max-h-[85vh]\""""

# Scheduled Drawer
old_sched = """      <!-- Scheduled Tasks Drawer -->
      <div class="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-4px_15px_rgba(0,0,0,0.1)] transition-transform duration-300 z-[65] max-w-3xl mx-auto flex flex-col max-h-[85vh]\""""

new_sched = """      <!-- Scheduled Tasks Drawer -->
      <div class="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border border-milktea-200/50 rounded-t-3xl shadow-[0_-4px_15px_rgba(0,0,0,0.1)] transition-transform duration-300 z-[65] max-w-3xl mx-auto flex flex-col max-h-[85vh]\""""

content = content.replace(old_unsched, new_unsched)
content = content.replace(old_sched, new_sched)

with open('todoghost/src/app/features/main-view/main-view.component.html', 'w') as f:
    f.write(content)
