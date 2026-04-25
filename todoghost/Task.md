# 開發任務清單 (Task Breakdown)

## 階段一：專案初始化與基礎建設 (Phase 1: Setup & Infrastructure)
- [x] 使用 Angular CLI 建立 Angular 18 Standalone 專案。
- [x] 安裝 Tailwind CSS、Angular Material 與 Firebase。
- [x] 加入 `@angular/pwa` 並配置相關 PWA 防縮放與防選取 CSS。

## 階段二：核心服務開發 (Phase 2: Core Services)
- [x] 實作 `UserService`: 支援無密碼登入與預設用戶。
- [x] 實作 `WorkspaceService`: 建立/修改空間、生成邀請碼。
- [x] 實作 `TaskService`: 代辦事項的 CRUD 操作與離線快取。

## 階段三：UI 組件與互動優化 (Phase 3: UI & Interactions)
- [x] **全域與選單**:
    - [x] 空間列表改用自訂 Modal (取代原生的 alert/prompt)。
    - [x] 空間名稱可在頂部 Header 點擊編輯。
- [x] **視圖重構**:
    - [x] 週視圖 (Week View): 改為手機友善的直式卡片清單，不再橫向擠壓。
    - [x] 日視圖 (Day View): 新增頂部「全天」專區。重疊任務使用更好的排版邏輯，且無結束時間的任務樣式予以區別。
- [x] **互動體驗提升**:
    - [x] 垃圾桶 (Trash) 改為全域 Floating Dropzone，只在拖曳狀態時顯示，不阻擋 UI。
    - [x] 修復拖曳跟手感，確保日視圖中重新拖拉已有排程的任務與抽屜拉出的手感一致。
    - [x] 底部未排程抽屜改為 Overlay 模式，拖曳時自動收合，不撐開頁面高度。
    - [x] 修正月視圖下拉清單位置與 Z-Index 遮擋問題。
    - [x] 移除日、週圖多餘垃圾桶，統一 header 背景透明樣式。
- [x] **表單與過濾**:
    - [x] 標籤輸入改為 Chip (Angular Material) 或等效 UI，隨打隨建。
    - [x] 標籤過濾支援選單直接點選，並有 AND/OR 切換開關。
    - [x] 增加依據建立者 (Created By) 篩選功能。
    - [x] 儲存表單時檢核「開始時間不能晚於結束時間」。
