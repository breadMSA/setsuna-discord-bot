const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');

// Store active chats and WebSocket connections globally for persistence across instances
const activeChats = new Map();
let wsConnection = null;
let messageCallbacks = new Map();
let messageResponses = new Map();
let csrfToken = null;

/**
 * Character.AI API client implementation based on PyCharacterAI Python library
 */
class CharacterAI {
  constructor() {
    this.token = null;
    this.accountId = null;
    this.baseUrl = 'https://beta.character.ai';
    this.wsUrl = 'wss://beta.character.ai/ws/';
    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    };
    this.axiosInstance = axios.create({
      withCredentials: true,
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
      },
      maxRedirects: 5
    });
    // Store cookies between requests
    this.cookies = '';
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
    
    const headers = {...this.headers};
    
    // Add CSRF token if available
    if (csrfToken) {
      headers['x-csrftoken'] = csrfToken;
    }
    
    // Add important headers for CSRF protection
    headers['Referer'] = this.baseUrl;
    headers['Origin'] = this.baseUrl;
    
    // Add cookies if available
    if (this.cookies) {
      headers['Cookie'] = this.cookies;
    }
    
    return headers;
  }

  /**
   * Fetch CSRF token from Character.AI
   * @returns {Promise<string>} CSRF token
   */
  async fetchCsrfToken() {
    try {
      console.log('Fetching CSRF token from Character.AI...');
      
      // Create new axios instance with cookie jar for this request
      const requestInstance = axios.create({
        withCredentials: true,
        maxRedirects: 5,
        timeout: 30000,
        headers: {
          'User-Agent': this.headers['User-Agent']
        }
      });
      
      // First make a GET request to the main site to get cookies
      const response = await requestInstance.get(`${this.baseUrl}/`, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'max-age=0',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
        }
      });
      
      // Extract CSRF token from cookies or response
      const cookies = response.headers['set-cookie'];
      if (cookies) {
        console.log('Received cookies from Character.AI');
        
        // Store cookies for future requests
        this.cookies = cookies.join('; ');
        this.axiosInstance.defaults.headers.common['Cookie'] = this.cookies;
        
        for (const cookie of cookies) {
          const match = cookie.match(/csrftoken=([^;]+)/);
          if (match && match[1]) {
            csrfToken = match[1];
            console.log('Successfully retrieved CSRF token:', csrfToken.substring(0, 10) + '...');
            return csrfToken;
          }
        }
      }
      
      // Try to extract from HTML if cookies didn't work
      if (response.data && typeof response.data === 'string') {
        // Look for CSRF token in various formats
        const patterns = [
          /csrfmiddlewaretoken['"]\s+value=['"](.*?)['"]/,
          /csrfToken['"]:.*?['"](.*?)['"]/,
          /name="csrfmiddlewaretoken"\s+value="([^"]+)"/,
          /"csrfmiddlewaretoken":"([^"]+)"/,
          /\{"csrfmiddlewaretoken":"([^"]+)"\}/
        ];
        
        for (const pattern of patterns) {
          const match = response.data.match(pattern);
          if (match && match[1]) {
            csrfToken = match[1];
            console.log('Successfully extracted CSRF token from HTML:', csrfToken.substring(0, 10) + '...');
            return csrfToken;
          }
        }
      }
      
      // If we still don't have a token, try the neo/csrf endpoint
      console.log('Trying neo/csrf endpoint for CSRF token...');
      try {
        const csrfResponse = await requestInstance.get(`${this.baseUrl}/neo/csrf`, {
          headers: {
            'Accept': 'application/json',
            'Cookie': this.cookies
          }
        });
        
        if (csrfResponse.data && csrfResponse.data.token) {
          csrfToken = csrfResponse.data.token;
          console.log('Successfully retrieved CSRF token from neo/csrf endpoint:', csrfToken.substring(0, 10) + '...');
          return csrfToken;
        }
      } catch (csrfError) {
        console.log('Error fetching from neo/csrf endpoint:', csrfError.message);
      }
      
      console.log('Could not find CSRF token in response');
      return null;
    } catch (error) {
      console.error('Error fetching CSRF token:', error.message);
      return null;
    }
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
      
      // Make sure we have a CSRF token
      const token = await this.fetchCsrfToken();
      if (!token) {
        throw new Error('Failed to obtain CSRF token');
      }
      
      // Create a custom instance for this request
      const requestInstance = axios.create({
        withCredentials: true,
        maxRedirects: 5,
        timeout: 90000 // 90 second timeout
      });
      
      // Get base headers
      const headers = {
        'User-Agent': this.headers['User-Agent'],
        'Content-Type': 'application/json',
        'Authorization': `Token ${this.token}`,
        'X-CSRFToken': token,
        'Cookie': this.cookies,
        'Accept': 'application/json',
        'Referer': `${this.baseUrl}/chat?char=${characterId}`,
        'Origin': this.baseUrl
      };
      
      // Send using HTTP API - use streaming endpoint
      console.log('Using message API with CSRF token');
      const response = await requestInstance({
        method: 'POST',
        url: `${this.baseUrl}/chat/streaming/`,
        headers: headers,
        data: {
          history_external_id: chatId,
          character_external_id: characterId,
          text: text,
          tgt: characterId,
          ranking_method: 'random',
          staging: false,
          model_server_address: null,
          override_prefix: null,
          override_rank: null,
          inject_memories: null,
          streaming: false,
          request_id: requestId
        }
      });
      
      // Update cookies if they're in the response
      if (response.headers['set-cookie']) {
        this.cookies = response.headers['set-cookie'].join('; ');
        this.axiosInstance.defaults.headers.common['Cookie'] = this.cookies;
      }
      
      console.log('HTTP API response status:', response.status);
      
      // Convert HTTP response to WebSocket format
      if (response.data) {
        // Check for turn data format
        if (response.data.turn && response.data.turn.candidates && response.data.turn.candidates.length > 0) {
          return {
            command: 'update_turn',
            turn: response.data.turn
          };
        }
        
        // Check for message format
        if (response.data.message) {
          return {
            command: 'update_turn',
            turn: {
              turn_id: requestId,
              author: {
                name: "Character"
              },
              candidates: [{
                candidate_id: requestId,
                text: response.data.message,
                raw_content: response.data.message
              }]
            }
          };
        }
        
        // Check for replies format
        if (response.data.replies && response.data.replies.length > 0) {
          const reply = response.data.replies[0];
          return {
            command: 'update_turn',
            turn: {
              turn_id: reply.id || requestId,
              author: {
                name: reply.name || "Character"
              },
              candidates: [{
                candidate_id: reply.id || requestId,
                text: reply.text,
                raw_content: reply.text
              }]
            }
          };
        }
      }
      
      throw new Error('Invalid response from Character.AI API - missing turn data');
    } catch (error) {
      console.error('Error sending message via HTTP:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
        
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

      // Make sure we have a CSRF token
      const token = await this.fetchCsrfToken();
      if (!token) {
        throw new Error('Failed to obtain CSRF token');
      }

      console.log('Fetching account info from Character.AI...');
      
      // Create a custom instance for this request
      const requestInstance = axios.create({
        withCredentials: true,
        maxRedirects: 5,
        timeout: 10000 // 10 second timeout
      });
      
      // Get base headers
      const headers = {
        'User-Agent': this.headers['User-Agent'],
        'Content-Type': 'application/json',
        'Authorization': `Token ${this.token}`,
        'X-CSRFToken': token,
        'Cookie': this.cookies,
        'Accept': 'application/json',
        'Referer': `${this.baseUrl}/`,
        'Origin': this.baseUrl
      };
      
      const response = await requestInstance({
        method: 'GET',
        url: `${this.baseUrl}/chat/user/`,
        headers: headers
      });

      console.log('Character.AI user API response status:', response.status);
      
      // Update cookies if they're in the response
      if (response.headers['set-cookie']) {
        this.cookies = response.headers['set-cookie'].join('; ');
        this.axiosInstance.defaults.headers.common['Cookie'] = this.cookies;
      }
      
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

      // Make sure we have a CSRF token
      const token = await this.fetchCsrfToken();
      if (!token) {
        throw new Error('Failed to obtain CSRF token');
      }

      // Make sure we have the account ID
      if (!this.accountId) {
        await this.fetchMe();
      }

      console.log(`Creating new chat with character ${characterId}...`);
      
      // Create a custom instance for this request
      const requestInstance = axios.create({
        withCredentials: true,
        maxRedirects: 5,
        timeout: 15000 // 15 second timeout
      });
      
      // Get base headers
      const headers = {
        'User-Agent': this.headers['User-Agent'],
        'Content-Type': 'application/json',
        'Authorization': `Token ${this.token}`,
        'X-CSRFToken': token,
        'Cookie': this.cookies,
        'Accept': 'application/json',
        'Referer': `${this.baseUrl}/chat?char=${characterId}`,
        'Origin': this.baseUrl
      };
      
      const response = await requestInstance({
        method: 'POST',
        url: `${this.baseUrl}/chat/history/create/`,
        headers: headers,
        data: {
          character_external_id: characterId,
          history_external_id: null
        }
      });

      // Update cookies if they're in the response
      if (response.headers['set-cookie']) {
        this.cookies = response.headers['set-cookie'].join('; ');
        this.axiosInstance.defaults.headers.common['Cookie'] = this.cookies;
      }

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
        console.error('Response data:', error.response.data);
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

      // Make sure we have a CSRF token and fresh cookies
      const token = await this.fetchCsrfToken();
      if (!token) {
        throw new Error('Failed to obtain CSRF token');
      }

      if (!this.accountId) {
        await this.fetchMe();
      }

      console.log(`Sending message to character ${characterId} in chat ${chatId}...`);
      
      // Create request ID
      const requestId = uuidv4();
      
      // Create a custom instance for this request to ensure we have the latest cookies and CSRF token
      const requestInstance = axios.create({
        withCredentials: true,
        maxRedirects: 5,
        timeout: 90000 // 90 second timeout
      });
      
      // Get base headers
      const headers = {
        'User-Agent': this.headers['User-Agent'],
        'Content-Type': 'application/json',
        'Authorization': `Token ${this.token}`,
        'X-CSRFToken': token,
        'Cookie': this.cookies,
        'Accept': 'application/json',
        'Referer': `${this.baseUrl}/chat?char=${characterId}`,
        'Origin': this.baseUrl
      };
      
      console.log('Using message API with CSRF token');
      
      // Send the request
      const response = await requestInstance({
        method: 'POST',
        url: `${this.baseUrl}/chat/streaming/`,
        headers: headers,
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
        }
      });

      // Update cookies if they're in the response
      if (response.headers['set-cookie']) {
        this.cookies = response.headers['set-cookie'].join('; ');
        this.axiosInstance.defaults.headers.common['Cookie'] = this.cookies;
      }

      console.log('Character.AI HTTP API response status:', response.status);
      
      // Process the response - check for various possible response formats
      if (response.data) {
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
        
        // Check for raw text format
        if (response.data.text) {
          console.log('Got response from character (text format):', response.data.text.substring(0, 50) + '...');
          
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
        
        // Check for the new response format (message key)
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
        
        // Log the actual response structure to help with debugging
        console.log('Unexpected response format. Response keys:', Object.keys(response.data));
        if (Object.keys(response.data).length > 0) {
          // Try to extract any text content from the response
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
        }
      }

      throw new Error('Invalid response from Character.AI API - missing reply data');
    } catch (error) {
      console.error('Error sending message:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
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

      // Make sure we have a CSRF token
      const token = await this.fetchCsrfToken();
      if (!token) {
        throw new Error('Failed to obtain CSRF token');
      }

      // Create a custom instance for this request
      const requestInstance = axios.create({
        withCredentials: true,
        maxRedirects: 5,
        timeout: 10000 // 10 second timeout
      });
      
      // Get base headers
      const headers = {
        'User-Agent': this.headers['User-Agent'],
        'Content-Type': 'application/json',
        'Authorization': `Token ${this.token}`,
        'X-CSRFToken': token,
        'Cookie': this.cookies,
        'Accept': 'application/json',
        'Referer': `${this.baseUrl}/chat/history`,
        'Origin': this.baseUrl
      };

      const response = await requestInstance({
        method: 'GET',
        url: `${this.baseUrl}/chat/history/msgs/user/`,
        headers: headers,
        params: {
          history_external_id: chatId
        }
      });

      // Update cookies if they're in the response
      if (response.headers['set-cookie']) {
        this.cookies = response.headers['set-cookie'].join('; ');
        this.axiosInstance.defaults.headers.common['Cookie'] = this.cookies;
      }

      if (!response.data || !response.data.messages) {
        throw new Error('Invalid response from Character.AI API - missing messages');
      }

      return response.data.messages;
    } catch (error) {
      console.error('Error fetching messages:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
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

      // Make sure we have a CSRF token
      const token = await this.fetchCsrfToken();
      if (!token) {
        throw new Error('Failed to obtain CSRF token');
      }

      // Create a custom instance for this request
      const requestInstance = axios.create({
        withCredentials: true,
        maxRedirects: 5,
        timeout: 10000 // 10 second timeout
      });
      
      // Get base headers
      const headers = {
        'User-Agent': this.headers['User-Agent'],
        'Content-Type': 'application/json',
        'Authorization': `Token ${this.token}`,
        'X-CSRFToken': token,
        'Cookie': this.cookies,
        'Accept': 'application/json',
        'Referer': `${this.baseUrl}/chat?char=${characterId}`,
        'Origin': this.baseUrl
      };

      const response = await requestInstance({
        method: 'POST',
        url: `${this.baseUrl}/chat/character/info/`,
        headers: headers,
        data: {
          external_id: characterId
        }
      });

      // Update cookies if they're in the response
      if (response.headers['set-cookie']) {
        this.cookies = response.headers['set-cookie'].join('; ');
        this.axiosInstance.defaults.headers.common['Cookie'] = this.cookies;
      }

      if (!response.data || !response.data.character) {
        throw new Error('Invalid response from Character.AI API - missing character data');
      }

      return response.data.character;
    } catch (error) {
      console.error('Error fetching character info:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
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