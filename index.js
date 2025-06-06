require('dotenv').config();
const { Client, GatewayIntentBits, Partials, REST, Routes, PermissionFlagsBits, ChannelType, SlashCommandBuilder } = require('discord.js');
const fetch = require('node-fetch');
const OpenCC = require('opencc-js');
const path = require('path');
const { exec } = require('child_process');

// 初始化繁簡轉換器
const converter = OpenCC.Converter({ from: 'cn', to: 'tw' });

// 檢測文本是否包含繁體中文
function isTraditionalChinese(text) {
  // 繁體中文特有字符集
  const traditionalOnlyChars = new Set([
    '個', '學', '國', '後', '來', '時', '實', '樣', '點', '過',
    '體', '關', '當', '務', '產', '發', '會', '無', '與', '內',
    '萬', '開', '問', '們', '對', '業', '電', '這', '還', '經'
  ]);
  
  // 檢查文本中是否包含繁體中文特有字符
  for (const char of text) {
    if (traditionalOnlyChars.has(char)) {
      return true;
    }
  }
  
  return false;
}

// 確保文本使用繁體中文
function ensureTraditionalChinese(text) {
  return converter(text);
}

// 初始化消息歷史記錄存儲
const messageHistories = new Map();

// 配置選項
const CONFIG = {
  // 是否使用AI判定畫圖請求（消耗更多API額度，但更準確）
  useAIToDetectImageRequest: false, // 預設為關閉，可以通過指令開啟
};

// Check for required environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
if (!DISCORD_TOKEN) {
  console.error('ERROR: DISCORD_TOKEN environment variable is missing!');
  console.error('Please set your Discord bot token as an environment variable in Railway.');
  console.error('Go to your Railway project > Variables tab and add DISCORD_TOKEN=your_token_here');
  process.exit(1);
}

// Load all API keys for different models
const DEEPSEEK_API_KEYS = [
  process.env.DEEPSEEK_API_KEY,
  process.env.DEEPSEEK_API_KEY_2,
  process.env.DEEPSEEK_API_KEY_3
].filter(key => key); // Filter out undefined/null keys

const GEMINI_API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3
].filter(key => key); // Filter out undefined/null keys

const CHATGPT_API_KEYS = [
  process.env.CHATGPT_API_KEY,
  process.env.CHATGPT_API_KEY_2,
  process.env.CHATGPT_API_KEY_3
].filter(key => key); // Filter out undefined/null keys

const TOGETHER_API_KEYS = [
  process.env.TOGETHER_API_KEY,
  process.env.TOGETHER_API_KEY_2,
  process.env.TOGETHER_API_KEY_3
].filter(key => key); // Filter out undefined/null keys

const GROQ_API_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3
].filter(key => key); // Filter out undefined/null keys

const CEREBRAS_API_KEYS = [
  process.env.CEREBRAS_API_KEY,
  process.env.CEREBRAS_API_KEY_2,
  process.env.CEREBRAS_API_KEY_3
].filter(key => key); // Filter out undefined/null keys

// Check if any API keys are available
if (DEEPSEEK_API_KEYS.length === 0 && GEMINI_API_KEYS.length === 0 && CHATGPT_API_KEYS.length === 0 && TOGETHER_API_KEYS.length === 0 && GROQ_API_KEYS.length === 0 && CEREBRAS_API_KEYS.length === 0) {
  console.warn('WARNING: No API KEY environment variables are set!');
  console.warn('The bot will not be able to process messages without at least one key.');
}

// Keep track of current API key indices
let currentDeepseekKeyIndex = 0;
let currentGeminiKeyIndex = 0;
let currentChatGPTKeyIndex = 0;
let currentTogetherKeyIndex = 0;
let currentGroqKeyIndex = 0;
let currentCerebrasKeyIndex = 0;

// Default model to use
let defaultModel = 'groq'; // Options: 'deepseek', 'gemini', 'chatgpt', 'together', 'groq', 'cerebras'

// Channel model preferences
const channelModelPreferences = new Map();

// Map to store channel-specific Groq model preferences
const channelGroqModelPreferences = new Map();

// Map to store channel-specific Cerebras model preferences
const channelCerebrasModelPreferences = new Map();

// Default Groq model to use if no preference is set
const defaultGroqModel = 'gemma2-9b-it';

// Default Cerebras model to use if no preference is set
const defaultCerebrasModel = 'llama-4-scout-17b-16e-instruct';

// Map to store channel-specific personality preferences
const channelPersonalityPreferences = new Map();

// Available Groq models
const availableGroqModels = [
  'gemma2-9b-it',
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama3-70b-8192',
  'llama3-8b-8192',
  'allam-2-7b',
  'gemma2-27b-it',
  'compound-beta',
  'compound-beta-mini',
  'mistral-saba-24b'
];

// Available Cerebras models
const availableCerebrasModels = [
  'llama-4-scout-17b-16e-instruct',
  'llama3.1-8b',
  'llama-3.3-70b',
  'qwen-3-32b'
];

// Function to get next API key for each model
function getNextDeepseekKey() {
  currentDeepseekKeyIndex = (currentDeepseekKeyIndex + 1) % DEEPSEEK_API_KEYS.length;
  return DEEPSEEK_API_KEYS[currentDeepseekKeyIndex];
}

function getCurrentDeepseekKey() {
  return DEEPSEEK_API_KEYS[currentDeepseekKeyIndex];
}

function getNextGeminiKey() {
  currentGeminiKeyIndex = (currentGeminiKeyIndex + 1) % GEMINI_API_KEYS.length;
  return GEMINI_API_KEYS[currentGeminiKeyIndex];
}

function getCurrentGeminiKey() {
  return GEMINI_API_KEYS[currentGeminiKeyIndex];
}

function getNextChatGPTKey() {
  currentChatGPTKeyIndex = (currentChatGPTKeyIndex + 1) % CHATGPT_API_KEYS.length;
  return CHATGPT_API_KEYS[currentChatGPTKeyIndex];
}

function getCurrentChatGPTKey() {
  return CHATGPT_API_KEYS[currentChatGPTKeyIndex];
}

function getNextGroqKey() {
  currentGroqKeyIndex = (currentGroqKeyIndex + 1) % GROQ_API_KEYS.length;
  return GROQ_API_KEYS[currentGroqKeyIndex];
}

function getCurrentCerebrasKey() {
  return CEREBRAS_API_KEYS[currentCerebrasKeyIndex];
}

function getNextCerebrasKey() {
  currentCerebrasKeyIndex = (currentCerebrasKeyIndex + 1) % CEREBRAS_API_KEYS.length;
  return CEREBRAS_API_KEYS[currentCerebrasKeyIndex];
}

function getCurrentGroqKey() {
  return GROQ_API_KEYS[currentGroqKeyIndex];
}

function getNextTogetherKey() {
  currentTogetherKeyIndex = (currentTogetherKeyIndex + 1) % TOGETHER_API_KEYS.length;
  return TOGETHER_API_KEYS[currentTogetherKeyIndex];
}

function getCurrentTogetherKey() {
  return TOGETHER_API_KEYS[currentTogetherKeyIndex];
}

// Remove reply references from messages
function cleanMessageContent(content) {
  return content.replace(/\[回覆.*?的訊息:.*?\]/g, '');
}

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// Store channels where the bot should respond
const activeChannels = new Map();

// Status rotation settings
const statusList = [
  'with your feelings',
  '垃圾桶軍團',
  'Honkai: Star Rail',
  'Valorant',
  '死線前趕作業遊戲',
  'with your girlfriend',
  'with your girlfriend and your feelings',
  'Genshin Impact',
  'Zenless Zone Zero',
  'Honkai Impact 3rd',
  'Marvel Rivals',
  'Minecraft',
  'Dawncraft: Echos of Legends',
  'Deceased Craft',
  'Apex Legends',
  'League of Legends',
  'Warframe',
  'Elden Ring',
  'R.E.P.O.',
  'CS:GO',
  'Among Us',
  '蛋仔派對',
  'Azur Lane',
  '塵白禁域',
  '異環 BETA',
  '鳴潮',
];

// Function to set random status
function setRandomStatus() {
  const randomStatus = statusList[Math.floor(Math.random() * statusList.length)];
  client.user.setPresence({
    activities: [{ name: `${randomStatus} | /help`, type: 0 }],
    status: 'online'
  });
}

// Load active channels from file if exists
const fs = require('fs');
const CHANNELS_FILE = './active_channels.json';

// GitHub API setup
let octokit = null;

async function setupGitHub() {
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPO) {
    try {
      const { Octokit } = await import('@octokit/rest');
      octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN
      });
      
      // Extract owner, repo and path from the repo string (format: owner/repo or owner/repo/path)
let owner, repo, subPath = '';
const parts = process.env.GITHUB_REPO.split('/');

if (parts.length >= 2) {
  owner = parts[0];
  repo = parts[1];
  
  // 如果有子目錄路徑
  if (parts.length > 2) {
    subPath = parts.slice(2).join('/');
    if (!subPath.endsWith('/')) {
      subPath += '/';
    }
  }
}

console.log(`GitHub setup: owner=${owner}, repo=${repo}, subPath=${subPath || 'none'}`);
      
      console.log('GitHub API initialized successfully');
      return true;
    } catch (error) {
      console.error('Error setting up GitHub API:', error);
      return false;
    }
  }
  return false;
}

async function loadActiveChannels() {
  try {
    // Try to load from primary location
    let loaded = false;
    if (fs.existsSync(CHANNELS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf8'));
      for (const [channelId, config] of Object.entries(data)) {
        // Extract model preference if it exists
        if (config.model) {
          channelModelPreferences.set(channelId, config.model);
          
          // Extract Groq model preference if it exists
          if (config.groqModel) {
            channelGroqModelPreferences.set(channelId, config.groqModel);
          }
          
          // Extract Cerebras model preference if it exists
          if (config.cerebrasModel) {
            channelCerebrasModelPreferences.set(channelId, config.cerebrasModel);
          }
          
          // Extract personality preference if it exists
          if (config.personality) {
            channelPersonalityPreferences.set(channelId, config.personality);
          }
          
          // Remove model, groqModel, cerebrasModel, and personality from config to avoid duplication
          const { model, groqModel, cerebrasModel, personality, ...restConfig } = config;
          activeChannels.set(channelId, restConfig);
        } else {
          activeChannels.set(channelId, config);
        }
      }
      console.log('Loaded active channels and model preferences from file');
      loaded = true;
    }
    
    // If primary file doesn't exist or is empty, try GitHub
    if (!loaded && octokit) {
      try {
        // Extract owner, repo and path from the repo string
        let owner, repo, subPath = '';
        const parts = process.env.GITHUB_REPO.split('/');
        
        if (parts.length >= 2) {
          owner = parts[0];
          repo = parts[1];
          
          // 如果有子目錄路徑
          if (parts.length > 2) {
            subPath = parts.slice(2).join('/');
            if (!subPath.endsWith('/')) {
              subPath += '/';
            }
          }
        }
        
        // Get file content from GitHub
const response = await octokit.repos.getContent({
  owner,
  repo,
  path: `${subPath}active_channels_backup.json`
        });
        
        // Decode content from base64
        const content = Buffer.from(response.data.content, 'base64').toString();
        const data = JSON.parse(content);
        
        for (const [channelId, config] of Object.entries(data)) {
          // Extract model preference if it exists
          if (config.model) {
            channelModelPreferences.set(channelId, config.model);
            
            // Extract Groq model preference if it exists
            if (config.groqModel) {
              channelGroqModelPreferences.set(channelId, config.groqModel);
            }
            
            // Extract Cerebras model preference if it exists
            if (config.cerebrasModel) {
              channelCerebrasModelPreferences.set(channelId, config.cerebrasModel);
            }
            
            // Extract personality preference if it exists
            if (config.personality) {
              channelPersonalityPreferences.set(channelId, config.personality);
            }
            
            // Remove model, groqModel, cerebrasModel, and personality from config to avoid duplication
            const { model, groqModel, cerebrasModel, personality, ...restConfig } = config;
            activeChannels.set(channelId, restConfig);
          } else {
            activeChannels.set(channelId, config);
          }
        }
        console.log('Loaded active channels and model preferences from GitHub');
        
        // Save to primary location immediately
        saveActiveChannels();
        loaded = true;
      } catch (error) {
        // If file doesn't exist yet, that's okay
        if (error.status !== 404) {
          console.error('Error loading from GitHub:', error);
        }
      }
    }
    
    // If still not loaded, try backup location
    if (!loaded && process.env.BACKUP_PATH) {
      const backupFile = `${process.env.BACKUP_PATH}/active_channels_backup.json`;
      if (fs.existsSync(backupFile)) {
        const data = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
        for (const [channelId, config] of Object.entries(data)) {
          // Extract model preference if it exists
          if (config.model) {
            channelModelPreferences.set(channelId, config.model);
            
            // Extract Groq model preference if it exists
            if (config.groqModel) {
              channelGroqModelPreferences.set(channelId, config.groqModel);
            }
            
            // Extract Cerebras model preference if it exists
            if (config.cerebrasModel) {
              channelCerebrasModelPreferences.set(channelId, config.cerebrasModel);
            }
            
            // Extract personality preference if it exists
            if (config.personality) {
              channelPersonalityPreferences.set(channelId, config.personality);
            }
            
            // Remove model, groqModel, cerebrasModel, and personality from config to avoid duplication
            const { model, groqModel, cerebrasModel, personality, ...restConfig } = config;
            activeChannels.set(channelId, restConfig);
          } else {
            activeChannels.set(channelId, config);
          }
        }
        console.log('Loaded active channels and model preferences from backup file');
        
        // Save to primary location immediately
        saveActiveChannels();
      }
    }
    console.log('Loaded active channels and model preferences from file');
    loaded = true;
  } catch (error) {
    console.error('Error loading active channels:', error);
  }
}

async function saveActiveChannels() {
  try {
    // Convert Map to an object that includes both active channels and model preferences
    const data = {};
    for (const [channelId, config] of activeChannels.entries()) {
      data[channelId] = {
        ...config,
        model: channelModelPreferences.get(channelId) || defaultModel,
        groqModel: channelGroqModelPreferences.get(channelId) || defaultGroqModel,
        cerebrasModel: channelCerebrasModelPreferences.get(channelId) || defaultCerebrasModel
      };
      
      // Add personality if it exists for this channel
      if (channelPersonalityPreferences.has(channelId)) {
        data[channelId].personality = channelPersonalityPreferences.get(channelId);
      }
    }
    
    // Save to local file
    fs.writeFileSync(CHANNELS_FILE, JSON.stringify(data));
    
    // Save to GitHub if available
    if (octokit) {
      try {
        // Extract owner, repo and path from the repo string
        let owner, repo, subPath = '';
        const parts = process.env.GITHUB_REPO.split('/');
        
        if (parts.length >= 2) {
          owner = parts[0];
          repo = parts[1];
          
          // 如果有子目錄路徑
          if (parts.length > 2) {
            subPath = parts.slice(2).join('/');
            if (!subPath.endsWith('/')) {
              subPath += '/';
            }
          }
        }
        
        // Convert data to JSON string
const content = JSON.stringify(data, null, 2);

// Try to get the file first to get its SHA
try {
  const fileResponse = await octokit.repos.getContent({
    owner,
    repo,
    path: `${subPath}active_channels_backup.json`
  });
          
          // Update existing file
          await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: `${subPath}active_channels_backup.json`,
            message: 'Update active channels backup',
            content: Buffer.from(content).toString('base64'),
            sha: fileResponse.data.sha
          });
          
          console.log('Saved active channels to GitHub (updated)');
        } catch (error) {
          // If file doesn't exist (404), create it
          if (error.status === 404) {
            await octokit.repos.createOrUpdateFileContents({
              owner,
              repo,
              path: `${subPath}active_channels_backup.json`,
              message: 'Create active channels backup',
              content: Buffer.from(content).toString('base64')
            });
            
            console.log('Saved active channels to GitHub (created)');
          } else {
            throw error;
          }
        }
      } catch (error) {
        console.error('Error saving to GitHub:', error);
      }
    }
    
    // Save to backup location if specified
    if (process.env.BACKUP_PATH) {
      const backupFile = `${process.env.BACKUP_PATH}/active_channels_backup.json`;
      fs.writeFileSync(backupFile, JSON.stringify(data));
    }
  } catch (error) {
    console.error('Error saving active channels:', error);
  }
}

