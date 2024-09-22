import axios from 'axios';
import * as cheerio from 'cheerio';
import { YoutubeTranscript } from 'youtube-transcript';
import { evaluate } from 'mathjs'

const function_declarations = [
  {
    name: "web_search",
    parameters: {
      type: "object",
      description: "Search the internet to find up-to-date information on a given topic.",
      properties: {
        query: {
          type: "string",
          description: "The query to search for."
        }
      },
      required: ["query"]
    }
  },
  {
    name: "search_webpage",
    parameters: {
      type: "object",
      description: "Returns a string with all the content of a webpage. Some websites block this, so try a few different websites.",
      properties: {
        url: {
          type: "string",
          description: "The URL of the site to search."
        }
      },
      required: ["url"]
    }
  },
  {
    name: "get_youtube_transcript",
    parameters: {
      type: "object",
      description: "Returns the transcript of a specified YouTube video. Use this to learn about the content of YouTube videos.",
      properties: {
        url: {
          type: "string",
          description: "URL of the YouTube video to retrieve the transcript from."
        }
      },
      required: ["url"]
    }
  },
  {
    name: "calculate",
    parameters: {
      type: "object",
      description: "Calculates a given mathematical equation and returns the result. Use this for calculations when writing responses. Exampled: '12 / (2.3 + 0.7)' -> '4', '12.7 cm to inch' -> '5 inch', 'sin(45 deg) ^ 2' -> '0.5', '9 / 3 + 2i' -> '3 + 2i', 'det([-1, 2; 3, 1])' -> '-7'",
      properties: {
        equation: {
          type: "string",
          description: "The equation to be calculated."
        }
      },
      required: ["equation"]
    }
  }
];

async function webSearch(args, name) {
  const query = args.query;
  try {
    const result = await performSearch(query);
    const function_call_result_message = [
      {
        functionResponse: {
          name: name,
          response: {
            query: query,
            content: result
          }
        }
      }
    ];
    return function_call_result_message;
  } catch (error) {
    const errorMessage = `Error while performing web search: ${error}`;
    console.error(errorMessage);
    const function_call_result_message = [
      {
        functionResponse: {
          name: name,
          response: {
            query: query,
            content: errorMessage
          }
        }
      }
    ];
    return function_call_result_message;
  }
}

async function searchWebpage(args, name) {
  const url = args.url;
  try {
    const result = await searchWebpageContent(url);
    const function_call_result_message = [
      {
        functionResponse: {
          name: name,
          response: {
            url: url,
            content: result
          }
        }
      }
    ];
    return function_call_result_message;
  } catch (error) {
    const errorMessage = `Error while searching the site: ${error}`;
    console.error(errorMessage);
    const function_call_result_message = [
      {
        functionResponse: {
          name: name,
          response: {
            url: url,
            content: errorMessage
          }
        }
      }
    ];
    return function_call_result_message;
  }
}

async function searchWebpageContent(url) {
  const TIMEOUT = 5000; // 5 seconds

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out after 5 seconds')), TIMEOUT)
  );

  try {
    const response = await Promise.race([fetch(url), timeoutPromise]);

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    $('script, style').remove();
    let bodyText = $('body').text();

    bodyText = bodyText.replace(/<[^>]*>?/gm, ''); // remove HTML tags
    bodyText = bodyText.replace(/\s{6,}/g, '  '); // replace sequences of 6 or more whitespace characters with 2 spaces
    bodyText = bodyText.replace(/(\r?\n){6,}/g, '\n\n'); // replace sequences of 6 or more line breaks with 2 line breaks

    const trimmedBodyText = bodyText.trim();

    return trimmedBodyText;
  } catch (error) {
    throw new Error(error.message || 'Could not search content from webpage');
  }
}

