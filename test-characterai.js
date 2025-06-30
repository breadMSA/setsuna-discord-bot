require('dotenv').config();
const CharacterAI = require('./characterai');

// Create a unique channel ID for testing
const channelId = `test-channel-${Date.now()}`;
const characterId = process.env.CHARACTERAI_CHARACTER_ID || 'K3AmsNVVJaTsy8k7J8cFLi_U6-lpnjqiwRbt29ptJWQ';

async function testCharacterAI() {
  try {
    console.log('Starting Character.AI test...');
    console.log(`Using character ID: ${characterId}`);
    console.log(`Using test channel ID: ${channelId}`);
    
    const token = process.env.CHARACTERAI_TOKEN;
    if (!token) {
      console.error('No Character.AI token found in .env file');
      console.error('Please add CHARACTERAI_TOKEN=your_token to your .env file');
      process.exit(1);
    }
    
    // Initialize the client
    const characterAI = new CharacterAI();
    characterAI.setToken(token);
    
    // Get account info
    console.log('Fetching account info...');
    const accountInfo = await characterAI.fetchMe();
    console.log('Account info:', accountInfo ? 'Success' : 'Failed');
    
    // Send a test message
    console.log('Sending test message...');
    const response = await characterAI.sendMessage(
      characterId,
      channelId,
      "Hello! This is a test message. Can you respond with a short greeting?"
    );
    
    console.log('\nResponse from Character.AI:');
    console.log('--------------------------');
    console.log(response.text);
    console.log('--------------------------');
    
    // Test continuity by sending a second message
    console.log('\nSending a follow-up message to test chat continuity...');
    const response2 = await characterAI.sendMessage(
      characterId,
      channelId,
      "What's your name and what do you like to do?"
    );
    
    console.log('\nSecond response from Character.AI:');
    console.log('--------------------------');
    console.log(response2.text);
    console.log('--------------------------');
    
    // Check that we have an active chat stored for this channel
    if (characterAI.activeChats.has(channelId)) {
      const chatInfo = characterAI.activeChats.get(channelId);
      console.log(`\nVerified: Active chat found for channel ${channelId}`);
      console.log(`Chat ID: ${chatInfo.chatId}`);
    } else {
      console.error('\nError: No active chat found for the test channel!');
    }
    
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Test failed with error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data).substring(0, 500));
    }
  }
}

testCharacterAI(); 