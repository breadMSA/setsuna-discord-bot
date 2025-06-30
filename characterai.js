const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Store active chats globally for persistence across instances
const activeChats = new Map();

/**
 * Character.AI API client implementation
 * Based on the PyCharacterAI Python library
 */
class CharacterAI {
  constructor() {
    this.token = null;
    this.accountId = null;
    // Use the Neo API URL as in the Python code
    this.baseUrl = 'https://neo.character.ai';
    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    };
  }

  /**
   * Get the active chats map (shared across instances)
   * @returns {Map} The active chats map
   */
  get activeChats() {
    return activeChats;
  }

  /**
   * Set the authentication token
   * @param {string} token - Character.AI token
   */
  setToken(token) {
    this.token = token;
    this.headers['authorization'] = `Token ${token}`;
  }

  /**
   * Get authentication headers
   * @returns {Object} Headers for API requests
   */
  getHeaders() {
    if (!this.token) {
      throw new Error('Token not set. Please call setToken() first.');
    }
    return this.headers;
  }

  /**
   * Fetch account information
   * @returns {Promise<Object>} Account info
   */
  async fetchMe() {
    try {
      if (!this.token) {
        throw new Error('Token not set. Please call setToken() first.');
      }

      console.log('Fetching account info from Character.AI...');
      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl}/chat/user/`,
        headers: this.getHeaders(),
        timeout: 10000 // 10 second timeout
      });

      console.log('Character.AI user API response status:', response.status);
      console.log('Response data:', JSON.stringify(response.data, null, 2).substring(0, 500) + '...');
      
      if (response.data && response.data.user) {
        this.accountId = response.data.user.user_id;
        console.log('Successfully retrieved account ID:', this.accountId);
        return response.data.user;
      }

      throw new Error('Failed to fetch account information - invalid response format');
    } catch (error) {
      console.error('Error fetching account info:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data));
      }
      throw error;
    }
  }

  /**
   * Create a new chat with a character
   * @param {string} characterId - Character ID to chat with
   * @returns {Promise<Object>} Chat object and optional greeting message
   */
  async createChat(characterId) {
    try {
      if (!this.token) {
        throw new Error('Token not set. Please call setToken() first.');
      }

      // Make sure we have the account ID
      if (!this.accountId) {
        await this.fetchMe();
      }

      const requestId = uuidv4();

      console.log(`Creating new chat with character ${characterId}...`);
      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/chat/history/create/`,
        headers: this.getHeaders(),
        timeout: 15000, // 15 second timeout
        data: {
          character_external_id: characterId,
          history_external_id: null
        }
      });

      console.log('Character.AI create chat response status:', response.status);
      console.log('Response data:', JSON.stringify(response.data, null, 2).substring(0, 500) + '...');
      
      if (response.data && response.data.external_id) {
        const chatId = response.data.external_id;
        let greeting = null;
        
        // Try to get the greeting message if available
        if (response.data.messages && response.data.messages.length > 0) {
          greeting = response.data.messages[0];
        }

        console.log(`Successfully created chat with ID: ${chatId}`);
        
        return { 
          chat: {
            chat_id: chatId,
            external_id: chatId,
            character_id: characterId
          }, 
          greeting: greeting 
        };
      }

      throw new Error('Failed to create chat - invalid response format');
    } catch (error) {
      console.error('Error creating chat:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data));
      }
      throw error;
    }
  }

  /**
   * Send a message to a character
   * @param {string} characterId - Character ID
   * @param {string} chatId - Chat ID
   * @param {string} message - Message text
   * @returns {Promise<Object>} Response turn object
   */
  async sendMessage(characterId, chatId, message) {
    try {
      if (!this.token) {
        throw new Error('Token not set. Please call setToken() first.');
      }

      console.log(`Sending message to character ${characterId} in chat ${chatId}...`);
      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/chat/streaming/recv/`,
        headers: this.getHeaders(),
        timeout: 30000, // 30 second timeout
        data: {
          history_external_id: chatId,
          character_external_id: characterId,
          text: message
        }
      });

      console.log('Character.AI send message response status:', response.status);
      
      // Process the response to extract the message
      if (response.data && response.data.replies && response.data.replies.length > 0) {
        const reply = response.data.replies[0];
        console.log('Got response from character:', reply.text?.substring(0, 50) + '...');
        
        return {
          turn_id: reply.id || uuidv4(),
          author_name: "Character",
          text: reply.text,
          candidates: [{ 
            candidate_id: reply.id || uuidv4(),
            text: reply.text
          }]
        };
      }

      throw new Error('Invalid response from Character.AI API - missing reply data');
    } catch (error) {
      console.error('Error sending message:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data));
      }
      throw error;
    }
  }

  /**
   * Fetch chat history
   * @param {string} chatId - Chat ID
   * @returns {Promise<Array>} List of message turns
   */
  async fetchMessages(chatId) {
    try {
      if (!this.token) {
        throw new Error('Token not set. Please call setToken() first.');
      }

      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl}/chat/history/msgs/user/`,
        headers: this.getHeaders(),
        timeout: 10000, // 10 second timeout
        params: {
          history_external_id: chatId
        }
      });

      if (!response.data || !response.data.messages) {
        throw new Error('Invalid response from Character.AI API - missing messages');
      }

      return response.data.messages;
    } catch (error) {
      console.error('Error fetching messages:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data));
      }
      throw error;
    }
  }

  /**
   * Get information about a character
   * @param {string} characterId - Character ID
   * @returns {Promise<Object>} Character information
   */
  async fetchCharacterInfo(characterId) {
    try {
      if (!this.token) {
        throw new Error('Token not set. Please call setToken() first.');
      }

      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl}/chat/character/info/`,
        headers: this.getHeaders(),
        timeout: 10000, // 10 second timeout
        params: {
          external_id: characterId
        }
      });

      if (!response.data || !response.data.character) {
        throw new Error('Invalid response from Character.AI API - missing character data');
      }

      return response.data.character;
    } catch (error) {
      console.error('Error fetching character info:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data));
      }
      throw error;
    }
  }
}

module.exports = CharacterAI; 