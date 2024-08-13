import axios from 'axios';
import EventSource from 'eventsource';
import WebSocket from 'ws';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));
const { bannerMusicGen, nevPrompt } = config;


function getEventId() {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  const hexString = Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
  return hexString;
}

async function fetchAndExtractRootUrl(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const htmlContent = await response.text();

    const rootMatch = htmlContent.match(/window\.gradio_config = (.*?});/s);
    if (rootMatch) {
      const gradioConfig = JSON.parse(rootMatch[1]);
      return gradioConfig.root;
    } else {
      throw new Error("Could not extract root value.");
    }
  } catch (error) {
    console.error('Failed to fetch:', error);
    return null;
  }
}

function generateSessionHash() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateRandomDigits() {
  return Math.floor(Math.random() * (999999999 - 100000000 + 1) + 100000000);
}

function speechGen(prompt, language) {
  let x, y;
  if (language == 'English') {
    x = 'EN';
    y = 'EN-Default';
  } else {
    switch (language) {
      case 'Spanish':
        x = y = 'ES';
        break;
      case 'French':
        x = y = 'FR';
        break;
      case 'Chinese':
        x = y = 'ZH';
        break;
      case 'Korean':
        x = y = 'KR';
        break;
      case 'Japanese':
        x = y = 'JP';
        break;
      default:
        x = 'EN';
        y = 'EN-Default';
    }
  }
  return new Promise((resolve, reject) => {
    try {
      const url = "https://mrfakename-melotts.hf.space";
      const session_hash = generateSessionHash();
      const urlFirstRequest = `${url}/queue/join?`;
      const dataFirstRequest = {
        "data": [prompt, y, 1, x],
        "event_data": null,
        "fn_index": 1,
        "trigger_id": 8,
        "session_hash": session_hash
      };

      axios.post(urlFirstRequest, dataFirstRequest).then(responseFirst => {

        const urlSecondRequest = `${url}/queue/data?session_hash=${session_hash}`;

        const eventSource = new EventSource(urlSecondRequest);

        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);

          if (data.msg === "process_completed") {
            eventSource.close();
            const full_url = data?.output?.data?.[0]?.url;
            if (full_url) {
              resolve(full_url);
            } else {
              reject(new Error("Invalid path: URL does not exist."));
              console.log(data);
            }
          }
        };
        eventSource.onerror = (error) => {
          eventSource.close();
          reject(error);
        };
      }).catch(error => {
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function musicGen(prompt) {
  let socket;
  try {
    const sessionHash = generateSessionHash();
    const banner = bannerMusicGen;

    // WebSocket connection promise
    const socketPromise = new Promise((resolve, reject) => {
      socket = new WebSocket('wss://surn-unlimitedmusicgen.hf.space/queue/join');
      socket.onopen = () => {
        resolve();
      };
      socket.onerror = (error) => {
        console.error('WebSocket error.');
        reject(new Error('WebSocket connection error'));
      };
    });

    // Wait for socket to be ready
    await socketPromise;

    // Send and process messages
    const url = await new Promise((resolve, reject) => {
      socket.onmessage = (message) => {
        const data = JSON.parse(message.data);

        if (data.msg === 'send_hash') {
          socket.send(JSON.stringify({
            fn_index: 0,
            session_hash: sessionHash,
          }));
        } else if (data.msg === 'send_data') {
          socket.send(JSON.stringify({
            data: ['large', prompt, null, 30, 2, 280, 1150, 0.7, 8.5, banner, 'MusicGen', './assets/arial.ttf', '#fff', -1, 2, 0, true, false, 'No'],
            event_data: null,
            fn_index: 5,
            session_hash: sessionHash,
          }));
        } else if (data.msg === 'process_completed') {
          const name = data?.output?.data?.[0]?.[0]?.name;
          if (name) {
            const url = `https://surn-unlimitedmusicgen.hf.space/file=${name}`;
            resolve(url);
          } else {
            reject(new Error("Output URL is missing"));
            console.log(data);
          }
        }
      };

      socket.onerror = () => {
        reject(new Error('WebSocket encountered an error during message handling.'));
      };

      socket.onclose = () => {
        reject(new Error('WebSocket connection was closed unexpectedly.'));
      };
    });

    return url;
  } catch (error) {
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.close();
    }
    throw error;
  }
}

async function generateWithPlayground(prompt, resolution) {
  let width, height;
  if (resolution == 'Square') {
    width = 1024;
    height = 1024;
  } else if (resolution == 'Wide') {
    width = 1280;
    height = 768;
  } else if (resolution == 'Portrait') {
    width = 768;
    height = 1280;
  }
  return new Promise(async (resolve, reject) => {
    try {
      const session_hash = generateSessionHash();
      const event_id = getEventId();
      const randomDigit = generateRandomDigits();
      const rootUrl = await fetchAndExtractRootUrl("https://playgroundai-playground-v2-5.hf.space/");

      const urlJoinQueue = `https://playgroundai-playground-v2-5.hf.space/queue/join?fn_index=3&session_hash=${session_hash}`;
      const eventSource = new EventSource(urlJoinQueue);

      eventSource.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        if (data.msg === "send_data") {
          const eventId = data?.event_id;
          fetch("https://playgroundai-playground-v2-5.hf.space/queue/data", {
            method: "POST",
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              data: [prompt, nevPrompt, true, randomDigit, width, height, 3, true],
              event_data: null,
              fn_index: 3,
              trigger_id: 6,
              session_hash: session_hash,
              event_id: eventId
            })
          });
        } else if (data.msg === "process_completed") {
          eventSource.close();
          const path = data?.output?.data?.[0]?.[0]?.image?.path;
          if (path) {
            const fullUrl = `${rootUrl}/file=${path}`;
            resolve({ images: [{ url: fullUrl }], modelUsed: "Playground" });
          } else {
            reject(new Error('No image path found in the process_completed message.'));
            console.log(data);
          }
        }
      };

      eventSource.onerror = (error) => {
        eventSource.close();
        reject(error);
      };

    } catch (error) {
      reject(error);
    }
  });
}

