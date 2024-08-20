import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import {
  GoogleGenerativeAI
} from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

import { diffusionMaster } from '../text/diffusionMasterPrompt.js';

async function enhancePrompt1(prompt) {
  const retryLimit = 3;
  let currentAttempt = 0;
  let error;

  while (currentAttempt < retryLimit) {
    try {
      currentAttempt += 1;
      console.log(`Attempt ${currentAttempt}`);

      let response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Request timed out'));
        }, 15000);

        const payload = {
          model: "llama3-70b-8192",
          stream: false,
          messages: [
            {
              role: "system",
              content: diffusionMaster
            },
            {
              role: "user",
              content: prompt
            }
          ]
        };

        const headers = {
          "Content-Type": "application/json"
        };
        if (process.env.OPENAI_API_KEY) {
          headers['Authorization'] = `Bearer ${process.env.OPENAI_API_KEY}`;
        }


        const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        axios.post(`${baseURL}/chat/completions`, payload, { headers: headers })
          .then(response => {
            clearTimeout(timeout);
            resolve(response);
          })
          .catch(err => {
            clearTimeout(timeout);
            reject(err);
          });
      });

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        let content = response.data.choices[0].message.content;
        const codeBlockPattern = /```([^`]+)```/s;
        const match = content.match(codeBlockPattern);
        if (match) {
          content = match[1].trim();
        } else {
          throw new Error(`Enhanced prompt not found`);
        }
        console.log(content);
        return content;
      } else {
        console.log('Error processing response data');
        error = new Error('Error processing response data');
      }
    } catch (err) {
      console.error(err.message);
      error = err;
    }
  }
  if (error) {
    console.error('Retries exhausted or an error occurred:', error.message);
  }
  return prompt;
}

async function enhancePrompt(prompt, attempts = 3) {
  const generate = async () => {
    const model = await genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", systemInstruction: { role: "system", parts: [{ text: diffusionMaster }] } });
    const result = await model.generateContent(prompt);
    return result.response.text();
  };

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const textResponse = await Promise.race([
        generate(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
      ]);

      let content = textResponse;
      const codeBlockPattern = /```([^`]+)```/s;
      const match = content.match(codeBlockPattern);
      if (match) {
        content = match[1].trim();
      } else {
        throw new Error(`Enhanced prompt not found`);
      }
      return content;
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
      if (attempt === attempts) {
        console.log('All attempts failed, returning the original prompt.');
        return prompt;
      }
    }
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryOperation(fn, maxRetries, delayMs = 1000) {
  let error;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      console.log(`Attempt ${attempt} failed: ${err.message}`);
      error = err;
      if (attempt < maxRetries) {
        console.log(`Waiting ${delayMs}ms before next attempt...`);
        await delay(delayMs);
      } else {
        console.log(`All ${maxRetries} attempts failed.`);
      }
    }
  }

  throw new Error(`Operation failed after ${maxRetries} attempts: ${error.message}`);
}

const nsfwWordsArray = JSON.parse(fs.readFileSync('./text/nsfwWords.json', 'utf-8'));

function filterPrompt(text) {
  nsfwWordsArray.forEach(word => {
    const regexPattern = new RegExp(word.split('').join('\\W*'), 'gi');
    text = text.replace(regexPattern, '');
  });
  return text;
}

export {
  delay,
  retryOperation,
  filterPrompt,
  enhancePrompt
};
