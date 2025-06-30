const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');

// Store active chats and WebSocket connections globally for persistence across instances
const activeChats = new Map();
let wsConnection = null;
let messageCallbacks = new Map();
let messageResponses = new Map();

/**
 * Character.AI API client implementation based on PyCharacterAI Python library
 */
class CharacterAI {
  constructor() {
    this.token = null;
    this.accountId = null;
    this.baseUrl = 'https://plus.character.ai';
    this.wsUrl = 'wss://neo.character.ai/ws/';
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
   * Connect to the WebSocket server
   * @returns {Promise<WebSocket>} WebSocket connection
   */
  async connectWebSocket() {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      console.log('Using existing WebSocket connection');
      return wsConnection;
    }

    return new Promise((resolve, reject) => {
      console.log('Opening new WebSocket connection to Character.AI...');
      
      // Close existing connection if it exists
      if (wsConnection) {
        try {
          wsConnection.terminate();
        } catch (err) {
          console.log('Error closing existing WebSocket:', err.message);
        }
      }

      // We need to use HTTP API first, not WebSocket for now
      console.log('Using HTTP API instead of WebSocket due to authentication issues');
      resolve(null); // Return null to indicate we're not using WebSocket
    });
  }

  /**
   * Send a message via WebSocket or fallback to HTTP
   * @param {Object} message - Message to send
   * @returns {Promise<Object>} Response
   */
  async sendWebSocketMessage(message) {
    // We'll use HTTP API instead of WebSocket due to authentication issues
    const requestId = message.request_id || uuidv4();
    
    try {
      console.log('Using HTTP API instead of WebSocket due to authentication issues');
      
      // Extract the necessary information from the WebSocket message
      const characterId = message.payload.character_id;
      const chatId = message.payload.turn.turn_key.chat_id;
      const text = message.payload.turn.candidates[0].raw_content;
      
      // Send using HTTP API - use non-streaming endpoint to avoid stream aborted errors
      console.log('Using non-streaming API endpoint to avoid stream aborted errors');
      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/chat/message/`,
        headers: this.getHeaders(),
        timeout: 90000, // 90 second timeout
        data: {
          history_external_id: chatId,
          character_external_id: characterId,
          text: text,
          request_id: requestId
        }
      });
      
      console.log('HTTP API response status:', response.status);
      
      // Convert HTTP response to WebSocket format
      if (response.data && response.data.turn) {
        return {
          command: 'update_turn',
          turn: response.data.turn
        };
      } else {
        throw new Error('Invalid response from Character.AI API - missing turn data');
      }
    } catch (error) {
      console.error('Error sending message via HTTP:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data));
        
        // Convert HTTP error to WebSocket format
        return {
          command: 'neo_error',
          comment: error.message,
          error_code: error.response.status
        };
      }
      throw error;
    }
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
      
      if (response.data && response.data.user) {
        this.accountId = response.data.user.user.user_id;
        console.log('Successfully retrieved account ID:', this.accountId);
        return response.data.user.user;
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
      
      if (response.data && response.data.external_id) {
        const chatId = response.data.external_id;
        let greeting = null;
        
        // Try to get the greeting message if available
        if (response.data.turns && response.data.turns.length > 0) {
          greeting = response.data.turns[0];
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

      if (!this.accountId) {
        await this.fetchMe();
      }

      console.log(`Sending message to character ${characterId} in chat ${chatId}...`);
      
      // Use HTTP API directly instead of WebSocket - use non-streaming endpoint
      const requestId = uuidv4();
      console.log('Using non-streaming API endpoint to avoid stream aborted errors');
      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/chat/message/`,
        headers: this.getHeaders(),
        timeout: 90000, // 90 second timeout
        data: {
          history_external_id: chatId,
          character_external_id: characterId,
          text: message,
          request_id: requestId
        }
      });

      console.log('Character.AI HTTP API response status:', response.status);
      
      // Process the response
      if (response.data && response.data.turn && response.data.turn.candidates) {
        const primaryCandidate = response.data.turn.candidates[0];
        console.log('Got response from character:', primaryCandidate.text?.substring(0, 50) + '...');
        
        return {
          turn_id: response.data.turn.turn_id,
          author_name: response.data.turn.author?.name || "Character",
          text: primaryCandidate.text || primaryCandidate.raw_content,
          candidates: response.data.turn.candidates.map(candidate => ({
            candidate_id: candidate.candidate_id,
            text: candidate.text || candidate.raw_content
          })),
          // Helper function to match Python implementation
          get_primary_candidate: function() {
            return this.candidates[0];
          }
        };
      }

      throw new Error('Invalid response from Character.AI API - missing turn data');
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
        method: 'POST',
        url: `${this.baseUrl}/chat/character/info/`,
        headers: this.getHeaders(),
        timeout: 10000, // 10 second timeout
        data: {
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

  /**
   * Close any open connections
   */
  async close() {
    if (wsConnection) {
      try {
        wsConnection.close();
        wsConnection = null;
        console.log('WebSocket connection closed');
      } catch (error) {
        console.error('Error closing WebSocket connection:', error.message);
      }
    }
  }
}

module.exports = CharacterAI; 