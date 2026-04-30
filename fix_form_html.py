import re

with open('todoghost/src/app/features/main-view/main-view.component.html', 'r') as f:
    content = f.read()

# Replace the form HTML section to incorporate requirements 5, 9, 10
# 5. 詳細內容放最下面與時間 Hint
# 9/10. 新增時 可以先隱藏時間跟提醒(可以設計一個類似進階的區塊 點了才會展開這樣子), 編輯的時候看如果有設定就自動展開

old_form = """      <div *ngIf="showForm" class="fixed inset-0 bg-black/30 z-[70] flex items-center justify-center p-4">
        <div class="bg-white p-6 rounded-2xl w-full max-w-sm shadow-xl relative max-h-screen flex flex-col">
          <h2 class="font-bold mb-4 shrink-0">{{ editingTask?.id ? '編輯代辦' : '新增代辦' }}</h2>
          <div class="overflow-y-auto flex-1 pb-4">
            <input [(ngModel)]="formTask.title" placeholder="標題" class="w-full p-2 mb-2 border rounded">
            <textarea [(ngModel)]="formTask.description" placeholder="詳細內容" class="w-full p-2 mb-2 border rounded" rows="2"></textarea>

            <div class="mb-2">
              <select [(ngModel)]="formTask.categoryId" class="w-full p-2 border rounded bg-white">
                <option [ngValue]="undefined">無分類</option>
                <option *ngFor="let cat of availableCategories" [value]="cat.id">{{ cat.name }}</option>
              </select>
            </div>

            <input [(ngModel)]="formTask.date" type="date" placeholder="日期" class="w-full p-2 mb-2 border rounded">
            <div class="flex gap-2 mb-2">
              <input [(ngModel)]="formTask.startTime" type="time" placeholder="開始時間" class="w-1/2 p-2 border rounded">
              <input [(ngModel)]="formTask.endTime" type="time" placeholder="結束時間" class="w-1/2 p-2 border rounded" [disabled]="!formTask.startTime">
            </div>

            <div class="flex flex-col gap-2 mb-2 border rounded p-2 bg-white">
               <label class="flex items-center gap-2 mb-2" *ngIf="editingTask?.id">
                   <input type="checkbox" [checked]="formTask.status === 'completed'" (change)="formTask.status = formTask.status === 'completed' ? 'pending' : 'completed'" class="rounded w-4 h-4 text-milktea-600 border-milktea-300">
                   <span class="text-sm font-bold text-milktea-900">標記為已完成</span>
               </label>
               <div class="flex gap-2 items-center mb-1">
                   <span class="text-sm text-milktea-600 font-bold">標籤</span>
                   <label class="flex items-center gap-1 text-sm text-red-500 font-bold whitespace-nowrap ml-auto">
                       <input type="checkbox" [(ngModel)]="formTask.isUrgent" class="rounded text-red-500"> 緊急
                   </label>
               </div>
               <div class="flex flex-wrap gap-1 mb-1" *ngIf="formTaskTags.length > 0">
                   <span *ngFor="let tag of formTaskTags" class="text-xs bg-milktea-100 text-milktea-800 px-2 py-1 rounded-full flex items-center gap-1">
                       {{ tag }}
                       <button class="text-milktea-400 hover:text-red-500 font-bold" (click)="removeFormTag(tag)">&times;</button>
                   </span>
               </div>
               <input [(ngModel)]="formTaskTagInput" (keydown.enter)="addFormTag()" placeholder="輸入標籤後按 Enter" class="w-full p-2 border rounded text-sm bg-gray-50 focus:bg-white outline-none">
            </div>

            <div class="flex items-center gap-2 mb-2">
               <span class="text-sm text-milktea-600">提醒:</span>
               <select [(ngModel)]="formTask.reminderOffset" class="flex-1 p-2 border rounded bg-white text-milktea-900" [disabled]="!formTask.startTime">
                  <option [ngValue]="null">不提醒</option>
                  <option [ngValue]="15">提前 15 分鐘</option>
                  <option [ngValue]="30">提前 30 分鐘</option>
                  <option [ngValue]="60">提前 1 小時</option>
                  <option [ngValue]="1440">提前 1 天</option>
               </select>
            </div>

            <label class="flex items-center gap-2 mt-4 mb-2 p-2 bg-milktea-50 rounded-lg border border-milktea-100" *ngIf="formTask.reminderOffset !== null">
               <input type="checkbox" [checked]="(formTask | any).enablePush" (change)="(formTask | any).enablePush = !(formTask | any).enablePush" class="rounded w-4 h-4 text-milktea-600 border-milktea-300">
               <span class="text-sm font-bold text-milktea-900">開啟推播通知</span>
               <span class="material-icons text-milktea-500 text-sm ml-auto">notifications_active</span>
            </label>
            <div *ngIf="(formTask | any).enablePush && formTask.reminderOffset !== null" class="text-xs text-milktea-500 mb-2 px-2">
              將會在設定時間推播通知至您的裝置
            </div>
          </div>

          <div class="flex justify-end gap-2 shrink-0 pt-4 border-t">
            <button class="px-4 py-2 border rounded-full text-milktea-600 font-bold" (click)="closeFormModal()">取消</button>
            <button class="px-4 py-2 bg-milktea-600 text-white rounded-full font-bold shadow-sm" [disabled]="!formTask.title" (click)="saveTask()">儲存</button>
          </div>
        </div>
      </div>"""