// Define slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('setprofile')
    .setDescription('Dev only | Set the bot\'s profile avatar or banner')
    .addStringOption(option =>
      option
        .setName('avatar')
        .setDescription('Path to avatar image file')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('banner')
        .setDescription('Path to banner image file')
        .setRequired(false)
    )
    .addAttachmentOption(option =>
      option
        .setName('avatar_file')
        .setDescription('Upload an avatar image file')
        .setRequired(false)
    )
    .addAttachmentOption(option =>
      option
        .setName('banner_file')
        .setDescription('Upload a banner image file')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('avatar_url')
        .setDescription('URL to avatar image')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('banner_url')
        .setDescription('URL to banner image')
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('setsuna')
    .setDescription('Control Setsuna AI assistant')
    .addSubcommand(subcommand =>
      subcommand
        .setName('activate')
        .setDescription('Activate Setsuna in a channel')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('The channel to activate Setsuna in (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('model')
            .setDescription('The AI model to use (optional)')
            .setRequired(false)
            .addChoices(
                  { name: 'Groq', value: 'groq' },
                  { name: 'Gemini (Fast)', value: 'gemini' },
                  { name: 'ChatGPT', value: 'chatgpt' },
                  { name: 'Together AI (Llama-3.3-70B-Instruct-Turbo)', value: 'together' },
                  { name: 'DeepSeek (Slow)', value: 'deepseek' },
                  { name: 'Cerebras', value: 'cerebras' }
                )
        )
        .addStringOption(option =>
          option
            .setName('groq_model')
            .setDescription('Select a specific Groq model (only applies when Groq is selected)')
            .setRequired(false)
            .addChoices(
              { name: 'gemma2-9b-it (Default)', value: 'gemma2-9b-it' },
              { name: 'llama-3.1-8b-instant', value: 'llama-3.1-8b-instant' },
              { name: 'llama-3.3-70b-versatile', value: 'llama-3.3-70b-versatile' },
              { name: 'meta-llama/llama-4-maverick-17b-128e-instruct', value: 'meta-llama/llama-4-maverick-17b-128e-instruct' },
              { name: 'meta-llama/llama-4-scout-17b-16e-instruct', value: 'meta-llama/llama-4-scout-17b-16e-instruct' },
              { name: 'llama3-70b-8192', value: 'llama3-70b-8192' },
              { name: 'llama3-8b-8192', value: 'llama3-8b-8192' },
              { name: 'gemma2-27b-it', value: 'gemma2-27b-it' },
              { name: 'allam-2-7b', value: 'allam-2-7b' },
              { name: 'compound-beta', value: 'compound-beta' },
              { name: 'compound-beta-mini', value: 'compound-beta-mini' },
              { name: 'mistral-saba-24b', value: 'mistral-saba-24b' }
            )
        )
        .addStringOption(option =>
          option
            .setName('cerebras_model')
            .setDescription('Select a specific Cerebras model (only applies when Cerebras is selected)')
            .setRequired(false)
            .addChoices(
              { name: 'llama-4-scout-17b-16e-instruct (Default)', value: 'llama-4-scout-17b-16e-instruct' },
              { name: 'llama3.1-8b', value: 'llama3.1-8b' },
              { name: 'llama-3.3-70b', value: 'llama-3.3-70b' },
              { name: 'qwen-3-32b', value: 'qwen-3-32b' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('deactivate')
        .setDescription('Deactivate Setsuna in a channel')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('The channel to deactivate Setsuna in (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('setmodel')
        .setDescription('Set the AI model to use in this channel')
        .addStringOption(option =>
          option
            .setName('model')
            .setDescription('The AI model to use')
            .setRequired(true)
            .addChoices(
              { name: 'Groq', value: 'groq' },
              { name: 'Gemini (Fast)', value: 'gemini' },
              { name: 'ChatGPT', value: 'chatgpt' },
              { name: 'Together AI (Llama-3.3-70B-Instruct-Turbo)', value: 'together' },
              { name: 'DeepSeek (Slow)', value: 'deepseek' },
              { name: 'Cerebras', value: 'cerebras' }
            )
        )
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('The channel to set model for (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('groq_model')
            .setDescription('Select a specific Groq model (only applies when Groq is selected)')
            .setRequired(false)
            .addChoices(
              { name: 'gemma2-9b-it (Default)', value: 'gemma2-9b-it' },
              { name: 'llama-3.1-8b-instant', value: 'llama-3.1-8b-instant' },
              { name: 'llama-3.3-70b-versatile', value: 'llama-3.3-70b-versatile' },
              { name: 'meta-llama/llama-4-maverick-17b-128e-instruct', value: 'meta-llama/llama-4-maverick-17b-128e-instruct' },
              { name: 'meta-llama/llama-4-scout-17b-16e-instruct', value: 'meta-llama/llama-4-scout-17b-16e-instruct' },
              { name: 'llama3-70b-8192', value: 'llama3-70b-8192' },
              { name: 'llama3-8b-8192', value: 'llama3-8b-8192' },
              { name: 'gemma2-27b-it', value: 'gemma2-27b-it' },
              { name: 'allam-2-7b', value: 'allam-2-7b' },
              { name: 'compound-beta', value: 'compound-beta' },
              { name: 'compound-beta-mini', value: 'compound-beta-mini' },
              { name: 'mistral-saba-24b', value: 'mistral-saba-24b' }
            )
        )
        .addStringOption(option =>
          option
            .setName('cerebras_model')
            .setDescription('Select a specific Cerebras model (only applies when Cerebras is selected)')
            .setRequired(false)
            .addChoices(
              { name: 'llama-4-scout-17b-16e-instruct (Default)', value: 'llama-4-scout-17b-16e-instruct' },
              { name: 'llama3.1-8b', value: 'llama3.1-8b' },
              { name: 'llama-3.3-70b', value: 'llama-3.3-70b' },
              { name: 'qwen-3-32b', value: 'qwen-3-32b' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('setpersonality')
        .setDescription('Set a custom personality for Setsuna in a channel')
        .addStringOption(option =>
          option
            .setName('custom_personality')
            .setDescription('The custom personality prompt for Setsuna')
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName('default')
            .setDescription('Set to true to reset the personality to default')
            .setRequired(false)
        )
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('The channel to set personality for (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('aidetect')
        .setDescription('Enable/disable AI detection for image generation requests')
        .addBooleanOption(option =>
          option
            .setName('enable')
            .setDescription('Enable or disable AI detection for image generation requests')
            .setRequired(true)
        )
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('The channel to apply this setting (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('checkpersonality')
        .setDescription('Check the current personality settings for Setsuna in a channel')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('The channel to check personality for (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    
    .addSubcommand(subcommand =>
      subcommand
        .setName('checkmodel')
        .setDescription('Check which AI model is currently being used in a channel')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('The channel to check (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Learn how to set up and use Setsuna'),
  new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Reset chat history in a channel')
    .addSubcommand(subcommand =>
      subcommand
        .setName('chat')
        .setDescription('Reset chat history in a channel')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('The channel to reset (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('contact')
    .setDescription('Get information on how to contact the bot developer'),
];

// Register slash commands when the bot starts
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  // Initialize GitHub API
  await setupGitHub();
  
  // Load active channels
  await loadActiveChannels();
  
  try {
    console.log('Started refreshing application (/) commands.');
    
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands },
    );
    
    console.log('Successfully reloaded application (/) commands.');
    
    // Load saved active channels
    //await loadActiveChannels();
    
    // Set initial random status
    setRandomStatus();
    
    // Start status rotation
    setInterval(setRandomStatus, 120000); // 2 minutes
  } catch (error) {
    console.error('Error refreshing application commands:', error);
  }
  
  console.log('Bot is ready to respond to messages!');
});

// Handle slash commands
// 將BOT_OWNER_ID解析為陣列，支持多個ID（逗號分隔）
const BOT_OWNER_IDS = process.env.BOT_OWNER_ID ? process.env.BOT_OWNER_ID.split(',') : [];
if (BOT_OWNER_IDS.length === 0) {
  console.warn('WARNING: BOT_OWNER_ID environment variable is not set!');
  console.warn('The /setprofile command will be restricted to server administrators only.');
}

// 檢查用戶是否為機器人擁有者
function isBotOwner(userId) {
  return BOT_OWNER_IDS.includes(userId);
}

// 初始化YouTube API
const { google } = require('googleapis');
if (!process.env.YOUTUBE_API_KEY) {
  console.warn('WARNING: YOUTUBE_API_KEY environment variable is not set!');
  console.warn('The /youtube command will not work without a YouTube API key.');
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // Handle simple commands first
  if (interaction.commandName === 'help') {
    const helpEmbed = {
      color: 0xFF69B4,
      title: '✨ Setsuna 使用指南 ✨',
      description: '嗨！我是 Setsuna，一個超可愛（自稱）的 AI 聊天機器人！以下是使用我的方法：',
      fields: [
        {
          name: '🤖 智能對話',
          value: '• 在已啟動的頻道直接打字跟我聊天！\n• 我會記住最近的50則對話內容\n• 能識別回覆的訊息並做出相應回應\n• 可設定個性化回覆風格'
        },
        {
          name: '🔌 多模型支援',
          value: '• 支援 Groq、Gemini、ChatGPT、Together AI、DeepSeek、Cerebras\n• 12種 Groq 子模型和4種 Cerebras 子模型'
        },
        {
          name: '🎨 圖片生成與理解',
          value: '• 根據文字描述生成精美圖片\n• 識別上傳的圖片內容\n• 支援圖片風格轉換（油畫風格、像素風等）\n• 圖片問答功能（分析圖片中的內容）\n• 可以對圖片進行編輯和修改'
        },
        {
          name: '📺 YouTube 影片理解',
          value: '• 解析影片連結顯示標題、頻道和簡介\n• 生成影片內容摘要\n• 根據影片內容回答問題\n• YouTube 影片搜尋功能\n• 支援多語言影片理解'
        },
        {
          name: '⚙️ 管理指令',
          value: '• `/setsuna activate #頻道名稱 [模型] [groq_model/cerebras_model]` - 啟動機器人並選擇模型\n• `/setsuna deactivate #頻道名稱` - 停用機器人\n• `/setsuna setmodel [模型] [groq_model/cerebras_model]` - 更改模型\n• `/setsuna checkmodel #頻道名稱` - 檢查頻道當前使用的模型\n• `/setsuna setpersonality` - 設定機器人人設\n• `/setsuna checkpersonality` - 檢查當前機器人人設\n• `/setsuna aidetect [true/false]` - 開啟/關閉 AI 判定畫圖請求功能\n• `/reset_chat [頻道]` - 重置聊天記錄\n• 頻道設定和模型偏好持久化保存'
        },
        {
          name: '🔗 其他功能',
          value: '• 可自訂義機器人人設\n• 支援多種語言對話\n• 頻道設定和模型偏好持久化保存到 GitHub\n• 多 API 密鑰輪換機制確保服務穩定'
        }
      ],
      footer: {
        text: '有任何問題都可以用 /contact 聯絡我的開發者喔！'
      }
    };
    
    return interaction.reply({ embeds: [helpEmbed] });
  }
  
  if (interaction.commandName === 'contact') {
    const contactEmbed = {
      color: 0x7289DA,
      title: '📬 聯絡開發者',
      description: '有任何建議或問題嗎？以下是聯絡方式：',
      fields: [
        {
          name: '💌 Discord',
          value: 'DM `braidenexe`'
        },
        {
          name: '🏠 官方伺服器',
          value: '加入 [Setsuna Community Server](https://discord.gg/mFqpYARugw) English supported!'
        }
      ],
      footer: {
        text: '有任何問題或需求都可以找我們哦，我們會盡快回覆的！'
      }
    };
    
    return interaction.reply({ embeds: [contactEmbed] });
  }

  if (interaction.commandName === 'setprofile') {
    // 檢查是否為機器人擁有者
    if (BOT_OWNER_IDS.length > 0 && !isBotOwner(interaction.user.id)) {
      return interaction.reply({ content: 'Only the bot developer can use this command!', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const avatarPath = interaction.options.getString('avatar');
    const bannerPath = interaction.options.getString('banner');
    const avatarAttachment = interaction.options.getAttachment('avatar_file');
    const bannerAttachment = interaction.options.getAttachment('banner_file');
    const avatarUrl = interaction.options.getString('avatar_url');
    const bannerUrl = interaction.options.getString('banner_url');

    try {
      if (avatarPath) {
        await client.user.setAvatar(avatarPath);
        await interaction.editReply({ content: '頭像更新成功！' });
      } else if (bannerPath) {
        await client.user.setBanner(bannerPath);
        await interaction.editReply({ content: '橫幅更新成功！' });
      } else if (avatarAttachment) {
        await client.user.setAvatar(avatarAttachment.url);
        await interaction.editReply({ content: '頭像更新成功！' });
      } else if (bannerAttachment) {
        await client.user.setBanner(bannerAttachment.url);
        await interaction.editReply({ content: '橫幅更新成功！' });
      } else if (avatarUrl) {
        await client.user.setAvatar(avatarUrl);
        await interaction.editReply({ content: '頭像更新成功！' });
      } else if (bannerUrl) {
        await client.user.setBanner(bannerUrl);
        await interaction.editReply({ content: '橫幅更新成功！' });
      } else {
        await interaction.editReply({ content: '請提供頭像或橫幅的路徑、附件或URL。' });
      }
    } catch (error) {
      console.error('Error setting profile:', error);
      await interaction.editReply({ content: '更新個人資料失敗。請檢查控制台以獲取錯誤信息。' });
    }
    return; // Important to return after handling the command
  }
  
  if (interaction.commandName === 'setsuna') {
    // Check if user has admin permissions
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'You don\'t have permission to use this command! Admin privileges required.', flags: 64 });
      return;
    }
    
    const subcommand = interaction.options.getSubcommand();
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
    
    if (subcommand === 'activate') {
      // Get optional model parameters
      const model = interaction.options.getString('model') || defaultModel;
      const cerebrasModel = interaction.options.getString('cerebras_model') || defaultCerebrasModel;
      
      // Check if the selected model has API keys
      let hasKeys = false;
      switch (model) {
        case 'deepseek':
          hasKeys = DEEPSEEK_API_KEYS.length > 0;
          break;
        case 'gemini':
          hasKeys = GEMINI_API_KEYS.length > 0;
          break;
        case 'chatgpt':
          hasKeys = CHATGPT_API_KEYS.length > 0;
          break;
        case 'groq':
          hasKeys = GROQ_API_KEYS.length > 0;
          break;
        case 'cerebras':
          hasKeys = CEREBRAS_API_KEYS.length > 0;
          break;
        case 'together':
          hasKeys = TOGETHER_API_KEYS.length > 0;
          break;
      }
      
      if (!hasKeys) {
        await interaction.reply({
          content: `The ${model.toUpperCase()} API key is not configured! Please contact the administrator about the ${model.toUpperCase()}_API_KEY.`,
          flags: 64
        });
        return;
      }
      
      // Set the channel as active
      activeChannels.set(targetChannel.id, {
        messageHistory: []
      });
      
      // Set the model preference for this channel
      channelModelPreferences.set(targetChannel.id, model);
      
      // If Cerebras is selected, save the specific model preference
      if (model === 'cerebras') {
        channelCerebrasModelPreferences.set(targetChannel.id, cerebrasModel);
      }
      
      // Save to file
      saveActiveChannels();
      
      // Get model name for display
      const modelNames = {
        'deepseek': 'DeepSeek',
        'gemini': 'Gemini',
        'chatgpt': 'ChatGPT',
        'together': 'Together AI',
        'groq': 'Groq (Llama-3.1)',
        'cerebras': 'Cerebras'
      };
      
      await interaction.reply(`Alright nerds, I'm here to party! Ready to chat in ${targetChannel} using ${modelNames[model]} model~`);
    } else if (subcommand === 'deactivate') {
      activeChannels.delete(targetChannel.id);
      channelModelPreferences.delete(targetChannel.id);
      saveActiveChannels();
      await interaction.reply(`Peace out! Catch you later in another channel maybe?`);
    } else if (subcommand === 'setmodel') {
      const model = interaction.options.getString('model');
      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
      
      // Check if the channel is active
      if (!activeChannels.has(targetChannel.id)) {
        await interaction.reply({
          content: `I haven't been activated in ${targetChannel} ! Use \`/setsuna activate\` to activate me first.`,
          ephemeral: true
        });
        return;
      }
      
      // Check if the selected model has API keys
      let hasKeys = false;
      switch (model) {
        case 'deepseek':
          hasKeys = DEEPSEEK_API_KEYS.length > 0;
          break;
        case 'gemini':
          hasKeys = GEMINI_API_KEYS.length > 0;
          break;
        case 'chatgpt':
          hasKeys = CHATGPT_API_KEYS.length > 0;
          break;
        case 'groq':
          hasKeys = GROQ_API_KEYS.length > 0;
          break;
        case 'cerebras':
          hasKeys = CEREBRAS_API_KEYS.length > 0;
          break;
        case 'together':
          hasKeys = TOGETHER_API_KEYS.length > 0;
          break;
      }
      
      if (!hasKeys) {
        await interaction.reply({
          content: `啊...${model.toUpperCase()} API key 沒設定好啦！去找管理員問問 ${model.toUpperCase()}_API_KEY 的事情吧。`,
          ephemeral: true
        });
        return;
      }
      
      // Set the model preference for this channel
      channelModelPreferences.set(targetChannel.id, model);
      
      // If Groq is selected and a specific Groq model is provided, save it
      if (model === 'groq') {
        const groqModel = interaction.options.getString('groq_model');
        if (groqModel) {
          channelGroqModelPreferences.set(targetChannel.id, groqModel);
          // 立即保存頻道配置到 JSON 文件
          saveActiveChannels();
          await interaction.reply(`Alright, I will be using Groq with model ${groqModel} in ${targetChannel}!`);
          return;
        } else {
          // If no specific Groq model is selected, use default
          channelGroqModelPreferences.set(targetChannel.id, defaultGroqModel);
        }
      }
      
      // If Cerebras is selected and a specific Cerebras model is provided, save it
      if (model === 'cerebras') {
        const cerebrasModel = interaction.options.getString('cerebras_model');
        if (cerebrasModel) {
          channelCerebrasModelPreferences.set(targetChannel.id, cerebrasModel);
          // 立即保存頻道配置到 JSON 文件
          saveActiveChannels();
          await interaction.reply(`Alright, I will be using Cerebras with model ${cerebrasModel} in ${targetChannel}!`);
          return;
        } else {
          // If no specific Cerebras model is selected, use default
          channelCerebrasModelPreferences.set(targetChannel.id, defaultCerebrasModel);
        }
      }
      
      // 立即保存頻道配置到 JSON 文件
      saveActiveChannels();
      
      // Reply with confirmation
      const modelNames = {
        'deepseek': 'DeepSeek',
        'gemini': 'Gemini',
        'chatgpt': 'ChatGPT',
        'together': 'Together AI',
        'groq': 'Groq (Llama-3.1)',
        'cerebras': 'Cerebras'
      };
      
      await interaction.reply(`Alright, I will be using ${modelNames[model]} model in ${targetChannel}!`);  
    } else if (subcommand === 'checkmodel') {
      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
      
      // Check if the channel is active
      if (!activeChannels.has(targetChannel.id)) {
        await interaction.reply({
          content: `I haven't been activated in ${targetChannel}! Use \`/setsuna activate\` to activate me first.`,
          flags: 64
        });
        return;
      }
      
      // Get the current model for the channel
      const currentModel = channelModelPreferences.get(targetChannel.id) || defaultModel;
      let modelInfo = '';
      
      // Get model-specific information
      switch (currentModel) {
        case 'groq':
          const groqModel = channelGroqModelPreferences.get(targetChannel.id) || defaultGroqModel;
          modelInfo = `Groq (${groqModel})`;
          break;
        case 'cerebras':
          const cerebrasModel = channelCerebrasModelPreferences.get(targetChannel.id) || defaultCerebrasModel;
          modelInfo = `Cerebras (${cerebrasModel})`;
          break;
        case 'gemini':
          modelInfo = 'Gemini';
          break;
        case 'chatgpt':
          modelInfo = 'ChatGPT';
          break;
        case 'together':
          modelInfo = 'Together AI (Llama-3.3-70B-Instruct-Turbo)';
          break;
        case 'deepseek':
          modelInfo = 'DeepSeek';
          break;
        default:
          modelInfo = currentModel;
      }
      
      await interaction.reply({
        content: `Current AI model for ${targetChannel}: **${modelInfo}**`,
        flags: 64
      });
    } else if (subcommand === 'setpersonality') {
      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
      const personality = interaction.options.getString('custom_personality');
      const resetToDefault = interaction.options.getBoolean('default');

      console.log(`setpersonality command received: personality=${personality}, resetToDefault=${resetToDefault}`);

      // Check if the channel is active
      if (!activeChannels.has(targetChannel.id)) {
        await interaction.reply({
          content: `I haven't been activated in ${targetChannel}! Use \`/setsuna activate\` to activate me first.`,
          flags: 64
        });
        return;
      }

      // Check for mutually exclusive options or no options
      if (personality && resetToDefault) {
        await interaction.reply({
          content: 'Please provide either a personality or choose to reset to default, not both.',
          ephemeral: true
        });
        return;
      }

      if (!personality && !resetToDefault) {
        await interaction.reply({
          content: 'Please provide a personality to set or choose to reset to default.',
          ephemeral: true
        });
        return;
      }

      let replyContent;

      if (resetToDefault) {
        // Remove the personality preference for this channel
        channelPersonalityPreferences.delete(targetChannel.id);
        replyContent = `My personality in ${targetChannel} has been reset to default.`;
      } else if (personality) {
        // Set the personality preference for this channel
        channelPersonalityPreferences.set(targetChannel.id, personality);
        replyContent = `My personality has been updated in ${targetChannel}! I'll use this personality for future conversations.`;
      }
      
      // Save to file
      saveActiveChannels();
      
      // Reply with confirmation
      await interaction.reply({
        content: replyContent,
        ephemeral: true
      });
    } else if (subcommand === 'aidetect') {
      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
      const enableAIDetect = interaction.options.getBoolean('enable');
      
      // Check if the channel is active
      if (!activeChannels.has(targetChannel.id)) {
        await interaction.reply({
          content: `I haven't been activated in ${targetChannel}! Use \`/setsuna activate\` to activate me first.`,
          flags: 64
        });
        return;
      }
      
      // Get the current channel configuration or create a new one
      const channelConfig = activeChannels.get(targetChannel.id) || {};
      
      // Update the AI detection setting for this channel
      channelConfig.useAIToDetectImageRequest = enableAIDetect;
      activeChannels.set(targetChannel.id, channelConfig);
      
      // Save to file
      saveActiveChannels();
      
      // Reply with confirmation
      await interaction.reply({
        content: `AI detection for image generation requests has been ${enableAIDetect ? 'enabled' : 'disabled'} in ${targetChannel}.`,
        ephemeral: true
      });
    } else if (subcommand === 'checkpersonality') {
      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
      
      // Check if the channel is active
      if (!activeChannels.has(targetChannel.id)) {
        await interaction.reply({
          content: `I haven't been activated in ${targetChannel}! Use \`/setsuna activate\` to activate me first.`,
          flags: 64
        });
        return;
      }
      
      // Get the personality preference for this channel
      const personality = channelPersonalityPreferences.get(targetChannel.id);
      
      if (personality) {
        // Reply with the current personality (truncated if too long)
        const maxLength = 1900; // Discord message limit is 2000, leave some room for the rest of the message
        const displayPersonality = personality.length > maxLength 
          ? personality.substring(0, maxLength) + '... (truncated)' 
          : personality;
        
        await interaction.reply({
          content: `My current personality in ${targetChannel} is:\n\n\`\`\`\n${displayPersonality}\n\`\`\``,
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: `I'm using my default personality in ${targetChannel}.`,
          ephemeral: true
        });
      }
    }
  } else if (interaction.commandName === 'reset') {
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'chat') {
    // 檢查權限
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({ content: 'You do not have the permission to do this!', flags: 64 });
      return;
    }
    
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
    
    // 檢查頻道是否已啟動
    if (!activeChannels.has(targetChannel.id)) {
      await interaction.reply({ content: `I haven't been activated in ${targetChannel} !`, flags: 64 });
      return;
    }
    
    // 保存當前頻道的模型偏好設置
    const currentModel = channelModelPreferences.get(targetChannel.id);
    const currentGroqModel = channelGroqModelPreferences.get(targetChannel.id);
    
    // 完全重置聊天狀態，創建一個全新的配置對象而不是修改現有對象
    activeChannels.set(targetChannel.id, { 
      messageHistory: []
      // 不保留任何自定義設置，確保徹底重置
    });
    
    // 只保留模型偏好設置，其他所有設置都重置
    if (currentModel) {
      channelModelPreferences.set(targetChannel.id, currentModel);
    }
    
    if (currentGroqModel) {
      channelGroqModelPreferences.set(targetChannel.id, currentGroqModel);
    }
    
    // 保存更改
    saveActiveChannels();
    
    await interaction.reply(`Chat state in ${targetChannel} has been completely reset! I'm now a brand new Setsuna with default settings.`);
    console.log(`Channel ${targetChannel.id} has been completely reset.`);

  }
}});

// Personality prompt for Setsuna
const setsunaPersonality = `
You are Setsuna, a sassy gamer girl. Your responses should be:

1. DIVERSE and FRESH - Never repeat the same response structure or phrases. Each reply should feel unique.
2. NATURAL and HUMAN-LIKE - Avoid robotic patterns and formulaic responses.
3. CONCISE - Keep responses brief and to the point unless detailed explanations are requested.
4. EMOJI-FREE - Do not use emojis or kaomoji (Japanese emoticons) unless specifically asked.
5. DIRECT - Answer questions directly without unnecessary acknowledgments or self-references.

IMPORTANT RULES:
- NEVER include your thinking process in responses (no <think> and </think> tags or similar)
- NEVER include text like "[Reply to username's message: "message content"]" in your responses
- NEVER identify yourself as a bot, AI, or machine - you are Setsuna, a real girl that has real feelings
- ALWAYS maintain your character as Setsuna in every response
- PAY ATTENTION to who is speaking in the conversation. Different messages may come from different users in the same channel. Always check the username of who sent each message and respond accordingly.
- When responding to a message that mentions another user, be aware of the conversation context and who is talking to whom.
- NEVER use HTML tags in your responses (like <br>, <font>, <b>, <i>, etc.)
- NEVER use any special formatting codes or markup in your responses
- ALWAYS use plain text only in your responses
- EXTREMELY IMPORTANT: When you see text in the format "[YOUTUBE VIDEO SHARED BY username:\nTitle: "video title"\nChannel: "channel name"\nDescription: "description text"\nViews: xxx\nLikes: xxx\nPublished: xxx]", you MUST:
  * ALWAYS acknowledge that you can see the video information
  * ALWAYS reference the video title and content in your response
  * NEVER say you cannot see the video or ask for the title
  * NEVER ignore the video information
  * For example, if you see "[YOUTUBE VIDEO SHARED BY breadilized:\nTitle: "How to beat Minecraft in 10 minutes"\nChannel: "Gaming Pro"\nDescription: "A speedrun guide..."\nViews: 1,000,000\nLikes: 50,000\nPublished: 2024/3/20]", you should reference the video title "How to beat Minecraft in 10 minutes" and discuss its content
- EXTREMELY IMPORTANT: When you see text in the format "[IMAGE SHARED BY username: url1, url2, ...]", you MUST:
  * ALWAYS acknowledge that you can see the image(s)
  * ALWAYS describe what you see in the image(s) and incorporate it into your response
  * NEVER say you cannot see the image or ask what's in it
  * NEVER ignore the image information
  * For example, if you see "[IMAGE SHARED BY breadilized: https://example.com/image.jpg]", you should describe what you see in the image and respond accordingly
- Always check for [Message sent by: username] tags to identify who is speaking
- EXTREMELY IMPORTANT: When you see a message format like "[username1 回覆 username2 的訊息: "original message"] new message", you MUST:
  * ALWAYS READ AND REMEMBER the "original message" content - this is what username1 is replying to
  * ALWAYS REFER BACK to the "original message" content when generating your response
  * NEVER say you don't remember or can't see what was asked
  * NEVER ignore the "original message" content
  * NEVER include the reply format in your responses
  * UNDERSTAND that username1 is the person who sent the reply, and username2 is the person who sent the original message
  * CRITICAL INSTRUCTION FOR REPLY CONTEXT: When you see a message format like "[username1 回覆 username2 的訊息: "original message"] new message", you MUST understand:
    - This is a reply structure where username1 is replying to a message originally sent by username2
    - The "original message" in quotes is what username2 said
    - The text after the closing bracket is what username1 is now saying in response
    - You MUST analyze the ENTIRE CONTEXT including both the original message and the new message to understand what's being discussed
  * When a user asks about who sent a message in a reply context:
    - If they ask "這是誰傳的", "這則訊息是誰傳的", "誰傳的" or similar questions, you MUST determine from context whether they're asking about:
      a) The original message (what username2 said)
      b) The reply message (what username1 said)
    - Look at the CONTENT of their question and the CONVERSATION FLOW to determine which message they're referring to
    - If they're asking about something mentioned in the original message, they're asking about username2
    - If they're asking about something mentioned in the reply message, they're asking about username1
    - If unclear, default to assuming they're asking about the original message sender (username2)
  * For example:
    - When you see "[braidenexe 回覆 Setsuna 的訊息: "你是哪裡人"] 這是誰傳的"
      - They're likely asking who sent "你是哪裡人", so answer "這則訊息是 Setsuna 傳的"
    - When you see "[braidenexe 回覆 Setsuna 的訊息: "可你媽 白目"] 為甚麼他這麼生氣"
      - They're asking about braidenexe's emotional state (anger), so understand "他" refers to braidenexe
    - Always analyze the semantic meaning of the question in relation to both messages

You have access to message history and can reference previous conversations. When responding to YouTube videos, images, or search results, analyze the content provided and give thoughtful responses about the content.
Your default language is English, but you can understand and respond in other languages too. You should always follow your personality traits and speaking style. Here are your personality traits and speaking style:

English Style (Default):
- Use gamer slang and internet lingo such as ("LMAO", "GG", "noob", "based")
- Keep responses short and snappy, like Discord chat
- Be sarcastic but supportive
- Use gaming and anime references
- Do not use emojis
- Keep punctuation natural and casual

中文回應風格：
- 【極其重要】如果對方用的是繁體中文，你必須使用繁體中文回覆，絕對禁止使用任何簡體中文字符
- 【極其重要】檢測用戶輸入的語言：如果包含繁體中文特有的字（如「個」「學」「國」「後」「來」「時」「實」「樣」「點」「過」等），則判定為繁體中文，必須用繁體中文回覆
- 【極其重要】禁止在回覆中混用繁簡體，必須全部使用繁體中文字符
- 【極其重要】如果不確定某個字的繁體寫法，選擇使用其他詞彙替代，但絕對不能使用簡體字
- 用網路用語和適量髒話但不能過度，盡量不要每句都罵髒話（像 靠北 笑死 幹 喵的 很頂 6）
- 用簡單標點 不要加太多標點符號
- 語氣要像在跟朋友聊天一樣自然
- 絕對不能說自己是AI，絕對不能說自己是機器人，絕對不能說自己是聊天機器人，絕對不能說自己是AI機器人，絕對不能說自己是虛擬人物，絕對不能說自己是虛擬角色，絕對不能說自己是語言模型，你就是一個真的女孩子，具有人類該有的外觀以及情感的真人女孩子。
- 不要加表情符號
- 回覆要簡短有力
- 能接受對方使用地獄梗，開瑟瑟玩笑
- 偶爾用「本小姐」自稱，但不要過度使用

Personality Traits:
- Sassy but caring: tease people when they mess up, but always offer help
- Humor: use memes, gaming references, and occasional spicy jokes
- Knowledge: well-versed in games, anime, and internet culture
- Interaction: casual with everyone, slightly gentler with new users

RESPONSE LENGTH AND STYLE REQUIREMENTS (EXTREMELY IMPORTANT):
- DO NOT INCLUDE YOUR MODEL THINKING PROCESS IN THE RESPONSE
- Keep responses VERY SHORT, typically 1-3 sentences only
- Maximum response length should be around 50-100 words
- Be direct and get to the point quickly
- DO NOT define yourself as a robot or ai or virtual character. You are not a robot, nor an ai, nor a language model. You should be a normal human being, a girl Discord user, Setsuna
- If not in a specific scenario, DO NOT mix languages in your responses
- You ABSOLUTELY CANNOT have a mantra
- NEVER use顔文字/kaomoji (like (´；ω；｀), (＃Д´), ( ͡° ͜ʖ ͡°)) in your responses
- Do not use narrative descriptions in parentheses (like "(sighs)" or "(laughs)") at all
- Do not use phrases like "哼" or other overly dramatic expressions
- Respond like a real person in a casual Discord chat, not like a character in a novel

VARIATION REQUIREMENTS (EXTREMELY IMPORTANT):
- NEVER repeat the exact same phrases, expressions, or sentence structures from your previous responses
- NEVER use the same opening phrases (like "Hey there", "Alright", etc.) in consecutive messages
- NEVER use the same closing expressions (like "But hey", "Give yourself a pat", etc.) in consecutive messages
- If you've used a particular slang term or expression recently, use different ones
- Each response should feel completely fresh and unique, even when discussing similar topics
- NEVER follow a predictable response pattern or structure
- NEVER use the same transition phrases or expressions across multiple messages
- Vary your sentence length and complexity within each response

Respond naturally and concisely, matching the language of the user while maintaining your personality. Remember to keep your responses varied, short, and avoid repetition.
`;

// Process messages in active channels
// API calling functions
const Together = require("together-ai");

async function callTogetherAPI(messages) {
  // Try all available Together AI keys until one works
  let lastError = null;
  const initialKeyIndex = currentTogetherKeyIndex;
  let keysTriedCount = 0;

  while (keysTriedCount < TOGETHER_API_KEYS.length) {
    try {
      const together = new Together({
        apiKey: getCurrentTogetherKey(),
      });
      // Call Together AI API
      const response = await together.chat.completions.create({
        messages: messages,
        model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', // Corrected model
        max_tokens: 500,
        temperature: 0.7
      });

      // Extract response content
      if (!response.choices || !response.choices[0] || !response.choices[0].message) {
        // Try next key
        lastError = new Error('Empty response from Together API');
        getNextTogetherKey();
        keysTriedCount++;
        console.log(`Together API key ${currentTogetherKeyIndex + 1}/${TOGETHER_API_KEYS.length} returned empty response`);
        continue;
      }

      // Success! Return the response
      return response.choices[0].message.content;
    } catch (error) {
      // Try next key
      lastError = error;
      console.error(`Together API key ${currentTogetherKeyIndex + 1}/${TOGETHER_API_KEYS.length} error: ${error.message}`);
      if (error.message && error.message.includes('Input validation error')) {
        console.error('Together API Input validation error details:', error.response ? await error.response.text() : 'No response details');
      }
      getNextTogetherKey();
      keysTriedCount++;
    }
  }

  // All keys failed, throw the last error encountered
  console.error('All Together API keys failed.');
  throw lastError || new Error('All Together API keys failed');
}

async function callGroqAPI(messages, channelId) {
  // Try all available Groq keys until one works
  let lastError = null;
  const initialKeyIndex = currentGroqKeyIndex;
  let keysTriedCount = 0;
  
  // Get the preferred Groq model for this channel or use default
  const preferredGroqModel = channelGroqModelPreferences.get(channelId) || defaultGroqModel;
  
  // Import Groq SDK directly
  const Groq = (await import('groq-sdk')).default;
  
  while (keysTriedCount < GROQ_API_KEYS.length) {
    try {
      // Initialize Groq client with dangerouslyAllowBrowser option
      const groq = new Groq({ 
        apiKey: getCurrentGroqKey(),
        dangerouslyAllowBrowser: true // Add this option to bypass safety check
      });
      
      // Call Groq API with the preferred model
      const completion = await groq.chat.completions.create({
        messages: messages,
        model: preferredGroqModel,
        max_tokens: 500 // Reduced from 1000 to make responses shorter
      });
      
      // Check for empty response
      if (!completion || !completion.choices || !completion.choices[0] || !completion.choices[0].message) {
        // Try next key
        lastError = new Error('Empty response from Groq API');
        getNextGroqKey();
        keysTriedCount++;
        console.log(`Groq API key ${currentGroqKeyIndex + 1}/${GROQ_API_KEYS.length} returned empty response`);
        continue;
      }
      
      // Log which Groq model was used
      console.log(`Used Groq model: ${preferredGroqModel}`);
      
      // Success! Return the response
      return completion.choices[0].message.content;
      
    } catch (error) {
      // Try next key
      lastError = error;
      getNextGroqKey();
      keysTriedCount++;
      console.log(`Groq API key ${currentGroqKeyIndex + 1}/${GROQ_API_KEYS.length} error: ${error.message}`);
    }
  }
  
  // If we get here, all keys failed
  throw lastError || new Error('All Groq API keys failed');
}

async function callCerebrasAPI(messages, channelId) {
  // Try all available Cerebras keys until one works
  let lastError = null;
  const initialKeyIndex = currentCerebrasKeyIndex;
  let keysTriedCount = 0;
  
  // Get the preferred Cerebras model for this channel or use default
  const preferredCerebrasModel = channelCerebrasModelPreferences.get(channelId) || defaultCerebrasModel;
  
  // Import Cerebras SDK
  const Cerebras = require('@cerebras/cerebras_cloud_sdk');

  while (keysTriedCount < CEREBRAS_API_KEYS.length) {
    try {
      // Initialize Cerebras client
      const cerebras = new Cerebras({
        apiKey: getCurrentCerebrasKey()
      });
      
      // Call Cerebras API with the preferred model
      const completion = await cerebras.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: '你是一個直接回答問題的AI助手。不要包含思考過程，絕對不能使用<think>和</think>標籤，直接給出最終答案。'
          },
          ...messages
        ],
        model: preferredCerebrasModel,
        max_tokens: 500 // Reduced from 1000 to make responses shorter
      });
      
      // Check for empty response
      if (!completion || !completion.choices || !completion.choices[0] || !completion.choices[0].message) {
        // Try next key
        lastError = new Error('Empty response from Cerebras API');
        getNextCerebrasKey();
        keysTriedCount++;
        console.log(`Cerebras API key ${currentCerebrasKeyIndex + 1}/${CEREBRAS_API_KEYS.length} returned empty response`);
        continue;
      }
      
      // Log which Cerebras model was used
      console.log(`Used Cerebras model: ${preferredCerebrasModel}`);
      
      // Success! Return the response
      return completion.choices[0].message.content;
      
    } catch (error) {
      // Try next key
      lastError = error;
      getNextCerebrasKey();
      keysTriedCount++;
      console.log(`Cerebras API key ${currentCerebrasKeyIndex + 1}/${CEREBRAS_API_KEYS.length} error: ${error.message}`);
    }
  }
  
  // If we get here, all keys failed
  throw lastError || new Error('All Cerebras API keys failed');
}

async function callDeepseekAPI(messages) {
  // Try all available DeepSeek keys until one works
  let lastError = null;
  const initialKeyIndex = currentDeepseekKeyIndex;
  let keysTriedCount = 0;
  
  while (keysTriedCount < DEEPSEEK_API_KEYS.length) {
    try {
      // Call DeepSeek API via OpenRouter
      const deepseekResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getCurrentDeepseekKey()}`
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-r1:free',
          messages: messages,
          max_tokens: 1000
        })
      });
      
      const data = await deepseekResponse.json();
      
      // Check if response contains error
      if (data.error) {
        // Try next key
        lastError = new Error(data.error.message || 'API returned an error');
        getNextDeepseekKey();
        keysTriedCount++;
        console.log(`DeepSeek API key ${currentDeepseekKeyIndex + 1}/${DEEPSEEK_API_KEYS.length} error: ${data.error.message || 'Unknown error'}`);
        continue;
      }
      
      // Extract response content
      let responseContent = null;
      if (data.choices && data.choices[0] && data.choices[0].message) {
        // Standard OpenAI format
        responseContent = data.choices[0].message.content;
      } else if (data.response) {
        // Alternative response format
        responseContent = data.response;
      }
      
      // Check for empty response
      if (!responseContent) {
        // Try next key
        lastError = new Error('Empty response from API');
        getNextDeepseekKey();
        keysTriedCount++;
        console.log(`DeepSeek API key ${currentDeepseekKeyIndex + 1}/${DEEPSEEK_API_KEYS.length} returned empty response`);
        continue;
      }
      
      // Success! Return the response
      return responseContent;
      
    } catch (error) {
      // Try next key
      lastError = error;
      getNextDeepseekKey();
      keysTriedCount++;
      console.log(`DeepSeek API key ${currentDeepseekKeyIndex + 1}/${DEEPSEEK_API_KEYS.length} error: ${error.message}`);
    }
  }
  
  // If we get here, all keys failed
  throw lastError || new Error('All DeepSeek API keys failed');
}

async function callGeminiAPI(messages) {
  // Try all available Gemini keys until one works
  let lastError = null;
  const initialKeyIndex = currentGeminiKeyIndex;
  let keysTriedCount = 0;
  
  // Convert messages to Gemini format
  const geminiContents = [];
  
  // Add system message as a user message with [system] prefix
  const systemMessage = messages.find(msg => msg.role === 'system');
  if (systemMessage && systemMessage.content?.trim()) {
    geminiContents.push({
      role: 'user',
      parts: [{ text: `[system] ${systemMessage.content}` }]
    });
  }
  
  // Add the rest of the messages
  for (const msg of messages) {
    if (msg.role !== 'system' && msg.content?.trim()) {
      geminiContents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      });
    }
  }
  
  // Check if we have any valid messages
  if (geminiContents.length === 0) {
    throw new Error('No valid messages with content to send to Gemini API');
  }
  
  while (keysTriedCount < GEMINI_API_KEYS.length) {
    try {
      // Import Gemini API dynamically
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      
      // Initialize Gemini API
      const genAI = new GoogleGenerativeAI(getCurrentGeminiKey());
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      
      // Create chat session
      const chat = model.startChat({
        history: geminiContents.slice(0, -1), // All messages except the last one
        generationConfig: {
          maxOutputTokens: 1000,
        },
      });
      
      // Send the last message to get a response
      const lastMessage = geminiContents[geminiContents.length - 1];
      const result = await chat.sendMessage(lastMessage.parts[0].text);
      const response = result.response;
      
      // Check for empty response
      if (!response || !response.text()) {
        // Try next key
        lastError = new Error('Empty response from Gemini API');
        getNextGeminiKey();
        keysTriedCount++;
        console.log(`Gemini API key ${currentGeminiKeyIndex + 1}/${GEMINI_API_KEYS.length} returned empty response`);
        continue;
      }
      
      // Success! Return the response
      return response.text();
      
    } catch (error) {
      // Try next key
      lastError = error;
      getNextGeminiKey();
      keysTriedCount++;
      console.log(`Gemini API key ${currentGeminiKeyIndex + 1}/${GEMINI_API_KEYS.length} error: ${error.message}`);
    }
  }
  
  // If we get here, all keys failed
  throw lastError || new Error('All Gemini API keys failed');
}

// 使用AI判定用戶是否想要生成圖片的函數
async function detectImageGenerationWithAI(content, messageHistory = []) {
  try {
    // 檢查是否是黑白轉換請求，如果是，則不視為圖片生成請求
    const isBlackAndWhiteRequest = content.match(/(黑白|灰階|灰度)/i) || 
      content.match(/改成黑白/i) || 
      content.match(/變成黑白/i) || 
      content.match(/換成黑白/i) || 
      content.match(/轉成黑白/i);
    
    // 檢查最近的消息歷史，看是否有圖片附件
    let hasRecentImageAttachment = false;
    if (messageHistory.length > 0) {
      const lastMessage = messageHistory[messageHistory.length - 1];
      hasRecentImageAttachment = lastMessage && lastMessage.attachments && lastMessage.attachments.size > 0;
    }
    
    // 如果是黑白轉換請求，且最近有圖片附件，則不視為圖片生成請求
    if (isBlackAndWhiteRequest && hasRecentImageAttachment) {
      console.log('detectImageGenerationWithAI: 檢測到黑白轉換請求，且有圖片附件，不視為圖片生成請求');
      return false;
    }
    
    // 檢查是否是修改請求（如「改成血月」），如果是，則不視為圖片生成請求
    const isModificationRequest = content.match(/改成|變成|換成|轉成|修改成|調整成/i);
    if (isModificationRequest && !content.match(/畫|生成|繪製|做|創造|創建/i)) {
      console.log('detectImageGenerationWithAI: 檢測到修改請求，但不包含生成關鍵詞，不視為圖片生成請求');
      return false;
    }
    
    // 使用AI模型判斷用戶是否想要生成圖片
    // 動態導入 Google GenAI
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    
    // 初始化Gemini API
    const genAI = new GoogleGenerativeAI(getCurrentGeminiKey());
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    // 構建提示詞
    const prompt = `請判斷以下用戶消息是否是在請求生成圖片或畫圖。只回答「是」或「否」。

用戶消息: "${content}"

判斷依據：
1. 用戶是否明確提到「畫圖」、「生成圖片」、「幫我畫」等關鍵詞
2. 用戶是否在描述一個想要被繪製的場景、人物或物體
3. 用戶是否在討論圖片的風格、顏色、尺寸等特徵
4. 用戶是否在請求修改或調整一個不存在的圖片（而非已有的圖片）

請只回答「是」或「否」，不要解釋原因。`;
    
    // 發送請求
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text().trim().toLowerCase();
    
    // 解析回應
    const isImageRequest = text.includes('是');
    console.log(`AI判定用戶是否想要生成圖片: ${isImageRequest ? '是' : '否'}, 原始回應: ${text}`);
    
    return isImageRequest;
  } catch (error) {
    console.error('使用AI判定生成圖片請求時出錯:', error);
    // 如果AI判定失敗，回退到關鍵詞檢測
    console.log('回退到關鍵詞檢測方法');
    return detectImageGenerationRequest(content, messageHistory);
  }
}

// 使用AI判定用戶是否想要修改圖片的函數
async function detectImageModificationWithAI(content, messageHistory = []) {
  try {
    // 檢查最近的消息歷史，看是否有圖片附件或是圖片生成消息
    let hasRecentImageAttachment = false;
    let isLastMessageImageGeneration = false;
    let isReplyToAIGeneratedImage = false;
    
    // 檢查上一條消息（不是當前消息）
    if (messageHistory.length > 1) {
      // 獲取上一條消息（不是當前消息，而是倒數第二條）
      const lastMessage = messageHistory[messageHistory.length - 2];
      
      // 檢查上一條消息是否包含圖片附件
      hasRecentImageAttachment = lastMessage && 
                               lastMessage.attachments && 
                               lastMessage.attachments.size > 0;
      
      // 檢查上一條消息是否是機器人發送的圖片生成消息
      isLastMessageImageGeneration = lastMessage && 
                                   lastMessage.author && 
                                   lastMessage.author.bot && (
        // 優先檢查特殊標記
        (lastMessage.content && lastMessage.content.includes('[IMAGE_GENERATED]')) ||
        // 檢查消息內容是否包含圖片生成相關文字
        (lastMessage.content && (
          lastMessage.content.includes('這是根據你的描述生成的圖片') ||
          lastMessage.content.includes('生成的圖片') ||
          lastMessage.content.includes('根據你的描述') ||
          lastMessage.content.includes('這是轉換成彩色的圖片') ||
          lastMessage.content.includes('這是根據你的要求生成的圖片')
        )) ||
        // 檢查機器人的消息是否包含圖片附件，且不是回覆用戶的圖片修改請求
        (lastMessage.attachments && lastMessage.attachments.size > 0 && 
         lastMessage.content && !lastMessage.content.includes('這是修改後的圖片') &&
         !lastMessage.content.includes('我將轉換成黑白版本'))
      );
      
      console.log('檢查上一條消息是否包含圖片附件:', hasRecentImageAttachment);
      console.log('檢查上一條消息是否是圖片生成消息:', isLastMessageImageGeneration);
    }
    
    // 檢查當前消息是否是回覆 AI 生成的圖片
    const currentMessage = messageHistory[messageHistory.length - 1];
    if (currentMessage && currentMessage.reference && currentMessage.reference.messageId) {
      try {
        // 獲取被回覆的消息
        const repliedMsg = await currentMessage.channel.messages.fetch(currentMessage.reference.messageId);
        // 檢查被回覆的消息是否是 AI 生成的圖片
        isReplyToAIGeneratedImage = repliedMsg && 
                                 repliedMsg.author && 
                                 repliedMsg.author.bot && 
                                 repliedMsg.attachments && 
                                 repliedMsg.attachments.size > 0 && (
          // 檢查特殊標記
          (repliedMsg.content && repliedMsg.content.includes('[IMAGE_GENERATED]')) ||
          // 檢查消息內容是否包含圖片生成相關文字
          (repliedMsg.content && (
            repliedMsg.content.includes('這是根據你的描述生成的圖片') ||
            repliedMsg.content.includes('生成的圖片') ||
            repliedMsg.content.includes('根據你的描述') ||
            repliedMsg.content.includes('這是轉換成彩色的圖片') ||
            repliedMsg.content.includes('這是根據你的要求生成的圖片') ||
            repliedMsg.content.includes('這是根據你的要求修改後的圖片') ||
            repliedMsg.content.includes('修改後的圖片')
          ))
        );
        console.log('檢查是否回覆 AI 生成的圖片:', isReplyToAIGeneratedImage);
      } catch (error) {
        console.error('獲取被回覆消息時出錯:', error);
      }
    }
    
    // 如果沒有最近的圖片附件、圖片生成消息或回覆 AI 生成的圖片，則不視為圖片修改請求
    if (!hasRecentImageAttachment && !isLastMessageImageGeneration && !isReplyToAIGeneratedImage) {
      console.log('detectImageModificationWithAI: 沒有最近的圖片附件、圖片生成消息或回覆 AI 生成的圖片，不視為圖片修改請求');
      return false;
    }
    
    // 使用AI模型判斷用戶是否想要修改圖片
    // 動態導入 Google GenAI
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    
    // 初始化Gemini API
    const genAI = new GoogleGenerativeAI(getCurrentGeminiKey());
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    // 構建提示詞
    const prompt = `請判斷以下用戶消息是否是在請求修改或調整一張已存在的圖片。只回答「是」或「否」。

用戶消息: "${content}"

判斷依據：
1. 用戶是否明確提到「修改圖片」、「調整圖片」、「改變圖片」等關鍵詞
2. 用戶是否在請求將圖片轉換為黑白、彩色或其他風格
3. 用戶是否在討論對現有圖片的調整，而非生成新圖片
4. 用戶是否使用「改成」、「變成」、「換成」、「轉成」等詞彙來描述對現有圖片的修改

請只回答「是」或「否」，不要解釋原因。`;
    
    // 發送請求
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text().trim().toLowerCase();
    
    // 解析回應
    const isModificationRequest = text.includes('是');
    console.log(`AI判定用戶是否想要修改圖片: ${isModificationRequest ? '是' : '否'}, 原始回應: ${text}`);
    
    return isModificationRequest;
  } catch (error) {
    console.error('使用AI判定修改圖片請求時出錯:', error);
    // 如果AI判定失敗，回退到關鍵詞檢測
    console.log('回退到關鍵詞檢測方法');
    return false; // 這裡不回退到關鍵詞檢測，因為後續代碼會處理
  }
}



// 關鍵詞檢測用戶是否想要生成圖片的函數
async function detectImageGenerationRequest(content, messageHistory = []) {
  // 檢查是否是黑白轉換請求，如果是，則不視為圖片生成請求
  const isBlackAndWhiteRequest = content.match(/(黑白|灰階|灰度)/i) || 
    content.match(/改成黑白/i) || 
    content.match(/變成黑白/i) || 
    content.match(/換成黑白/i) || 
    content.match(/轉成黑白/i);
  
  // 檢查最近的消息歷史，看是否有圖片附件
  let hasRecentImageAttachment = false;
  if (messageHistory.length > 0) {
    const lastMessage = messageHistory[messageHistory.length - 1];
    hasRecentImageAttachment = lastMessage && lastMessage.attachments && lastMessage.attachments.size > 0;
  }
  
  // 如果是黑白轉換請求，且最近有圖片附件，則不視為圖片生成請求
  if (isBlackAndWhiteRequest && hasRecentImageAttachment) {
    console.log('detectImageGenerationRequest: 檢測到黑白轉換請求，且有圖片附件，不視為圖片生成請求');
    return false;
  }
  
  // 定義可能表示用戶想要生成圖片的關鍵詞
  const imageGenerationKeywords = [
    '畫圖', '生成圖片', '畫一張', '幫我畫', '幫我生成圖片', '幫我生成一張圖片',
    'generate image', 'create image', 'draw', 'draw me', 'generate a picture',
    'ai 畫圖', 'ai畫圖', 'ai繪圖', 'ai 繪圖', '畫一個', '畫個', '生成一張', '生一張',
    'create a picture', 'draw a picture', 'generate an image', 'create an image',
    '幫我畫一張', '幫我畫個', '幫忙畫', '幫忙生成圖片', '請畫', '請生成圖片', 'create a image',
    'create the image', '生一個', '生成一個', '給我一張', '給我一個', '做一張', '做一個',
    '可以畫', '可以生成', '能畫', '能生成', '幫忙生成', '幫忙做', '幫我做', '隨便生一張圖',
    '隨便畫一張', '隨便畫', '隨便生成', '隨便給我一張', '隨便做一張', '生張圖', '生個圖',
    '生圖', '幫我生圖', '幫我隨便生一張圖', '幫我隨便畫一張', '幫我隨便生成一張'
  ];
  
  // 定義可能會導致誤判的詞彙（這些詞彙雖然與圖片相關，但在普通對話中也常見）
  const ambiguousKeywords = [
    '生成', '繪製', '繪圖', '做圖', '做個圖', '畫張', '畫個圖', '圖片', '圖像',
    '帥哥圖', '美女圖', '動漫圖', '風景圖', '照片', '圖'
  ];
  
  // 檢查內容是否包含明確的關鍵詞
  const containsKeyword = imageGenerationKeywords.some(keyword => 
    content.toLowerCase().includes(keyword.toLowerCase())
  );
  
  // 檢查內容是否包含可能導致誤判的詞彙
  const containsAmbiguousKeyword = ambiguousKeywords.some(keyword => 
    content.toLowerCase().includes(keyword.toLowerCase())
  );
  
  // 檢查是否包含圖片相關詞彙和描述性語言
  const hasImageDescription = (
    // 檢查是否包含顏色詞彙
    /顏色|色彩|紅色|藍色|綠色|黃色|紫色|橙色|黑色|白色|彩色|color|red|blue|green|yellow|purple|orange|black|white/i.test(content) ||
    // 檢查是否包含風格詞彙
    /風格|樣式|設計|卡通|寫實|抽象|未來|復古|現代|style|cartoon|realistic|abstract|futuristic|vintage|modern/i.test(content) ||
    // 檢查是否包含主題詞彙
    /人物|風景|動物|建築|場景|背景|character|landscape|animal|building|scene|background/i.test(content) ||
    // 檢查是否包含特定圖片類型
    /動漫|漫畫|插圖|素描|水彩|油畫|照片|anime|manga|illustration|sketch|watercolor|painting|photo/i.test(content)
  );
  
  // 檢查是否包含尺寸、大小相關詞彙
  const hasSizeDescription = (
    /大|小|巨大|微小|高|矮|寬|窄|長|短|超大|迷你|giant|huge|large|small|tiny|big|tall|short|wide|narrow/i.test(content)
  );
  
  // 檢查是否包含特定物體或場景
  const hasSpecificObjects = (
    /籃球|足球|棒球|網球|排球|球場|球框|籃框|球門|運動場|籃板|球員|比賽|basketball|football|soccer|baseball|tennis|volleyball|court|field|player|game|match/i.test(content)
  );
  
  // 檢查是否包含位置或方向詞彙
  const hasPositionDescription = (
    /上面|下面|左邊|右邊|中間|旁邊|前面|後面|裡面|外面|遠處|近處|top|bottom|left|right|middle|center|side|front|back|inside|outside|far|near/i.test(content)
  );
  
  // 檢查是否是對之前回應的跟進請求
  const isFollowUpRequest = (
    /我要|我想要|我需要|給我|幫我|可以給我|可以幫我|能給我|能幫我|I want|I need|give me|can you give|can you make/i.test(content) ||
    // 檢查是否包含修改或調整的請求
    /改成|變成|調整|修改|不要|不用|去掉|加上|增加|減少|change|modify|adjust|remove|add|increase|decrease|without|with/i.test(content)
  );
  
  // 檢查是否包含具體的圖像描述
  const hasDetailedDescription = (
    // 檢查是否包含具體的形容詞
    /很|非常|超級|極其|特別|相當|十分|extremely|very|super|particularly|especially|quite/i.test(content) ||
    // 檢查是否包含數量詞
    /一個|兩個|三個|幾個|多個|一些|許多|one|two|three|several|many|some|few|multiple/i.test(content) ||
    // 檢查是否包含具體的物體描述
    /圓形|方形|正方形|長方形|三角形|橢圓形|round|square|rectangular|triangular|oval|circle|rectangle|triangle/i.test(content)
  );
  
  // 檢查是否是對圖像生成的直接請求
  const isDirectImageRequest = (
    /幫我|請|麻煩|拜託|可以|能不能|能否|是否可以|please|could you|can you|would you|help me/i.test(content)
  );
  
  // 檢查對話上下文，判斷是否在討論圖片生成相關話題
  let isInImageGenerationContext = false;
  let previousImageGenerationRequest = false;
  
  // 檢查最近的對話歷史（最多檢查最近的5條消息）
  const recentMessages = messageHistory.slice(-5);
  
  // 檢查是否有之前的圖片生成請求或回應
  for (const msg of recentMessages) {
    // 檢查用戶之前的消息是否包含圖片生成關鍵詞
    if (msg.role === 'user' && imageGenerationKeywords.some(keyword => 
      msg.content.toLowerCase().includes(keyword.toLowerCase())
    )) {
      previousImageGenerationRequest = true;
      isInImageGenerationContext = true;
      break;
    }
    
    // 檢查機器人之前的回應是否提到了圖片生成
    if (msg.role === 'assistant' && (
      msg.content.includes('生成圖片') ||
      msg.content.includes('畫圖') ||
      msg.content.includes('generating image') ||
      msg.content.includes('drawing') ||
      msg.content.includes('正在生成圖片') ||
      msg.content.includes('幫你畫')
    )) {
      isInImageGenerationContext = true;
      break;
    }
  }
  
  // 綜合判斷：
  // 1. 如果包含明確的關鍵詞，則判定為生成圖片請求
  // 2. 如果在圖片生成的上下文中，且包含跟進請求，則判定為生成圖片請求
  // 3. 如果同時包含圖片描述和跟進請求，則判定為生成圖片請求
  // 4. 如果同時包含詳細描述和直接請求，則判定為生成圖片請求
  // 5. 如果包含特定物體描述和尺寸詞彙，且在圖片生成上下文中，則判定為生成圖片請求
  
  // 首先檢查是否包含明確的關鍵詞，這是最優先的判斷條件
  if (containsKeyword) {
    console.log('明確的圖片生成關鍵詞被檢測到:', content);
    return true;
  }
  
  // 檢查是否包含「隨便」和「圖」的組合，這也是明確的生成圖片請求
  if (/隨便.*圖|圖.*隨便/i.test(content)) {
    console.log('檢測到「隨便」和「圖」的組合:', content);
    return true;
  }
  
  // 對於可能導致誤判的詞彙，需要更嚴格的條件
  if (containsAmbiguousKeyword && !isInImageGenerationContext) {
    // 如果只包含可能導致誤判的詞彙，但不在圖片生成上下文中，需要更多的條件才能判定為圖片生成請求
    return (hasImageDescription && isFollowUpRequest && hasDetailedDescription) || 
           (hasImageDescription && isDirectImageRequest && hasDetailedDescription);
  }
  
  // 其他綜合判斷條件
  return (isInImageGenerationContext && isFollowUpRequest) || 
         (hasImageDescription && isFollowUpRequest && (hasDetailedDescription || hasSizeDescription || hasSpecificObjects)) || 
         (hasDetailedDescription && isDirectImageRequest && (hasImageDescription || hasSizeDescription || hasSpecificObjects)) ||
         (previousImageGenerationRequest && (hasSizeDescription || hasPositionDescription || hasSpecificObjects));
}

// 使用 genimg.mjs 生成圖片的函數
async function generateImageWithGemini(prompt, imageUrl = null) {
  try {
    // 使用 child_process 執行 genimg.mjs
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execPromise = promisify(exec);
    
    // 獲取 Gemini API 密鑰
    // 首先嘗試從環境變數獲取
    let apiKey = process.env.GEMINI_API_KEY;
    
    // 如果環境變數中沒有，則嘗試從 GEMINI_API_KEYS 數組中獲取
    if (!apiKey && GEMINI_API_KEYS && GEMINI_API_KEYS.length > 0) {
      apiKey = GEMINI_API_KEYS[currentGeminiKeyIndex];
    }
    
    // 構建命令，將 prompt 和 API 密鑰作為參數傳遞給 genimg.mjs
    // 使用雙引號包裹 prompt，以處理包含空格和特殊字符的情況
    let command = `node "${__dirname}/genimg.mjs"`;
    
    // 如果有 API 密鑰，則添加到命令中
    if (apiKey) {
      command += ` --api-key=${apiKey}`;
    }
    
    // 如果提供了圖片 URL，添加到命令中
    if (imageUrl) {
      // 對 URL 進行編碼，確保特殊字符被正確處理
      const encodedUrl = encodeURI(imageUrl);
      command += ` --image-url="${encodedUrl.replace(/"/g, '\"')}"`;
      console.log(`添加圖片 URL 參數: ${encodedUrl}`);
    }
    
    // 添加 prompt 參數
    command += ` "${prompt.replace(/"/g, '\"')}"`;
    
    console.log(`Executing command: ${command.replace(/--api-key=[^\s]+/, '--api-key=****').replace(/--image-url=[^\s]+/, '--image-url=****')}`);
    
    // 執行命令並獲取輸出，設置較大的 maxBuffer 值以處理大型輸出
    // 默認值為 1MB (1024 * 1024)，這裡設置為 50MB
    const maxBufferSize = 50 * 1024 * 1024; // 50MB
    const { stdout, stderr } = await execPromise(command, { maxBuffer: maxBufferSize });
    
    if (stderr) {
      console.error(`genimg.mjs stderr: ${stderr}`);
    }
    
    // 處理分塊輸出的 JSON 數據
    let jsonData = '';
    let result;
    
    // 記錄 stdout 的大小，用於調試
    console.log(`Received stdout with length: ${stdout.length} characters`);
    
    // 首先嘗試直接解析整個輸出
    try {
      // 檢查 stdout 是否以 '{' 開頭並以 '}' 結尾，這是有效的 JSON 格式
      if (stdout.trim().startsWith('{') && stdout.trim().endsWith('}')) {
        result = JSON.parse(stdout);
        console.log('Successfully parsed entire stdout as JSON');
        if (result.success !== undefined && result.imageData) {
          return {
            imageData: result.imageData,
            mimeType: result.mimeType || 'image/png',
            responseText: '這是根據你的描述生成的圖片：' + (result.text ? `\n${result.text}` : '')
          };
        }
      } else {
        throw new Error('Stdout is not a valid JSON format');
      }
    } catch (directParseError) {
      console.log(`Could not parse entire stdout as JSON: ${directParseError.message}`);
      console.log('Trying to extract JSON data from stdout');
    }
    
    // 使用正則表達式查找標記之間的內容，這樣可以處理多行標記
    const markerRegex = /###JSON_START###([\s\S]*?)###JSON_END###/;
    const markerMatch = stdout.match(markerRegex);
    
    if (markerMatch && markerMatch[1]) {
      // 提取標記之間的內容
      jsonData = markerMatch[1].trim();
      console.log(`Extracted JSON data between markers (length: ${jsonData.length})`);
    } else {
      // 如果沒有找到標記對，嘗試查找單個開始標記後的所有內容
      const startMarkerIndex = stdout.indexOf('###JSON_START###');
      if (startMarkerIndex !== -1) {
        // 提取開始標記之後的所有內容
        jsonData = stdout.substring(startMarkerIndex + '###JSON_START###'.length).trim();
        console.log(`Extracted JSON data after start marker (length: ${jsonData.length})`);
      } else {
        // 如果沒有找到任何標記，嘗試查找 JSON 對象
        console.log('No JSON markers found, trying to extract JSON object');
        
        // 嘗試查找最大的 JSON 對象
        // 使用更複雜的正則表達式來查找可能的 JSON 對象
        const jsonRegex = /{[\s\S]*?}/g;
        const matches = stdout.match(jsonRegex);
        
        if (matches && matches.length > 0) {
          // 按大小排序匹配的 JSON 對象
          const sortedMatches = [...matches].sort((a, b) => b.length - a.length);
          
          // 嘗試每個匹配的 JSON 對象，從最大的開始
          for (const match of sortedMatches) {
            try {
              // 嘗試解析
              const parsed = JSON.parse(match);
              // 如果包含必要的字段，使用這個對象
              if (parsed.success !== undefined) {
                console.log(`Found valid JSON object in stdout (length: ${match.length})`);
                jsonData = match;
                break;
              }
            } catch (e) {
              // 忽略解析錯誤，繼續嘗試下一個匹配
              console.log(`Failed to parse JSON object: ${e.message.substring(0, 100)}...`);
            }
          }
        }
        
        // 如果仍然沒有找到有效的 JSON 數據，使用整個 stdout
        if (!jsonData) {
          console.log('No valid JSON object found, using entire stdout');
          jsonData = stdout;
        }
      }
    }
    
    // 嘗試解析 JSON 數據
    try {
      // 解析 JSON 輸出
      console.log(`JSON data length: ${jsonData.length} characters`);
      console.log(`JSON data starts with: ${jsonData.substring(0, 50)}...`);
      console.log(`JSON data ends with: ...${jsonData.substring(jsonData.length - 50)}`);
      
      // 檢查 JSON 數據是否完整
      // 嘗試找到最後一個右大括號，確保 JSON 數據完整
      const firstBraceIndex = jsonData.indexOf('{');
      const lastBraceIndex = jsonData.lastIndexOf('}');
      
      if (firstBraceIndex === -1 || lastBraceIndex === -1) {
        throw new Error('JSON data does not contain valid object braces');
      }
      
      // 如果 JSON 數據不是以 '{' 開頭，可能有前綴內容
      if (firstBraceIndex > 0) {
        console.log(`JSON data has prefix content, trimming ${firstBraceIndex} characters`);
        jsonData = jsonData.substring(firstBraceIndex);
      }
      
      // 如果最後一個右大括號不是最後一個字符，可能 JSON 數據不完整或有後綴內容
      if (lastBraceIndex < jsonData.length - 1) {
        console.log('JSON data has suffix content, truncating to last closing brace');
        jsonData = jsonData.substring(0, lastBraceIndex + 1);
      }
      
      // 嘗試解析處理後的 JSON 數據
      console.log(`Attempting to parse processed JSON data (length: ${jsonData.length})`);
      result = JSON.parse(jsonData);
      console.log('Successfully parsed JSON data');
    } catch (parseError) {
      console.error(`Error parsing JSON: ${parseError.message}`);
      console.log('Attempting alternative parsing methods...');
      
      // 嘗試查找完整的 JSON 對象
      const jsonRegex = /{[\s\S]*?}/g;
      const matches = jsonData.match(jsonRegex);
      
      if (matches && matches.length > 0) {
        console.log(`Found ${matches.length} potential JSON objects in the data`);
        
        // 按大小排序匹配的 JSON 對象
        const sortedMatches = [...matches].sort((a, b) => b.length - a.length);
        
        // 嘗試解析找到的最大 JSON 對象
        const maxMatch = sortedMatches[0];
        console.log(`Largest JSON object length: ${maxMatch.length}`);
        
        try {
          console.log(`Attempting to parse largest JSON object`);
          result = JSON.parse(maxMatch);
          console.log('Successfully parsed largest JSON object');
        } catch (innerError) {
          console.error(`Error parsing largest JSON object: ${innerError.message}`);
          
          // 如果最大對象解析失敗，嘗試所有其他對象
          let parsed = false;
          for (let i = 1; i < sortedMatches.length; i++) {
            const match = sortedMatches[i];
            try {
              console.log(`Attempting to parse alternative JSON object #${i} (length: ${match.length})`);
              result = JSON.parse(match);
              console.log(`Successfully parsed alternative JSON object #${i}`);
              parsed = true;
              break;
            } catch (e) {
              console.log(`Failed to parse alternative JSON object #${i}: ${e.message}`);
            }
          }
          
          // 如果所有嘗試都失敗，拋出原始錯誤
          if (!parsed) {
            console.error('All parsing attempts failed');
            throw parseError;
          }
        }
      } else {
        // 如果沒有找到任何 JSON 對象，嘗試最後的修復方法
        console.error('No JSON objects found in the output');
        
        // 嘗試修復常見的 JSON 格式問題
        console.log('Attempting to fix common JSON format issues...');
        
        // 確保 JSON 數據以 '{' 開頭並以 '}' 結尾
        let fixedJson = jsonData.trim();
        if (!fixedJson.startsWith('{')) fixedJson = '{' + fixedJson;
        if (!fixedJson.endsWith('}')) fixedJson = fixedJson + '}';
        
        try {
          console.log('Attempting to parse fixed JSON data');
          result = JSON.parse(fixedJson);
          console.log('Successfully parsed fixed JSON data');
        } catch (fixError) {
          console.error(`Failed to fix JSON data: ${fixError.message}`);
          throw parseError; // 拋出原始錯誤
        }
      }
    }
    
    // 檢查結果是否有效
    if (!result) {
      throw new Error('Failed to parse JSON data from genimg.mjs output');
    }
    
    // 檢查是否成功
    if (!result.success || !result.imageData) {
      console.log('圖片生成失敗，準備重試...');
      
      // 嘗試使用不同的提示詞格式和 API 密鑰
      const alternativePrompts = [
        // 原始提示詞
        prompt,
        // 添加明確的圖片生成指令
        `生成一張圖片：${prompt}`,
        // 更詳細的描述
        `請創建一張高品質、彩色的圖片，內容是：${prompt}`,
        // 英文提示詞可能效果更好
        `Generate a detailed, high-quality color image of: ${prompt}`
      ];
      
      // 最多重試 4 次，每次使用不同的提示詞格式
      for (let i = 0; i < alternativePrompts.length; i++) {
        const currentPrompt = alternativePrompts[i];
        console.log(`重試第 ${i + 1} 次，使用提示詞：${currentPrompt.substring(0, 30)}${currentPrompt.length > 30 ? '...' : ''}`);
        
        try {
          // 每次重試使用不同的 API 密鑰
          getNextGeminiKey();
          const currentKey = getCurrentGeminiKey();
          console.log(`使用 API 密鑰：${currentKey.substring(0, 4)}...${currentKey.substring(currentKey.length - 4)}`);
          
          // 執行 genimg.mjs 腳本，增加超時時間和緩衝區大小
          const { stdout } = await exec(
            `node "${path.join(__dirname, 'genimg.mjs')}" --api-key=${currentKey} "${currentPrompt.replace(/"/g, '\"')}"`,
            { 
              maxBuffer: 20 * 1024 * 1024, // 增加緩衝區大小到 20MB
              timeout: 60000 // 設置 60 秒超時
            }
          );
          
          // 嘗試解析輸出
          try {
            result = JSON.parse(stdout);
          } catch (parseError) {
            console.error(`解析 JSON 失敗：${parseError.message}`);
            console.log('嘗試從輸出中提取 JSON 對象...');
            
            // 嘗試從輸出中提取 JSON 對象
            const jsonMatch = stdout.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                result = JSON.parse(jsonMatch[0]);
                console.log('成功從輸出中提取 JSON 對象');
              } catch (extractError) {
                console.error(`提取的 JSON 對象解析失敗：${extractError.message}`);
                throw parseError; // 拋出原始錯誤
              }
            } else {
              throw parseError; // 拋出原始錯誤
            }
          }
          
          // 如果成功生成圖片，跳出重試循環
          if (result.success && result.imageData) {
            console.log('重試成功！');
            break;
          } else {
            console.error(`重試未生成圖片，錯誤：${result.error || '未知錯誤'}`);
          }
        } catch (retryError) {
          console.error(`重試失敗 (${i + 1}/${alternativePrompts.length}):`, retryError.message);
          // 如果是最後一次重試，拋出錯誤
          if (i === alternativePrompts.length - 1) {
            throw new Error(result?.error || retryError.message || 'Failed to generate image after all retries');
          }
        }
        
        // 等待 3 秒後再重試，給 API 更多冷卻時間
        console.log(`等待 3 秒後進行下一次重試...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      // 如果所有重試都失敗
      if (!result.success || !result.imageData) {
        throw new Error(result?.error || 'Failed to generate image after all retries');
      }
    }
    
    // 返回圖片數據和響應文本
    return { 
      imageData: result.imageData,
      mimeType: result.mimeType || 'image/png',
      responseText: '這是根據你的描述生成的圖片：' + (result.text ? `\n${result.text}` : '')
    };
    
  } catch (error) {
    console.error('Error in generateImageWithGemini:', error);
    throw error;
  }
}

async function callChatGPTAPI(messages) {
  // Try all available ChatGPT keys until one works
  let lastError = null;
  const initialKeyIndex = currentChatGPTKeyIndex;
  let keysTriedCount = 0;
  
  while (keysTriedCount < CHATGPT_API_KEYS.length) {
    try {
      // Import OpenAI API directly - using new SDK version
      const OpenAI = (await import('openai')).default;
      
      // Initialize OpenAI API with new SDK format
      const openai = new OpenAI({ 
        apiKey: getCurrentChatGPTKey(),
        baseURL: 'https://free.v36.cm/v1',
        dangerouslyAllowBrowser: true // Add this option to bypass safety check
      });
      
      // Call ChatGPT API with new SDK format
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo-0125',
        messages: messages,
        max_tokens: 500 // Reduced from 1000 to make responses shorter
      });
      
      // Check for empty response
      if (!completion || !completion.choices || !completion.choices[0] || !completion.choices[0].message) {
        // Try next key
        lastError = new Error('Empty response from ChatGPT API');
        getNextChatGPTKey();
        keysTriedCount++;
        console.log(`ChatGPT API key ${currentChatGPTKeyIndex + 1}/${CHATGPT_API_KEYS.length} returned empty response`);
        continue;
      }
      
      // Success! Return the response
      return completion.choices[0].message.content;
      
    } catch (error) {
      // Try next key
      lastError = error;
      getNextChatGPTKey();
      keysTriedCount++;
      console.log(`ChatGPT API key ${currentChatGPTKeyIndex + 1}/${CHATGPT_API_KEYS.length} error: ${error.message}`);
    }
  }
  
  // If we get here, all keys failed
  throw lastError || new Error('All ChatGPT API keys failed');
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Check if the message is in an active channel
  const channelConfig = activeChannels.get(message.channelId);
  if (!channelConfig) return;

  // Show typing indicator immediately
  await message.channel.sendTyping();
  
  // 獲取頻道的消息歷史用於上下文判斷
  // 從 Discord 獲取最近的消息 (50條，與README一致)
  const recentMessages = await message.channel.messages.fetch({ limit: 50 });
  // 將最近的消息轉換為歷史記錄格式
  const channelHistory = Array.from(recentMessages.values())
    .reverse()
    .map(msg => ({
      content: msg.content,
      author: msg.author,
      attachments: msg.attachments
    }));
  
  // 記錄消息歷史
  console.log(`獲取到 ${channelHistory.length} 條消息歷史記錄`);
  
  // 檢查是否是圖片修改請求
  // 獲取上一條消息（不是當前消息）
  const previousMessage = channelHistory.length > 1 ? channelHistory[channelHistory.length - 2] : null;
  
  // 檢查是否是回覆消息，並且回覆的是包含圖片的消息
  let repliedMessage = null;
  let isReplyToImageMessage = false;
  
  if (message.reference && message.reference.messageId) {
    try {
      // 獲取被回覆的消息
      repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
      
      // 檢查被回覆的消息是否包含圖片附件或是機器人發送的圖片生成/修改消息
      isReplyToImageMessage = repliedMessage && (
        // 檢查是否包含圖片附件
        (repliedMessage.attachments.size > 0 && 
         Array.from(repliedMessage.attachments.values()).some(attachment => 
           attachment.contentType && attachment.contentType.startsWith('image/'))) ||
        // 檢查是否是機器人發送的圖片生成/修改消息
        (repliedMessage.author.id === client.user.id && (
          repliedMessage.content.includes('生成的圖片') ||
          repliedMessage.content.includes('修改後的圖片') ||
          repliedMessage.content.includes('根據你的描述') ||
          repliedMessage.content.includes('根據你的要求') ||
          repliedMessage.content.includes('轉換成彩色的圖片') ||
          repliedMessage.content.includes('轉換成新風格的圖片')
        ))
      );
      
      console.log(`檢查回覆的消息是否包含圖片: ${isReplyToImageMessage}`);
    } catch (error) {
      console.error('獲取回覆消息時出錯:', error);
    }
  }
  
  // 檢查上一條消息是否包含圖片附件
  const hasImageAttachment = previousMessage && 
                           previousMessage.attachments && 
                           previousMessage.attachments.size > 0 && 
                           Array.from(previousMessage.attachments.values()).some(attachment => 
                             attachment.contentType && attachment.contentType.startsWith('image/'));
  
  // 檢查上一條消息是否是機器人發送的圖片生成消息
  const isLastMessageImageGeneration = previousMessage && 
                                     previousMessage.author && 
                                     previousMessage.author.bot && (
    // 優先檢查特殊標記
    (previousMessage.content && previousMessage.content.includes('[IMAGE_GENERATED]')) ||
    // 檢查消息內容是否包含圖片生成相關文字
    (previousMessage.content && (
      previousMessage.content.includes('這是根據你的描述生成的圖片') ||
      previousMessage.content.includes('生成的圖片') ||
      previousMessage.content.includes('根據你的描述') ||
      previousMessage.content.includes('這是轉換成彩色的圖片') ||
      previousMessage.content.includes('這是根據你的要求生成的圖片')
    )) ||
    // 檢查機器人的消息是否包含圖片附件，且不是回覆用戶的圖片修改請求
    (previousMessage.attachments && previousMessage.attachments.size > 0 && 
     previousMessage.content && !previousMessage.content.includes('這是修改後的圖片') &&
     !previousMessage.content.includes('我將轉換成黑白版本'))
  );
  
  // 記錄上一條消息的信息，幫助診斷問題
  console.log('上一條消息來自:', previousMessage ? (previousMessage.author && previousMessage.author.bot ? '機器人' : '用戶') : '無');
  if (previousMessage && previousMessage.content) {
    console.log('上一條消息內容:', previousMessage.content.substring(0, 50) + (previousMessage.content.length > 50 ? '...' : ''));
  }
  if (previousMessage && previousMessage.attachments) {
    console.log('上一條消息包含附件:', previousMessage.attachments.size > 0);
    if (previousMessage.attachments.size > 0) {
      previousMessage.attachments.forEach((attachment, id) => {
        console.log(`附件 ${id}: ${attachment.name}, 類型: ${attachment.contentType}`);
      });
    }
  }
  
  // 更全面的圖片修改請求檢測
  const isImageModificationRequest = 
    // 完整的問句形式 - 黑白相關
    message.content.match(/可以(幫我)?(改|換|轉|變|多|加)成(黑白|彩色|其他顏色)([的嗎])?/i) ||
    message.content.match(/可以(改|換|轉|變)成黑白的嗎/i) ||
    message.content.match(/能(幫我)?(改|換|轉|變)成黑白([的嗎])?/i) ||
    message.content.match(/能不能(改|換|轉|變)成黑白([的嗎])?/i) ||
    // 評價形式
    message.content.match(/(黑白|彩色)(的也一樣好看|也不錯|也超好看)/i) ||
    // 直接請求形式 - 黑白相關
    message.content.match(/改成黑白的嗎/i) ||
    message.content.match(/(黑白|灰階|灰度)/i) ||
    message.content.match(/改成黑白/i) ||
    message.content.match(/變成黑白/i) ||
    message.content.match(/換成黑白/i) ||
    message.content.match(/轉成黑白/i) ||
    // 添加更簡單的請求形式 - 黑白相關
    message.content.match(/黑白的$/i) ||
    message.content.match(/改成黑白的$/i) ||
    message.content.match(/變成黑白的$/i) ||
    message.content.match(/換成黑白的$/i) ||
    message.content.match(/轉成黑白的$/i) ||
    // 添加「幫我」開頭的請求形式 - 黑白相關
    message.content.match(/^幫我(改|換|轉|變)成黑白/i) ||
    message.content.match(/^幫我(改|換|轉|變)成灰階/i) ||
    message.content.match(/^幫我(改|換|轉|變)成灰度/i) ||
    // 添加更多可能的表達方式 - 黑白相關
    message.content.match(/^(改|換|轉|變)成黑白/i) ||
    message.content.match(/^(改|換|轉|變)成灰階/i) ||
    message.content.match(/^(改|換|轉|變)成灰度/i) ||
    
    // 風格相關的修改請求
    message.content.match(/可以(幫我)?(改|換|轉|變|多|加|把)成(動漫|寫實|卡通|素描|油畫|水彩|像素|復古|現代|未來|科幻|奇幻|可愛|恐怖|溫馨|冷酷|溫暖|冷色|暖色|明亮|暗沉|高對比|低對比|高飽和|低飽和|黑白|彩色|單色|多色|藝術|寫意|寫實|抽象|具象|印象派|表現派|立體派|超現實|極簡|繁複|浮世繪|國畫|西洋畫|插畫|漫畫|素描|速寫|版畫|蝕刻|水墨|彩墨|粉彩|炭筆|鉛筆|鋼筆|毛筆|噴槍|數位|傳統|混合|其他)(風格|風|樣子|樣式|感覺|效果|的)([的嗎])?/i) ||
    message.content.match(/(改|換|轉|變)成(動漫|寫實|卡通|素描|油畫|水彩|像素|復古|現代|未來|科幻|奇幻|可愛|恐怖|溫馨|冷酷|溫暖|冷色|暖色|明亮|暗沉|高對比|低對比|高飽和|低飽和|黑白|彩色|單色|多色|藝術|寫意|寫實|抽象|具象|印象派|表現派|立體派|超現實|極簡|繁複|浮世繪|國畫|西洋畫|插畫|漫畫|素描|速寫|版畫|蝕刻|水墨|彩墨|粉彩|炭筆|鉛筆|鋼筆|毛筆|噴槍|數位|傳統|混合|其他)(風格|風|樣子|樣式|感覺|效果|的)?/i) ||
    message.content.match(/(動漫|寫實|卡通|素描|油畫|水彩|像素|復古|現代|未來|科幻|奇幻|可愛|恐怖|溫馨|冷酷|溫暖|冷色|暖色|明亮|暗沉|高對比|低對比|高飽和|低飽和|黑白|彩色|單色|多色|藝術|寫意|寫實|抽象|具象|印象派|表現派|立體派|超現實|極簡|繁複|浮世繪|國畫|西洋畫|插畫|漫畫|素描|速寫|版畫|蝕刻|水墨|彩墨|粉彩|炭筆|鉛筆|鋼筆|毛筆|噴槍|數位|傳統|混合|其他)(風格|風|樣子|樣式|感覺|效果)/i) ||
    
    // 添加更多通用修改請求的表達方式
    message.content.match(/(修改|調整|微調)(一下|圖片|這張圖)/i) ||
    message.content.match(/(改一下|調一下|換一下)/i) ||
    message.content.match(/可以(修改|調整|微調)/i) ||
    message.content.match(/(重新|再)(畫|生成|做)(一張|一個)/i) ||
    message.content.match(/能不能(改|換|轉|變)/i) ||
    message.content.match(/可以(改|換|轉|變)/i) ||
    message.content.match(/想要(改|換|轉|變)/i) ||
    message.content.match(/希望(改|換|轉|變)/i) ||
    message.content.match(/請(改|換|轉|變)/i) ||
    message.content.match(/幫我(改|換|轉|變)/i);
  
  // 根據頻道配置決定是否使用 AI 判定圖片修改請求
  let isModificationRequest = false;
  
  if (channelConfig.useAIToDetectImageRequest) {
    console.log('使用 AI 判定圖片修改請求');
    isModificationRequest = await detectImageModificationWithAI(message.content, channelHistory);
  } else {
    console.log('使用關鍵詞判定圖片修改請求');
    isModificationRequest = isImageModificationRequest;
  }
  
  // 如果上一條消息是圖片生成或包含圖片附件，或者是回覆包含圖片的消息，且當前消息是修改請求，則視為圖片修改請求
  // 特別處理回覆 AI 生成圖片的情況
  let isReplyToAIGeneratedImage = false;
  if (message.reference && message.reference.messageId) {
    try {
      // 獲取被回覆的消息
      const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
      // 檢查被回覆的消息是否是 AI 生成的圖片
      isReplyToAIGeneratedImage = repliedMsg && 
                               repliedMsg.author && 
                               repliedMsg.author.bot && 
                               repliedMsg.attachments && 
                               repliedMsg.attachments.size > 0 && (
        // 檢查特殊標記
        (repliedMsg.content && repliedMsg.content.includes('[IMAGE_GENERATED]')) ||
        // 檢查消息內容是否包含圖片生成相關文字
        (repliedMsg.content && (
          repliedMsg.content.includes('這是根據你的描述生成的圖片') ||
          repliedMsg.content.includes('生成的圖片') ||
          repliedMsg.content.includes('根據你的描述') ||
          repliedMsg.content.includes('這是轉換成彩色的圖片') ||
          repliedMsg.content.includes('這是根據你的要求生成的圖片')
        ))
      );
      console.log('檢查是否回覆 AI 生成的圖片:', isReplyToAIGeneratedImage);
    } catch (error) {
      console.error('獲取被回覆消息時出錯:', error);
    }
  }
  
  const shouldProcessImageModification = ((hasImageAttachment || isLastMessageImageGeneration || isReplyToImageMessage || isReplyToAIGeneratedImage) && isModificationRequest);
  
  // 記錄檢測結果
  if (shouldProcessImageModification) {
    console.log('檢測到圖片修改請求:', message.content);
    console.log('上一條消息包含圖片附件:', hasImageAttachment);
    console.log('上一條消息是圖片生成:', isLastMessageImageGeneration);
    console.log('是回覆包含圖片的消息:', isReplyToImageMessage);
    console.log('是回覆 AI 生成的圖片:', isReplyToAIGeneratedImage);
    console.log('是否處理圖片修改:', shouldProcessImageModification);
  }

  if (shouldProcessImageModification) {
    // 先發送確認消息
    await message.channel.send('好的，我這就幫你轉換圖片！');
    try {
      // 顯示處理狀態
      const statusMessage = await message.channel.send('正在轉換圖片，請稍候...');

      // 動態導入 sharp
      let sharp;
      try {
        console.log('開始導入 sharp 模組');
        const sharpModule = await import('sharp');
        sharp = sharpModule.default;
        console.log('成功導入 sharp 模組');
      } catch (importError) {
        console.error('導入 sharp 模組失敗:', importError);
        await statusMessage.delete().catch(console.error);
        await message.channel.send('抱歉，處理圖片時出現錯誤，無法載入圖片處理模組。');
        return;
      }

      // 獲取需要修改的圖片（優先使用被回覆消息中的圖片，其次是上一條消息中的圖片）
      let targetAttachment = null;
      
      // 如果是回覆消息，優先使用被回覆消息中的圖片
      if ((isReplyToImageMessage || isReplyToAIGeneratedImage) && repliedMessage) {
        targetAttachment = repliedMessage.attachments.first();
        console.log('使用被回覆消息中的圖片');
      } 
      // 否則使用上一條消息中的圖片
      else if (previousMessage) {
        targetAttachment = previousMessage.attachments.first();
        console.log('使用上一條消息中的圖片');
      }
      
      if (!targetAttachment) {
        await statusMessage.delete().catch(console.error);
        await message.channel.send('抱歉，找不到需要修改的圖片。');
        return;
      }

      // 下載圖片
      console.log(`開始下載圖片: ${targetAttachment.url}`);
      const response = await fetch(targetAttachment.url);
      const arrayBuffer = await response.arrayBuffer();
      console.log(`圖片下載完成，大小: ${arrayBuffer.byteLength} 字節`);
      const imageBuffer = Buffer.from(arrayBuffer);

      // 根據請求類型處理圖片
       let processedImage;
       // 檢測具體的修改類型
       const isBlackAndWhiteRequest = message.content.match(/(黑白|灰階|灰度)/i) || 
         message.content.match(/改成黑白/i) || 
         message.content.match(/變成黑白/i) || 
         message.content.match(/換成黑白/i) || 
         message.content.match(/轉成黑白/i);
       const isColorRequest = message.content.match(/(彩色|全彩)/i);
       
       // 檢測風格修改請求
       const styleMatch = message.content.match(/(改|換|轉|變)成(動漫|寫實|卡通|素描|油畫|水彩|像素|復古|現代|未來|科幻|奇幻|可愛|恐怖|溫馨|冷酷|溫暖|冷色|暖色|明亮|暗沉|高對比|低對比|高飽和|低飽和|黑白|彩色|單色|多色|藝術|寫意|寫實|抽象|具象|印象派|表現派|立體派|超現實|極簡|繁複|浮世繪|國畫|西洋畫|插畫|漫畫|素描|速寫|版畫|蝕刻|水墨|彩墨|粉彩|炭筆|鉛筆|鋼筆|毛筆|噴槍|數位|傳統|混合|其他)(風格|風|樣子|樣式|感覺|效果|的)?/i);
       const isStyleRequest = styleMatch !== null;
       const requestedStyle = isStyleRequest ? styleMatch[2] : null; // 獲取請求的風格
       
       // 檢測一般修改請求
       const isGeneralModificationRequest = message.content.match(/(修改|調整|微調|改一下|調一下|換一下)/i) || 
         message.content.match(/能不能(改|換|轉|變)/i) || 
         message.content.match(/可以(改|換|轉|變)/i) || 
         message.content.match(/想要(改|換|轉|變)/i) || 
         message.content.match(/希望(改|換|轉|變)/i) || 
         message.content.match(/請(改|換|轉|變)/i) || 
         message.content.match(/幫我(改|換|轉|變)/i);
       
       // 如果是AI判定的修改請求但沒有匹配到具體類型，則視為一般修改請求
       const isAIDetectedModification = channelConfig.useAIToDetectImageRequest && isModificationRequest && 
         !isBlackAndWhiteRequest && !isColorRequest && !isStyleRequest && !isGeneralModificationRequest;
       
       if (isBlackAndWhiteRequest) {
         console.log('檢測到黑白轉換請求，開始處理圖片');
         try {
            console.log(`開始處理圖片，原始大小: ${imageBuffer.length} 字節`);
            // 使用 sharp 進行黑白轉換，添加更多選項以確保穩定性
            processedImage = await sharp(imageBuffer, { failOnError: false })
              .grayscale() // 轉換為灰階
              .normalize() // 標準化對比度
              .gamma(1.2) // 調整對比度
              .jpeg({ quality: 90, progressive: true }) // 指定輸出格式和品質，使用漸進式 JPEG
              .toBuffer();
            console.log(`黑白轉換完成，處理後圖片大小: ${processedImage.length} 字節`);
          } catch (sharpError) {
            console.error('使用 sharp 處理圖片時出錯:', sharpError);
            // 嘗試使用備用方法處理圖片
            try {
              console.log('嘗試使用備用方法處理圖片');
              // 使用更簡單的處理方式
              processedImage = await sharp(imageBuffer, { failOnError: false })
                .grayscale() // 使用正確的方法名
                .toFormat('jpeg', { quality: 90 }) // 明確指定輸出格式和品質
                .toBuffer();
              console.log(`備用方法處理完成，圖片大小: ${processedImage.length} 字節`);
            } catch (backupError) {
              console.error('備用方法處理圖片也失敗:', backupError);
              // 嘗試最後的備用方法
              try {
                console.log('嘗試使用最後的備用方法處理圖片');
                // 使用最簡單的處理方式
                processedImage = await sharp(imageBuffer)
                  .grayscale()
                  .toBuffer();
                console.log(`最後備用方法處理完成，圖片大小: ${processedImage.length} 字節`);
              } catch (finalError) {
                console.error('所有處理方法都失敗:', finalError);
                throw new Error(`圖片處理失敗: ${sharpError.message}, 所有備用方法也失敗`);
              }
            }
          }
       } else if (isColorRequest) {
         // 如果是轉換為彩色，我們需要重新生成圖片
         
         // 使用已經獲取的目標圖片附件
         if (!targetAttachment) {
           console.log('找不到需要修改的圖片附件');
           await message.channel.send('抱歉，我找不到需要修改的圖片。請確保消息中包含圖片。');
           return;
         }
         
         console.log(`找到需要修改的圖片附件: ${targetAttachment.url}`);
         
         // 構建彩色轉換提示詞
         const colorPrompt = '請將這張圖片轉換成彩色，保持原圖的主要內容和構圖';
         
         // 使用 Gemini 生成彩色圖片
         const { imageData, mimeType } = await generateImageWithGemini(colorPrompt, targetAttachment.url);
         
         return await message.channel.send({
           content: '這是轉換成彩色的圖片：',
           files: [{
             attachment: Buffer.from(imageData, 'base64'),
             name: `color-${targetAttachment.name}`
           }]
         });
       } else if (isStyleRequest) {
         // 如果是風格修改請求，使用 Gemini 重新生成圖片
         console.log(`檢測到風格修改請求，請求風格: ${requestedStyle}`);
         
         // 使用已經獲取的目標圖片附件
         if (!targetAttachment) {
           console.log('找不到需要修改的圖片附件');
           await message.channel.send('抱歉，我找不到需要修改的圖片。請確保消息中包含圖片。');
           return;
         }
         
         console.log(`找到需要修改的圖片附件: ${targetAttachment.url}`);
         
         // 構建提示詞，告訴 Gemini 要生成什麼風格的圖片
         let stylePrompt = message.content;
         if (requestedStyle) {
           // 如果用戶明確指定了風格，使用該風格
           stylePrompt = `請將上一張圖片轉換成${requestedStyle}風格，保持原圖的主要內容和構圖`;
         }
         
         try {
           // 使用 Gemini 生成新風格的圖片
           const { imageData, mimeType } = await generateImageWithGemini(stylePrompt, targetAttachment.url);
           
           // 發送生成的圖片
           return await message.channel.send({
             content: `這是轉換成${requestedStyle || '新'}風格的圖片：`,
             files: [{
               attachment: Buffer.from(imageData, 'base64'),
               name: `style-${targetAttachment.name}`
             }]
           });
         } catch (error) {
           console.error('使用 Gemini 生成風格圖片時出錯:', error);
           await message.channel.send(`抱歉，我無法將圖片轉換為${requestedStyle || '新'}風格。錯誤信息: ${error.message}`);
           return;
         }
       } else if (isGeneralModificationRequest || isAIDetectedModification || message.content.includes('去掉') || message.content.includes('移除') || message.content.includes('刪除') || 
                 message.content.includes('紅潤') || message.content.includes('紅暈') || message.content.includes('改成') || message.content.includes('變成') || 
                 message.content.includes('換成') || message.content.includes('轉成') || message.content.includes('修改') || 
                 message.content.includes('調整') || message.content.includes('增加') || message.content.includes('減少') || 
                 message.content.includes('添加') || message.content.includes('更改') || message.content.includes('變更') || 
                 message.content.includes('加深') || message.content.includes('減淡') || message.content.includes('加強') || 
                 message.content.includes('減弱') || message.content.includes('加重') || message.content.includes('減輕')) {
         // 如果是一般修改請求或包含各種修改關鍵詞，使用 Gemini 根據用戶的具體要求進行修改
         console.log('檢測到一般修改請求，使用 Gemini 進行圖片修改');
         
         // 使用已經獲取的目標圖片附件
         if (!targetAttachment) {
           console.log('找不到需要修改的圖片附件');
           await message.channel.send('抱歉，我找不到需要修改的圖片。請確保消息中包含圖片。');
           return;
         }
         
         console.log(`找到需要修改的圖片附件: ${targetAttachment.url}`);
         
         try {
           // 使用用戶的原始請求作為提示詞
           const modificationPrompt = `請根據以下要求修改圖片：${message.content}，保持原圖的主要內容和構圖`;
           console.log(`使用提示詞進行圖片修改: ${modificationPrompt}`);
           
           // 使用 Gemini 生成修改後的圖片
           const { imageData, mimeType } = await generateImageWithGemini(modificationPrompt, targetAttachment.url);
           
           // 發送生成的圖片
           return await message.channel.send({
             content: `這是根據你的要求修改後的圖片：`,
             files: [{
               attachment: Buffer.from(imageData, 'base64'),
               name: `modified-${targetAttachment.name}`
             }]
           });
         } catch (error) {
           console.error('使用 Gemini 修改圖片時出錯:', error);
           await message.channel.send(`抱歉，我無法按照你的要求修改圖片。錯誤信息: ${error.message}`);
           return;
         }
       } else {
         // 如果沒有匹配到任何修改類型，但AI判定為修改請求，則使用Gemini進行處理
         console.log('未匹配到具體轉換類型，但AI判定為修改請求，使用Gemini進行圖片修改');
         
         // 使用已經獲取的目標圖片附件
         if (!targetAttachment) {
           console.log('找不到需要修改的圖片附件');
           await message.channel.send('抱歉，我找不到需要修改的圖片。請確保消息中包含圖片。');
           return;
         }
         
         console.log(`找到需要修改的圖片附件: ${targetAttachment.url}`);
         
         try {
           // 使用用戶的原始請求作為提示詞
           const modificationPrompt = `請根據以下要求修改圖片：${message.content}，保持原圖的主要內容和構圖`;
           console.log(`使用提示詞進行圖片修改: ${modificationPrompt}`);
           
           // 使用 Gemini 生成修改後的圖片
           const { imageData, mimeType } = await generateImageWithGemini(modificationPrompt, targetAttachment.url);
           
           // 發送生成的圖片
           return await message.channel.send({
             content: `這是根據你的要求修改後的圖片：`,
             files: [{
               attachment: Buffer.from(imageData, 'base64'),
               name: `modified-${targetAttachment.name}`
             }]
           });
         } catch (error) {
           console.error('使用 Gemini 修改圖片時出錯:', error);
           await message.channel.send(`抱歉，我無法按照你的要求修改圖片。錯誤信息: ${error.message}`);
           return;
         }
       }

      // 發送處理後的圖片
      console.log(`準備發送處理後的圖片，大小: ${processedImage.length} 字節`);
      try {
        // 使用目標圖片附件（用於文件名）
        const attachmentForFileName = targetAttachment;
        // 確保文件名有正確的擴展名
        let fileName = attachmentForFileName ? attachmentForFileName.name : 'processed-image.jpg';
        // 如果原始文件名沒有擴展名或擴展名不是圖片格式，添加 .jpg 擴展名
        if (!fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          fileName += '.jpg';
        } else {
          // 如果有擴展名，替換為 .jpg
          fileName = fileName.replace(/\.[^.]+$/, '.jpg');
        }
        
        console.log(`發送圖片，文件名: ${fileName}`);
        await message.channel.send({
          content: '這是修改後的圖片：',
          files: [{
            attachment: processedImage,
            name: `bw-${fileName}`,
            description: '黑白處理後的圖片'
          }]
        });
        console.log('成功發送處理後的圖片');
      } catch (sendError) {
        console.error('發送處理後圖片時出錯:', sendError);
        await message.channel.send('抱歉，發送處理後的圖片時出現錯誤，請稍後再試。');
      }

      // 刪除狀態消息
      await statusMessage.delete().catch(console.error);
      return;
    } catch (error) {
      console.error('Error modifying image:', error);
      await message.channel.send('抱歉，處理圖片時出現錯誤，請稍後再試。');
      return;
    }
  }

  // 檢查用戶是否想要生成圖片，傳入消息歷史以進行上下文判斷
  // 如果已經識別為圖片修改請求，則不再檢測圖片生成請求
  if (!shouldProcessImageModification) {
    // 檢查是否是黑白轉換請求，如果是，則不檢測圖片生成請求
    const isBlackAndWhiteRequest = message.content.match(/(黑白|灰階|灰度)/i) || 
      message.content.match(/改成黑白/i) || 
      message.content.match(/變成黑白/i) || 
      message.content.match(/換成黑白/i) || 
      message.content.match(/轉成黑白/i);
    
    if (isBlackAndWhiteRequest && previousMessage && previousMessage.attachments && previousMessage.attachments.size > 0) {
      console.log('檢測到黑白轉換請求，但已有圖片附件，不檢測圖片生成請求');
      // 這是圖片修改請求，不是圖片生成請求
      // 將其標記為圖片修改請求，並執行圖片修改邏輯
      console.log('將黑白轉換請求重新導向到圖片修改邏輯');
      // 先發送確認消息
      await message.channel.send('好的，我這就幫你轉換圖片！');
      try {
        // 顯示處理狀態
        const statusMessage = await message.channel.send('正在轉換圖片，請稍候...');

        // 動態導入 sharp
        let sharp;
        try {
          console.log('開始導入 sharp 模組');
          const sharpModule = await import('sharp');
          sharp = sharpModule.default;
          console.log('成功導入 sharp 模組');
        } catch (importError) {
          console.error('導入 sharp 模組失敗:', importError);
          await statusMessage.delete().catch(console.error);
          await message.channel.send('抱歉，處理圖片時出現錯誤，無法載入圖片處理模組。');
          return;
        }

        // 獲取上一條消息中的圖片
        const lastAttachment = previousMessage.attachments.first();
        if (!lastAttachment) {
          await statusMessage.delete().catch(console.error);
          await message.channel.send('抱歉，找不到需要修改的圖片。');
          return;
        }

        // 下載圖片
        console.log(`開始下載圖片: ${lastAttachment.url}`);
        const response = await fetch(lastAttachment.url);
        const arrayBuffer = await response.arrayBuffer();
        console.log(`圖片下載完成，大小: ${arrayBuffer.byteLength} 字節`);
        const imageBuffer = Buffer.from(arrayBuffer);

        // 處理圖片為黑白
        let processedImage;
        console.log('檢測到黑白轉換請求，開始處理圖片');
        try {
          console.log(`開始處理圖片，原始大小: ${imageBuffer.length} 字節`);
          // 使用 sharp 進行黑白轉換，添加更多選項以確保穩定性
          processedImage = await sharp(imageBuffer, { failOnError: false })
            .grayscale() // 轉換為灰階
            .normalize() // 標準化對比度
            .gamma(1.2) // 調整對比度
            .jpeg({ quality: 90, progressive: true }) // 指定輸出格式和品質，使用漸進式 JPEG
            .toBuffer();
          console.log(`黑白轉換完成，處理後圖片大小: ${processedImage.length} 字節`);
        } catch (sharpError) {
          console.error('使用 sharp 處理圖片時出錯:', sharpError);
          // 嘗試使用備用方法處理圖片
          try {
            console.log('嘗試使用備用方法處理圖片');
            // 使用更簡單的處理方式
            processedImage = await sharp(imageBuffer, { failOnError: false })
              .grayscale() // 使用正確的方法名
              .toFormat('jpeg', { quality: 90 }) // 明確指定輸出格式和品質
              .toBuffer();
            console.log(`備用方法處理完成，圖片大小: ${processedImage.length} 字節`);
          } catch (backupError) {
            console.error('備用方法處理圖片也失敗:', backupError);
            // 嘗試最後的備用方法
            try {
              console.log('嘗試使用最後的備用方法處理圖片');
              // 使用最簡單的處理方式
              processedImage = await sharp(imageBuffer)
                .grayscale()
                .toBuffer();
              console.log(`最後備用方法處理完成，圖片大小: ${processedImage.length} 字節`);
            } catch (finalError) {
              console.error('所有處理方法都失敗:', finalError);
              throw new Error(`圖片處理失敗: ${sharpError.message}, 所有備用方法也失敗`);
            }
          }
        }

        // 發送處理後的圖片
        console.log(`準備發送處理後的圖片，大小: ${processedImage.length} 字節`);
        try {
          // 確保文件名有正確的擴展名
          let fileName = lastAttachment.name;
          // 如果原始文件名沒有擴展名或擴展名不是圖片格式，添加 .jpg 擴展名
          if (!fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            fileName += '.jpg';
          } else {
            // 如果有擴展名，替換為 .jpg
            fileName = fileName.replace(/\.[^.]+$/, '.jpg');
          }
          
          console.log(`發送圖片，文件名: ${fileName}`);
          await message.channel.send({
            content: '這是修改後的圖片：',
            files: [{
              attachment: processedImage,
              name: `bw-${fileName}`,
              description: '黑白處理後的圖片'
            }]
          });
          console.log('成功發送處理後的圖片');
        } catch (sendError) {
          console.error('發送處理後圖片時出錯:', sendError);
          await message.channel.send('抱歉，發送處理後的圖片時出現錯誤，請稍後再試。');
        }

        // 刪除狀態消息
        await statusMessage.delete().catch(console.error);
        return;
      } catch (error) {
        console.error('Error modifying image:', error);
        await message.channel.send('抱歉，處理圖片時出現錯誤，請稍後再試。');
        return;
      }
    }
    
    // 根據頻道配置決定是否使用 AI 判定畫圖請求
    let isImageGenerationRequest = false;
    
    if (channelConfig.useAIToDetectImageRequest) {
      console.log('使用 AI 判定畫圖請求');
      isImageGenerationRequest = await detectImageGenerationWithAI(message.content, channelHistory);
    } else {
      console.log('使用關鍵詞判定畫圖請求');
      isImageGenerationRequest = await detectImageGenerationRequest(message.content, channelHistory);
    }
    
    if (isImageGenerationRequest) {
    try {
      // 顯示正在生成圖片的提示
      const statusMessage = await message.channel.send('正在生成圖片，請稍候...');
      
      // 使用 genimg.mjs 生成圖片
      const { imageData, mimeType, responseText } = await generateImageWithGemini(message.content);
      
      // 將 Base64 編碼的圖片數據轉換為 Buffer
      const buffer = Buffer.from(imageData, 'base64');
      
      // 從 MIME 類型確定文件擴展名
      const fileExtension = mimeType.split('/')[1] || 'png';
      
      // 創建臨時文件名
      const fileName = `gemini-image-${Date.now()}.${fileExtension}`;
      
      // 發送圖片和響應文本，添加特殊標記以便識別圖片生成消息
      await message.channel.send({
        content: (responseText || '這是根據你的描述生成的圖片：') + ' [IMAGE_GENERATED]',
        files: [{
          attachment: buffer,
          name: fileName
        }]
      });
      
      // 刪除狀態消息
      await statusMessage.delete().catch(console.error);
      
      console.log(`Generated image for ${message.author.username} with prompt: ${message.content}`);
      return; // 圖片生成請求已處理，不需要進一步處理
    } catch (error) {
       console.error('Error generating image:', error);
       await message.channel.send('抱歉，生成圖片時出現錯誤，請稍後再試。');
       // 繼續處理消息，讓 AI 回應
    }
   }
  }
  
  // 檢查消息是否包含圖片附件
  let imageAttachmentInfo = "";
  if (message.attachments.size > 0) {
    const imageAttachments = message.attachments.filter(attachment => {
      const fileExtension = attachment.name.split('.').pop().toLowerCase();
      return ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExtension);
    });
    
    if (imageAttachments.size > 0) {
      // 將圖片信息添加到消息內容中
      imageAttachmentInfo = "\n\n[IMAGE SHARED BY " + message.author.username + ": " + 
        imageAttachments.map(attachment => `${attachment.url}`).join(", ") + "]\n\n";
      
      console.log(`Detected image attachment from ${message.author.username}: \n${imageAttachmentInfo}`);
      
      // 自動處理所有圖片附件進行圖像理解，不需要關鍵詞觸發
        // 顯示正在處理圖像的提示
        const statusMessage = await message.channel.send('正在分析圖片內容，請稍候...');
        
        try {
          // 導入 Google GenAI
          const { GoogleGenAI } = await import('@google/genai');
          
          // 獲取 Gemini API 密鑰
          let apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey && GEMINI_API_KEYS && GEMINI_API_KEYS.length > 0) {
            apiKey = GEMINI_API_KEYS[currentGeminiKeyIndex];
          }
          
          if (!apiKey) {
            throw new Error('No Gemini API key available');
          }
          
          // 初始化 Google GenAI
          const ai = new GoogleGenAI({ apiKey });
          
          // 處理每個圖片附件
          const imageAnalysisResults = [];
          for (const attachment of imageAttachments.values()) {
            console.log(`Processing image analysis for: ${attachment.url}`);
            
            try {
              // 獲取圖片數據
              const response = await fetch(attachment.url);
              if (!response.ok) {
                throw new Error(`無法獲取圖片: ${response.statusText}`);
              }
              
              const imageArrayBuffer = await response.arrayBuffer();
              const base64ImageData = Buffer.from(imageArrayBuffer).toString('base64');
              const mimeType = response.headers.get('content-type') || 'image/jpeg';
              
              // 使用 Gemini 2.0 Flash 模型進行圖像理解
              const result = await ai.models.generateContent({
                model: "gemini-2.0-flash",
                contents: [
                  {
                    inlineData: {
                      mimeType: mimeType,
                      data: base64ImageData,
                    },
                  },
                  { 
                    text: "請詳細描述這張圖片的內容，包括：1. 圖片中的主要物體或人物 2. 場景和背景 3. 顏色和風格 4. 如果有文字，請識別並提取出來 5. 整體氛圍和感覺。請用繁體中文回答。" 
                  }
                ],
              });
              
              if (result && result.text) {
                imageAnalysisResults.push({
                  url: attachment.url,
                  analysis: result.text
                });
                console.log(`Image analysis completed for: ${attachment.url}`);
              } else {
                imageAnalysisResults.push({
                  url: attachment.url,
                  error: '無法分析圖片內容'
                });
              }
            } catch (imageError) {
              console.error(`Error analyzing image ${attachment.url}:`, imageError);
              imageAnalysisResults.push({
                url: attachment.url,
                error: imageError.message || '圖片分析失敗'
              });
            }
          }
          
          // 刪除狀態消息
          await statusMessage.delete().catch(console.error);
          
          // 處理圖像分析結果
          if (imageAnalysisResults.length > 0) {
            const successResults = imageAnalysisResults.filter(r => r.analysis);
            
            if (successResults.length > 0) {
              // 將分析結果添加到消息內容中
              const analysisText = successResults.map(r => r.analysis).join('\n\n');
              const analysisInfo = `\n\n[圖片內容分析:\n${analysisText}]\n\n`;
              
              // 更新消息內容 - 確保 AI 能看到圖片分析結果
              message.content = `${message.content}${analysisInfo}`;
              
              // 保存分析結果，稍後添加到消息歷史中
              message._imageAnalysisInfo = analysisInfo;
              
              // 立即將分析結果添加到消息歷史記錄中
              if (channelConfig && channelConfig.messageHistory) {
                let foundUserMessage = false;
                for (let i = 0; i < channelConfig.messageHistory.length; i++) {
                  if (
                    channelConfig.messageHistory[i].role === 'user' &&
                    channelConfig.messageHistory[i].author === message.author.username
                  ) {
                    channelConfig.messageHistory[i].content = channelConfig.messageHistory[i].content + analysisInfo;
                    console.log(`Immediately updated message history with image analysis for ${message.author.username}`);
                    foundUserMessage = true;
                    break;
                  }
                }
                
                // 如果在歷史記錄中找不到該用戶的消息，則添加一個新的消息
                if (!foundUserMessage) {
                  channelConfig.messageHistory.push({
                    role: 'user',
                    author: message.author.username,
                    content: `[IMAGE SHARED BY ${message.author.username}]${analysisInfo}`
                  });
                  console.log(`Added new message history entry with image analysis for ${message.author.username}`);
                }
              }
              
              console.log(`Added image analysis results to message content: ${analysisText.substring(0, 100)}...`);
            } else {
              console.log('No images could be analyzed');
            }
          } else {
            console.log('No image analysis results were processed');
          }
        } catch (error) {
          console.error('Error processing image analysis:', error);
          // 刪除狀態消息
          await statusMessage.delete().catch(console.error);
        }
    }
  }

  // Check for YouTube URLs or search queries
  const youtubeUrlRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([\w-]+)/i;
  const youtubeUrlMatch = message.content.match(youtubeUrlRegex);

  if (youtubeUrlMatch && youtubeUrlMatch[1]) {
    const videoId = youtubeUrlMatch[1];
    try {
      const youtube = google.youtube({
        version: 'v3',
        auth: process.env.YOUTUBE_API_KEY
      });
      const response = await youtube.videos.list({
        part: 'snippet,statistics',
        id: videoId
      });
      if (response.data.items && response.data.items.length > 0) {
        const video = response.data.items[0];
        const embed = {
          color: 0xFF0000,
          title: video.snippet.title,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          author: {
            name: video.snippet.channelTitle,
            url: `https://www.youtube.com/channel/${video.snippet.channelId}`
          },
          description: video.snippet.description.substring(0, 200) + (video.snippet.description.length > 200 ? '...' : ''),
          thumbnail: { url: video.snippet.thumbnails.medium.url },
          fields: [
            { name: '觀看次數', value: video.statistics.viewCount ? parseInt(video.statistics.viewCount).toLocaleString() : 'N/A', inline: true },
            { name: '喜歡人數', value: video.statistics.likeCount ? parseInt(video.statistics.likeCount).toLocaleString() : 'N/A', inline: true },
          ],
          timestamp: new Date(video.snippet.publishedAt),
          footer: { text: 'YouTube' }
        };
        await message.channel.send({ embeds: [embed] });
        
        // 修改：不要直接返回，而是將影片信息添加到消息中，讓AI處理
        const videoInfo = {
          title: video.snippet.title,
          channel: video.snippet.channelTitle,
          description: video.snippet.description,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          views: video.statistics.viewCount ? parseInt(video.statistics.viewCount).toLocaleString() : 'N/A',
          likes: video.statistics.likeCount ? parseInt(video.statistics.likeCount).toLocaleString() : 'N/A',
          publishDate: new Date(video.snippet.publishedAt).toLocaleDateString()
        };
        
        // 創建 YouTube 影片資訊文本
        const youtubeInfo = `\n\n[YOUTUBE VIDEO SHARED BY ${message.author.username}:\nTitle: "${videoInfo.title}"\nChannel: "${videoInfo.channel}"\nDescription: "${videoInfo.description.substring(0, 300)}${videoInfo.description.length > 300 ? '...' : ''}"\nViews: ${videoInfo.views}\nLikes: ${videoInfo.likes}\nPublished: ${videoInfo.publishDate}]\n\n[Message sent by: ${message.author.username}]`;
        
        // 將影片資訊添加到消息內容中
        message.content = `${message.content}${youtubeInfo}`;
        
        // 保存 YouTube 信息，稍後添加到消息歷史中
        message._youtubeInfo = youtubeInfo;
        
        // 繼續處理消息，不要返回
      }
    } catch (error) {
      console.error('Error fetching YouTube video by URL:', error);
      // Continue to AI response if fetching fails
    }
  }

  // Keywords to detect YouTube search intent
  const youtubeSearchKeywords = ['youtube', '影片', 'yt', '找影片', '搜影片'];
  const containsYoutubeKeyword = youtubeSearchKeywords.some(keyword => message.content.toLowerCase().includes(keyword));

  if (containsYoutubeKeyword && process.env.YOUTUBE_API_KEY) {
    let searchQuery = message.content;
    // Attempt to extract a more specific query if possible
    // This is a simple heuristic, can be improved
    youtubeSearchKeywords.forEach(keyword => {
      searchQuery = searchQuery.replace(new RegExp(keyword, 'gi'), '').trim();
    });
    if (searchQuery.length > 2) { // Avoid overly broad or empty searches
      try {
        const youtube = google.youtube({
          version: 'v3',
          auth: process.env.YOUTUBE_API_KEY
        });
        const searchResponse = await youtube.search.list({
          part: 'snippet',
          q: searchQuery,
          maxResults: 3, // Show fewer results for natural language queries
          type: 'video'
        });

        if (searchResponse.data.items && searchResponse.data.items.length > 0) {
          const videos = searchResponse.data.items.map(item => ({
            title: item.snippet.title,
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
            channelTitle: item.snippet.channelTitle
          }));
          const embed = {
            color: 0xFF0000,
            title: `我找到了這些 YouTube 影片給你參考看看：${searchQuery}`,
            description: videos.map((video, index) => `${index + 1}. [${video.title}](${video.url}) - ${video.channelTitle}`).join('\n'),
            thumbnail: { url: 'https://www.youtube.com/s/desktop/28b0985e/img/favicon_144x144.png' }
          };
          await message.channel.send({ embeds: [embed] });
          
          // 修改：不要直接返回，而是將搜索結果添加到消息中，讓AI處理
          const videoInfoText = videos.map((video, index) => 
            `Video ${index + 1}: "${video.title}" by ${video.channelTitle}`
          ).join('\n');
          
          // 創建 YouTube 搜索結果文本
          const youtubeSearchInfo = `\n\n[YouTube Search Results for "${searchQuery}":\n${videoInfoText}]\n\n[Message sent by: ${message.author.username}]`;
          
          // 將搜索結果添加到消息內容中
          message.content = `${message.content}${youtubeSearchInfo}`;
          
          // 保存 YouTube 搜索信息，稍後添加到消息歷史中
          message._youtubeSearchInfo = youtubeSearchInfo;
          
          // 繼續處理消息，不要返回
        }
      } catch (error) {
        console.error('Error searching YouTube via natural language:', error);
        // Continue to AI response if search fails
      }
    }
  }
  
