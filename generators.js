const axios = require('axios');
const EventSource = require('eventsource');
const WebSocket = require('ws');

const config = require('./config.json');
const bannerMusicGen = config.bannerMusicGen;
const nevPrompt = config.nevPrompt;


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
  return new Promise(async (resolve, reject) => {
    try {
      const sessionHash = generateSessionHash();

      // First request to join the queue
      await fetch("https://mrfakename-melotts.hf.space/queue/join?", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [prompt, y, 1, x],
          event_data: null,
          fn_index: 1,
          trigger_id: 8,
          session_hash: sessionHash
        }),
      });

      // Replace this part to use EventSource for listening to the event stream
      const es = new EventSource(`https://mrfakename-melotts.hf.space/queue/data?session_hash=${sessionHash}`);

      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.msg === 'process_completed') {
          es.close();
          const outputUrl = data?.output?.data?.[0]?.url;
          if (!outputUrl) {
            reject(new Error("Output URL does not exist, path might be invalid."));
            console.log(data);
          } else {
            resolve(outputUrl);
          }
        }
      };

      es.onerror = (error) => {
        es.close();
        reject(error);
      };
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

function generateWithSC(prompt,  resolution) {
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
      const randomDigit = generateRandomDigits();
      const sessionHash = generateSessionHash();

      await fetch("https://multimodalart-stable-cascade.hf.space/run/predict", {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          "data": [0, true],
          "event_data": null,
          "fn_index": 2,
          "trigger_id": 6,
          "session_hash": sessionHash
        })
      });

      // Second request to initiate the image generation
      const queueResponse = await fetch("https://multimodalart-stable-cascade.hf.space/queue/join?", {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          "data": [prompt, nevPrompt, randomDigit, width, height, 30, 4, 12, 0, 1],
          "event_data": null,
          "fn_index": 3,
          "trigger_id": 6,
          "session_hash": sessionHash
        })
      });

      // Setting up event source for listening to the progress
      const es = new EventSource(`https://multimodalart-stable-cascade.hf.space/queue/data?session_hash=${sessionHash}`);
      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.msg === 'process_completed') {
          es.close();
          const outputUrl = data?.output?.data?.[0]?.url;
          if (outputUrl) {
            resolve({ images: [{ url: outputUrl }], modelUsed: "Stable-Cascade" });
          } else {
            reject(new Error("Output URL is missing"));
            console.log(data);
          }
        }
      };

      es.onerror = (error) => {
        es.close();
        reject(error);
      };
    } catch (error) {
      reject(error);
    }
  });
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

function generateWithDallEXL(prompt, resolution) {
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
      const randomDigits = generateRandomDigits();
      const sessionHash = generateSessionHash();

      // First request to join the queue
      await fetch("https://ehristoforu-dalle-3-xl-lora-v2.hf.space/queue/join?", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [prompt, nevPrompt, true, randomDigits, width, height, 6, true],
          event_data: null,
          fn_index: 3,
          trigger_id: 6,
          session_hash: sessionHash
        }),
      });

      // Replace this part to use EventSource for listening to the event stream
      const es = new EventSource(`https://ehristoforu-dalle-3-xl-lora-v2.hf.space/queue/data?session_hash=${sessionHash}`);

      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.msg === 'process_completed') {
          es.close();
          const outputUrl = data?.output?.data?.[0]?.[0]?.image?.url;
          if (!outputUrl) {
            reject(new Error("Output URL does not exist, path might be invalid."));
            console.log(data);
          } else {
            resolve({ images: [{ url: outputUrl }], modelUsed: "DallE-XL" });
          }
        }
      };

      es.onerror = (error) => {
        es.close();
        reject(error);
      };
    } catch (error) {
      reject(error);
    }
  });
}

