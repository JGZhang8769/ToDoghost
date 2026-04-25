# 設計規範 (Design Guidelines)

## 1. 視覺主題 (Visual Theme)
整體應用程式採用「奶茶色系 (Milktea Palette)」為主軸，強調簡單、乾淨、溫暖的視覺體驗。

## 2. 響應式與 PWA 設計 (Responsive & PWA Design)
*   以 iOS Mobile (iPhone 15 Pro / iPad) 為優先考量。
*   禁用原生網頁的反彈效果與捲動條 (`no-scrollbar`)。
*   全域 CSS 設置 `user-select: none` 與 `-webkit-touch-callout: none`，並在 `meta viewport` 加入 `user-scalable=no` 避免被縮放跟反白。
*   底部抽屜 (Bottom Drawer) 使用絕對定位遮罩 (Overlay) 方式實作，避免撐開原有頁面長度。
*   高度計算須包含 `env(safe-area-inset-bottom)` 確保 iOS 底部橫條不會遮擋內容。

## 3. 互動設計 (Interaction Design)
*   **拖拉 (Drag and Drop)**:
    *   使用者可將未排程抽屜中的事項拖曳至月、週、日視圖。
    *   日視圖有「全天/未指定時間」專屬拖曳區，以及「時間網格」。若拖到時間網格且未指定結束時間，預設佔用一小時並有獨特的視覺區隔 (漸層或虛線底色)。
    *   拖拉啟動時，畫面才浮現右上角垃圾桶供取消排程。
    *   **拖曳預覽 (Drag Preview)**: 為了避免視線遮蔽，所有拖曳動作發生時，預覽圖樣僅顯示為一顆紅色圓點。
*   **滑動 (Swipe)**:
    *   自訂水平滑動事件，確保使用者滑出「複製」或「取消」按鈕時手感順暢，並設定閥值以防在電腦版或拖拉時誤觸。
*   **標籤 (Tags)**:
    *   輸入時採晶片 (Chip) 樣式，輸入逗號或 Enter 即可產生新標籤。
    *   過濾器採多選，支援 AND/OR 切換。
