const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Store active chats globally for persistence across instances
const activeChats = new Map();

/**
 * Character.AI API client implementation
 */
class CharacterAI {
  constructor() {
    this.token = null;
    this.accountId = null;
    this.baseUrl = 'https://beta.character.ai';
    this.neoBaseUrl = 'https://neo.character.ai';
    this.plusBaseUrl = 'https://plus.character.ai';
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36';
    
    // Initialize axios instance with default settings
    this.axiosInstance = axios.create({
      withCredentials: true,
      timeout: 30000,
      headers: {
        'User-Agent': this.userAgent,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      maxRedirects: 5
    });
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
    this.axiosInstance.defaults.headers.common['Authorization'] = `Token ${token}`;
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
      'Authorization': `Token ${this.token}`,
      'Content-Type': 'application/json'
    };
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
      
      const response = await this.axiosInstance({
        method: 'GET',
        url: `${this.plusBaseUrl}/chat/user/`,
        headers: this.getHeaders()
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
        console.error('Response data:', error.response.data);
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
      
      // First let's try using the plus API
      try {
        const response = await this.axiosInstance({
          method: 'POST',
          url: `${this.plusBaseUrl}/chat/history/create/`,
          headers: this.getHeaders(),
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
          
          // Store in active chats
          this.activeChats.set(chatId, {
            characterId,
            chatId
          });
          
          return { 
            chat: {
              chat_id: chatId,
              external_id: chatId,
              character_id: characterId
            }, 
            greeting: greeting 
          };
        }
      } catch (error) {
        console.error('Error using plus API to create chat:', error.message);
        // Continue to try the neo API
      }
      
      // If plus API fails, try the neo API
      try {
        const chatId = uuidv4();
        
        const response = await this.axiosInstance({
          method: 'POST',
          url: `${this.neoBaseUrl}/chat/`,
          headers: this.getHeaders(),
          data: {
            character_id: characterId,
            chat_id: chatId
          }
        });
        
        console.log('Neo API create chat response status:', response.status);
        
        if (response.data && response.data.chat) {
          console.log(`Successfully created chat with ID: ${chatId} using Neo API`);
          
          // Store in active chats
          this.activeChats.set(chatId, {
            characterId,
            chatId
          });
          
          return {
            chat: {
              chat_id: chatId,
              external_id: chatId,
              character_id: characterId
            },
            greeting: null // Neo API doesn't return a greeting
          };
        }
      } catch (error) {
        console.error('Error using neo API to create chat:', error.message);
      }

      throw new Error('Failed to create chat - both APIs failed');
    } catch (error) {
      console.error('Error creating chat:', error.message);
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
      
      // First try the streaming API
      try {
        const requestId = uuidv4();
        
        const response = await this.axiosInstance({
          method: 'POST',
          url: `${this.baseUrl}/chat/streaming/`,
          headers: this.getHeaders(),
          data: {
            history_external_id: chatId,
            character_external_id: characterId,
            text: message,
            tgt: characterId,
            ranking_method: 'random',
            staging: false,
            model_server_address: null,
            override_prefix: null,
            override_rank: null,
            inject_memories: null,
            streaming: false,
            request_id: requestId
          },
          timeout: 90000 // 90 second timeout
        });
        
        console.log('Streaming API response status:', response.status);
        console.log('Response data keys:', Object.keys(response.data || {}));
        
        // Log the response data for debugging
        if (response.data) {
          const responseStr = JSON.stringify(response.data).substring(0, 500); // Log first 500 chars only
          console.log('Response data (partial):', responseStr);
        }
        
        // Process the response
        if (response.data) {
          // If we have a valid turn response
          if (response.data.status === 200 && response.data.turns && response.data.turns.length > 0) {
            const turn = response.data.turns[0];
            console.log('Got response from character (turns format):', turn.text.substring(0, 50) + '...');
            
            return {
              turn_id: turn.id || requestId,
              author_name: turn.name || "Character",
              text: turn.text || '',
              candidates: [{
                candidate_id: turn.id || requestId,
                text: turn.text || ''
              }],
              get_primary_candidate() {
                return this.candidates[0];
              }
            };
          }
          
          // Check for turn data format
          if (response.data.turn && response.data.turn.candidates && response.data.turn.candidates.length > 0) {
            const candidate = response.data.turn.candidates[0];
            console.log('Got response from character (turn format):', (candidate.text || candidate.raw_content || '').substring(0, 50) + '...');
            
            return {
              turn_id: response.data.turn.turn_id || candidate.candidate_id || requestId,
              author_name: response.data.turn.author?.name || "Character",
              text: candidate.text || candidate.raw_content || '',
              candidates: response.data.turn.candidates.map(c => ({
                candidate_id: c.candidate_id || requestId,
                text: c.text || c.raw_content || ''
              })),
              get_primary_candidate() {
                return this.candidates[0];
              }
            };
          }
          
          // Check for message format
          if (response.data.message) {
            console.log('Got response from character (message format):', response.data.message.substring(0, 50) + '...');
            
            return {
              turn_id: requestId,
              author_name: "Character",
              text: response.data.message,
              candidates: [{
                candidate_id: requestId,
                text: response.data.message
              }],
              get_primary_candidate() {
                return this.candidates[0];
              }
            };
          }
          
          // Check for replies format
          if (response.data.replies && response.data.replies.length > 0) {
            const reply = response.data.replies[0];
            console.log('Got response from character (replies format):', (reply.text || '').substring(0, 50) + '...');
            
            return {
              turn_id: reply.id || requestId,
              author_name: reply.name || "Character",
              text: reply.text || '',
              candidates: [{
                candidate_id: reply.id || requestId,
                text: reply.text || ''
              }],
              get_primary_candidate() {
                return this.candidates[0];
              }
            };
          }
          
          // Check for text property directly in response
          if (response.data.text) {
            console.log('Got response from character (direct text):', response.data.text.substring(0, 50) + '...');
            
            return {
              turn_id: requestId,
              author_name: "Character",
              text: response.data.text,
              candidates: [{
                candidate_id: requestId,
                text: response.data.text
              }],
              get_primary_candidate() {
                return this.candidates[0];
              }
            };
          }
          
          // Check for any response field that might contain text
          const responseStr = JSON.stringify(response.data);
          const textMatch = responseStr.match(/"text"\s*:\s*"([^"]+)"/);
          if (textMatch && textMatch[1]) {
            console.log('Found text content in response:', textMatch[1].substring(0, 50) + '...');
            
            return {
              turn_id: requestId,
              author_name: "Character",
              text: textMatch[1],
              candidates: [{
                candidate_id: requestId,
                text: textMatch[1]
              }],
              get_primary_candidate() {
                return this.candidates[0];
              }
            };
          }
          
          // If the streaming API returned successful but we couldn't parse the response,
          // we'll try a different approach
          if (response.status === 200) {
            console.log('Streaming API returned success but in unexpected format, trying legacy API...');
          }
        }
      } catch (error) {
        console.error('Error using streaming API:', error.message);
        if (error.response && error.response.data) {
          console.log('Streaming API error response:', JSON.stringify(error.response.data).substring(0, 200));
        }
        // Fall through to try the message API
      }
      
      // If streaming API fails, try the message API
      try {
        const response = await this.axiosInstance({
          method: 'POST',
          url: `${this.baseUrl}/chat/message/`,
          headers: this.getHeaders(),
          data: {
            history_external_id: chatId,
            character_external_id: characterId,
            text: message
          },
          timeout: 90000 // 90 second timeout
        });
        
        console.log('Message API response status:', response.status);
        
        if (response.data) {
          console.log('Message API response keys:', Object.keys(response.data));
          
          if (response.data.replies && response.data.replies.length > 0) {
            const reply = response.data.replies[0];
            console.log('Got response from character (message API):', (reply.text || '').substring(0, 50) + '...');
            
            return {
              turn_id: reply.id || uuidv4(),
              author_name: reply.name || "Character",
              text: reply.text || '',
              candidates: [{
                candidate_id: reply.id || uuidv4(),
                text: reply.text || ''
              }],
              get_primary_candidate() {
                return this.candidates[0];
              }
            };
          }
          
          // Try other response formats
          if (response.data.text) {
            console.log('Got text from message API:', response.data.text.substring(0, 50) + '...');
            
            return {
              turn_id: uuidv4(),
              author_name: "Character",
              text: response.data.text,
              candidates: [{
                candidate_id: uuidv4(),
                text: response.data.text
              }],
              get_primary_candidate() {
                return this.candidates[0];
              }
            };
          }
        }
      } catch (error) {
        console.error('Error using message API:', error.message);
        if (error.response && error.response.data) {
          console.log('Message API error response:', JSON.stringify(error.response.data).substring(0, 200));
        }
      }
      
      // Try the legacy turn API
      try {
        const response = await this.axiosInstance({
          method: 'POST',
          url: `${this.baseUrl}/chat/history/msgs/user/`,
          headers: this.getHeaders(),
          data: {
            history_external_id: chatId,
            text: message,
            tgt: characterId
          },
          timeout: 90000 // 90 second timeout
        });
        
        console.log('Legacy API response status:', response.status);
        
        if (response.data && response.data.replies && response.data.replies.length > 0) {
          const reply = response.data.replies[0];
          console.log('Got response from character (legacy API):', (reply.text || '').substring(0, 50) + '...');
          
          return {
            turn_id: reply.id || uuidv4(),
            author_name: reply.name || "Character",
            text: reply.text || '',
            candidates: [{
              candidate_id: reply.id || uuidv4(),
              text: reply.text || ''
            }],
            get_primary_candidate() {
              return this.candidates[0];
            }
          };
        }
      } catch (error) {
        console.error('Error using legacy API:', error.message);
        if (error.response && error.response.data) {
          console.log('Legacy API error response:', JSON.stringify(error.response.data).substring(0, 200));
        }
      }
      
      // Try the REST-based neo API approach (similar to PyCharacterAI)
      try {
        const turnId = uuidv4();
        const candidateId = uuidv4();
        
        // First create a user turn using the REST API
        const createTurnResponse = await this.axiosInstance({
          method: 'POST',
          url: `${this.neoBaseUrl}/turns/${chatId}/`,
          headers: this.getHeaders(),
          data: {
            turn_key: {
              chat_id: chatId,
              turn_id: turnId
            },
            author: {
              author_id: this.accountId,
              is_human: true
            },
            candidates: [{
              candidate_id: candidateId,
              raw_content: message
            }],
            primary_candidate_id: candidateId
          },
          timeout: 30000 // 30 second timeout
        });
        
        console.log('Neo REST API create turn response status:', createTurnResponse.status);
        
        if (createTurnResponse.status === 200) {
          // Now generate the AI response
          const generateResponse = await this.axiosInstance({
            method: 'POST',
            url: `${this.neoBaseUrl}/generate-turn/`,
            headers: this.getHeaders(),
            data: {
              character_id: characterId,
              turn_key: {
                chat_id: chatId,
                turn_id: turnId
              }
            },
            timeout: 90000 // 90 second timeout
          });
          
          console.log('Neo REST API generate response status:', generateResponse.status);
          
          if (generateResponse.data && generateResponse.data.turn) {
            const turn = generateResponse.data.turn;
            console.log('Got response from character (neo REST API):', (turn.candidates[0]?.raw_content || '').substring(0, 50) + '...');
            
            return {
              turn_id: turn.turn_key?.turn_id || uuidv4(),
              author_name: turn.author?.name || "Character",
              text: turn.candidates[0]?.raw_content || '',
              candidates: turn.candidates?.map(c => ({
                candidate_id: c.candidate_id,
                text: c.raw_content || ''
              })) || [],
              get_primary_candidate() {
                return this.candidates[0];
              }
            };
          }
        }
      } catch (error) {
        console.error('Error using neo REST API:', error.message);
        if (error.response && error.response.data) {
          console.log('Neo REST API error response:', JSON.stringify(error.response.data).substring(0, 200));
        }
      }
      
      // If both fail, try the neo API with WebSocket-style polling
      try {
        const turnId = uuidv4();
        const candidateId = uuidv4();
        
        // First create a user turn
        await this.axiosInstance({
          method: 'POST',
          url: `${this.neoBaseUrl}/turns/${chatId}/`,
          headers: this.getHeaders(),
          data: {
            turn_key: {
              chat_id: chatId,
              turn_id: turnId
            },
            author: {
              author_id: this.accountId,
              is_human: true
            },
            candidates: [{
              candidate_id: candidateId,
              raw_content: message
            }],
            primary_candidate_id: candidateId
          }
        });
        
        // Then wait for the AI response
        const responseStart = Date.now();
        const maxWaitTime = 90000; // 90 seconds
        
        while (Date.now() - responseStart < maxWaitTime) {
          // Wait a bit before checking for response
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Check for new turns
          const turnsResponse = await this.axiosInstance({
            method: 'GET',
            url: `${this.neoBaseUrl}/turns/${chatId}/`,
            headers: this.getHeaders()
          });
          
          if (turnsResponse.data && turnsResponse.data.turns) {
            // Look for the AI response after our turn
            let foundUserTurn = false;
            for (const turn of turnsResponse.data.turns) {
              if (turn.turn_key && turn.turn_key.turn_id === turnId) {
                foundUserTurn = true;
                continue;
              }
              
              if (foundUserTurn && turn.author && !turn.author.is_human) {
                // This is the AI response
                console.log('Got response from character (neo API)');
                
                return {
                  turn_id: turn.turn_key.turn_id,
                  author_name: turn.author?.name || "Character",
                  text: turn.candidates[0]?.raw_content || '',
                  candidates: turn.candidates.map(c => ({
                    candidate_id: c.candidate_id,
                    text: c.raw_content || ''
                  })),
                  get_primary_candidate() {
                    return this.candidates[0];
                  }
                };
              }
            }
          }
        }
        
        throw new Error('Timed out waiting for AI response');
      } catch (error) {
        console.error('Error using neo API:', error.message);
        if (error.response && error.response.data) {
          console.log('Neo API error response:', JSON.stringify(error.response.data).substring(0, 200));
        }
      }

      throw new Error('Failed to send message - all APIs failed');
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

      // First try the neo API
      try {
        const response = await this.axiosInstance({
          method: 'GET',
          url: `${this.neoBaseUrl}/turns/${chatId}/`,
          headers: this.getHeaders()
        });

        if (response.data && response.data.turns) {
          return response.data.turns;
        }
      } catch (error) {
        console.error('Error using neo API to fetch messages:', error.message);
      }
      
      // If neo API fails, try the plus API
      try {
        const response = await this.axiosInstance({
          method: 'GET',
          url: `${this.plusBaseUrl}/chat/history/msgs/user/`,
          headers: this.getHeaders(),
          params: {
            history_external_id: chatId
          }
        });

        if (response.data && response.data.messages) {
          return response.data.messages;
        }
      } catch (error) {
        console.error('Error using plus API to fetch messages:', error.message);
      }

      throw new Error('Failed to fetch messages - both APIs failed');
    } catch (error) {
      console.error('Error fetching messages:', error.message);
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

      // First try the neo API
      try {
        const response = await this.axiosInstance({
          method: 'GET',
          url: `${this.neoBaseUrl}/characters/${characterId}/`,
          headers: this.getHeaders()
        });

        if (response.data && response.data.character) {
          return response.data.character;
        }
      } catch (error) {
        console.error('Error using neo API to fetch character info:', error.message);
      }
      
      // If neo API fails, try the plus API
      try {
        const response = await this.axiosInstance({
          method: 'POST',
          url: `${this.plusBaseUrl}/chat/character/info/`,
          headers: this.getHeaders(),
          data: {
            external_id: characterId
          }
        });

        if (response.data && response.data.character) {
          return response.data.character;
        }
      } catch (error) {
        console.error('Error using plus API to fetch character info:', error.message);
      }

      throw new Error('Failed to fetch character info - both APIs failed');
    } catch (error) {
      console.error('Error fetching character info:', error.message);
      throw error;
    }
  }
}

module.exports = CharacterAI; 