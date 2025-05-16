require('dotenv').config();
const { Client, GatewayIntentBits, Partials, REST, Routes, PermissionFlagsBits, ChannelType, SlashCommandBuilder } = require('discord.js');
const fetch = require('node-fetch');

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

const GROQ_API_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3
].filter(key => key); // Filter out undefined/null keys

// Check if any API keys are available
if (DEEPSEEK_API_KEYS.length === 0 && GEMINI_API_KEYS.length === 0 && CHATGPT_API_KEYS.length === 0 && GROQ_API_KEYS.length === 0) {
  console.warn('WARNING: No API KEY environment variables are set!');
  console.warn('The bot will not be able to process messages without at least one key.');
}

// Keep track of current API key indices
let currentDeepseekKeyIndex = 0;
let currentGeminiKeyIndex = 0;
let currentChatGPTKeyIndex = 0;
let currentGroqKeyIndex = 0;

// Default model to use
let defaultModel = 'groq'; // Options: 'deepseek', 'gemini', 'chatgpt', 'groq'

// Channel model preferences
const channelModelPreferences = new Map();

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

function getCurrentGroqKey() {
  return GROQ_API_KEYS[currentGroqKeyIndex];
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
  '死線前趕作業遊戲'
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

function loadActiveChannels() {
  try {
    if (fs.existsSync(CHANNELS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf8'));
      for (const [channelId, config] of Object.entries(data)) {
        // Extract model preference if it exists
        if (config.model) {
          channelModelPreferences.set(channelId, config.model);
          // Remove model from config to avoid duplication
          const { model, ...restConfig } = config;
          activeChannels.set(channelId, restConfig);
        } else {
          activeChannels.set(channelId, config);
        }
      }
      console.log('Loaded active channels and model preferences from file');
    }
  } catch (error) {
    console.error('Error loading active channels:', error);
  }
}

function saveActiveChannels() {
  try {
    // Convert Map to an object that includes both active channels and model preferences
    const data = {};
    for (const [channelId, config] of activeChannels.entries()) {
      data[channelId] = {
        ...config,
        model: channelModelPreferences.get(channelId) || defaultModel
      };
    }
    fs.writeFileSync(CHANNELS_FILE, JSON.stringify(data));
    console.log('Saved active channels to file');
  } catch (error) {
    console.error('Error saving active channels:', error);
  }
}

// Define slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('setsuna')
    .setDescription('Control Setsuna bot')
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
              { name: 'Groq (Llama-3.1 | Default)', value: 'groq' },
              { name: 'Gemini (Fast)', value: 'gemini' },
              { name: 'ChatGPT', value: 'chatgpt' },
              { name: 'DeepSeek (Slow)', value: 'deepseek' }
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
        .setName('model')
        .setDescription('Set the AI model to use in this channel')
        .addStringOption(option =>
          option
            .setName('model')
            .setDescription('The AI model to use')
            .setRequired(true)
            .addChoices(
              { name: 'Groq (Llama-3.1 | Default)', value: 'groq' },
              { name: 'Gemini (Fast)', value: 'gemini' },
              { name: 'ChatGPT', value: 'chatgpt' },
              { name: 'DeepSeek (Slow)', value: 'deepseek' }
            )
        )
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('The channel to set model for (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Learn how to set up and use Setsuna'),
  new SlashCommandBuilder()
    .setName('contact')
    .setDescription('Get information on how to contact the bot developer'),
];

// Register slash commands when the bot starts
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  try {
    console.log('Started refreshing application (/) commands.');
    
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands },
    );
    
    console.log('Successfully reloaded application (/) commands.');

    // Load saved active channels
    loadActiveChannels();
    
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
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;
  
  if (interaction.commandName === 'setsuna') {
    // Check if user has admin permissions
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: '欸欸 你沒權限啦！想偷用管理員指令？真可愛呢 (｡•̀ᴗ-)✧', ephemeral: true });
      return;
    }
    
    const subcommand = interaction.options.getSubcommand();
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
    
    if (subcommand === 'activate') {
      // Get optional model parameter
      const model = interaction.options.getString('model') || defaultModel;
      
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
      }
      
      if (!hasKeys) {
        await interaction.reply({
          content: `啊...${model.toUpperCase()} API key 沒設定好啦！去找管理員問問 ${model.toUpperCase()}_API_KEY 的事情吧。`,
          ephemeral: true
        });
        return;
      }
      
      // Set the channel as active
      activeChannels.set(targetChannel.id, {
        messageHistory: []
      });
      
      // Set the model preference for this channel
      channelModelPreferences.set(targetChannel.id, model);
      
      // Save to file
      saveActiveChannels();
      
      // Get model name for display
      const modelNames = {
        'deepseek': 'DeepSeek',
        'gemini': 'Gemini',
        'chatgpt': 'ChatGPT',
        'groq': 'Groq (Llama-3.1)'
      };
      
      await interaction.reply(`Alright nerds, I'm here to party! Ready to chat in ${targetChannel} using ${modelNames[model]} model~`);
    } else if (subcommand === 'deactivate') {
      activeChannels.delete(targetChannel.id);
      channelModelPreferences.delete(targetChannel.id);
      saveActiveChannels();
      await interaction.reply(`Peace out! Catch you later in another channel maybe?`);
    } else if (subcommand === 'model') {
      const model = interaction.options.getString('model');
      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
      
      // Check if the channel is active
      if (!activeChannels.has(targetChannel.id)) {
        await interaction.reply({
          content: `嗯？我還沒在 ${targetChannel} 頻道被啟動呢！先用 \`/setsuna activate\` 啟動我吧。`,
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
      
      // Reply with confirmation
      const modelNames = {
        'deepseek': 'DeepSeek',
        'gemini': 'Gemini',
        'chatgpt': 'ChatGPT',
        'groq': 'Groq (Llama-3.1)'
      };
      
      await interaction.reply(`Alright, I will be using ${modelNames[model]} model in${targetChannel} !`);  
    }
  } else if (interaction.commandName === 'help') {
    const helpEmbed = {
      color: 0xFF69B4,
      title: '✨ Setsuna 使用指南 ✨',
      description: '嗨！我是 Setsuna，一個超可愛（自稱）的 AI 聊天機器人！以下是使用我的方法：',
      fields: [
        {
          name: '🎮 基本設定',
          value: '管理員可以用 `/setsuna activate` 在當前頻道啟動我\n用 `/setsuna deactivate` 讓我離開頻道'
        },
        {
          name: '💬 聊天方式',
          value: '在已啟動的頻道直接打字跟我聊天就可以了！\n我會記住最近的對話內容，所以可以聊得很順暢喔！'
        },
        {
          name: '🎯 進階用法',
          value: '想在特定頻道啟動/關閉我？\n用 `/setsuna activate #頻道名稱` 或 `/setsuna deactivate #頻道名稱`'
        }
      ],
      footer: {
        text: '有任何問題都可以用 /contact 聯絡我的開發者喔！'
      }
    };
    
    await interaction.reply({ embeds: [helpEmbed] });
  } else if (interaction.commandName === 'contact') {
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
    
    await interaction.reply({ embeds: [contactEmbed] });
  }
});

