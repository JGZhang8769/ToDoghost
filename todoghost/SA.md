# 系統架構設計 (System Architecture Design)

## 1. 系統概述
ToDoghost 是一個基於 Angular 開發的手機版專用 (iOS PWA 優先) 代辦事項與行事曆應用程式。此應用程式專為兩位情侶使用者設計，提供即時同步、離線支援，以及直覺的拖拉 (Drag and Drop) 和滑動 (Swipe) 操作。

## 2. 核心技術選型
*   **前端框架**: Angular 18 (Standalone Components)
*   **UI 樣式與組件**: Tailwind CSS v3, Angular Material CDK (DragDrop)
*   **後端服務**: Firebase (Firestore, Cloud Messaging)
*   **PWA 支援**: `@angular/pwa` 與 `@angular/service-worker`
*   **日期處理**: `date-fns`

## 3. 系統架構模組
### 3.1 核心服務 (Core Services)
*   **`UserService`**: 負責處理使用者的儲存、讀取與狀態維護。支援無密碼登入 (直接選擇使用者)。初始狀態若為空，將自動建立預設用戶 "R張" 與 "小芷"。
*   **`WorkspaceService`**: 管理共用空間 (最多兩人)。負責生成一次性邀請碼與處理空間加入邏輯。
*   **`TaskService`**: 負責代辦事項的 CRUD。所有對 Firestore 的寫入都會被本機快取以支援離線操作 (`persistentLocalCache`)，並在恢復連線時自動同步。
*   **`PushNotificationService`**: 處理 FCM 推播授權申請。

### 3.2 功能模組 (Feature Components)
*   **`LoginComponent`**: 提供仿 Netflix 的使用者選擇介面與新增使用者功能。
*   **`WorkspaceListComponent`**: 顯示已加入的空間列表，並提供建立新空間與輸入邀請碼加入空間的介面。
*   **`MainViewComponent`**: 主要的行事曆與代辦操作介面。包含月視圖、週視圖、日視圖 (時間軸)，以及從底部滑出的未排程代辦抽屜。處理複雜的拖拉、滑動複製/取消排程、標籤過濾與提醒通知排程邏輯。

## 4. 資料庫結構 (Firestore)
*   **`users`**: `{ id: string, name: string, avatar: string }`
*   **`workspaces`**: `{ id: string, name: string, createdAt: number, users: string[], inviteCode: string | null }`
*   **`tasks`**: `{ id: string, workspaceId: string, title: string, description: string, date: string | null, startTime: string | null, endTime: string | null, tags: string[], isUrgent: boolean, createdBy: string, status: string, reminderOffset: number | null, createdAt: timestamp, updatedAt: timestamp }`