function generateWithAnime(prompt, resolution) {
  let size;
  if (resolution == 'Square') {
    size = '1024 x 1024';
  } else if (resolution == 'Wide') {
    size = '1344 x 768';
  } else if (resolution == 'Portrait') {
    size = '832 x 1216';
  }
  return new Promise(async (resolve, reject) => {
    const randomDigit = generateRandomDigits();
    const sessionHash = generateSessionHash();

    try {
      // First request to initiate the process
      await fetch("https://cagliostrolab-animagine-xl-3-1.hf.space/queue/join?", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [
            prompt, nevPrompt, randomDigit, 1024, 1024, 7, 35, "DPM++ SDE Karras", size,"(None)", "Standard v3.1", false, 0.55, 1.5, true
          ],
          event_data: null,
          fn_index: 5,
          trigger_id: 49,
          session_hash: sessionHash,
        }),
      });

      // Using EventSource to listen for server-sent events
      const es = new EventSource(`https://cagliostrolab-animagine-xl-3-1.hf.space/queue/data?session_hash=${sessionHash}`);

      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.msg === 'process_completed') {
          es.close();
          const outputUrl = data?.output?.data?.[0]?.[0]?.image?.url;
          if (!outputUrl) {
            reject(new Error('Invalid or missing output URL'));
            console.log(data);
          } else {
            resolve({ images: [{ url: outputUrl }], modelUsed: "Anime" });
          }
        }
      };

      es.onerror = (error) => {
        es.close();
        reject(error);
      };

    } catch (error) {
      reject(error);
    }
  });
}

function generateWithSDXL(prompt, resolution) {
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
  return new Promise((resolve, reject) => {
    try {
      const url = "https://kingnish-sdxl-flash.hf.space";
      const randomDigit = generateRandomDigits();
      const session_hash = generateSessionHash();
      const urlFirstRequest = `${url}/queue/join?`;
      const dataFirstRequest = {
        "data": [prompt, nevPrompt, true, randomDigit, width, height, 4, 12, true, 1],
        "event_data": null,
        "fn_index": 2,
        "trigger_id": 5,
        "session_hash": session_hash
      };

      axios.post(urlFirstRequest, dataFirstRequest).then(responseFirst => {

        const urlSecondRequest = `${url}/queue/data?session_hash=${session_hash}`;

        const eventSource = new EventSource(urlSecondRequest);

        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);

          if (data.msg === "process_completed") {
            eventSource.close();
            const full_url = data?.output?.data?.[0]?.[0]?.image?.url;
            if (full_url) {
              resolve({ images: [{ url: full_url }], modelUsed: "SD-XL" });
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

function generateWithPixArt_Sigma(prompt, resolution) {
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
  return new Promise((resolve, reject) => {
    try {
      const url = "https://pixart-alpha-pixart-sigma.hf.space";
      const randomDigit = generateRandomDigits();
      const session_hash = generateSessionHash();
      const urlFirstRequest = `${url}/queue/join?`;
      const dataFirstRequest = {
        "data": [prompt, nevPrompt, "(No style)", true, 1, randomDigit, width, height, "SA-Solver", 4.5, 3, 14, 35, true],
        "event_data": null,
        "fn_index": 3,
        "trigger_id": 7,
        "session_hash": session_hash
      };

      axios.post(urlFirstRequest, dataFirstRequest).then(responseFirst => {

        const urlSecondRequest = `${url}/queue/data?session_hash=${session_hash}`;

        const eventSource = new EventSource(urlSecondRequest);

        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);

          if (data.msg === "process_completed") {
            eventSource.close();
            const full_url = data?.output?.data?.[0]?.[0]?.image?.url;
            if (full_url) {
              resolve({ images: [{ url: full_url }], modelUsed: "PixArt-Sigma" });
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

function generateWithMobius(prompt, resolution) {
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
  return new Promise((resolve, reject) => {
    try {
      const url = "https://corcelio-mobius.hf.space";
      const randomDigit = generateRandomDigits();
      const session_hash = generateSessionHash();
      const urlFirstRequest = `${url}/queue/join?`;
      const dataFirstRequest = {
        "data": [prompt, nevPrompt, true, randomDigit, width, height, 3.5, true],
        "event_data": null,
        "fn_index": 3,
        "trigger_id": 6,
        "session_hash": session_hash
      };

      axios.post(urlFirstRequest, dataFirstRequest).then(responseFirst => {

        const urlSecondRequest = `${url}/queue/data?session_hash=${session_hash}`;

        const eventSource = new EventSource(urlSecondRequest);

        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);

          if (data.msg === "process_completed") {
            eventSource.close();
            const full_url = data?.output?.data?.[0]?.[0]?.image?.url;
            if (full_url) {
              resolve({ images: [{ url: full_url }], modelUsed: "Mobius" });
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

module.exports = {
  speechGen,
  musicGen,
  generateWithSC,
  generateWithPlayground,
  generateWithDallEXL,
  generateWithAnime,
  generateWithSDXL,
  generateWithPixArt_Sigma,
  generateWithDalle3,
  generateWithMobius
};
