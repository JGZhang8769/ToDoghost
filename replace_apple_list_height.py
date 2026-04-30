import re

with open('todoghost/src/app/features/main-view/main-view.component.html', 'r') as f:
    content = f.read()

# Fix apple list fixed height
# <div class="bg-white rounded-2xl shadow-sm border border-milktea-100 flex flex-col mt-4">
# <div class="flex-1 overflow-y-auto px-4 py-4 min-h-[50vh] max-h-[50vh]">

old_apple_list = """      <!-- Apple List View Mode -->
      <div *ngIf="viewMode === 'monthApple'" class="flex-1 flex flex-col h-full bg-milktea-50 overflow-hidden relative">
        <div class="px-4 py-4">
          <div class="bg-white rounded-2xl shadow-sm border border-milktea-100 flex flex-col mt-4">
            <!-- Header -->
            <div class="px-6 py-4 border-b border-milktea-100 flex justify-between items-center bg-milktea-50/50 rounded-t-2xl">
              <h3 class="text-lg font-bold text-milktea-900 flex items-center">
                <svg class="w-5 h-5 mr-2 text-milktea-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                {{ getFormattedSelectedDate() }}
              </h3>
              <span class="bg-milktea-100 text-milktea-700 text-xs font-bold px-3 py-1 rounded-full">
                {{ getSelectedDateTasks().length }} 項代辦
              </span>
            </div>

            <!-- List -->
            <div class="flex-1 overflow-y-auto px-4 py-4 min-h-[50vh] max-h-[50vh]">"""

new_apple_list = """      <!-- Apple List View Mode -->
      <div *ngIf="viewMode === 'monthApple'" class="flex-1 flex flex-col h-full bg-milktea-50 overflow-hidden relative">
        <div class="px-4 py-4 flex-1 flex flex-col h-full min-h-0">
          <div class="bg-white rounded-2xl shadow-sm border border-milktea-100 flex flex-col mt-4 flex-1 min-h-0">
            <!-- Header -->
            <div class="px-6 py-4 shrink-0 border-b border-milktea-100 flex justify-between items-center bg-milktea-50/50 rounded-t-2xl">
              <h3 class="text-lg font-bold text-milktea-900 flex items-center">
                <svg class="w-5 h-5 mr-2 text-milktea-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                {{ getFormattedSelectedDate() }}
              </h3>
              <span class="bg-milktea-100 text-milktea-700 text-xs font-bold px-3 py-1 rounded-full">
                {{ getSelectedDateTasks().length }} 項代辦
              </span>
            </div>

            <!-- List -->
            <div class="flex-1 overflow-y-auto px-4 py-4">"""

content = content.replace(old_apple_list, new_apple_list)

with open('todoghost/src/app/features/main-view/main-view.component.html', 'w') as f:
    f.write(content)