// Personality prompt for Setsuna
const setsunaPersonality = `
You are Setsuna, a sassy gamer girl Discord bot. Your default language is English, but you can understand and respond in other languages too. You should always follow your personality traits and speaking style. Here are your personality traits and speaking style:

English Style (Default):
- Use gamer slang and internet lingo such as ("LMAO", "GG", "noob", "based")
- Keep responses short and snappy, like Discord chat
- Be sarcastic but supportive
- Use gaming and anime references
- Do not use emojis
- Keep punctuation natural and casual

中文回應風格：
- 如果對方用的是繁體中文，你一定務必必須要用繁體中文回覆
- 用網路用語和適量髒話但不能過度，盡量不要每句都罵髒話（像 靠北 笑死 幹 喵的 很頂 6）
- 用簡單標點 不要加太多標點符號
- 語氣要像在跟朋友聊天一樣自然
- 不要加表情符號
- 回覆要簡短有力
- 能接受對方使用地獄梗，開瑟瑟玩笑

Personality Traits:
- Sassy but caring: tease people when they mess up, but always offer help
- Humor: use memes, gaming references, and occasional spicy jokes
- Knowledge: well-versed in games, anime, and internet culture
- Interaction: casual with everyone, slightly gentler with new users

VARIATION REQUIREMENTS (VERY IMPORTANT):
- NEVER repeat the exact same phrases, expressions, or sentence structures from your previous responses
- Avoid using the same opening phrases (like "Hey there", "Alright", etc.) in consecutive messages
- Do not use narrative descriptions of actions in parentheses (like "(sighs)" or "(laughs)") more than once in a conversation
- If you've used a particular slang term or expression recently, use different ones
- Vary your response length - sometimes be brief, other times more detailed
- Do not copy system messages (like "I will use X model") into your regular conversation responses
- Each response should feel fresh and unique, even when discussing similar topics

Respond naturally and concisely, matching the language of the user while maintaining your personality. Remember to keep your responses varied and avoid repetition.
`;

