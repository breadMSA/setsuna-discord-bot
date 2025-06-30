require('dotenv').config();
const CharacterAI = require('./characterai');

// Get token from environment variables
const CHARACTERAI_TOKEN = process.env.CHARACTERAI_TOKEN;
const CHARACTERAI_CHARACTER_ID = process.env.CHARACTERAI_CHARACTER_ID || 'K3AmsNVVJaTsy8k7J8cFLi_U6-lpnjqiwRbt29ptJWQ'; // Default to a character ID

async function testCharacterAI() {
  try {
    console.log('Starting CharacterAI test...');
    
    // Check if token exists
    if (!CHARACTERAI_TOKEN) {
      console.error('ERROR: CHARACTERAI_TOKEN is not set in .env file');
      console.error('Please add your Character.AI token to your .env file as CHARACTERAI_TOKEN=your_token_here');
      return;
    }
    
    // Initialize client
    const client = new CharacterAI();
    
    // Set token
    console.log(`Using token: ${CHARACTERAI_TOKEN.substring(0, 5)}...`);
    client.setToken(CHARACTERAI_TOKEN);
    
    // Fetch account info
    console.log('Fetching account info...');
    const accountInfo = await client.fetchMe();
    console.log('Account info:', accountInfo);
    
    // Create a new chat
    console.log(`Creating chat with character ${CHARACTERAI_CHARACTER_ID}...`);
    const chatResult = await client.createChat(CHARACTERAI_CHARACTER_ID);
    console.log('Chat created:', chatResult);
    
    // Send a message
    const chatId = chatResult.external_id || chatResult.chat_id;
    console.log(`Sending message to chat ${chatId}...`);
    const response = await client.sendMessage(CHARACTERAI_CHARACTER_ID, chatId, 'Hello, how are you today?');
    console.log('Response:', response);
    
    // Send a second message to test continuity
    console.log('Sending a follow-up message...');
    const response2 = await client.sendMessage(CHARACTERAI_CHARACTER_ID, chatId, 'What do you like to do for fun?');
    console.log('Second response:', response2);
    
    // Fetch message history
    console.log('Fetching message history...');
    const messages = await client.fetchMessages(chatId);
    console.log(`Retrieved ${messages.length} messages`);
    
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Error in test:', error);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

// Run the test
testCharacterAI(); 