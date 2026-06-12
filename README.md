# Setsuna Discord 機器人

🌐 [English](README_en.md) | [繁體中文](README.md)

一個能連接多種 LLM API 並在指定頻道與用戶聊天的 Discord AI 機器人，整合了音樂播放、雲端視覺網頁操作、OCR 圖片識別與 YouTube 影片分析等多功能。

---

## 🚀 功能特色

### 智能對話與記憶
- **脈絡理解**：透過分析頻道訊息歷史，提供有脈絡的回覆。
- **回覆識別**：能夠識別用戶指定回覆的訊息，並針對回覆內容做出相應回應。
- **長對話記憶**：支援長對話記憶，可記住頻道中最近的 50 則對話。
- **個性化人設**：可設定個性化回覆風格與角色設定，讓機器人在不同頻道展現不同性格。
- **私人訊息 (DM)**：支援私人訊息聊天，無需在伺服器中啟用即可私聊。

### 🔌 多模型支援
- 整合多種熱門 LLM API：
  - **Groq** (提供極速回覆，支援 8 種以上模型如 Llama 3.3, Llama 3.1, Llama 4, Saba 等)
  - **Gemini** (Google's AI model)
  - **ChatGPT** (OpenAI GPT 系列模型)
  - **Together AI** (Llama 3.3 等雲端模型)
  - **DeepSeek** (DeepSeek 系列模型)
  - **Cerebras** (極速 Llama 系列與 Qwen 系列模型)
  - **Mistral AI** (Mistral-small, Nemo 等模型)
  - **Character.AI** (使用 Character.AI 上的自訂角色進行對話)
- 支援在啟用頻道時選擇使用的模型，並可隨時切換。
- 頻道模型偏好持久化保存，重啟後不遺失。
- 多 API Key 輪換機制，確保服務穩定性與防止超限 (Rate Limit)。

### 🎨 圖片生成與理解
- **文生圖**：支援根據文字描述生成圖片（由 Gemini 提供支援）。
- **圖片理解**：可識別用戶上傳的圖片內容，進行問答（如：圖片中有幾隻貓？）。
- **圖片風格轉換**：支援圖片風格轉換（如：油畫風格、像素風格、增加/減少畫面上的物件等）。
- **AI 智能判定**：支援 AI 智慧判定畫圖請求（可透過 `/setsuna aidetect` 指令開啟/關閉）。

### 🎵 智慧音樂播放
- **全功能播放器**：支援播放來自 **YouTube**、**Spotify** 與 **SoundCloud** 的音樂、專輯或播放清單。
- **智慧語意觸發**：在已啟用的聊天頻道中，只要直接輸入「幫我播 [歌名]」、「播放 [歌名]」、「play [song]」等自然語言，AI 或內建正則會自動判定播歌意圖，讓 Bot 自動加入您所在的語音頻道並播放歌曲！
- **語意切歌與暫停**：支援透過聊天對話要求「切歌/跳過」、「暫停」、「繼續」、「停止播放」。
- **豐富的控制指令**：提供完整的音樂控制指令（詳見 [音樂控制指令](#音樂控制指令)）。

### 🌐 雲端視覺網頁操作 (OpenClaw 整合)
- **智慧網頁瀏覽**：當用戶詢問需要上網查詢即時資料（如天氣、最新新聞、今天股價、公車到站等），AI 會自動判定為上網意圖 (`BROWSE_WEB`)。
- **OpenClaw 雲端操作**：Bot 會自動調用 OpenClaw 雲端瀏覽器進行實時網頁搜尋或造訪特定網站。
- **網頁截圖與下載**：支援用戶明確要求對特定網頁進行截圖或下載檔案（例如：「幫我截圖 Google 首頁」）。
- **免費雲端部署 (Hugging Face)**：OpenClaw 可以部署於 **Hugging Face Spaces**，完全免費且**無需信用卡**。
- **完美防 Ban 機制**：採用精心設計的規避機制（優先使用內建 `web_search` 搜尋以避免被防機器人機制阻擋；搜尋時造訪 DuckDuckGo 規避 Google/Yahoo 的 WAF 阻擋等），完美避免 HF 帳號被 Ban 的風險，確保服務持久穩定。

### 📝 OCR 圖片文字識別 (Tesseract.js)
- **圖片轉文字**：支援直接從用戶上傳的圖片中提取文字。
- **簡單觸發**：在 Discord 頻道中上傳圖片，並在訊息中附帶關鍵字（如：`ocr`、`文字識別`、`圖片轉文字`、`讀取圖片`、`extract text` 等），Bot 即會自動下載圖片並調用 Tesseract.js 解析，將文字結果送入對話上下文中讓 AI 進行後續分析。

### 📺 YouTube 影片理解
- **網址解析**：可解析 YouTube 影片連結，顯示影片標題、頻道和簡介。
- **影片摘要**：支援 YouTube 影片內容摘要。
- **影片問答**：可根據影片內容進行問答。
- **影片搜尋**：支援 YouTube 影片搜尋功能。

### ⚙️ 管理與備份
- **GitHub 自動備份**：頻道設定與模型偏好會自動持久化備份保存到 GitHub 倉庫中，確保重新部署後設定不遺失。
- **Dev 專用設定**：支援管理員透過指令更換 Bot 的頭像與橫幅。

---

## 🛠️ 環境變數設定

建立 `.env` 檔案並填入以下金鑰：

```env
# Discord 機器人 Token
DISCORD_TOKEN=你的 Discord bot token

# AI 模型 API 金鑰 (至少填寫一個)
GEMINI_API_KEY=你的 Gemini API 金鑰
DEEPSEEK_API_KEY=你的 DeepSeek API 金鑰
CHATGPT_API_KEY=你的 ChatGPT API 金鑰
MISTRAL_API_KEY=你的 Mistral API 金鑰
GROQ_API_KEY=你的 Groq API 金鑰
TOGETHER_API_KEY=你的 Together AI API 金鑰
CEREBRAS_API_KEY=你的 Cerebras API 金鑰

# Character.AI 設定
CHARACTERAI_TOKEN=你的 Character.AI 訪問令牌
CHARACTERAI_CHARACTER_ID=你想使用的 Character.AI 角色 ID

# YouTube API (用於影片搜尋和 URL 預覽功能)
YOUTUBE_API_KEY=你的 YouTube API 金鑰

# OpenClaw 雲端視覺網頁操作 (可部署在 Hugging Face Spaces，完全免費免信用卡)
OPENCLAW_API_URL=你的 OpenClaw 部署網址
OPENCLAW_GATEWAY_PASSWORD=你的 OpenClaw 閘道密碼

# 機器人擁有者 ID (多個請用逗號隔開，用於 /setprofile 與部分限制指令)
BOT_OWNER_ID=你的Discord用戶ID,其他管理員ID

# GitHub 備份設定 (用於儲存頻道設定與模型偏好)
GITHUB_REPO=你的 GitHub 倉庫名稱 (例如：yourusername/yourrepository)
GITHUB_TOKEN=你的 GitHub Personal Access Token (PAT)
```

> [!TIP]
> 為了避免 API 速率限制，你可以為各個服務配置多個 API Key。只需在變數名稱後加上數字即可，例如：`GEMINI_API_KEY_2=...`、`GROQ_API_KEY_2=...`。

---

## 📦 安裝步驟

### 本地開發

1. 複製本專案到本地。
2. 安裝依賴：
   ```bash
   npm install
   ```
3. 確保 `temp` 目錄存在於項目根目錄下（用於儲存 OCR 臨時圖片）：
   ```bash
   mkdir temp
   ```
4. 建立並配置 `.env` 檔案。
5. 啟動機器人：
   ```bash
   npm start
   # 或使用 nodemon 進行開發
   npm run dev
   ```

### 24 小時雲端部署

#### 選項 1：Railway
Railway 提供簡單的雲端部署平台：
1. 連結 GitHub repository。
2. 在 Railway 後台新增環境變數。
3. 部署你的應用程式。

#### 選項 2：Render
1. 建立新的 Web Service。
2. 設定 build 指令為 `npm install`。
3. 設定 start 指令為 `node server.js & node index.js`。
4. 新增環境變數並部署。

#### 選項 3：Heroku
1. 在專案根目錄建立 `Procfile`，內容如下：
   ```text
   worker: npm start
   ```
2. 使用 Heroku CLI 部署，並在後台配置環境變數，將 worker 擴展為 1：
   ```bash
   heroku ps:scale worker=1
   ```

---

## 🎮 指令與使用方法

### 🤖 Setsuna 系統指令

這些指令需要使用者在伺服器中擁有 **管理頻道 (Manage Channels)** 的權限。若不指定 `#頻道名稱`，則預設為當前頻道。

- `/setsuna activate [#頻道名稱] [模型] [子模型]`
  - 在指定頻道啟用機器人。
  - **模型選項**：Groq, Gemini, ChatGPT, Mistral, DeepSeek, Cerebras, Character.AI。
- `/setsuna deactivate [#頻道名稱]`
  - 在指定頻道停用機器人。
- `/setsuna setmodel [模型] [子模型] [#頻道名稱]`
  - 更改指定頻道使用的模型和特定的子模型（如 Groq 模型或 Cerebras 模型）。
- `/setsuna checkmodel [#頻道名稱]`
  - 檢查頻道當前使用的模型。
- `/setsuna setpersonality [人設 prompt] [是否重設] [#頻道名稱]`
  - 設定機器人人設，自訂機器人的回覆風格和個性（若勾選重設則恢復預設）。
- `/setsuna checkpersonality [#頻道名稱]`
  - 檢查當前頻道中機器人的自訂人設。
- `/setsuna aidetect [啟用/停用] [#頻道名稱]`
  - 開啟/關閉 AI 智慧判定畫圖請求功能。
- `/reset chat [#頻道名稱]`
  - 重置指定或當前頻道的聊天記錄。

### 🎵 音樂控制指令

使用 `/music` 主指令與其子指令進行音樂播放控制：

- `/music play [搜尋關鍵字或網址]`：播放音樂（支援 YouTube、Spotify、SoundCloud 連結或播放清單）。
- `/music pause`：暫停播放。
- `/music resume`：繼續播放。
- `/music skip [目標位置]`：跳過當前歌曲（可指定跳到隊列中的特定位置）。
- `/music stop`：停止播放並讓 Bot 離開語音頻道。
- `/music queue [頁碼]`：顯示當前播放隊列。
- `/music nowplaying`：顯示正在播放的歌曲詳細資訊。
- `/music shuffle`：隨機打亂播放隊列順序。
- `/music loop [模式]`：設定循環模式（關閉、單曲循環、整個隊列循環）。
- `/music volume [音量 0-150]`：調整播放音量。
- `/music seek [時間]`：跳轉到指定時間點（格式如 `1:30` 或 `90` 秒）。
- `/music remove [隊列位置]`：從播放隊列中移除指定歌曲。
- `/music move [原始位置] [目標位置]`：移動隊列中歌曲的位置。
- `/music clear`：清空隊列（保留正在播放的歌曲）。
- `/music replay`：重新播放當前歌曲。
- `/music forward [秒數]`：快進歌曲（預設 10 秒）。
- `/music rewind [秒數]`：倒退歌曲（預設 10 秒）。
- `/music filter [濾鏡名稱]`：套用音效濾鏡：
  - `🔊 重低音 (Bassboost)`、`🌙 夜核 (Nightcore)`、`🌊 蒸汽波 (Vaporwave)`、`🎤 卡拉OK (Karaoke)`、`🔉 回音 (Echo)`、`🎧 3D 效果`、`🔄 環繞音效`、`⏪ 反轉` 等。

### 🛠️ 開發與社群指令

- `/setprofile [avatar] [banner] [avatar_file] [banner_file] [avatar_url] [banner_url]`
  - **開發者與 Bot 擁有者專用**。動態更改 Bot 的頭像與橫幅。
- `/contact`
  - 聯絡開發者或加入我們的社群伺服器以獲得支援。
- `/help`
  - 查看機器人的詳細使用說明與幫助。

---

## 📝 授權條款

本專案採用 [MIT 授權條款](LICENSE) 開源。
