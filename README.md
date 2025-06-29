<details>
<summary>🇹🇼 點擊展開／收起繁體中文說明</summary>

# Setsuna Discord 機器人

一個能連接 LLM API 並在指定頻道與用戶聊天的 Discord AI 機器人。

## 功能特色

### 🤖 智能對話
- 連接 Discord 並在設定的頻道回應訊息
- 透過分析頻道訊息歷史，提供有脈絡的回覆
- 能夠識別用戶指定回覆的訊息，並針對回覆內容做出相應回應
- 支援長對話記憶，可記住頻道中最近的50則對話
- 可設定個性化回覆風格，讓機器人在不同頻道展現不同性格

### 🔌 多模型支援
- 整合多種 LLM API（Groq、Gemini、ChatGPT、Together AI、DeepSeek、Cerebras）
- 可在啟用頻道時選擇使用的模型
- 支援選擇特定的 Groq 模型（12種）和 Cerebras 模型（4種）
- 可隨時切換頻道使用的模型
- 模型偏好持久化保存，重啟後不會遺失

### 🎨 圖片生成與理解
- 支援根據文字描述生成圖片
- 支援 AI 智能判定畫圖請求（可透過 `/setsuna aidetect` 指令開啟/關閉）
- 可識別用戶上傳的圖片內容
- 支援圖片風格轉換（如：油畫風格、像素風格、增加/減少畫面上的物件等）
- 可根據圖片進行問答（如：圖片中有幾隻貓？）

### 📺 YouTube 影片理解
- 可解析 YouTube 影片連結，顯示影片標題、頻道和簡介
- 支援 YouTube 影片內容摘要
- 可根據影片內容進行問答
- 支援 YouTube 影片搜尋功能

### ⚙️ 進階功能
- 支援簡單的頻道啟用／停用指令
- 可自訂義機器人人設
- 多 API Key 輪換機制，確保服務穩定性
- 頻道設定和模型偏好持久化保存到 GitHub