async function performSearch(query) {
  const url = 'https://websearch.plugsugar.com/api/plugins/websearch';
  const response = await axios.post(url, { query: query })
    .catch(error => {
      throw new Error(`Failed to perform the initial search request: ${error.message}`);
    });
  const rawText = response.data.result;
  const entries = rawText.trim().split('\n\n').slice(0, 3);

  const resultObject = await Promise.all(entries.map(async (entry, index) => {
    const lines = entry.split('\n');
    const title = lines.find(line => line.startsWith('Title:')).replace('Title: ', '');
    let result = lines.find(line => line.startsWith('Result:')).replace('Result: ', '');
    const url = lines.find(line => line.startsWith('URL:')).replace('URL: ', '');

    try {
      const searchedContent = await searchWebpageContent(url);
      result = searchedContent;
    } catch (error) {
      console.error(`Failed to search content from ${url}:`, error);
    }

    return { [`result_${index + 1}`]: { title, result, url } };
  }));
  
  const note = {
    "Note": "Search results provide only an overview and do not offer sufficiently detailed information. Please continue by using the Search Website tool and search websites to find relevant information about the topic."
  };

  return JSON.stringify(resultObject.reduce((acc, curr) => Object.assign(acc, curr), note), null, 2);
}

async function getYoutubeTranscript(args, name) {
  const url = args.url;
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(url);
    const function_call_result_message = [
      {
        functionResponse: {
          name: name,
          response: {
            url: url,
            content: transcript
          }
        }
      }
    ];
    return function_call_result_message;
  } catch (error) {
    const errorMessage = `Error fetching the transcript: ${error}`
    console.error(errorMessage);
    const function_call_result_message = [
      {
        functionResponse: {
          name: name,
          response: {
            url: url,
            content: errorMessage
          }
        }
      }
    ];
    return function_call_result_message;
  }
}

function calculate(args, name) {
  const equation = args.equation;
  try {
    const result = evaluate(equation).toString();
    const function_call_result_message = [
      {
        functionResponse: {
          name: name,
          response: {
            equation: equation,
            content: result
          }
        }
      }
    ];
    return function_call_result_message;
  } catch (error) {
    const errorMessage = `Error calculating the equation: ${error}`;
    console.error(errorMessage);
    const function_call_result_message = [
      {
        functionResponse: {
          name: name,
          response: {
            equation: equation,
            content: errorMessage
          }
        }
      }
    ];
    return function_call_result_message;
  }
}

async function manageToolCall(toolCall) {
  const tool_calls_to_function = {
    "web_search": webSearch,
    "search_webpage": searchWebpage,
    "get_youtube_transcript": getYoutubeTranscript,
    "calculate": calculate
  }
  const functionName = toolCall.name;
  const func = tool_calls_to_function[functionName];
  if (func) {
    const args = toolCall.args;
    const result = await func(args, functionName);
    return result;
  } else {
    const errorMessage = `No function found for ${functionName}`;
    console.error(errorMessage);
    const function_call_result_message = [
      {
        functionResponse: {
          name: functionName,
          response: {
            name: functionName,
            content: errorMessage
          }
        }
      }
    ];
    return function_call_result_message;
  }
}

function processFunctionCallsNames(functionCalls) {
  return functionCalls
    .map(tc => {
      if (!tc.name) return '';

      const formattedName = tc.name.split('_')
        .map(word => {
          if (isNaN(word)) {
            return word.charAt(0).toUpperCase() + word.slice(1);
          }
          return word;
        })
        .join(' ');

      const formattedArgs = tc.args ? Object.entries(tc.args)
        .map(([key, value]) => {
          const stringValue = String(value);
          const truncatedValue = stringValue.length > 500 ? stringValue.slice(0, 500) + '...' : stringValue;
          return `${key}: ${truncatedValue}`;
        })
        .join(', ') : '';

      return formattedArgs ? `${formattedName} (${formattedArgs})` : formattedName;
    })
    .filter(name => name)
    .join(', ');
}

export { function_declarations, manageToolCall, processFunctionCallsNames };