const modelsData = {
  "DallE-XL": {
    url: "https://ehristoforu-dalle-3-xl-lora-v2.hf.space",
    fnIndex: 3,
    triggerId: 6,
    useSize: false,
    dataPattern: (prompt, randomDigit, width, height) => [prompt, nevPrompt, true, randomDigit, width, height, 6, true]
  },
  "Anime": {
    url: "https://cagliostrolab-animagine-xl-3-1.hf.space",
    fnIndex: 5,
    triggerId: 49,
    useSize: true,
    dataPattern: (prompt, randomDigit, size) => [prompt, nevPrompt, randomDigit, 1024, 1024, 7, 35, "DPM++ SDE Karras", size, "(None)", "Standard v3.1", false, 0.55, 1.5, true]
  },
  "SD-XL": {
    url: "https://kingnish-sdxl-flash.hf.space",
    fnIndex: 2,
    triggerId: 5,
    useSize: false,
    dataPattern: (prompt, randomDigit, width, height) => [prompt, nevPrompt, true, randomDigit, width, height, 3, 12, true, 1]
  },
  "PixArt-Sigma": {
    url: "https://dataautogpt3-pixart-sigma-900m.hf.space",
    fnIndex: 2,
    triggerId: 5,
    useSize: false,
    dataPattern: (prompt, randomDigit, width, height) => [prompt, nevPrompt, randomDigit, true, width, height, 5, 35]
  },
  "Kolors": {
    url: "https://gokaygokay-kolors.hf.space",
    fnIndex: 0,
    triggerId: 23,
    useSize: false,
    dataPattern: (prompt, randomDigit, width, height) => [prompt, nevPrompt, height, width, 35, 5, 1, true, randomDigit]
  },
  "FLUX.1 [dev]": {
    url: "https://black-forest-labs-flux-1-dev.hf.space",
    fnIndex: 2,
    triggerId: 5,
    useSize: false,
    dataPattern: (prompt, randomDigit, width, height) => [prompt, randomDigit, true, width, height, 4, 35]
  },
  "FLUX.1 [schnell]": {
    url: "https://multimodalart-flux-1-merged.hf.space",
    fnIndex: 2,
    triggerId: 5,
    useSize: false,
    dataPattern: (prompt, randomDigit, width, height) => [prompt, randomDigit, true, width, height, 3.5, 16]
  }
};

function getResolution(resolution) {
  switch (resolution) {
    case 'Square': return { width: 1024, height: 1024, size: '1024 x 1024' };
    case 'Wide': return { width: 1280, height: 768, size: '1344 x 768' };
    case 'Portrait': return { width: 768, height: 1280, size: '832 x 1216' };
    default: throw new Error("Invalid resolution");
  }
}

function generateImage(prompt, resolution, model) {
  return new Promise((resolve, reject) => {
    try {
      const { width, height, size } = getResolution(resolution);
      const { url, fnIndex, triggerId, useSize, dataPattern } = modelsData[model];
      const randomDigit = generateRandomDigits();
      const session_hash = generateSessionHash();

      const data = useSize ? dataPattern(prompt, randomDigit, size) : dataPattern(prompt, randomDigit, width, height);

      const urlFirstRequest = `${url}/queue/join?`;
      const dataFirstRequest = {
        "data": data,
        "event_data": null,
        "fn_index": fnIndex,
        "trigger_id": triggerId,
        "session_hash": session_hash
      };

      axios.post(urlFirstRequest, dataFirstRequest).then(responseFirst => {
        const urlSecondRequest = `${url}/queue/data?session_hash=${session_hash}`;

        const eventSource = new EventSource(urlSecondRequest);

        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);

          if (data.msg === "process_completed") {
            eventSource.close();
            const full_url = data?.output?.data?.[0]?.[0]?.image?.url || data?.output?.data?.[0]?.url || data?.output?.data?.[1]?.url;
            if (full_url) {
              resolve({ images: [{ url: full_url }], modelUsed: model });
            } else {
              reject(new Error("Invalid path: URL does not exist."));
              console.error(data);
            }
          }
        };

        eventSource.onerror = (error) => {
          eventSource.close();
          reject(error);
        };
      }).catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

async function generateWithDalle3(prompt) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    };
  
    const body = JSON.stringify({
      model: "dall-e-3",
      prompt: prompt,
      n: 1
    });
  
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Request timed out (30 seconds limit)'));
      }, 30000);
    });

    const fetchPromise = fetch(`${process.env.OPENAI_BASE_URL}/images/generations` || 'https://api.openai.com/v1/images/generations', {
      method: 'POST', headers, body
    });

    const response = await Promise.race([fetchPromise, timeoutPromise]);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(`${response.status} ${data?.message || ''}`);
    }
    return { images: data.data, modelUsed: "DallE-3" };
  } catch (error) {
    console.log(error);
    throw error;
  }
}

const imgModels = [
  ...Object.keys(modelsData),
  'Playground',
  'DallE-3'
];

const imageModelFunctions = {
  ...Object.fromEntries(Object.keys(modelsData).map(model => [model, generateImage])),
  'Playground': generateWithPlayground,
  'DallE-3': generateWithDalle3
};

export {
  speechGen,
  musicGen,
  generateWithPlayground,
  generateImage,
  generateWithDalle3,
  imgModels,
  imageModelFunctions
};