## 邀請 Setsuna
你可以用以下連結邀請 Setsuna 到你的 Discord 伺服器：
[邀請 Setsuna 到你的 Discord 伺服器](https://discord.com/oauth2/authorize?client_id=1372437324595462206&permissions=1689917160152128&integration_type=0&scope=applications.commands+bot)

伺服器設定教學請參考下方[使用方法](https://github.com/breadMSA/setsuna-discord-bot?tab=readme-ov-file#使用方法)。

## 安裝步驟

### 本地開發

1. 複製本專案
2. 安裝依賴：
   ```
   npm install
   ```
3. 建立 `.env` 檔案並填入 API 金鑰：
   ```
   DISCORD_TOKEN=你的 Discord bot token
   GEMINI_API_KEY=你的 Gemini API 金鑰
   DEEPSEEK_API_KEY=你的 DeepSeek API 金鑰
   CHATGPT_API_KEY=你的 ChatGPT API 金鑰
   GROQ_API_KEY=你的 Groq API 金鑰
   YOUTUBE_API_KEY=你的 YouTube API 金鑰 (用於 YouTube 影片搜尋和 URL 預覽功能)
   BOT_OWNER_ID=你的Discord用戶ID,其他管理員ID (非必要，但若欲使用/setprofile指令則須填寫。若有多個，請用逗號隔開，例如：123456789012345678,987654321098765432)
   TOGETHER_API_KEY=你的 Together AI API 金鑰
   CEREBRAS_API_KEY=你的 Cerebras API 金鑰
   GITHUB_REPO=你的 GitHub 倉庫名稱 (這是用於儲存頻道設定和模型偏好。範例：yourusername/yourrepository)
   GITHUB_TOKEN=你的 GitHub Personal Access Token (PAT)
   ```
4. 啟動機器人：
   ```
   npm start
   ```

### GitHub 部署

1. 建立新的 GitHub repository
2. 推送程式碼：
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/setsuna-discord-bot.git
   git push -u origin main
   ```

## 24 小時部署選項

### 選項 1：Railway

[Railway](https://railway.app/) 提供簡單的雲端部署平台，有免費方案。

1. 註冊 Railway 並連接 GitHub repository
2. 在 Railway 後台新增環境變數
3. 部署你的應用程式

### 選項 2：Render

[Render](https://render.com/) 提供免費的 Web 服務主機。

1. 註冊 Render 並連接 GitHub repository
2. 建立新的 Web Service
3. 設定 build 指令為 `npm install`
4. 設定 start 指令為 `node server.js & node index.js`
5. 新增環境變數
6. 部署你的應用程式

### 選項 3：Heroku

[Heroku](https://www.heroku.com/) 也是常見的 Discord bot 雲端主機。

1. 註冊 Heroku 並安裝 Heroku CLI
2. 在專案根目錄建立 `Procfile`，內容如下：
   ```
   worker: npm start
   ```
3. 部署到 Heroku：
   ```
   heroku create
   git push heroku main
   ```
4. 在 Heroku 後台新增環境變數
5. 啟動 worker：
   ```
   heroku ps:scale worker=1
   ```

### 選項 4：GitHub Actions + 自架 Runner

如果你有 24 小時運作的主機：

1. 設定 GitHub Actions workflow（`.github/workflows/deploy.yml`）：
   ```yaml
   name: Deploy Bot
   
   on:
     push:
       branches: [ main ]
   
   jobs:
     deploy:
       runs-on: self-hosted
       steps:
         - uses: actions/checkout@v2
         - name: Use Node.js
           uses: actions/setup-node@v2
           with:
             node-version: '16.x'
         - run: npm ci
         - run: pm2 restart setsuna || pm2 start index.js --name setsuna
   ```
2. 在主機安裝 PM2：`npm install -g pm2`
3. 設定自架 GitHub Actions runner
4. 推送到 GitHub 觸發部署

## 使用方法

機器人啟動後，你可以在 Discord 伺服器使用以下指令：

- `/setsuna activate #頻道名稱 [模型] [groq_model/cerebras_model]` - 在指定頻道啟用機器人，可選擇使用的模型（Groq、Gemini、ChatGPT、Together AI、DeepSeek、Cerebras、Character.AI）和特定的子模型
- `/setsuna deactivate #頻道名稱` - 在指定頻道停用機器人
- `/setsuna setmodel [模型] [groq_model/cerebras_model] #頻道名稱` - 更改指定頻道使用的模型和特定的子模型
- `/setsuna checkmodel #頻道名稱` - 檢查頻道當前使用的模型
- `/setsuna aidetect [true/false]`：開啟/關閉 AI 判定畫圖請求功能。
- `/setsuna setpersonality` - 設定機器人人設，自訂機器人的回覆風格和個性
- `/setsuna checkpersonality` - 檢查當前機器人人設
- 若不指定 #頻道名稱，則預設為當前頻道
- 若不指定模型，則預設使用 Groq
- 若選擇 Groq 但不指定 groq_model，則預設使用 llama-3.1-8b-instant
- `/reset_chat [channel]` - (需有管理頻道權限) 重置指定或當前頻道的聊天記錄

- `/contact` - 聯絡機器人開發者或加入我們的社群伺服器提供回饋、獲得支援
- `/help` - 查看機器人使用說明

### 💬 與 Setsuna 聊天

- 在 Setsuna 已啟用的頻道中直接輸入訊息即可開始聊天。
- Setsuna 會記住頻道中最近的 50 則訊息以了解對話脈絡。
- 你可以回覆 Setsuna 或其他用戶的訊息，Setsuna 能夠理解回覆的上下文。
- 如果你傳送 YouTube 影片的網址，Setsuna 會顯示影片的預覽資訊。
- 如果你請 Setsuna 幫忙找 YouTube 影片 (例如：「幫我找貓咪的影片」)，Setsuna 會嘗試搜尋並提供相關的影片連結。

## 授權條款

MIT

</details>

<details>
<summary>🇺🇸 Click to expand/collapse English instructions</summary>

# Setsuna Discord Bot

A Discord AI bot that connects to LLM API and chats with users in specific channels.

## Features

### 🤖 Intelligent Conversation
- Connects to Discord and responds to messages in configured channels
- Provides context-aware responses by analyzing channel message history
- Recognizes which messages users reply to, and responds accordingly to the reply context
- Supports long conversation memory, remembering the last 50 messages in a channel
- Allows customizable response styles to give the bot different personalities in different channels

### 🔄 Multiple AI Models Support
- Supports multiple AI models:
  - Groq (various models including Llama 3.1, Llama 3.3, Gemma 2, etc.)
  - Gemini (Google's AI model)
  - ChatGPT (OpenAI's GPT models)
  - Together AI (Llama-3.3-70B-Instruct-Turbo)
  - DeepSeek (DeepSeek's AI models)
  - Cerebras (various models including Llama 4, Llama 3.1, etc.)
  - Character.AI (Chat with characters from Character.AI)
- Allows setting different models for different channels
- Automatic API key rotation for load balancing and reliability
- Fallback mechanisms when API calls fail

### 🎨 Image Generation & Understanding
- Generates images based on text descriptions
- Identifies content in user-uploaded images
- Supports image style transformation (e.g., oil painting style, pixel art, adding/removing objects)
- Enables question answering based on images (e.g., "How many cats are in this picture?")

### 📺 YouTube Video Understanding
- Parses YouTube video links to display title, channel, and description
- Provides YouTube video content summaries
- Answers questions based on video content
- Supports YouTube video search functionality

### ⚙️ Advanced Features
- Simple channel activation/deactivation commands
- Customizable bot personality settings
- Multiple API key rotation for service stability
- Persistent channel settings and model preferences stored on GitHub

## Invite Setsuna
You can invite pre-built Setsuna to your Discord server using the following link:
[Invite Setsuna to your Discord server](https://discord.com/oauth2/authorize?client_id=1372437324595462206&permissions=1689917160152128&integration_type=0&scope=applications.commands+bot) 

For server setup tutorial, please refer to the [usage](https://github.com/breadMSA/setsuna-discord-bot?tab=readme-ov-file#usage) below.

## Setup

### Local Development

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file with your API keys:
   ```
   DISCORD_TOKEN=your_discord_bot_token
   GEMINI_API_KEY=your_gemini_api_key
   DEEPSEEK_API_KEY=your_deepseek_api_key
   CHATGPT_API_KEY=your_chatgpt_api_key
   GROQ_API_KEY=your_groq_api_key
   YOUTUBE_API_KEY=your_youtube_api_key (Required for YouTube video search and URL preview features)
   BOT_OWNER_ID=your_discord_user_id,other_admin_id (Not necessary. But if you'd like to use the /setprofile command, you need to fill in.For multiple owners, separate IDs with a comma, e.g., `123456789012345678,987654321098765432`)
   TOGETHER_API_KEY=your_together_ai_api_key
   CEREBRAS_API_KEY=your_cerebras_api_key
   GITHUB_REPO=your_github_repository_name (This is used to store channel settings and model preferences. E.g., yourusername/yourrepository)
   GITHUB_TOKEN=your_github_personal_access_token (PAT)
   CHARACTERAI_TOKEN=your_character_ai_token_here
   CHARACTERAI_CHARACTER_ID=your_character_id_here
   ```
4. Run the bot:
   ```
   npm start
   ```

### GitHub Setup

1. Create a new GitHub repository
2. Push your code to the repository:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/setsuna-discord-bot.git
   git push -u origin main
   ```

## Deployment Options for 24/7 Operation

### Option 1: Railway

[Railway](https://railway.app/) offers a simple deployment platform with a free tier.

1. Sign up for Railway and connect your GitHub repository
2. Add your environment variables in the Railway dashboard
3. Deploy your application

### Option 2: Render

[Render](https://render.com/) provides a free tier for web services.

1. Sign up for Render and connect your GitHub repository
2. Create a new Web Service
3. Set the build command to `npm install`
4. Set the start command to `node server.js & node index.js`
5. Add your environment variables
6. Deploy your application

### Option 3: Heroku

[Heroku](https://www.heroku.com/) is another popular option for hosting Discord bots.

1. Sign up for Heroku and install the Heroku CLI
2. Create a `Procfile` in your project root with the content:
   ```
   worker: npm start
   ```
3. Deploy to Heroku:
   ```
   heroku create
   git push heroku main
   ```
4. Add your environment variables in the Heroku dashboard
5. Scale your worker dyno:
   ```
   heroku ps:scale worker=1
   ```

### Option 4: GitHub Actions + Self-hosted Runner

If you have a server or computer that can run 24/7:

1. Set up a GitHub Actions workflow file (`.github/workflows/deploy.yml`):
   ```yaml
   name: Deploy Bot
   
   on:
     push:
       branches: [ main ]
   
   jobs:
     deploy:
       runs-on: self-hosted
       steps:
         - uses: actions/checkout@v2
         - name: Use Node.js
           uses: actions/setup-node@v2
           with:
             node-version: '16.x'
         - run: npm ci
         - run: pm2 restart setsuna || pm2 start index.js --name setsuna
   ```
2. Install PM2 on your server: `npm install -g pm2`
3. Set up a self-hosted GitHub Actions runner on your server
4. Push to GitHub to trigger the deployment

## Usage

Once the bot is running, you can use the following commands in your Discord server:

- `/setsuna activate #channel-name [model] [groq_model/cerebras_model]` - Activate the bot in designated channel with optional model selection (Groq, Gemini, ChatGPT, Together AI, DeepSeek, Cerebras, Character.AI) and specific submodel.
- `/setsuna deactivate #channel-name` - Deactivate the bot in the current channel.
- `/setsuna setmodel [model] [groq_model/cerebras_model] #channel-name` - Change the model and specific submodel used in the specified channel.
- `/setsuna checkmodel #channel-name` - Check which model is currently being used in the channel.
- `/setsuna aidetect [true/false]`：Enables/disables AI detection for image generation requests.
- `/setsuna setpersonality` - Set the bot's personality, customize its response style and character.
- `/setsuna checkpersonality` - Check the current bot personality settings.
- If #channel_name is not specified, defaults to the current channel.
- If model is not specified, defaults to Groq.
- If Groq is selected but no groq_model is specified, defaults to llama-3.1-8b-instant.
- `/reset_chat [channel]` - (Manage Channels permission required) Resets the chat history for Setsuna in the specified or current channel.

- `/contact` - Contact the bot developer or join our community server for feedback and support
- `/help` - View bot usage instructions

### 💬 Chatting with Setsuna

- Simply type your message in a channel where Setsuna is active.
- Setsuna remembers the last 50 messages in the channel for context.
- You can reply to Setsuna's messages or other users' messages, and Setsuna will understand the context.
- If you send a YouTube video URL, Setsuna will show a preview of the video.
- If you ask Setsuna to find a YouTube video (e.g., "help me find a cat video"), Setsuna will try to search and provide relevant video links.

## License

MIT

</details>
