import re

with open('todoghost/src/app/features/main-view/main-view.component.html', 'r') as f:
    content = f.read()

# Fix login auth settings bubbling
# <input type="checkbox" [(ngModel)]="localLoginAuth.valid" (change)="saveLoginAuth()" class="...">
# To: <input type="checkbox" [(ngModel)]="localLoginAuth.valid" (change)="saveLoginAuth()" (click)="$event.stopPropagation()" class="...">

old_auth = """            <div class="flex items-center justify-between mt-4 bg-white p-3 rounded-xl border border-milktea-100 shadow-sm">
              <span class="font-bold text-milktea-800">啟用 Face ID / 密碼登入</span>
              <input type="checkbox" [(ngModel)]="localLoginAuth.valid" (change)="saveLoginAuth()" class="w-5 h-5 accent-milktea-600">
            </div>"""

new_auth = """            <div class="flex items-center justify-between mt-4 bg-white p-3 rounded-xl border border-milktea-100 shadow-sm" (click)="$event.stopPropagation()">
              <span class="font-bold text-milktea-800">啟用 Face ID / 密碼登入</span>
              <input type="checkbox" [(ngModel)]="localLoginAuth.valid" (change)="saveLoginAuth()" (click)="$event.stopPropagation()" class="w-5 h-5 accent-milktea-600">
            </div>"""

content = content.replace(old_auth, new_auth)

with open('todoghost/src/app/features/main-view/main-view.component.html', 'w') as f:
    f.write(content)
