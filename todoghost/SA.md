# 系統架構設計 (System Architecture Design)

## 1. 系統概述
ToDoghost 是一個基於 Angular 開發的手機版專用 (iOS PWA 優先) 代辦事項與行事曆應用程式。此應用程式專為兩位情侶使用者設計，提供即時同步、離線支援，以及直覺的拖拉 (Drag and Drop) 和滑動 (Swipe) 操作。

## 2. 核心技術選型
*   **前端框架**: Angular 18 (Standalone Components)
*   **UI 樣式與組件**: Tailwind CSS v3, Angular Material CDK (DragDrop)
*   **後端服務**: Firebase (Firestore, Cloud Messaging)
*   **PWA 支援**: `@angular/pwa` 與 `@angular/service-worker`，並設定了 `user-scalable=no` 避免被縮放。
*   **日期處理**: `date-fns`

## 3. 系統架構模組
### 3.1 核心服務 (Core Services)
*   **`UserService`**: 負責處理使用者的儲存、讀取與狀態維護。支援無密碼登入。
*   **`WorkspaceService`**: 管理共用空間 (最多兩人)。負責生成一次性邀請碼與處理空間名稱修改。
*   **`TaskService`**: 負責代辦事項的 CRUD。支援離線操作 (`persistentLocalCache`)。
*   **`PushNotificationService`**: 處理 FCM 推播授權申請與前台訊息。

### 3.2 功能模組 (Feature Components)
*   **`LoginComponent`**: 提供仿 Netflix 的使用者選擇介面與新增使用者功能。
*   **`WorkspaceListComponent`**: 顯示已加入的空間列表，自訂彈窗建立空間與輸入邀請碼。
*   **`MainViewComponent`**: 主要的行事曆與代辦操作介面。包含：
    *   月視圖
    *   週視圖 (改為直式時間軸以利手機閱讀)
    *   日視圖 (改進了全天區塊與排程重疊顯示)
    *   底部浮動抽屜 (絕對定位不影響主體滾動)
    *   全域拖曳垃圾桶 (只有在拖曳時顯示)

## 4. 資料庫結構 (Firestore)
*   **`users`**: `{ id: string, name: string, avatar: string }`
*   **`workspaces`**: `{ id: string, name: string, createdAt: number, users: string[], inviteCode: string | null }`
*   **`tasks`**: `{ id: string, workspaceId: string, title: string, description: string, date: string | null, startTime: string | null, endTime: string | null, tags: string[], isUrgent: boolean, createdBy: string, status: string, reminderOffset: number | null, createdAt: timestamp, updatedAt: timestamp }`
