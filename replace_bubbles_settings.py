import re

with open('todoghost/src/app/features/settings/settings.component.ts', 'r') as f:
    content = f.read()

# Replace missing stopPropagation in toggles and feature drawers
old_toggles = """<label class="flex items-center justify-between p-3 bg-milktea-50 rounded-xl border border-milktea-100">
              <span class="font-bold text-milktea-900">月曆</span>
              <input type="checkbox" [checked]="featureTabs.includes('month')" (change)="toggleFeatureTab('month')" class="w-5 h-5 accent-milktea-600">
            </label>
            <label class="flex items-center justify-between p-3 bg-milktea-50 rounded-xl border border-milktea-100">
              <span class="font-bold text-milktea-900">週曆</span>
              <input type="checkbox" [checked]="featureTabs.includes('week')" (change)="toggleFeatureTab('week')" class="w-5 h-5 accent-milktea-600">
            </label>
            <label class="flex items-center justify-between p-3 bg-milktea-50 rounded-xl border border-milktea-100">
              <span class="font-bold text-milktea-900">日曆</span>
              <input type="checkbox" [checked]="featureTabs.includes('day')" (change)="toggleFeatureTab('day')" class="w-5 h-5 accent-milktea-600">
            </label>
            <label class="flex items-center justify-between p-3 bg-milktea-50 rounded-xl border border-milktea-100">
              <span class="font-bold text-milktea-900">月曆 (蘋果)</span>
              <input type="checkbox" [checked]="featureTabs.includes('monthApple')" (change)="toggleFeatureTab('monthApple')" class="w-5 h-5 accent-milktea-600">
            </label>"""

new_toggles = """<label class="flex items-center justify-between p-3 bg-milktea-50 rounded-xl border border-milktea-100" (click)="$event.stopPropagation()">
              <span class="font-bold text-milktea-900">月曆</span>
              <input type="checkbox" [checked]="featureTabs.includes('month')" (change)="toggleFeatureTab('month')" (click)="$event.stopPropagation()" class="w-5 h-5 accent-milktea-600">
            </label>
            <label class="flex items-center justify-between p-3 bg-milktea-50 rounded-xl border border-milktea-100" (click)="$event.stopPropagation()">
              <span class="font-bold text-milktea-900">週曆</span>
              <input type="checkbox" [checked]="featureTabs.includes('week')" (change)="toggleFeatureTab('week')" (click)="$event.stopPropagation()" class="w-5 h-5 accent-milktea-600">
            </label>
            <label class="flex items-center justify-between p-3 bg-milktea-50 rounded-xl border border-milktea-100" (click)="$event.stopPropagation()">
              <span class="font-bold text-milktea-900">日曆</span>
              <input type="checkbox" [checked]="featureTabs.includes('day')" (change)="toggleFeatureTab('day')" (click)="$event.stopPropagation()" class="w-5 h-5 accent-milktea-600">
            </label>
            <label class="flex items-center justify-between p-3 bg-milktea-50 rounded-xl border border-milktea-100" (click)="$event.stopPropagation()">
              <span class="font-bold text-milktea-900">月曆 (蘋果)</span>
              <input type="checkbox" [checked]="featureTabs.includes('monthApple')" (change)="toggleFeatureTab('monthApple')" (click)="$event.stopPropagation()" class="w-5 h-5 accent-milktea-600">
            </label>"""


old_feature_drawer = """<!-- Feature Drawer -->
      <div *ngIf="showFeatureDrawer" class="fixed inset-0 bg-black/20 z-[60] transition-opacity" (click)="closeFeatureDrawer()"></div>
      <div class="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-4px_15px_rgba(0,0,0,0.1)] transition-transform duration-300 z-[65] max-w-3xl mx-auto flex flex-col"
           [style.transform]="showFeatureDrawer ? 'translateY(0)' : 'translateY(100%)'">"""

new_feature_drawer = """<!-- Feature Drawer -->
      <div *ngIf="showFeatureDrawer" class="fixed inset-0 bg-black/20 z-[60] transition-opacity" (click)="closeFeatureDrawer()"></div>
      <div class="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-4px_15px_rgba(0,0,0,0.1)] transition-transform duration-300 z-[65] max-w-3xl mx-auto flex flex-col"
           (click)="$event.stopPropagation()"
           [style.transform]="showFeatureDrawer ? 'translateY(0)' : 'translateY(100%)'">"""

old_cat_drawer = """<!-- Category Drawer -->
      <div *ngIf="showCategoryDrawer" class="fixed inset-0 bg-black/20 z-[60] transition-opacity" (click)="closeCategoryDrawer()"></div>
      <div class="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-4px_15px_rgba(0,0,0,0.1)] transition-transform duration-300 z-[65] max-w-3xl mx-auto flex flex-col"
           [style.transform]="showCategoryDrawer ? 'translateY(0)' : 'translateY(100%)'">"""

new_cat_drawer = """<!-- Category Drawer -->
      <div *ngIf="showCategoryDrawer" class="fixed inset-0 bg-black/20 z-[60] transition-opacity" (click)="closeCategoryDrawer()"></div>
      <div class="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-4px_15px_rgba(0,0,0,0.1)] transition-transform duration-300 z-[65] max-w-3xl mx-auto flex flex-col"
           (click)="$event.stopPropagation()"
           [style.transform]="showCategoryDrawer ? 'translateY(0)' : 'translateY(100%)'">"""

content = content.replace(old_toggles, new_toggles)
content = content.replace(old_feature_drawer, new_feature_drawer)
content = content.replace(old_cat_drawer, new_cat_drawer)

with open('todoghost/src/app/features/settings/settings.component.ts', 'w') as f:
    f.write(content)
