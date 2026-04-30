import re

with open('todoghost/src/app/features/main-view/main-view.component.html', 'r') as f:
    content = f.read()

# Make drawers take appropriate dynamic height instead of fixed.

old_unscheduled_drawer = """      <div class="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-4px_15px_rgba(0,0,0,0.1)] transition-transform duration-300 z-40 max-w-3xl mx-auto "
           [style.transform]="drawerOpen ? 'translateY(0)' : 'translateY(calc(100% - 60px))'">
        <div class="h-[60px] flex items-center justify-center cursor-pointer relative" (click)="drawerOpen = !drawerOpen">
          <div class="w-12 h-1.5 bg-milktea-200 rounded-full mb-1"></div>
          <span class="absolute right-6 bg-milktea-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">未排程 ({{ unassignedTasks.length }})</span>
        </div>

        <div class="flex-1 overflow-y-auto px-4 pb-8 overflow-x-hidden" [class.invisible]="!drawerOpen" [class.hidden]="!drawerOpen"
             cdkDropList"""

new_unscheduled_drawer = """      <div class="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-4px_15px_rgba(0,0,0,0.1)] transition-transform duration-300 z-40 max-w-3xl mx-auto flex flex-col max-h-[85vh]"
           [style.transform]="drawerOpen ? 'translateY(0)' : 'translateY(calc(100% - 60px))'">
        <div class="h-[60px] shrink-0 flex items-center justify-center cursor-pointer relative" (click)="drawerOpen = !drawerOpen">
          <div class="w-12 h-1.5 bg-milktea-200 rounded-full mb-1"></div>
          <span class="absolute right-6 bg-milktea-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">未排程 ({{ unassignedTasks.length }})</span>
        </div>

        <div class="flex-1 overflow-y-auto px-4 pb-8 overflow-x-hidden" [class.invisible]="!drawerOpen" [class.hidden]="!drawerOpen"
             cdkDropList"""

old_scheduled_drawer = """      <div class="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-4px_15px_rgba(0,0,0,0.1)] transition-transform duration-300 z-[65] max-w-3xl mx-auto "
           [style.transform]="scheduledDrawerOpen ? 'translateY(0)' : 'translateY(100%)'">
        <div class="h-[60px] flex items-center justify-between px-6 cursor-pointer relative border-b border-milktea-100" (click)="scheduledDrawerOpen = !scheduledDrawerOpen">
          <span class="font-bold text-milktea-900">{{ scheduledDrawerDate }} 排程</span>
          <div class="w-12 h-1.5 bg-milktea-200 rounded-full absolute left-1/2 -translate-x-1/2 top-2"></div>
          <span class="bg-milktea-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{{ scheduledDrawerTasks.length }}</span>
        </div>

        <div class="flex-1 overflow-y-auto px-4 py-4 overflow-x-hidden"
             cdkDropList"""

new_scheduled_drawer = """      <div class="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-4px_15px_rgba(0,0,0,0.1)] transition-transform duration-300 z-[65] max-w-3xl mx-auto flex flex-col max-h-[85vh]"
           [style.transform]="scheduledDrawerOpen ? 'translateY(0)' : 'translateY(100%)'">
        <div class="h-[60px] shrink-0 flex items-center justify-between px-6 cursor-pointer relative border-b border-milktea-100" (click)="scheduledDrawerOpen = !scheduledDrawerOpen">
          <span class="font-bold text-milktea-900">{{ scheduledDrawerDate }} 排程</span>
          <div class="w-12 h-1.5 bg-milktea-200 rounded-full absolute left-1/2 -translate-x-1/2 top-2"></div>
          <span class="bg-milktea-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{{ scheduledDrawerTasks.length }}</span>
        </div>

        <div class="flex-1 overflow-y-auto px-4 py-4 overflow-x-hidden"
             cdkDropList"""

content = content.replace(old_unscheduled_drawer, new_unscheduled_drawer)
content = content.replace(old_scheduled_drawer, new_scheduled_drawer)

with open('todoghost/src/app/features/main-view/main-view.component.html', 'w') as f:
    f.write(content)
