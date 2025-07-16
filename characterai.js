const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');

// Store active chats globally for persistence across instances
const activeChats = new Map();
// Store active WebSocket connections
const activeWebSockets = new Map();

// Debug: Log all environment variables related to Character.AI
console.log('CHARACTER.AI ENVIRONMENT VARIABLES:');
console.log('CHARACTERAI_CHARACTER_ID:', process.env.CHARACTERAI_CHARACTER_ID || 'NOT SET');
console.log('CHARACTERAI_TOKEN length:', process.env.CHARACTERAI_TOKEN ? process.env.CHARACTERAI_TOKEN.length : 'NOT SET');

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
      'Accept': 'application/json',
      'Origin': 'https://character.ai',
      'Referer': 'https://character.ai/'
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
    // Update the Authorization header
    this.headers['Authorization'] = `Token ${token}`;
  }

  /**
   * Get authentication headers
   * @returns {Object} Headers for API requests
   */
  getHeaders() {
    if (!this.token) {
      throw new Error('Token not set. Please call setToken() first.');
    }
    
    return {
      'Content-Type': 'application/json',
      'Authorization': `Token ${this.token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Origin': 'https://character.ai',
      'Referer': 'https://character.ai/'
    };
  }

  /**
   * Create or get a WebSocket connection
   * @returns {Promise<WebSocket>} WebSocket connection
   */
  async getWebSocket() {
    // Check if we already have an active connection for this token
    if (activeWebSockets.has(this.token) && activeWebSockets.get(this.token).readyState === WebSocket.OPEN) {
      console.log('Using existing WebSocket connection');
      return activeWebSockets.get(this.token);
    }

    // Create a new WebSocket connection
    return new Promise((resolve, reject) => {
      console.log('Creating new WebSocket connection to Character.AI...');
      
      // Close any existing connection that might be in a bad state
      if (activeWebSockets.has(this.token)) {
        try {
          const oldWs = activeWebSockets.get(this.token);
          if (oldWs.readyState !== WebSocket.CLOSED) {
            console.log('Closing existing WebSocket connection');
            oldWs.terminate();
          }
        } catch (error) {
          console.error('Error closing existing WebSocket:', error.message);
        }
      }
      
      // Create new connection with proper headers
      // The WebSocket connection needs the token in the URL or as a cookie
      // Try both approaches for maximum compatibility
      const wsUrlWithToken = `${this.wsUrl}?token=${this.token}`;
      console.log(`Connecting to WebSocket with token in URL: ${wsUrlWithToken.substring(0, 40)}...`);
      
      const ws = new WebSocket(wsUrlWithToken, {
        headers: {
          'Cookie': `Authorization=Token ${this.token}`,
          'User-Agent': this.headers['User-Agent'],
          'Origin': 'https://character.ai',
          'Referer': 'https://character.ai/'
        }
      });

      ws.on('open', () => {
        console.log('WebSocket connection established');
        activeWebSockets.set(this.token, ws);
        
        // Send a ping to verify the connection is working
        try {
          ws.send(JSON.stringify({ command: "ping" }));
          console.log('Sent ping to WebSocket');
        } catch (error) {
          console.error('Error sending ping:', error.message);
        }
        
        resolve(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket connection error:', error.message);
        reject(error);
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.command === 'pong') {
            console.log('Received pong from WebSocket');
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error.message);
        }
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
      
      // Try the primary API endpoint first
      try {
        const response = await axios({
          method: 'GET',
          url: `${this.baseUrl}/chat/user/`,
          headers: this.getHeaders(),
          timeout: 10000 // 10 second timeout
        });

        console.log('Character.AI user API response status:', response.status);
        
        if (response.data && response.data.user) {
          // The user ID is nested inside the response
          this.accountId = response.data.user.user.user_id;
          console.log('Successfully retrieved account ID:', this.accountId);
          return response.data.user.user;
        } else if (response.data && response.data.status === "OK" && response.data.user_id) {
          // Alternative response format
          this.accountId = response.data.user_id;
          console.log('Successfully retrieved account ID (alternative format):', this.accountId);
          return response.data;
        }
      } catch (primaryError) {
        console.log(`Primary user API failed: ${primaryError.message}, trying neo API...`);
      }
      
      // Try the neo API endpoint if the primary fails
      try {
        const neoResponse = await axios({
          method: 'GET',
          url: 'https://neo.character.ai/user/',
          headers: this.getHeaders(),
          timeout: 10000 // 10 second timeout
        });
        
        console.log('Character.AI neo user API response status:', neoResponse.status);
        
        if (neoResponse.data && neoResponse.data.user && neoResponse.data.user.user_id) {
          this.accountId = neoResponse.data.user.user_id;
          console.log('Successfully retrieved account ID from neo API:', this.accountId);
          return neoResponse.data.user;
        }
      } catch (neoError) {
        console.log(`Neo user API failed: ${neoError.message}`);
      }
      
      // If we still don't have an account ID, try to generate one
      if (!this.accountId) {
        // Generate a UUID to use as account ID if we can't get one from the API
        this.accountId = uuidv4();
        console.log('Generated fallback account ID:', this.accountId);
        return { user_id: this.accountId };
      }

      console.error('Invalid response format from all user API endpoints');
      throw new Error('Failed to fetch account information - invalid response format');
    } catch (error) {
      console.error('Error fetching account info:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data));
      }
      
      // Generate a UUID to use as account ID if we can't get one from the API
      this.accountId = uuidv4();
      console.log('Generated fallback account ID after error:', this.accountId);
      return { user_id: this.accountId };
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
      
      try {
        // Create a new WebSocket connection
        const ws = await this.getWebSocket();
        const requestId = uuidv4();
        const chatId = uuidv4();
        
        // Format the WebSocket message following the Python implementation
        const createChatMessage = {
          command: "create_chat",
          request_id: requestId,
          payload: {
            chat: {
              chat_id: chatId,
              creator_id: this.accountId,
              visibility: "VISIBILITY_PRIVATE",
              character_id: characterId,
              type: "TYPE_ONE_ON_ONE"
            },
            with_greeting: true
          },
          origin_id: "web-next"
        };
        
        console.log('Sending create_chat message:', JSON.stringify(createChatMessage));
        
        // Send the message and wait for response
        return await new Promise((resolve, reject) => {
          let newChat = null;
          let greetingTurn = null;
          
          // Handle WebSocket messages for this specific request
          const messageHandler = (data) => {
            try {
              const response = JSON.parse(data.toString());
              console.log('Received WebSocket response:', response.command);
              
              // Check if the response is for our request
              if (response.request_id !== requestId && 
                  !['create_chat_response', 'add_turn', 'neo_error'].includes(response.command)) {
                return; // Ignore messages for other requests
              }
              
              const command = response.command;
              
              if (command === 'neo_error') {
                const errorComment = response.comment || '';
                cleanup();
                reject(new Error(`Character.AI API error: ${errorComment}`));
                return;
              }
              
              if (command === 'create_chat_response') {
                newChat = response.chat;
                console.log('Received create_chat_response:', JSON.stringify(newChat));
                
                // If we're not expecting a greeting, resolve now
                if (!createChatMessage.payload.with_greeting) {
                  cleanup();
                  resolve({ 
                    chat: newChat,
                    greeting: null
                  });
                }
                
                // Otherwise, wait for the greeting turn
                return;
              }
              
              if (command === 'add_turn') {
                greetingTurn = response.turn;
                console.log('Received greeting turn');
                
                // We have both the chat and greeting, resolve
                if (newChat) {
                  cleanup();
                  resolve({ 
                    chat: newChat,
                    greeting: greetingTurn
                  });
                }
                
                return;
              }
            } catch (error) {
              console.error('Error processing WebSocket message:', error.message);
              cleanup();
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
            clearTimeout(timeout);
          };
          
          // Set up event listeners
          ws.on('message', messageHandler);
          ws.on('error', errorHandler);
          ws.on('close', closeHandler);
          
          // Set a timeout for the entire operation
          const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Timeout waiting for Character.AI response'));
          }, 30000); // 30 second timeout
          
          // Send the message
          ws.send(JSON.stringify(createChatMessage), (error) => {
            if (error) {
              cleanup();
              reject(error);
            }
          });
        });
      } catch (wsError) {
        // WebSocket method failed, try HTTP fallback
        console.log(`WebSocket chat creation failed, falling back to HTTP API: ${wsError.message}`);
        
        // Try the HTTP API to create a chat
        console.log('Attempting to create chat using HTTP API...');
        
        // First try the neo API
        try {
          const neoResponse = await axios({
            method: 'POST',
            url: 'https://neo.character.ai/chat/',
            headers: this.getHeaders(),
            timeout: 15000, // 15 second timeout
            data: {
              character_id: characterId
            }
          });
          
          console.log('Character.AI neo create chat response status:', neoResponse.status);
          
          if (neoResponse.data && neoResponse.data.chat && neoResponse.data.chat.chat_id) {
            const chatId = neoResponse.data.chat.chat_id;
            console.log(`Successfully created chat with ID: ${chatId} (Neo HTTP API)`);
            
            return {
              chat: neoResponse.data.chat,
              greeting: null // Neo API doesn't return greeting with the create call
            };
          }
        } catch (neoError) {
          console.log(`Neo HTTP API failed, trying legacy API: ${neoError.message}`);
          
          // Log the error details
          if (neoError.response) {
            console.error('Neo API response status:', neoError.response.status);
            console.error('Neo API response data:', JSON.stringify(neoError.response.data));
          }
        }
        
        // Try another Neo API endpoint
        try {
          const neoAltResponse = await axios({
            method: 'POST',
            url: 'https://neo.character.ai/chat/history/create/',
            headers: this.getHeaders(),
            timeout: 15000, // 15 second timeout
            data: {
              character_id: characterId
            }
          });
          
          console.log('Character.AI neo alt create chat response status:', neoAltResponse.status);
          
          if (neoAltResponse.data && (neoAltResponse.data.chat_id || neoAltResponse.data.external_id)) {
            const chatId = neoAltResponse.data.chat_id || neoAltResponse.data.external_id;
            console.log(`Successfully created chat with ID: ${chatId} (Neo Alt HTTP API)`);
            
            return {
              chat: neoAltResponse.data,
              greeting: null
            };
          }
        } catch (neoAltError) {
          console.log(`Neo Alt HTTP API failed, trying legacy API: ${neoAltError.message}`);
          
          // Log the error details
          if (neoAltError.response) {
            console.error('Neo Alt API response status:', neoAltError.response.status);
            console.error('Neo Alt API response data:', JSON.stringify(neoAltError.response.data));
          }
        }
        
        // If Neo API fails, try the legacy API
        try {
          const legacyResponse = await axios({
            method: 'POST',
            url: `${this.baseUrl}/chat/history/create/`,
            headers: this.getHeaders(),
            timeout: 15000, // 15 second timeout
            data: {
              character_external_id: characterId,
              history_external_id: null
            }
          });
          
          console.log('Character.AI legacy create chat response status:', legacyResponse.status);
          
          if (legacyResponse.data && legacyResponse.data.external_id) {
            const chatId = legacyResponse.data.external_id;
            let greeting = null;
            
            // Try to get the greeting message if available
            if (legacyResponse.data.turns && legacyResponse.data.turns.length > 0) {
              greeting = legacyResponse.data.turns[0];
            }
            
            console.log(`Successfully created chat with ID: ${chatId} (Legacy HTTP API)`);
            
            return {
              chat: {
                ...legacyResponse.data,
                chat_id: chatId // Add WebSocket compatible chat_id
              },
              greeting: greeting
            };
          }
        } catch (legacyError) {
          console.error('Legacy API error:', legacyError.message);
          
          // Log the error details
          if (legacyError.response) {
            console.error('Legacy API response status:', legacyError.response.status);
            console.error('Legacy API response data:', JSON.stringify(legacyError.response.data));
          }
          
          throw legacyError; // Re-throw the error after logging
        }
        
        throw new Error('Failed to create chat using both WebSocket and HTTP methods');
      }
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