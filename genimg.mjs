import { GoogleGenAI } from "@google/genai";

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
}

async function generateImage(prompt, imageUrl = null) {
  try {
    if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
      throw new Error('GEMINI_API_KEY is not set or is using the default placeholder value');
    }
    
    console.error('Using API key:', apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4));
    
    const ai = new GoogleGenAI({ apiKey });
    console.error('Initialized Google GenAI client');
    console.error('Sending request to Imagen API...');
    
    let finalPrompt = prompt;
    if (imageUrl) {
      finalPrompt = `Based on the reference image at ${imageUrl}, ${prompt}`;
    }

    const response = await ai.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt: finalPrompt,
      config: {
        numberOfImages: 1,
        outputMimeType: "image/jpeg",
        aspectRatio: "1:1",
      },
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (!response.generatedImages || response.generatedImages.length === 0) {
      throw new Error("No images returned from Imagen API");
    }
    
    const imgBytes = response.generatedImages[0].image.imageBytes;
    if (!imgBytes) {
      throw new Error("Empty image bytes in response");
    }

    return {
      success: true,
      text: "這是使用 Imagen 3.0 生成的圖片",
      imageData: imgBytes,
      mimeType: "image/jpeg",
      error: ""
    };
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
    const prompt = promptArgs.join(" ");
    if (!prompt) {
      throw new Error("No prompt provided");
    }

    console.error(`Generating image with prompt: ${prompt}`);
    if (imageUrlFromArg) {
      console.error(`Using image URL: ${imageUrlFromArg}`);
    }
    const result = await generateImage(prompt, imageUrlFromArg);
    
    console.error('Generated result:', JSON.stringify({
      success: result.success,
      text: result.text,
      mimeType: result.mimeType,
      error: result.error,
      imageDataLength: result.imageData ? result.imageData.length : 0
    }));
    
    const jsonResult = JSON.stringify(result);
    
    console.error('###JSON_START###');
    const chunkSize = 64 * 1024; // 64KB
    
    const writeChunks = async () => {
      for (let i = 0; i < jsonResult.length; i += chunkSize) {
        const chunk = jsonResult.substring(i, i + chunkSize);
        await new Promise((resolve) => {
          process.stdout.write(chunk, () => {
            resolve();
          });
        });
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    };
    
    await writeChunks();
    console.error('###JSON_END###');
    process.exit(0);
  } catch (error) {
    console.error('Error in main function:', error.message);
    const errorJson = JSON.stringify({
      success: false,
      text: "",
      imageData: "",
      mimeType: "",
      error: error.message
    });
    
    console.error('###JSON_START###');
    const chunkSize = 64 * 1024;
    const writeChunks = async () => {
      for (let i = 0; i < errorJson.length; i += chunkSize) {
        const chunk = errorJson.substring(i, i + chunkSize);
        await new Promise((resolve) => {
          process.stdout.write(chunk, () => {
            resolve();
          });
        });
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    };
    await writeChunks();
    console.error('###JSON_END###');
    process.exit(1);
  }
}

main();