new_form = """      <div *ngIf="showForm" class="fixed inset-0 bg-black/30 z-[70] flex items-center justify-center p-4">
        <div class="bg-white p-6 rounded-2xl w-full max-w-sm shadow-xl relative max-h-screen flex flex-col">
          <h2 class="font-bold mb-4 shrink-0">{{ editingTask?.id ? '編輯代辦' : '新增代辦' }}</h2>
          <div class="overflow-y-auto flex-1 pb-4">
            <input [(ngModel)]="formTask.title" placeholder="標題" class="w-full p-2 mb-2 border rounded">

            <div class="mb-2">
              <select [(ngModel)]="formTask.categoryId" class="w-full p-2 border rounded bg-white">
                <option [ngValue]="undefined">無分類</option>
                <option *ngFor="let cat of availableCategories" [value]="cat.id">{{ cat.name }}</option>
              </select>
            </div>

            <input [(ngModel)]="formTask.date" type="date" placeholder="日期" class="w-full p-2 mb-2 border rounded">

            <!-- Time and Reminder Block toggle -->
            <div class="mb-2 flex items-center gap-2 cursor-pointer text-milktea-600" (click)="showTimeReminder = !showTimeReminder">
              <span class="material-icons text-sm">{{ showTimeReminder ? 'expand_less' : 'expand_more' }}</span>
              <span class="text-sm font-bold">{{ showTimeReminder ? '隱藏進階設定 (時間與提醒)' : '進階設定 (時間與提醒)' }}</span>
            </div>

            <div *ngIf="showTimeReminder" class="bg-milktea-50 p-3 rounded-xl border border-milktea-100 mb-2">
              <div class="flex gap-2 mb-2">
                <div class="w-1/2 flex flex-col">
                  <label class="text-xs text-milktea-500 mb-1 font-bold">開始時間</label>
                  <input [(ngModel)]="formTask.startTime" type="time" class="w-full p-2 border rounded">
                </div>
                <div class="w-1/2 flex flex-col">
                  <label class="text-xs text-milktea-500 mb-1 font-bold">結束時間</label>
                  <input [(ngModel)]="formTask.endTime" type="time" class="w-full p-2 border rounded" [disabled]="!formTask.startTime">
                </div>
              </div>

              <div class="flex items-center gap-2 mb-2">
                 <span class="text-sm text-milktea-600 font-bold">提醒:</span>
                 <select [(ngModel)]="formTask.reminderOffset" class="flex-1 p-2 border rounded bg-white text-milktea-900" [disabled]="!formTask.startTime">
                    <option [ngValue]="null">不提醒</option>
                    <option [ngValue]="15">提前 15 分鐘</option>
                    <option [ngValue]="30">提前 30 分鐘</option>
                    <option [ngValue]="60">提前 1 小時</option>
                    <option [ngValue]="1440">提前 1 天</option>
                 </select>
              </div>

              <label class="flex items-center gap-2 mt-2 mb-2 p-2 bg-white rounded-lg border border-milktea-100" *ngIf="formTask.reminderOffset !== null">
                 <input type="checkbox" [checked]="(formTask | any).enablePush" (change)="(formTask | any).enablePush = !(formTask | any).enablePush" class="rounded w-4 h-4 text-milktea-600 border-milktea-300">
                 <span class="text-sm font-bold text-milktea-900">開啟推播通知</span>
                 <span class="material-icons text-milktea-500 text-sm ml-auto">notifications_active</span>
              </label>
              <div *ngIf="(formTask | any).enablePush && formTask.reminderOffset !== null" class="text-xs text-milktea-500 px-2">
                將會在設定時間推播通知至您的裝置
              </div>
            </div>

            <div class="flex flex-col gap-2 mb-2 border rounded p-2 bg-white">
               <label class="flex items-center gap-2 mb-2" *ngIf="editingTask?.id">
                   <input type="checkbox" [checked]="formTask.status === 'completed'" (change)="formTask.status = formTask.status === 'completed' ? 'pending' : 'completed'" class="rounded w-4 h-4 text-milktea-600 border-milktea-300">
                   <span class="text-sm font-bold text-milktea-900">標記為已完成</span>
               </label>
               <div class="flex gap-2 items-center mb-1">
                   <span class="text-sm text-milktea-600 font-bold">標籤</span>
                   <label class="flex items-center gap-1 text-sm text-red-500 font-bold whitespace-nowrap ml-auto">
                       <input type="checkbox" [(ngModel)]="formTask.isUrgent" class="rounded text-red-500"> 緊急
                   </label>
               </div>
               <div class="flex flex-wrap gap-1 mb-1" *ngIf="formTaskTags.length > 0">
                   <span *ngFor="let tag of formTaskTags" class="text-xs bg-milktea-100 text-milktea-800 px-2 py-1 rounded-full flex items-center gap-1">
                       {{ tag }}
                       <button class="text-milktea-400 hover:text-red-500 font-bold" (click)="removeFormTag(tag)">&times;</button>
                   </span>
               </div>
               <input [(ngModel)]="formTaskTagInput" (keydown.enter)="addFormTag()" placeholder="輸入標籤後按 Enter" class="w-full p-2 border rounded text-sm bg-gray-50 focus:bg-white outline-none">
            </div>

            <!-- Notes at the bottom -->
            <label class="text-xs text-milktea-500 mb-1 font-bold block mt-4">詳細內容 (備註)</label>
            <textarea [(ngModel)]="formTask.description" placeholder="輸入詳細內容..." class="w-full p-2 mb-2 border rounded" rows="3"></textarea>
          </div>

          <div class="flex justify-end gap-2 shrink-0 pt-4 border-t">
            <button class="px-4 py-2 border rounded-full text-milktea-600 font-bold" (click)="closeFormModal()">取消</button>
            <button class="px-4 py-2 bg-milktea-600 text-white rounded-full font-bold shadow-sm" [disabled]="!formTask.title" (click)="saveTask()">儲存</button>
          </div>
        </div>
      </div>"""

content = content.replace(old_form, new_form)

with open('todoghost/src/app/features/main-view/main-view.component.html', 'w') as f:
    f.write(content)
