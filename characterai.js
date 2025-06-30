const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');

// Store active chats globally for persistence across instances
const activeChats = new Map();
// Store active WebSocket connections
const activeWebSockets = new Map();

/**
 * Character.AI API client implementation
 * Based on the PyCharacterAI Python library
 */
class CharacterAI {
  constructor() {
    this.token = null;
    this.accountId = null;
    // Use plus.character.ai as the base URL like in the Python code
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
   * Create or get a WebSocket connection
   * @returns {Promise<WebSocket>} WebSocket connection
   */
  async getWebSocket() {
    // Check if we already have an active connection for this token
    if (activeWebSockets.has(this.token) && activeWebSockets.get(this.token).readyState === WebSocket.OPEN) {
      return activeWebSockets.get(this.token);
    }

    // Create a new WebSocket connection
    return new Promise((resolve, reject) => {
      console.log('Creating new WebSocket connection to Character.AI...');
      const ws = new WebSocket(this.wsUrl, {
        headers: {
          'Cookie': `HTTP_AUTHORIZATION=Token ${this.token}`
        }
      });

      ws.on('open', () => {
        console.log('WebSocket connection established');
        activeWebSockets.set(this.token, ws);
        resolve(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket connection error:', error.message);
        reject(error);
      });

      // Set a timeout for connection
      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error('WebSocket connection timeout'));
      }, 15000);

      // Clear timeout when connected
      ws.on('open', () => clearTimeout(timeout));
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
      
      // First try the WebSocket API to create the chat (more reliable for subsequent message sending)
      try {
        const ws = await this.getWebSocket();
        const requestId = uuidv4();
        
        const createChatMessage = {
          command: "create_chat",
          origin_id: "web-next",
          payload: {
            character_id: characterId,
            history_id: null
          },
          request_id: requestId
        };
        
        const chatData = await new Promise((resolve, reject) => {
          // Handle WebSocket messages for this specific request
          const messageHandler = (data) => {
            try {
              const response = JSON.parse(data.toString());
              
              // Check if the response is for our request
              if (response.request_id !== requestId) {
                return; // Ignore messages for other requests
              }
              
              const command = response.command;
              
              if (!command) {
                reject(new Error('Invalid response from WebSocket - missing command'));
                return;
              }
              
              if (command === 'neo_error') {
                const errorComment = response.comment || '';
                reject(new Error(`Character.AI API error: ${errorComment}`));
                return;
              }
              
              if (command === 'chat') {
                cleanup();
                resolve(response);
              }
            } catch (error) {
              console.error('Error processing WebSocket message:', error.message);
              reject(error);
            }
          };
          
          // Set up error handling
          const errorHandler = (error) => {
            console.error('WebSocket error during chat creation:', error.message);
            cleanup();
            reject(error);
          };
          
          // Set up close handling
          const closeHandler = (code, reason) => {
            console.log(`WebSocket closed during chat creation: ${code} - ${reason}`);
            cleanup();
            reject(new Error(`WebSocket closed unexpectedly: ${reason}`));
          };
          
          // Clean up event listeners
          const cleanup = () => {
            ws.removeListener('message', messageHandler);
            ws.removeListener('error', errorHandler);
            ws.removeListener('close', closeHandler);
          };
          
          // Set up event listeners
          ws.on('message', messageHandler);
          ws.on('error', errorHandler);
          ws.on('close', closeHandler);
          
          // Set a timeout for the entire operation
          const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Timeout waiting for Character.AI response'));
          }, 15000); // 15 second timeout
          
          // Send the message
          ws.send(JSON.stringify(createChatMessage), (error) => {
            if (error) {
              clearTimeout(timeout);
              cleanup();
              reject(error);
            }
          });
        });
        
        // Extract chat ID from WebSocket response
        if (chatData && chatData.chat && chatData.chat.chat_id) {
          const chatId = chatData.chat.chat_id;
          console.log(`Successfully created chat with ID: ${chatId} (WebSocket API)`);
          
          return { 
            chat: chatData.chat,
            greeting: chatData.chat.turns && chatData.chat.turns.length > 0 ? chatData.chat.turns[0] : null
          };
        }
      } catch (wsError) {
        console.log(`WebSocket chat creation failed, falling back to HTTP API: ${wsError.message}`);
        // Continue with HTTP API fallback
      }
      
