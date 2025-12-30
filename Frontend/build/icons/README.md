生成應用與安裝程式圖示 (Windows / macOS)

目標
- 為 Windows 與 NSIS 安裝程式提供多尺寸的 ICO：包含 256, 128, 64, 48, 32, 16。
- 為 macOS 提供 `.icns`（若需要）。

建議來源檔
- 一個高解析度的 PNG 或 SVG（例如：白色機器人圖示，透明背景），尺寸 1024x1024 或更大。

使用 ImageMagick 產生 .ico（Windows）
- 需要先安裝 ImageMagick（https://imagemagick.org）
- 範例：
  magick convert icon-1024.png -resize 256x256 icon-256.png
  magick convert icon-1024.png -resize 128x128 icon-128.png
  magick convert icon-1024.png -resize 64x64 icon-64.png
  magick convert icon-1024.png -resize 48x48 icon-48.png
  magick convert icon-1024.png -resize 32x32 icon-32.png
  magick convert icon-1024.png -resize 16x16 icon-16.png
  magick convert icon-256.png icon-128.png icon-64.png icon-48.png icon-32.png icon-16.png build/icons/icon.ico

或一次性產生（某些 ImageMagick 版本支援）：
  magick convert icon-1024.png -define icon:auto-resize=256,128,64,48,32,16 build/icons/icon.ico

產生 macOS `.icns`（選擇性）
- 需要 macOS 或 icns 工具（例如 `png2icns`）
- 範例：
  png2icns build/icons/icon.icns icon-1024.png

檔案放置建議
- 把原始高解析度圖放到 `build/icons/icon-1024.png` 或 `build/icons/icon.svg`。
- 產生的 `icon.ico` 放到 `build/icons/icon.ico`。
- 你也可以提供 `installerIcon.ico` 與 `uninstallerIcon.ico`（可與主 icon 相同或微調）。

注意
- electron-builder 會在 Windows 使用 `build.icons.icon.ico`（或 `build/icon.ico`），macOS 需要 `.icns`。
- 我已經在 `package.json` 中設定預期路徑為 `build/icons/icon.ico` 和安裝程式圖示路徑 `build/icons/installerIcon.ico`。

如果你上傳一個 PNG 或 SVG，我可以幫你把它轉成 ICO/ICNS（需要 ImageMagick / macOS 工具在執行環境）。
