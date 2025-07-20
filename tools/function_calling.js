import { YoutubeTranscript } from 'youtube-transcript';
import { evaluate } from 'mathjs'

const function_declarations = [
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
