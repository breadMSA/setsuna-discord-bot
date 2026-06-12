const { MongoClient } = require('mongodb');

let client = null;
let db = null;

/**
 * Connects to MongoDB using process.env.MONGODB_URI
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    return null;
  }
  if (db) return db;
  try {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(); // Connects to the default DB defined in connection string
    console.log('[DB] 成功連線至 MongoDB 資料庫。');
    return db;
  } catch (error) {
    console.error('[DB] MongoDB 連線失敗:', error.message);
    return null;
  }
}

/**
 * Loads all active channel configurations from the 'channel_preferences' collection
 */
async function loadAllChannelConfigs() {
  const database = await connectDB();
  if (!database) return null;
  try {
    const collection = database.collection('channel_preferences');
    const docs = await collection.find({}).toArray();
    const config = {};
    for (const doc of docs) {
      if (doc.channelId) {
        config[doc.channelId] = {
          model: doc.model,
          groqModel: doc.groqModel,
          cerebrasModel: doc.cerebrasModel,
          customInstructions: doc.customInstructions,
          customRole: doc.customRole,
          customSpeakingStyle: doc.customSpeakingStyle,
          customTextStructure: doc.customTextStructure,
          useAIToDetectImageRequest: doc.useAIToDetectImageRequest,
          caiChatId: doc.caiChatId
        };
      }
    }
    return config;
  } catch (error) {
    console.error('[DB] 從 MongoDB 載入頻道設定失敗:', error.message);
    return null;
  }
}

/**
 * Upserts a channel's configuration in the 'channel_preferences' collection
 */
async function saveChannelConfig(channelId, config) {
  const database = await connectDB();
  if (!database) return false;
  try {
    const collection = database.collection('channel_preferences');
    await collection.updateOne(
      { channelId: channelId },
      {
        $set: {
          channelId: channelId,
          model: config.model || null,
          groqModel: config.groqModel || null,
          cerebrasModel: config.cerebrasModel || null,
          customInstructions: config.customInstructions || null,
          customRole: config.customRole || null,
          customSpeakingStyle: config.customSpeakingStyle || null,
          customTextStructure: config.customTextStructure || null,
          useAIToDetectImageRequest: typeof config.useAIToDetectImageRequest === 'boolean' ? config.useAIToDetectImageRequest : null,
          caiChatId: config.caiChatId || null,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
    return true;
  } catch (error) {
    console.error(`[DB] 儲存頻道 ${channelId} 設定至 MongoDB 失敗:`, error.message);
    return false;
  }
}

/**
 * Saves the Telegram owner chat ID to the 'bot_settings' collection
 */
async function saveTelegramChatId(chatId) {
  const database = await connectDB();
  if (!database) return false;
  try {
    const collection = database.collection('bot_settings');
    await collection.updateOne(
      { key: 'telegram_config' },
      { 
        $set: { 
          chatId: String(chatId), 
          updatedAt: new Date() 
        } 
      },
      { upsert: true }
    );
    return true;
  } catch (error) {
    console.error('[DB] 儲存 Telegram Chat ID 至 MongoDB 失敗:', error.message);
    return false;
  }
}

/**
 * Loads the Telegram owner chat ID from the 'bot_settings' collection
 */
async function loadTelegramChatId() {
  const database = await connectDB();
  if (!database) return null;
  try {
    const collection = database.collection('bot_settings');
    const doc = await collection.findOne({ key: 'telegram_config' });
    return doc ? doc.chatId : null;
  } catch (error) {
    console.error('[DB] 從 MongoDB 載入 Telegram Chat ID 失敗:', error.message);
    return null;
  }
}

module.exports = {
  connectDB,
  loadAllChannelConfigs,
  saveChannelConfig,
  saveTelegramChatId,
  loadTelegramChatId
};
