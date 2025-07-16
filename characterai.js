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
    // Use Firefox 135 user agent as in the Python implementation
    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
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
    
    // Based on the Python implementation, they use:
    // impersonate="firefox135" for the user agent
    // and HTTP_AUTHORIZATION cookie for authentication
    return {
      'Content-Type': 'application/json',
      'Authorization': `Token ${this.token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
      'Accept': 'application/json',
      'Origin': 'https://character.ai',
      'Referer': 'https://character.ai/',
      'Cookie': `HTTP_AUTHORIZATION=Token ${this.token}`
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
      
      // Try multiple authentication approaches
      // First, try with HTTP_AUTHORIZATION cookie (Python implementation)
      const tryConnection = (options, attempt = 1, url = this.wsUrl) => {
        console.log(`WebSocket connection attempt ${attempt} with options:`, JSON.stringify(options));
        
        const ws = new WebSocket(url, options);
        
        const connectionTimeout = setTimeout(() => {
          console.log(`WebSocket connection attempt ${attempt} timed out`);
          ws.terminate();
          
          // Try next approach if this one fails
          if (attempt === 1) {
            // Second attempt: Try with Authorization cookie
            tryConnection({
              headers: {
                'Cookie': `Authorization=Token ${this.token}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
                'Origin': 'https://character.ai',
                'Referer': 'https://character.ai/'
              }
            }, 2);
          } else if (attempt === 2) {
            // Third attempt: Try with token in URL
            const wsUrlWithToken = `${this.wsUrl}?token=${this.token}`;
            console.log(`Connecting to WebSocket with token in URL: ${wsUrlWithToken.substring(0, 40)}...`);
            
            tryConnection({
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
                'Origin': 'https://character.ai',
                'Referer': 'https://character.ai/'
              }
            }, 3, wsUrlWithToken);
          } else {
            // All attempts failed
            reject(new Error('All WebSocket connection attempts failed'));
          }
        }, 10000);
        
        ws.on('open', () => {
          clearTimeout(connectionTimeout);
          console.log(`WebSocket connection established on attempt ${attempt}`);
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
          clearTimeout(connectionTimeout);
          console.error(`WebSocket connection error on attempt ${attempt}:`, error.message);
          
          // Try next approach if this one fails
          if (attempt === 1) {
            // Second attempt: Try with Authorization cookie
            tryConnection({
              headers: {
                'Cookie': `Authorization=Token ${this.token}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
                'Origin': 'https://character.ai',
                'Referer': 'https://character.ai/'
              }
            }, 2);
          } else if (attempt === 2) {
            // Third attempt: Try with token in URL
            const wsUrlWithToken = `${this.wsUrl}?token=${this.token}`;
            console.log(`Connecting to WebSocket with token in URL: ${wsUrlWithToken.substring(0, 40)}...`);
            
            tryConnection({
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
                'Origin': 'https://character.ai',
                'Referer': 'https://character.ai/'
              }
            }, 3, wsUrlWithToken);
          } else {
            // All attempts failed
            reject(error);
          }
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
      };
      
      // Start with first attempt - HTTP_AUTHORIZATION cookie
      tryConnection({
        headers: {
          'Cookie': `HTTP_AUTHORIZATION=Token ${this.token}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
          'Origin': 'https://character.ai',
          'Referer': 'https://character.ai/'
        }
      }, 1, this.wsUrl);
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
        console.log('Full user response data:', JSON.stringify(response.data, null, 2));
        
        // Try multiple possible paths for account ID
        if (response.data && response.data.user) {
          // Try different paths to find the account ID
          if (response.data.user.id) {
            this.accountId = response.data.user.id;
            console.log('Successfully retrieved account ID (path: user.id):', this.accountId);
            return response.data.user;
          } else if (response.data.user.user && response.data.user.user.id) {
            this.accountId = response.data.user.user.id;
            console.log('Successfully retrieved account ID (path: user.user.id):', this.accountId);
            return response.data.user.user;
          } else if (response.data.user.user_id) {
            this.accountId = response.data.user.user_id;
            console.log('Successfully retrieved account ID (path: user.user_id):', this.accountId);
            return response.data.user;
          } else if (response.data.user.user && response.data.user.user.user_id) {
            this.accountId = response.data.user.user.user_id;
            console.log('Successfully retrieved account ID (path: user.user.user_id):', this.accountId);
            return response.data.user.user;
          }
          
          // If we couldn't find the ID in the expected paths, log the structure and try a fallback
          console.log('Could not find account ID in expected paths. User object structure:', 
                     JSON.stringify(response.data.user, null, 2));
        }
        
        if (response.data && response.data.status === "OK" && response.data.user_id) {
          // Alternative response format
          this.accountId = response.data.user_id;
          console.log('Successfully retrieved account ID (alternative format):', this.accountId);
          return response.data;
        }
      } catch (primaryError) {
        console.log(`Primary user API failed: ${primaryError.message}, trying neo API...`);
        if (primaryError.response) {
          console.log('Primary API error response:', JSON.stringify(primaryError.response.data, null, 2));
        }
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
        console.log('Full neo user response data:', JSON.stringify(neoResponse.data, null, 2));
        
        if (neoResponse.data && neoResponse.data.user && neoResponse.data.user.user_id) {
          this.accountId = neoResponse.data.user.user_id;
          console.log('Successfully retrieved account ID from neo API:', this.accountId);
          return neoResponse.data.user;
        }
        
        // Try additional paths
        if (neoResponse.data && neoResponse.data.user) {
          if (neoResponse.data.user.id) {
            this.accountId = neoResponse.data.user.id;
            console.log('Successfully retrieved account ID from neo API (path: user.id):', this.accountId);
            return neoResponse.data.user;
          }
        }
        
        // If user object exists but no ID found, log the structure
        if (neoResponse.data && neoResponse.data.user) {
          console.log('Neo API user object structure:', JSON.stringify(neoResponse.data.user, null, 2));
        }
      } catch (neoError) {
        console.log(`Neo user API failed: ${neoError.message}`);
        if (neoError.response) {
          console.log('Neo API error response:', JSON.stringify(neoError.response.data, null, 2));
        }
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
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
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
        
        // Format the WebSocket message exactly like the Python implementation
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
          }
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
              
              // Check if the response is for our request or is a relevant command
              // The Python implementation doesn't check request_id for certain commands
              if (response.command === 'neo_error') {
                const errorComment = response.comment || '';
                cleanup();
                reject(new Error(`Character.AI API error: ${errorComment}`));
                return;
              }
              
              if (response.command === 'create_chat_response') {
                newChat = response.chat;
                console.log('Received create_chat_response:', JSON.stringify(newChat));
                
                // If we're not expecting a greeting, resolve now
                if (!createChatMessage.payload.with_greeting) {
                  cleanup();
                  resolve({ 
                    chat: newChat,
                    greeting: null
                  });
                  return;
                }
                
                // Otherwise, wait for the greeting turn
                return;
              }
              
              if (response.command === 'add_turn') {
                greetingTurn = response.turn;
                console.log('Received greeting turn');
                
                // We have both the chat and greeting, resolve
                if (newChat) {
                  cleanup();
                  resolve({ 
                    chat: newChat,
                    greeting: greetingTurn
                  });
                  return;
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
        // WebSocket method failed, try direct HTTP API calls
        console.log(`WebSocket chat creation failed: ${wsError.message}`);
        return await this.createChatWithHTTP(characterId);
      }
    } catch (error) {
      console.error('Error creating chat:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  /**
   * Create a chat using direct HTTP API calls
   * @param {string} characterId - Character ID to chat with
   * @returns {Promise<Object>} Chat object
   */
  async createChatWithHTTP(characterId) {
    console.log('Attempting to create chat using direct HTTP API calls...');
    
    // Try multiple API endpoints
    const endpoints = [
      {
        url: 'https://beta.character.ai/chat/history/create/',
        method: 'POST',
        data: { character_external_id: characterId, history_external_id: null },
        name: 'Beta API'
      },
      {
        url: 'https://neo.character.ai/chat/',
        method: 'POST',
        data: { character_id: characterId },
        name: 'Neo API'
      },
      {
        url: 'https://neo.character.ai/chat/history/create/',
        method: 'POST',
        data: { character_id: characterId },
        name: 'Neo History API'
      },
      {
        url: `${this.baseUrl}/chat/history/create/`,
        method: 'POST',
        data: { character_external_id: characterId, history_external_id: null },
        name: 'Legacy API'
      }
    ];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`Trying ${endpoint.name} at ${endpoint.url}...`);
        const response = await axios({
          method: endpoint.method,
          url: endpoint.url,
          headers: this.getHeaders(),
          timeout: 15000, // 15 second timeout
          data: endpoint.data
        });
        
        console.log(`${endpoint.name} response status:`, response.status);
        console.log(`${endpoint.name} response data:`, JSON.stringify(response.data, null, 2));
        
        // Extract chat ID from various possible formats
        let chatId = null;
        let chat = null;
        
        if (response.data) {
          // Neo API format
          if (response.data.chat && response.data.chat.chat_id) {
            chatId = response.data.chat.chat_id;
            chat = response.data.chat;
          } 
          // Legacy API format
          else if (response.data.external_id) {
            chatId = response.data.external_id;
            chat = {
              ...response.data,
              chat_id: response.data.external_id
            };
          }
          // Other possible formats
          else if (response.data.chat_id) {
            chatId = response.data.chat_id;
            chat = response.data;
          } else if (response.data.id) {
            chatId = response.data.id;
            chat = response.data;
          }
          
          // If we found a chat ID, return it
          if (chatId) {
            console.log(`Successfully created chat with ID: ${chatId} using ${endpoint.name}`);
            return { 
              chat: chat,
              greeting: null // Direct API calls don't usually return greetings
            };
          }
        }
        
        console.log(`${endpoint.name} response did not contain a valid chat ID`);
      } catch (error) {
        console.log(`${endpoint.name} failed:`, error.message);
        if (error.response) {
          console.log(`${endpoint.name} error status:`, error.response.status);
          console.log(`${endpoint.name} error data:`, JSON.stringify(error.response.data, null, 2));
        }
      }
    }
    
    throw new Error('All HTTP API endpoints failed to create a chat');
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

  /**
   * Get chat ID from a Character.AI URL hist parameter
   * @param {string} histId - The hist parameter from a Character.AI URL
   * @returns {Promise<string>} The chat ID to use with the API
   */
  async getChatIdFromHistId(histId) {
    try {
      if (!this.token) {
        throw new Error('Token not set. Please call setToken() first.');
      }

      console.log(`Trying to get chat ID from hist ID: ${histId}`);
      
      // Try to get the chat directly from the neo API
      try {
        const response = await axios({
          method: 'GET',
          url: `https://neo.character.ai/chat/history/${histId}/`,
          headers: this.getHeaders(),
          timeout: 10000 // 10 second timeout
        });

        console.log('Character.AI get chat by hist ID response status:', response.status);
        
        if (response.data && response.data.chat_id) {
          console.log(`Successfully retrieved chat ID: ${response.data.chat_id} from hist ID`);
          return response.data.chat_id;
        }
      } catch (error) {
        console.log(`Error getting chat by hist ID: ${error.message}`);
      }
      
      // If the neo API fails, just use the hist ID directly
      return histId;
    } catch (error) {
      console.error('Error getting chat ID from hist ID:', error.message);
      return histId; // Fall back to using the hist ID directly
    }
  }
}

module.exports = CharacterAI; 