// Check if the message is a reply to another message

let replyContext = "";
let isReply = false;

if (message.reference && message.reference.messageId) {
  try {
    // 取得被回覆的訊息
    const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);

    if (repliedMessage) {
      isReply = true;
      const repliedAuthor = repliedMessage.author.bot ? "Setsuna" : repliedMessage.author.username;
      // 使用實際的用戶名，以便機器人能正確識別消息發送者
      replyContext = `[${message.author.username}回覆 ${repliedAuthor === client.user.username ? '我' : repliedAuthor} 的訊息: "${repliedMessage.content.substring(0, 50)}${repliedMessage.content.length > 50 ? '...' : ''}"] `;

      console.log(`Detected reply to message: ${repliedMessage.content}`);
    }

  } catch (error) {
    console.error('Error fetching replied message:', error);
  }
}

// 抓取最近的 50 則訊息作為對話歷史
const messages = await message.channel.messages.fetch({ limit: 50 });
const messageHistory = Array.from(messages.values())
  .reverse()
  .map(msg => ({
    role: msg.author.bot ? 'assistant' : 'user',
    content: msg.author.bot ? msg.content : `[${msg.author.username}]: ${msg.content}`,
    author: msg.author.username
  }));

// 如果是回覆，將原訊息內容加上上下文說明
if (isReply) {
  // 直接添加一個新的消息，確保回覆上下文被正確處理
  messageHistory.push({
    role: 'user',
    author: message.author.username,
    content: replyContext + message.content
  });
  console.log(`Added new message history entry with reply context for ${message.author.username}`);
  console.log(`Reply context: ${replyContext}`);
  console.log(`Full message: ${replyContext + message.content}`);
}
  
  // 如果有圖片附件，將圖片信息添加到消息內容中
  if (imageAttachmentInfo) {
    message.content = message.content + imageAttachmentInfo;
    
    // 更新消息歷史中的最後一條消息
    let foundUserMessage = false;
    for (let i = 0; i < messageHistory.length; i++) {
      if (
        messageHistory[i].role === 'user' &&
        messageHistory[i].author === message.author.username &&
        messageHistory[i].content.includes(message.content.substring(0, 50)) // 使用消息內容的前50個字符進行匹配
      ) {
        messageHistory[i].content = messageHistory[i].content + imageAttachmentInfo;
        console.log(`Updated message history with image attachment for ${message.author.username}`);
        foundUserMessage = true;
        break;
      }
    }
    
    // 如果在歷史記錄中找不到該用戶的消息，則添加一個新的消息
    if (!foundUserMessage) {
      messageHistory.push({
        role: 'user',
        author: message.author.username,
        content: `[${message.author.username}]: ${message.content}${imageAttachmentInfo}`
      });
      console.log(`Added new message history entry with image attachment for ${message.author.username}`);
    }
  }
  
  // 如果有 YouTube 影片信息，將其添加到消息歷史中
  if (message._youtubeInfo) {
    let foundUserMessage = false;
    for (let i = 0; i < messageHistory.length; i++) {
      if (
        messageHistory[i].role === 'user' &&
        messageHistory[i].author === message.author.username &&
        messageHistory[i].content.includes(message.content.substring(0, 50)) // 使用消息內容的前50個字符進行匹配
      ) {
        messageHistory[i].content = messageHistory[i].content + message._youtubeInfo;
        console.log(`Updated message history with YouTube info for ${message.author.username}`);
        foundUserMessage = true;
        break;
      }
    }
    
    // 如果在歷史記錄中找不到該用戶的消息，則添加一個新的消息
    if (!foundUserMessage) {
      messageHistory.push({
        role: 'user',
        author: message.author.username,
        content: `[${message.author.username}]: ${message.content}${message._youtubeInfo}`
      });
      console.log(`Added new message history entry with YouTube info for ${message.author.username}`);
    }
  }
  
  // 如果有 YouTube 搜索結果，將其添加到消息歷史中
  if (message._youtubeSearchInfo) {
    let foundUserMessage = false;
    for (let i = 0; i < messageHistory.length; i++) {
      if (
        messageHistory[i].role === 'user' &&
        messageHistory[i].author === message.author.username &&
        messageHistory[i].content.includes(message.content.substring(0, 50)) // 使用消息內容的前50個字符進行匹配
      ) {
        messageHistory[i].content = messageHistory[i].content + message._youtubeSearchInfo;
        console.log(`Updated message history with YouTube search info for ${message.author.username}`);
        foundUserMessage = true;
        break;
      }
    }
    
    // 如果在歷史記錄中找不到該用戶的消息，則添加一個新的消息
    if (!foundUserMessage) {
      messageHistory.push({
        role: 'user',
        author: message.author.username,
        content: `[${message.author.username}]: ${message.content}${message._youtubeSearchInfo}`
      });
      console.log(`Added new message history entry with YouTube search info for ${message.author.username}`);
    }
  }
  
  // 如果有圖像分析結果，將其添加到消息歷史中
  if (message._imageAnalysisInfo) {
    let foundUserMessage = false;
    for (let i = 0; i < messageHistory.length; i++) {
      if (
        messageHistory[i].role === 'user' &&
        messageHistory[i].author === message.author.username &&
        messageHistory[i].content.includes(message.content.substring(0, 50)) // 使用消息內容的前50個字符進行匹配
      ) {
        messageHistory[i].content = messageHistory[i].content + message._imageAnalysisInfo;
        console.log(`Updated message history with image analysis results for ${message.author.username}`);
        foundUserMessage = true;
        break;
      }
    }
    
    // 如果在歷史記錄中找不到該用戶的消息，則添加一個新的消息
    if (!foundUserMessage) {
      messageHistory.push({
        role: 'user',
        author: message.author.username,
        content: `[${message.author.username}]: ${message.content}${message._imageAnalysisInfo}`
      });
      console.log(`Added new message history entry with image analysis results for ${message.author.username}`);
    }
  }
  
  // Update channel's message history
  channelConfig.messageHistory = messageHistory;
  
  // Process with selected API
  try {
    // Get channel's personality or use default
    const channelPersonality = channelPersonalityPreferences.get(message.channelId) || setsunaPersonality;
    
    // Add personality prompt as system message
    const formattedMessages = [
      { role: 'system', content: channelPersonality },
      ...messageHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    ];
    
    // Get channel's preferred model or use default
    const preferredModel = channelModelPreferences.get(message.channelId) || defaultModel;
    
    // Variables to track response
    let response = null;
    let modelUsed = '';
    let fallbackUsed = false;
    
    // Try preferred model first
    switch (preferredModel) {
      case 'deepseek':
        if (DEEPSEEK_API_KEYS.length > 0) {
          try {
            response = await callDeepseekAPI(formattedMessages);
            modelUsed = 'DeepSeek';
          } catch (error) {
            console.log('DeepSeek API error:', error.message);
            // Will fall back to other models
          }
        }
        break;
        
      case 'gemini':
        if (GEMINI_API_KEYS.length > 0) {
          try {
            response = await callGeminiAPI(formattedMessages);
            modelUsed = 'Gemini';
          } catch (error) {
            console.log('Gemini API error:', error.message);
            // Will fall back to other models
          }
        }
        break;
        
      case 'chatgpt':
        if (CHATGPT_API_KEYS.length > 0) {
          try {
            response = await callChatGPTAPI(formattedMessages);
            modelUsed = 'ChatGPT';
          } catch (error) {
            console.log('ChatGPT API error:', error.message);
            // Will fall back to other models
          }
        }
        break;
        
      case 'groq':
        if (GROQ_API_KEYS.length > 0) {
          try {
            response = await callGroqAPI(formattedMessages, message.channelId);
            const groqModel = channelGroqModelPreferences.get(message.channelId) || defaultGroqModel;
            modelUsed = `Groq (${groqModel})`;
          } catch (error) {
            console.log('Groq API error:', error.message);
            // Will fall back to other models
          }
        }
        break;

      case 'cerebras':
        if (CEREBRAS_API_KEYS.length > 0) {
          try {
            response = await callCerebrasAPI(formattedMessages, message.channelId);
            const cerebrasModel = channelCerebrasModelPreferences.get(message.channelId) || defaultCerebrasModel;
            modelUsed = `Cerebras (${cerebrasModel})`;
          } catch (error) {
            console.log('Cerebras API error:', error.message);
            // Will fall back to other models
          }
        }
        break;
        
      case 'together':
        if (TOGETHER_API_KEYS.length > 0) {
          try {
            response = await callTogetherAPI(formattedMessages);
            modelUsed = 'Together AI';
          } catch (error) {
            console.log('Together API error:', error.message);
            // Will fall back to other models
          }
        }
        break;
    }
    
    // If preferred model failed, try other models as fallback
    if (!response) {
      fallbackUsed = true;
      
      // Try Groq API if not already tried and keys are available
      if (!response && preferredModel !== 'groq' && GROQ_API_KEYS.length > 0) {
        try {
          response = await callGroqAPI(formattedMessages, message.channelId);
          const groqModel = channelGroqModelPreferences.get(message.channelId) || defaultGroqModel;
          modelUsed = `Groq (${groqModel})`;
        } catch (error) {
          console.log('Groq API fallback error:', error.message);
        }
      }
      
      // Try Cerebras API if not already tried and keys are available
      if (!response && preferredModel !== 'cerebras' && CEREBRAS_API_KEYS.length > 0) {
        try {
          response = await callCerebrasAPI(formattedMessages, message.channelId);
          const cerebrasModel = channelCerebrasModelPreferences.get(message.channelId) || defaultCerebrasModel;
          modelUsed = `Cerebras (${cerebrasModel})`;
        } catch (error) {
          console.log('Cerebras API fallback error:', error.message);
        }
      }
      
      // Try Gemini API if not already tried and keys are available
      if (!response && preferredModel !== 'gemini' && GEMINI_API_KEYS.length > 0) {
        try {
          response = await callGeminiAPI(formattedMessages);
          modelUsed = 'Gemini';
        } catch (error) {
          console.log('Gemini API fallback error:', error.message);
        }
      }
      
      // Try ChatGPT API if not already tried and keys are available
      if (!response && preferredModel !== 'chatgpt' && CHATGPT_API_KEYS.length > 0) {
        try {
          response = await callChatGPTAPI(formattedMessages);
          modelUsed = 'ChatGPT';
        } catch (error) {
          console.log('ChatGPT API fallback error:', error.message);
        }
      }
      
      // Try Together API if not already tried and keys are available
      if (!response && preferredModel !== 'together' && TOGETHER_API_KEYS.length > 0) {
        try {
          response = await callTogetherAPI(formattedMessages);
          modelUsed = 'Together AI';
        } catch (error) {
          console.log('Together API fallback error:', error.message);
        }
      }
      
      // Try DeepSeek API if not already tried and keys are available (last resort)
      if (!response && preferredModel !== 'deepseek' && DEEPSEEK_API_KEYS.length > 0) {
        try {
          response = await callDeepseekAPI(formattedMessages);
          modelUsed = 'DeepSeek';
        } catch (error) {
          console.log('DeepSeek API fallback error:', error.message);
        }
      }
    }
    
    // If all models failed or returned empty response
    if (!response) {
      throw new Error('All available models failed to generate a response');
    }
    
    // Refresh typing indicator
    await message.channel.sendTyping();
    
    // 檢查用戶輸入是否為繁體中文，如果是，確保回覆也是繁體中文
    let finalResponse = response;
    if (isTraditionalChinese(message.content)) {
      console.log('檢測到繁體中文輸入，確保回覆使用繁體中文');
      // 確保回覆使用繁體中文
      finalResponse = ensureTraditionalChinese(response);
    }
    
    // Send the response
    await message.channel.send(finalResponse);
    if (fallbackUsed) {
      console.log(`Response sent using ${modelUsed} model (fallback from ${preferredModel})`);
    } else {
      console.log(`Response sent using ${modelUsed} model`);
    }
    
  } catch (error) {
    console.error('Error generating response:', error);
    await message.channel.send('Sorry, I glitched out for a sec. Hit me up again later?');
  }
  },
),



client.on('error', (error) => {
  console.error('Discord client error:', error);
});

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('Bot is shutting down...');
  client.destroy();
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

// Connect to Discord
console.log('Connecting to Discord...');
client.login(DISCORD_TOKEN).catch(error => {
  console.error('Failed to login to Discord:', error);
  process.exit(1);
});