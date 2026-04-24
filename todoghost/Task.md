# 開發任務清單 (Task Breakdown)

## 階段一：專案初始化與基礎建設 (Phase 1: Setup & Infrastructure)
- [x] 使用 Angular CLI 建立 Angular 18 Standalone 專案。
- [x] 安裝 Tailwind CSS 並配置 `milktea` 主題色彩。
- [x] 加入 `@angular/pwa` 生成 manifest 與 service worker，並配置 `firebase-messaging-sw.js`。
- [x] 整合 `@angular/fire`，設定 Firestore (啟用 `persistentLocalCache` 以支援離線) 與 Auth/Messaging。
- [x] 安裝 `@angular/cdk` 處理拖拉，安裝 `date-fns` 處理日期邏輯。

## 階段二：核心服務開發 (Phase 2: Core Services)
- [x] 實作 `UserService`: 使用者登入/登出 (LocalStorage 保存)、讀取 Firebase 用戶列表、自動生成預設用戶。
- [x] 實作 `WorkspaceService`: 建立空間、生成邀請碼、根據邀請碼加入空間 (人數限制兩人)。
- [x] 實作 `TaskService`: 代辦事項的 CRUD 操作。
- [x] 實作 `PushNotificationService`: 請求 FCM 權限與攔截前景訊息，並提供本地端提醒排程 (`setTimeout`)。

## 階段三：UI 組件與互動實作 (Phase 3: UI & Interactions)
- [x] 開發 `SvgIconComponent`：內建豹貓、金漸層、兔子、老虎的 SVG 向量圖。
- [x] 開發 `LoginComponent`：無密碼登入畫面，點選頭像即登入，支援新增用戶功能。
- [x] 開發 `WorkspaceListComponent`：空間列表，支援透過邀請碼加入與建立新空間。
- [x] 開發 `MainViewComponent` 核心佈局：頭部資訊、視圖切換 (月/週/日)、篩選按鈕、底部未排程抽屜。
- [x] **日曆視圖邏輯**:
    - [x] 月視圖 (Month View): 日期網格、紅點指示器、點擊展開精簡列表。
    - [x] 週視圖 (Week View): 橫向列表顯示整週任務。
    - [x] 日視圖 (Day View): 24小時時間軸、任務長度計算與重疊位移邏輯。
- [x] **拖拉邏輯 (Drag and Drop)**:
    - [x] 將底部抽屜的未排程任務拖拉至月/週視圖 (指派日期)。
    - [x] 將底部抽屜任務拖拉至日視圖 (指派日期與開始時間)。
    - [x] 設置垃圾桶接收區，將排程任務拖入以「取消排程」。
- [x] **滑動邏輯 (Swipe)**:
    - [x] 實作自訂的 `touchstart/move/end` 邏輯計算水平滑動。
    - [x] 向左滑觸發「複製」、向右滑觸發「取消排程」。
    - [x] 確保與 CDK Drag 的事件不衝突 (`cdkDragHandle` 分離)。
- [x] **表單與其他功能**:
    - [x] 新增/編輯代辦表單 (包含標題、內容、日期、起迄時間、標籤、緊急度、提醒時間設定)。
    - [x] 實作本地端提醒邏輯 (依據 `reminderOffset` 提前觸發 Notification)。
    - [x] 實作標籤與緊急狀態過濾器。

## 階段四：測試與交付 (Phase 4: Testing & Delivery)
- [x] 修復所有 `zone.js` 問題確保 `ng serve` 與 `ng build` 成功。
- [x] 修正測試設定，確保 `ng test --browsers=ChromeHeadless` 通過。
- [x] 執行 Code Review 確認無阻塞性錯誤。
- [x] 撰寫 MD 文件 (SA.md, Design.md, Task.md)。