      // Fallback to HTTP API if WebSocket fails
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

        console.log(`Successfully created chat with ID: ${chatId} (HTTP API)`);
        
        // Store the chat ID in the format expected by the WebSocket API
        const wsCompatChatId = response.data.external_id;
        
        return { 
          chat: {
            ...response.data,
            chat_id: wsCompatChatId // Add WebSocket compatible chat_id
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
   * Send a message to a character via WebSocket
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

      // Make sure we have the account ID
      if (!this.accountId) {
        await this.fetchMe();
      }

      // Generate UUIDs for the request
      const candidateId = uuidv4();
      const turnId = uuidv4();
      const requestId = uuidv4();
      
      console.log(`Sending message to character ${characterId} in chat ${chatId}...`);
      
      // Format the WebSocket message following the Python implementation
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
              author_id: this.accountId,
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

      // Get WebSocket connection
      const ws = await this.getWebSocket();
      
      return new Promise((resolve, reject) => {
        // Store responses from the WebSocket
        let finalResponse = null;
        
        // Handle WebSocket messages for this specific request
        const messageHandler = (data) => {
          try {
            const response = JSON.parse(data.toString());
            
            // Check if the response is for our request
            if (response.request_id !== requestId && 
                !(response.command === 'add_turn' || response.command === 'update_turn')) {
              return; // Ignore messages for other requests
            }
            
            const command = response.command;
            
            if (!command) {
              reject(new Error('Invalid response from WebSocket - missing command'));
              return;
            }
            
            if (command === 'neo_error') {
              const errorComment = response.comment || '';
              reject(new Error(`Character.AI API error: ${errorComment}`));
              return;
            }
            
            if (command === 'filter_user_input_self_harm') {
              reject(new Error('Message was flagged for self harm content'));
              return;
            }
            
            // Process turn updates and additions
            if (command === 'add_turn' || command === 'update_turn') {
              // Skip if it's the user's message (first response is usually echoing the user message)
              if (response.turn && response.turn.author && response.turn.author.is_human) {
                return;
              }
              
              // Check if this is the final response
              const isFinal = response.turn && 
                             response.turn.candidates && 
                             response.turn.candidates[0] && 
                             response.turn.candidates[0].is_final;
              
              // Store the latest response
              finalResponse = {
                turn_id: response.turn.turn_id,
                author_name: response.turn.author ? (response.turn.author.name || "Character") : "Character",
                text: response.turn.candidates[0].raw_content || response.turn.candidates[0].text,
                candidates: response.turn.candidates.map(candidate => ({
                  candidate_id: candidate.candidate_id,
                  text: candidate.raw_content || candidate.text
                })),
                get_primary_candidate: function() {
                  return this.candidates[0];
                }
              };
              
              // If this is the final response, resolve the promise
              if (isFinal) {
                cleanup();
                resolve(finalResponse);
              }
            }
          } catch (error) {
            console.error('Error processing WebSocket message:', error.message);
            reject(error);
          }
        };
        
        // Set up error handling
        const errorHandler = (error) => {
          console.error('WebSocket error during message send:', error.message);
          cleanup();
          reject(error);
        };
        
        // Set up close handling
        const closeHandler = (code, reason) => {
          console.log(`WebSocket closed during message send: ${code} - ${reason}`);
          cleanup();
          
          // If we haven't resolved yet, reject
          if (!finalResponse) {
            reject(new Error(`WebSocket closed unexpectedly: ${reason}`));
          }
        };
        
        // Clean up event listeners
        const cleanup = () => {
          ws.removeListener('message', messageHandler);
          ws.removeListener('error', errorHandler);
          ws.removeListener('close', closeHandler);
        };
        
        // Set up event listeners
        ws.on('message', messageHandler);
        ws.on('error', errorHandler);
        ws.on('close', closeHandler);
        
        // Set a timeout for the entire operation
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Timeout waiting for Character.AI response'));
        }, 60000); // 60 second timeout
        
        // Send the message
        ws.send(JSON.stringify(wsMessage), (error) => {
          if (error) {
            clearTimeout(timeout);
            cleanup();
            reject(error);
          }
        });
      });
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
}

module.exports = CharacterAI; 