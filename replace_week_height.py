import re

with open('todoghost/src/app/features/main-view/main-view.component.html', 'r') as f:
    content = f.read()

old_week_view = """      <!-- Week View -->
      <div *ngIf="viewMode === 'week'" class="flex-1 flex flex-col h-full bg-milktea-50 overflow-hidden relative">
        <div class="px-2 py-4">
          <div class="bg-white rounded-2xl shadow-sm border border-milktea-100 flex flex-col h-[70vh]">
            <div class="flex-1 overflow-y-auto px-2 py-4">"""

new_week_view = """      <!-- Week View -->
      <div *ngIf="viewMode === 'week'" class="flex-1 flex flex-col h-full bg-milktea-50 overflow-hidden relative">
        <div class="px-2 py-4 flex-1 flex flex-col min-h-0">
          <div class="bg-white rounded-2xl shadow-sm border border-milktea-100 flex flex-col flex-1 min-h-0">
            <div class="flex-1 overflow-y-auto px-2 py-4">"""

content = content.replace(old_week_view, new_week_view)

with open('todoghost/src/app/features/main-view/main-view.component.html', 'w') as f:
    f.write(content)
