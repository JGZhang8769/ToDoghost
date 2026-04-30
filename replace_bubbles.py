import re

with open('todoghost/src/app/features/main-view/main-view.component.html', 'r') as f:
    content = f.read()

# Fix settings checkbox bubbling
# <input type="checkbox" [(ngModel)]="localLoginAuth.valid" (change)="saveLoginAuth()" class="...">
# To: <input type="checkbox" [(ngModel)]="localLoginAuth.valid" (change)="saveLoginAuth(); $event.stopPropagation()" (click)="$event.stopPropagation()" class="...">

# Need to look for saveLoginAuth
# Actually, the user mentioned: 而且在勾選編輯功能設定的時候 為啥點一個就會返回到主頁去 我不能點完 反正你們就是即時同步監聽做儲存 我完成設定自然會按叉叉 在自己返回回去
# The issue is the "settings" modal overlay might have a click listener that closes the modal, and clicks inside the modal are bubbling up to the overlay.
# Let's find the settings modal in main-view.component.html

old_settings_overlay = """      <!-- Settings Overlay -->
      <div *ngIf="showSettings" class="fixed inset-0 z-[70] bg-black/20 backdrop-blur-sm transition-opacity" (click)="closeSettings()">
        <div class="fixed inset-x-0 bottom-0 max-w-3xl mx-auto bg-milktea-50 rounded-t-3xl shadow-2xl transform transition-transform duration-300"
             [style.height]="'90vh'">"""

new_settings_overlay = """      <!-- Settings Overlay -->
      <div *ngIf="showSettings" class="fixed inset-0 z-[70] bg-black/20 backdrop-blur-sm transition-opacity" (click)="closeSettings()">
        <div class="fixed inset-x-0 bottom-0 max-w-3xl mx-auto bg-milktea-50 rounded-t-3xl shadow-2xl transform transition-transform duration-300 flex flex-col"
             [style.height]="'90vh'" (click)="$event.stopPropagation()">"""

content = content.replace(old_settings_overlay, new_settings_overlay)

with open('todoghost/src/app/features/main-view/main-view.component.html', 'w') as f:
    f.write(content)
