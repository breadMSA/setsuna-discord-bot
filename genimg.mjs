import { GoogleGenAI, Modality } from "@google/genai";

// 在 Railway 平台上，環境變數直接從平台設置獲取
// 不需要讀取 .env 文件

// 解析命令行參數
let apiKeyFromArg = null;
let imageUrlFromArg = null;
let promptArgs = [];

process.argv.slice(2).forEach(arg => {
  if (arg.startsWith('--api-key=')) {
    apiKeyFromArg = arg.substring('--api-key='.length);
  } else if (arg.startsWith('--image-url=')) {
    imageUrlFromArg = arg.substring('--image-url='.length);
    console.error(`接收到圖片 URL 參數: ${imageUrlFromArg}`);
  } else {
    promptArgs.push(arg);
  }
});

// 從環境變數或命令行參數獲取 API 密鑰
const apiKey = apiKeyFromArg || process.env.GEMINI_API_KEY;

// 檢查 API 密鑰是否存在
if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
  console.error('Warning: GEMINI_API_KEY is not set or is using the default placeholder value.');
  console.error('Please set the GEMINI_API_KEY environment variable, update the .env file, or provide it via --api-key parameter.');
}

async function generateImage(prompt, imageUrl = null) {
  try {
    // 檢查 API 密鑰
    if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
      throw new Error('GEMINI_API_KEY is not set or is using the default placeholder value');
    }
    
    console.error('Using API key:', apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4));
    
    // 初始化 Google GenAI
    const ai = new GoogleGenAI({ apiKey });
    
    console.error('Initialized Google GenAI client');
    
    // 設置 responseModalities 包含 "Image" 以便模型生成圖片
    console.error('Sending request to Gemini API...');
    
    // 檢查是否提供了圖片 URL
    let requestConfig;
    let contents = [];

    // 構建增強的提示詞，以獲得更好的圖片生成效果
    const enhancedPrompt = `請生成一張高品質的圖片，內容是：${prompt}

請嚴格遵循以下要求：
1. 必須生成一張完整的圖片，不要只生成文字回應
2. 圖片必須是高解析度、清晰且細節豐富的
3. 使用專業的構圖和光影效果
4. 確保圖片風格一致且美觀
5. 盡可能準確呈現描述的內容和特徵
6. 使用豐富的色彩和適當的對比度
7. 圖片必須是彩色的，除非特別要求黑白效果
8. 不要在圖片中添加任何文字或水印`;

    if (imageUrl) {
      console.error(`使用圖片 URL 進行修改: ${imageUrl}`);
      try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
          throw new Error(`無法獲取圖片: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);
        const mimeType = response.headers.get('content-type') || 'image/jpeg'; // 嘗試從響應頭獲取 MIME 類型，否則默認為 jpeg

        contents.push({
          inlineData: {
            data: imageBuffer.toString('base64'),
            mimeType: mimeType,
          },
        });
        contents.push({ text: prompt }); // 將原始提示詞作為文本部分
      } catch (error) {
        console.error('下載或處理圖片時出錯:', error);
        // 如果圖片下載失敗，則只使用文本提示
        contents.push({ text: enhancedPrompt });
      }
    } else {
      contents.push({ text: enhancedPrompt });
    }

    // 使用 gemini-2.0-flash-preview-image-generation 模型生成圖片
    requestConfig = {
      model: "gemini-2.0-flash-preview-image-generation",
      contents: contents,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        temperature: 0.7,
        topK: 32,
        topP: 1,
        maxOutputTokens: 2048,
      },
    };
    
    // 發送請求到 Gemini API
    const response = await ai.models.generateContent(requestConfig);
    
    // 添加延遲，確保 API 有足夠時間處理請求
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 初始化結果對象
    const result = {
      success: false,
      text: "",
      imageData: "",
      mimeType: "",
      error: ""
    };

    // 詳細記錄響應結構，幫助調試
    console.error('Response structure:', JSON.stringify({
      candidates: response.candidates ? {
        length: response.candidates.length,
        firstCandidate: response.candidates[0] ? {
          hasContent: !!response.candidates[0].content,
          partsCount: response.candidates[0].content ? response.candidates[0].content.parts.length : 0
        } : 'No first candidate'
      } : 'No candidates'
    }));
    
    // 檢查響應是否有效
    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("No candidates in the response");
    }
    
    if (!response.candidates[0].content || !response.candidates[0].content.parts) {
      throw new Error("No content parts in the response");
    }
    
    // 處理響應
    for (const part of response.candidates[0].content.parts) {
      console.error('Processing part type:', part.text ? 'text' : (part.inlineData ? 'inlineData' : 'unknown'));
      
      // 根據部分類型，處理文本或圖片
      if (part.text) {
        result.text = part.text;
        console.error('Found text content:', part.text.substring(0, 100) + (part.text.length > 100 ? '...' : ''));
      } else if (part.inlineData) {
        result.imageData = part.inlineData.data; // Base64 編碼的圖片數據
        result.mimeType = part.inlineData.mimeType;
        result.success = true;
        console.error('Found image data, MIME type:', part.inlineData.mimeType);
        console.error('Image data length:', part.inlineData.data.length);
      }
    }

    // 如果沒有找到圖片數據，嘗試從文本中提取
    if (!result.imageData && result.text) {
      console.error('No image data found, attempting to extract from text');
      
      // 嘗試從文本中提取 Base64 編碼的圖片數據
      const base64Regex = /data:image\/(jpeg|png|gif|webp);base64,([A-Za-z0-9+/=]+)/;
      const base64Match = result.text.match(base64Regex);
      
      if (base64Match) {
        console.error('Found Base64 image data in text');
        result.mimeType = `image/${base64Match[1]}`;
        result.imageData = base64Match[2];
        result.success = true;
      } else {
        throw new Error("No image data found in the response");
      }
    } else if (!result.imageData) {
      throw new Error("No image data found in the response");
    }

    return result;
  } catch (error) {
    return {
      success: false,
      text: "",
      imageData: "",
      mimeType: "",
      error: error.message
    };
  }
}

// 主函數
async function main() {
  try {
    // 獲取命令行參數作為 prompt（排除 --api-key 參數）
    const prompt = promptArgs.join(" ");
    
    if (!prompt) {
      throw new Error("No prompt provided");
    }

    // 生成圖片
    console.error(`Generating image with prompt: ${prompt}`);
    // 如果提供了圖片 URL，則傳遞給 generateImage 函數
    if (imageUrlFromArg) {
      console.error(`Using image URL: ${imageUrlFromArg}`);
    }
    const result = await generateImage(prompt, imageUrlFromArg);
    
    // 只將結果輸出為 JSON，不要在標準輸出中包含其他內容
    // 使用 console.error 輸出日誌，避免干擾 JSON 輸出
    console.error('Generated result:', JSON.stringify({
      success: result.success,
      text: result.text,
      mimeType: result.mimeType,
      error: result.error,
      imageDataLength: result.imageData ? result.imageData.length : 0
    }));
    
    // 將完整結果（包括圖片數據）輸出為 JSON
    const jsonResult = JSON.stringify(result);
    
    // 分塊輸出 JSON 數據，確保完整性
    // 使用明確的標記，確保它們不會被其他輸出干擾
    console.error('###JSON_START###');
    
    // 使用更小的塊大小，每塊 64KB
    const chunkSize = 64 * 1024; // 64KB
    
    // 使用 Promise 和 setTimeout 確保每個塊都能被完整輸出
    const writeChunks = async () => {
      for (let i = 0; i < jsonResult.length; i += chunkSize) {
        const chunk = jsonResult.substring(i, i + chunkSize);
        // 使用 Promise 確保寫入完成
        await new Promise((resolve) => {
          process.stdout.write(chunk, () => {
            // 寫入完成後解析 Promise
            resolve();
          });
        });
        // 增加延遲時間，確保輸出緩衝區有足夠時間處理
        await new Promise(resolve => setTimeout(resolve, 50));
        // 每輸出一塊數據後，輸出進度信息到標準錯誤
        if (i + chunkSize < jsonResult.length) {
          console.error(`Wrote chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(jsonResult.length/chunkSize)}, ${Math.round((i + chunkSize) / jsonResult.length * 100)}% complete`);
        }
      }
    };
    
    // 等待所有塊寫入完成
    await writeChunks();
    
    console.error('###JSON_END###');
    
    // 備用方案：如果需要使用標記，將它們輸出到標準錯誤
    if (process.env.USE_JSON_MARKERS === 'true') {
      // 使用更小的塊大小，每塊 64KB
      const backupChunkSize = 64 * 1024; // 64KB
      
      // 使用 Promise 和 setTimeout 確保每個塊都能被完整輸出
      const writeBackupChunks = async () => {
        // 輸出開始標記
        await new Promise((resolve) => {
          process.stderr.write('###JSON_START###\n', resolve);
        });
        
        // 分塊輸出 JSON 數據
        for (let i = 0; i < jsonResult.length; i += backupChunkSize) {
          const chunk = jsonResult.substring(i, i + backupChunkSize);
          await new Promise((resolve) => {
            process.stderr.write(chunk, resolve);
          });
          // 增加延遲時間，確保輸出緩衝區有足夠時間處理
          await new Promise(resolve => setTimeout(resolve, 50));
          // 每輸出一塊數據後，輸出進度信息到標準錯誤
          if (i + backupChunkSize < jsonResult.length) {
            console.error(`Backup wrote chunk ${Math.floor(i/backupChunkSize) + 1}/${Math.ceil(jsonResult.length/backupChunkSize)}, ${Math.round((i + backupChunkSize) / jsonResult.length * 100)}% complete`);
          }
        }
        
        // 輸出結束標記
        await new Promise((resolve) => {
          process.stderr.write('\n###JSON_END###\n', resolve);
        });
      };
      
      // 執行備用輸出
      await writeBackupChunks();
    }
    
    // 成功時返回 0
    process.exit(0);
  } catch (error) {
    // 將錯誤信息輸出到標準錯誤
    console.error('Error in main function:', error.message);
    
    // 直接輸出錯誤 JSON 數據，不使用標記
    const errorJson = JSON.stringify({
      success: false,
      text: "",
      imageData: "",
      mimeType: "",
      error: error.message
    });
    
    // 分塊輸出 JSON 數據，確保完整性
    // 使用明確的標記，確保它們不會被其他輸出干擾
    console.error('###JSON_START###');
    
    // 使用更小的塊大小，每塊 64KB
    const chunkSize = 64 * 1024; // 64KB
    
    // 使用 Promise 和 setTimeout 確保每個塊都能被完整輸出
    const writeChunks = async () => {
      for (let i = 0; i < errorJson.length; i += chunkSize) {
        const chunk = errorJson.substring(i, i + chunkSize);
        // 使用 Promise 確保寫入完成
        await new Promise((resolve) => {
          process.stdout.write(chunk, () => {
            // 寫入完成後解析 Promise
            resolve();
          });
        });
        // 增加延遲時間，確保輸出緩衝區有足夠時間處理
        await new Promise(resolve => setTimeout(resolve, 50));
        // 每輸出一塊數據後，輸出進度信息到標準錯誤
        if (i + chunkSize < errorJson.length) {
          console.error(`Error: Wrote chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(errorJson.length/chunkSize)}, ${Math.round((i + chunkSize) / errorJson.length * 100)}% complete`);
        }
      }
    };
    
    // 等待所有塊寫入完成
    await writeChunks();
    
    console.error('###JSON_END###');
    
    // 備用方案：如果需要使用標記，將它們輸出到標準錯誤
    if (process.env.USE_JSON_MARKERS === 'true') {
      // 使用更小的塊大小，每塊 64KB
      const backupChunkSize = 64 * 1024; // 64KB
      
      // 使用 Promise 和 setTimeout 確保每個塊都能被完整輸出
      const writeBackupChunks = async () => {
        // 輸出開始標記
        await new Promise((resolve) => {
          process.stderr.write('###JSON_START###\n', resolve);
        });
        
        // 分塊輸出 JSON 數據
        for (let i = 0; i < errorJson.length; i += backupChunkSize) {
          const chunk = errorJson.substring(i, i + backupChunkSize);
          await new Promise((resolve) => {
            process.stderr.write(chunk, resolve);
          });
          // 增加延遲時間，確保輸出緩衝區有足夠時間處理
          await new Promise(resolve => setTimeout(resolve, 50));
          // 每輸出一塊數據後，輸出進度信息到標準錯誤
          if (i + backupChunkSize < errorJson.length) {
            console.error(`Error Backup: Wrote chunk ${Math.floor(i/backupChunkSize) + 1}/${Math.ceil(errorJson.length/backupChunkSize)}, ${Math.round((i + backupChunkSize) / errorJson.length * 100)}% complete`);
          }
        }
        
        // 輸出結束標記
        await new Promise((resolve) => {
          process.stderr.write('\n###JSON_END###\n', resolve);
        });
      };
      
      // 執行備用輸出
      await writeBackupChunks();
    }
    
    // 失敗時返回 1
    process.exit(1);
  }
}

// 執行主函數
main();