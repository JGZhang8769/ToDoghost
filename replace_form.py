import re

with open('todoghost/src/app/features/main-view/main-view.component.html', 'r') as f:
    content = f.read()

old_form_part = """            <input [(ngModel)]="formTask.title" placeholder="標題" class="w-full p-2 mb-2 border rounded">
            <textarea [(ngModel)]="formTask.description" placeholder="詳細內容" class="w-full p-2 mb-2 border rounded" rows="2"></textarea>

            <div class="mb-2">
              <select [(ngModel)]="formTask.categoryId" class="w-full p-2 border rounded bg-white">
                <option [ngValue]="undefined">無分類</option>
                <option *ngFor="let cat of availableCategories" [value]="cat.id">{{ cat.name }}</option>
              </select>
            </div>

            <input [(ngModel)]="formTask.date" type="date" placeholder="日期" class="w-full p-2 mb-2 border rounded">
            <div class="flex gap-2 mb-2">
              <input [(ngModel)]="formTask.startTime" type="time" placeholder="開始時間" class="flex-1 p-2 border rounded">
              <input [(ngModel)]="formTask.endTime" type="time" placeholder="結束時間" class="flex-1 p-2 border rounded">
            </div>

            <div class="flex flex-col gap-2 mb-2 border rounded p-2 bg-white">
               <div class="flex items-center gap-2 justify-between">
                   <label class="text-sm font-bold text-milktea-800">開啟推播提醒</label>
                   <input type="checkbox" [(ngModel)]="formTask.enablePush" class="w-4 h-4 accent-milktea-600">
               </div>
               <div class="text-xs text-milktea-500 mb-1">須設定日期與開始時間</div>
               <select [(ngModel)]="formTask.reminderOffset" class="flex-1 p-2 border rounded bg-white text-milktea-900" [disabled]="!formTask.startTime">
                   <option [ngValue]="0">時間到時</option>
                   <option [ngValue]="5">5 分鐘前</option>
                   <option [ngValue]="10">10 分鐘前</option>
                   <option [ngValue]="15">15 分鐘前</option>
                   <option [ngValue]="30">30 分鐘前</option>
                   <option [ngValue]="60">1 小時前</option>
               </select>
            </div>"""

new_form_part = """            <input [(ngModel)]="formTask.title" placeholder="標題" class="w-full p-2 mb-2 border rounded">
            <div class="mb-2">
              <select [(ngModel)]="formTask.categoryId" class="w-full p-2 border rounded bg-white">
                <option [ngValue]="undefined">無分類</option>
                <option *ngFor="let cat of availableCategories" [value]="cat.id">{{ cat.name }}</option>
              </select>
            </div>

            <input [(ngModel)]="formTask.date" type="date" placeholder="日期" class="w-full p-2 mb-2 border rounded">

            <button class="text-xs text-milktea-600 font-bold mb-2 w-full text-left p-2 bg-milktea-50 rounded" (click)="showTimeReminder = !showTimeReminder">
                {{ showTimeReminder ? '隱藏時間與提醒' : '新增時間與提醒 (選填)' }}
            </button>

            <div *ngIf="showTimeReminder" class="mb-2 p-2 border border-milktea-100 rounded bg-milktea-50/50">
              <div class="flex gap-2 mb-2">
                <div class="flex-1 flex flex-col gap-1">
                  <span class="text-xs text-milktea-500 font-bold pl-1">開始時間</span>
                  <input [(ngModel)]="formTask.startTime" type="time" placeholder="開始時間" class="w-full p-2 border rounded">
                </div>
                <div class="flex-1 flex flex-col gap-1">
                  <span class="text-xs text-milktea-500 font-bold pl-1">結束時間</span>
                  <input [(ngModel)]="formTask.endTime" type="time" placeholder="結束時間" class="w-full p-2 border rounded">
                </div>
              </div>

              <div class="flex flex-col gap-2 border rounded p-2 bg-white">
                 <div class="flex items-center gap-2 justify-between">
                     <label class="text-sm font-bold text-milktea-800">開啟推播提醒</label>
                     <input type="checkbox" [(ngModel)]="formTask.enablePush" class="w-4 h-4 accent-milktea-600">
                 </div>
                 <div class="text-xs text-milktea-500 mb-1">須設定日期與開始時間</div>
                 <select [(ngModel)]="formTask.reminderOffset" class="flex-1 p-2 border rounded bg-white text-milktea-900" [disabled]="!formTask.startTime">
                     <option [ngValue]="0">時間到時</option>
                     <option [ngValue]="5">5 分鐘前</option>
                     <option [ngValue]="10">10 分鐘前</option>
                     <option [ngValue]="15">15 分鐘前</option>
                     <option [ngValue]="30">30 分鐘前</option>
                     <option [ngValue]="60">1 小時前</option>
                 </select>
              </div>
            </div>

            <textarea [(ngModel)]="formTask.description" placeholder="詳細內容（備註）" class="w-full p-2 mb-2 border rounded" rows="2"></textarea>"""

content = content.replace(old_form_part, new_form_part)

with open('todoghost/src/app/features/main-view/main-view.component.html', 'w') as f:
    f.write(content)