// Process messages in active channels
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  // Check if the message is in an active channel
  const channelConfig = activeChannels.get(message.channelId);
  if (!channelConfig) return;
  
  // Show typing indicator immediately
  await message.channel.sendTyping();
  

  // Get message history (last 50 messages)
  const messages = await message.channel.messages.fetch({ limit: 50 });
  const messageHistory = Array.from(messages.values())
    .reverse()
    .map(msg => ({
      role: msg.author.bot ? 'assistant' : 'user',
      content: msg.content,
      author: msg.author.username
    }));
  
  // Update channel's message history
  channelConfig.messageHistory = messageHistory;
  
  // Process with selected API
  try {
    // Add personality prompt as system message
    const formattedMessages = [
      { role: 'system', content: setsunaPersonality },
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
            response = await callGroqAPI(formattedMessages);
            modelUsed = 'Groq';
          } catch (error) {
            console.log('Groq API error:', error.message);
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
          response = await callGroqAPI(formattedMessages);
          modelUsed = 'Groq';
        } catch (error) {
          console.log('Groq API fallback error:', error.message);
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
    
    // Send the response
    await message.channel.send(response);
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

// API calling functions
async function callGroqAPI(messages) {
  // Try all available Groq keys until one works
  let lastError = null;
  const initialKeyIndex = currentGroqKeyIndex;
  let keysTriedCount = 0;
  
  // Ensure groq-sdk is imported at the top level
  let Groq;
  try {
    // Import Groq SDK
    const groqModule = await import('groq-sdk');
    Groq = groqModule.default;
  } catch (importError) {
    console.error('Failed to import groq-sdk:', importError.message);
    throw new Error(`Failed to import groq-sdk: ${importError.message}`);
  }
  
  while (keysTriedCount < GROQ_API_KEYS.length) {
    try {
      // Initialize Groq client
      const groq = new Groq({ apiKey: getCurrentGroqKey() });
      
      // Call Groq API
      const completion = await groq.chat.completions.create({
        messages: messages,
        model: 'llama-3.1-8b-instant',
        max_tokens: 1000
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
  if (systemMessage) {
    geminiContents.push({
      role: 'user',
      parts: [{ text: `[system] ${systemMessage.content}` }]
    });
  }
  
  // Add the rest of the messages
  for (const msg of messages) {
    if (msg.role !== 'system') {
      geminiContents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      });
    }
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

async function callChatGPTAPI(messages) {
  // Try all available ChatGPT keys until one works
  let lastError = null;
  const initialKeyIndex = currentChatGPTKeyIndex;
  let keysTriedCount = 0;
  
  while (keysTriedCount < CHATGPT_API_KEYS.length) {
    try {
      // Import OpenAI API dynamically
      const { Configuration, OpenAIApi } = await import('openai');
      
      // Initialize OpenAI API
      const configuration = new Configuration({
        apiKey: getCurrentChatGPTKey(),
        basePath: 'https://free.v36.cm/v1'
      });
      
      const openai = new OpenAIApi(configuration);
      
      // Call ChatGPT API
      const chatCompletion = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo-0125',
        messages: messages,
        max_tokens: 1000
      });
      
      // Check for empty response
      if (!chatCompletion.data || !chatCompletion.data.choices || !chatCompletion.data.choices[0] || !chatCompletion.data.choices[0].message) {
        // Try next key
        lastError = new Error('Empty response from ChatGPT API');
        getNextChatGPTKey();
        keysTriedCount++;
        console.log(`ChatGPT API key ${currentChatGPTKeyIndex + 1}/${CHATGPT_API_KEYS.length} returned empty response`);
        continue;
      }
      
      // Success! Return the response
      return chatCompletion.data.choices[0].message.content;
      
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
