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

      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl}/api/v1/user/me`,
        headers: this.getHeaders(),
      });

      if (response.data && response.data.user) {
        this.accountId = response.data.user.user_id;
        return response.data.user;
      }

      throw new Error('Failed to fetch account information');
    } catch (error) {
      console.error('Error fetching account info:', error.message);
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

      if (!this.accountId) {
        await this.fetchMe();
      }

      const chatId = uuidv4();
      const requestId = uuidv4();

      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/api/v1/chat/create`,
        headers: this.getHeaders(),
        data: {
          request_id: requestId,
          command: "create_chat",
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
        }
      });

      if (response.data && response.data.chat) {
        let greeting = null;
        
        // Try to get the greeting message if available
        if (response.data.turns && response.data.turns.length > 0) {
          greeting = response.data.turns[0];
        }

        return { 
          chat: response.data.chat, 
          greeting: greeting 
        };
      }

      throw new Error('Failed to create chat');
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

      const turnId = uuidv4();
      const candidateId = uuidv4();
      const requestId = uuidv4();

      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/api/v1/chat/streaming/`,
        headers: this.getHeaders(),
        data: {
          command: "create_and_generate_turn",
          origin_id: "web-next",
          request_id: requestId,
          payload: {
            character_id: characterId,
            num_candidates: 1,
            turn: {
              author: {
                author_id: this.accountId,
                is_human: true,
                name: ""
              },
              candidates: [
                {
                  candidate_id: candidateId,
                  raw_content: message
                }
              ],
              primary_candidate_id: candidateId,
              turn_key: {
                chat_id: chatId,
                turn_id: turnId
              }
            },
            tts_enabled: false,
            selected_language: ""
          }
        }
      });

      // For streaming responses, we'd need to parse differently
      // For now, we'll handle the non-streaming response
      if (response.data && response.data.turn) {
        return {
          turn_id: response.data.turn.turn_id,
          author_name: response.data.turn.author.name || "Character",
          text: response.data.turn.candidates[0].text || response.data.turn.candidates[0].raw_content,
          candidates: response.data.turn.candidates.map(candidate => ({
            candidate_id: candidate.candidate_id,
            text: candidate.text || candidate.raw_content
          }))
        };
      }

      throw new Error('Invalid response from Character.AI API');
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
        url: `${this.baseUrl}/api/v1/chat/history/msgs/user/`,
        headers: this.getHeaders(),
        params: {
          history_external_id: chatId
        }
      });

      if (!response.data || !response.data.messages) {
        throw new Error('Invalid response from Character.AI API');
      }

      return response.data.messages;
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

      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl}/api/v1/characters/${characterId}`,
        headers: this.getHeaders()
      });

      if (!response.data || !response.data.character) {
        throw new Error('Invalid response from Character.AI API');
      }

      return response.data.character;
    } catch (error) {
      console.error('Error fetching character info:', error.message);
      throw error;
    }
  }
}

module.exports = CharacterAI; 