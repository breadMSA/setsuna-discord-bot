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

      // Create new connection
      const ws = new WebSocket(this.wsUrl, {
        headers: {
          'Cookie': `HTTP_AUTHORIZATION=Token ${this.token}`
        }
      });

      ws.on('open', () => {
        console.log('WebSocket connection established');
        wsConnection = ws;
        resolve(ws);
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          console.log('WebSocket message received:', JSON.stringify(message).substring(0, 150) + '...');
          
          const requestId = message.request_id;
          
          if (requestId) {
            // Store the response for this request ID
            if (!messageResponses.has(requestId)) {
              messageResponses.set(requestId, []);
            }
            
            const responses = messageResponses.get(requestId);
            responses.push(message);
            messageResponses.set(requestId, responses);
            
            // If we have a callback for this request ID and certain conditions are met, call it
            if (messageCallbacks.has(requestId)) {
              const callback = messageCallbacks.get(requestId);
              
              // For update_turn and add_turn commands with is_final=true, call the callback
              if (message.command === 'update_turn' || message.command === 'add_turn') {
                if (message.turn && 
                    message.turn.candidates && 
                    message.turn.candidates.length > 0 && 
                    message.turn.candidates[0].is_final === true) {
                  callback(message);
                }
              } else if (message.command === 'neo_error') {
                // For error messages, call the callback immediately
                callback(message);
              }
            }
          }
        } catch (err) {
          console.error('Error processing WebSocket message:', err.message);
        }
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
        reject(error);
      });

      ws.on('close', (code, reason) => {
        console.log(`WebSocket connection closed: ${code} ${reason}`);
        wsConnection = null;
      });
    });
  }

  /**
   * Send a message via WebSocket and wait for specific response
   * @param {Object} message - Message to send
   * @returns {Promise<Object>} Response
   */
  async sendWebSocketMessage(message) {
    const ws = await this.connectWebSocket();
    const requestId = message.request_id || uuidv4();
    
    if (!message.request_id) {
      message.request_id = requestId;
    }

    // Clear any previous responses for this request
    messageResponses.delete(requestId);

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        messageCallbacks.delete(requestId);
        
        // Check if we have any responses for this request before failing
        if (messageResponses.has(requestId)) {
          const responses = messageResponses.get(requestId);
          console.log(`Timeout but found ${responses.length} responses for request ${requestId}`);
          
          // Find the last update_turn or add_turn response
          for (let i = responses.length - 1; i >= 0; i--) {
            const response = responses[i];
            if (response.command === 'update_turn' || response.command === 'add_turn') {
              if (response.turn && response.turn.candidates && response.turn.candidates.length > 0) {
                console.log('Found valid response in collected messages, using it despite timeout');
                messageResponses.delete(requestId);
                return resolve(response);
              }
            }
          }
        }
        
        reject(new Error('WebSocket request timed out'));
      }, 90000); // 90 second timeout - character.ai can be slow

      // Set up callback for this request
      messageCallbacks.set(requestId, (response) => {
        clearTimeout(timeoutId);
        messageCallbacks.delete(requestId);
        messageResponses.delete(requestId);
        resolve(response);
      });

      // Send the message
      try {
        ws.send(JSON.stringify(message));
        console.log('WebSocket message sent for request:', requestId);
      } catch (error) {
        clearTimeout(timeoutId);
        messageCallbacks.delete(requestId);
        messageResponses.delete(requestId);
        reject(error);
      }
    });
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
   * Send a message to a character using WebSocket
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

      // Use the same message format as in the Python library
      const candidateId = uuidv4();
      const turnId = uuidv4();
      const requestId = uuidv4();

      console.log(`Sending message to character ${characterId} in chat ${chatId} via WebSocket...`);
      
      const wsMessage = {
        command: "create_and_generate_turn",
        origin_id: "web-next",
        payload: {
          character_id: characterId,
          num_candidates: 1,
          previous_annotations: {
            bad_memory: 0,
            boring: 0,
            ends_chat_early: 0,
            funny: 0,
            helpful: 0,
            inaccurate: 0,
            interesting: 0,
            long: 0,
            not_bad_memory: 0,
            not_boring: 0,
            not_ends_chat_early: 0,
            not_funny: 0,
            not_helpful: 0,
            not_inaccurate: 0,
            not_interesting: 0,
            not_long: 0,
            not_out_of_character: 0,
            not_repetitive: 0,
            not_short: 0,
            out_of_character: 0,
            repetitive: 0,
            short: 0,
          },
          selected_language: "",
          tts_enabled: false,
          turn: {
            author: {
              author_id: this.accountId || "user",
              is_human: true,
              name: "",
            },
            candidates: [{ candidate_id: candidateId, raw_content: message }],
            primary_candidate_id: candidateId,
            turn_key: { chat_id: chatId, turn_id: turnId },
          },
          user_name: "",
        },
        request_id: requestId,
      };

      // Send the message via WebSocket
      const response = await this.sendWebSocketMessage(wsMessage);
      
      // Handle error response
      if (response.command === 'neo_error') {
        throw new Error(`Character.AI error: ${response.comment || 'Unknown error'}`);
      }
      
      // Process the response according to the Python implementation
      if (response && response.turn && response.turn.candidates) {
        const primaryCandidate = response.turn.candidates[0];
        console.log('Got response from character:', primaryCandidate.text?.substring(0, 50) + '...');
        
        return {
          turn_id: response.turn.turn_id,
          author_name: response.turn.author?.name || "Character",
          text: primaryCandidate.text || primaryCandidate.raw_content,
          candidates: response.turn.candidates.map(candidate => ({
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