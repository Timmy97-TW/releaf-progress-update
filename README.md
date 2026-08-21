# ReLeaf — 給張嘉修校長的進度回報 (2026-08-22)

自 2026-06-18 拜訪之後的生物反應器進度回報、設計現況、到 10/21 的里程碑，
以及六個想當面請教的問題。中文為主，右上角可切換英文。

單一 `index.html`，沒有建置步驟。設計沿用 ReLeaf wiki 的 `tokens.css` 與 `page.css`。

## 寄出前必須做完的事

1. 頁面上所有 `待填` / `TBD` 標記，全部補上真實數據或刪除該列。
2. 刪掉 `index.html` 裡的 `<p class="draft">` 草稿橫幅。
3. 移除 `<meta name="robots" content="noindex">`。
4. 附錄的四個連結補上網址。
5. 拜訪區塊填上時段、人數、聯絡方式。

## 頁面結構

1. 64 天，五件事（摘要）
2. 6/18 → 今天（反應器三件事 + 當天九個題目的完整帳目）
3. 七個版本（V1–V7 橫向規格與能力圖）+ 五件工作的證據（可展開的儀器卡）
4. 操作點與放大（數字來自 Bioreactor Invariant Explorer）
5. 商業化單元 V6
6. 到 10/21 的里程碑
7. 六個問題 + 拜訪請求
8. 附錄

## 檔案結構

```
index.html              整頁
assets/css/tokens.css   從 wiki 複製，未修改
assets/css/page.css     從 wiki 複製，未修改
assets/css/update.css   這一頁專用的元件
assets/js/update.js     語言切換、目錄、燈箱
assets/img/             照片，全部來自 iGEM2026_Images，已縮到 1600 px
```

## 照片出處

全部取自 `iGEM2026_Images`，檔名對應如下：

| 這裡的檔名 | 原始檔 |
|---|---|
| `0618-group.jpg` | `20260618_General_Photo_ProfChang_BioreactorImportantDiscussion_Suggestion_Imporatnt.jpg` |
| `0618-advising.jpg` | `..._Suggestion_Imporatnt2.jpg` |
| `0618-prototype2.jpg` | `..._Suggestion2.jpg` |
| `0618-concept.jpg` | `..._Suggestion3.jpg` |
| `pressure-first-live.jpg` | `20260712_Drylab_Photo_Bioreactor...PressureSensor...` |
| `pressure-testing.jpg` | `20260813_Drylab_Photo_Bioreactor_PressureSensorTesting...` |
| `photometer-live.jpg` | `20260719_Drylab_Photo_ImportantInlinePhotometerWorking...` |
| `photometer-4fold.png` | `20260719_Drylab_Photo_PhotometerOverestimatesAround4FoldFromBiodrop.png` |
| `incubator-overview.jpg` | `20260803_Drylab_Photo_OverviewOfTheIncubator...` |
| `growthcurve-screen.jpg` | `20260803_Drylab_Photo_PhotometerBSubGrowthTestLongTest_ComputerScreen...` |
| `design-full.png` | `20260804_Drylab_Figure_BioreactorDesignFigureFullDesign.png` |
| `do-ph-sensors.jpg` | `20260805_Drylab_Photo_TestingOutPHAndDissolvedOxygenSensors.jpg` |
| `students-design.jpg` | `20260815_Drylab_Photo_StudentsDiscussingFutureDesigns...` |
| `reactor-running.jpg` | `20260720_Drylab_Photo_Bioreactor_GreatPhotoOfBioreactorRunning...` |
