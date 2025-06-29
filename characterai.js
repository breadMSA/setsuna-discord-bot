const axios = require('axios');

/**
 * Character.AI API client implementation
 * Based on the PyCharacterAI Python library
 */
class CharacterAI {
  constructor() {
    this.token = null;
    this.baseUrl = 'https://beta.character.ai';
    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    };
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
   * Create a new chat with a character
   * @param {string} characterId - Character ID to chat with
   * @returns {Promise<Object>} Chat object and optional greeting message
   */
  async createChat(characterId) {
    try {
      if (!this.token) {
        throw new Error('Token not set. Please call setToken() first.');
      }

      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/chat/history/create/`,
        headers: this.getHeaders(),
        data: {
          character_external_id: characterId,
          history_external_id: null,
        },
      });

      const chat = response.data;
      let greeting = null;

      // Get the greeting message if available
      if (chat.status === 'OK' && chat.turns && chat.turns.length > 0) {
        greeting = chat.turns[0];
      }

      return { chat, greeting };
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

      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/chat/streaming/`,
        headers: this.getHeaders(),
        data: {
          character_external_id: characterId,
          history_external_id: chatId,
          text: message,
          tgt: characterId,
        },
      });

      return this._processMessageResponse(response.data);
    } catch (error) {
      console.error('Error sending message:', error.message);
      throw error;
    }
  }

  /**
   * Process the message response from the API
   * @param {Object} data - API response data
   * @returns {Object} Processed turn object
   */
  _processMessageResponse(data) {
    if (!data || !data.turn) {
      throw new Error('Invalid response from Character.AI API');
    }

    return {
      turn_id: data.turn.turn_id,
      author_name: data.turn.author.name,
      text: data.turn.candidates[0].text,
      candidates: data.turn.candidates.map(candidate => ({
        candidate_id: candidate.candidate_id,
        text: candidate.text
      }))
    };
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
        url: `${this.baseUrl}/chat/history/msgs/user/?history_external_id=${chatId}`,
        headers: this.getHeaders(),
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
        url: `${this.baseUrl}/chat/character/info/`,
        headers: this.getHeaders(),
        params: {
          external_id: characterId
        }
      });

      return response.data.character;
    } catch (error) {
      console.error('Error fetching character info:', error.message);
      throw error;
    }
  }
}

module.exports = CharacterAI; 