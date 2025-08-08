### Introduction to the File API

The File API allows you to upload and store files that can then be referenced in your calls to the Gemini API. This is a two-step process:

1.  **Upload the file:** You first upload your file to the Gemini API, which returns a file reference.
2.  **Generate content:** You then use this file reference in your `generateContent` request to the model.

Files uploaded via the File API are stored for 48 hours and can be accessed during that time using your API key. The File API is available at no cost in all regions where the Gemini API is available.

### Handling Image Files

The Gemini API can process a wide variety of image formats. The File API is particularly useful when working with large images or when you need to use the same image in multiple prompts.

To upload and use an image file, you can use the following JavaScript code:

```javascript
import { GoogleGenAI, createUserContent, createPartFromUri } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: "YOUR_API_KEY" });

async function main() {
  // Upload the image file
  const myfile = await ai.files.upload({
    file: "path/to/sample.jpg",
    config: {
      mimeType: "image/jpeg",
    },
  });

  // Use the uploaded image in a generateContent request
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: createUserContent([
      createPartFromUri(myfile.uri, myfile.mimeType),
      "Caption this image.",
    ]),
  });
  console.log(response.text);
}

main();
```

You can also prompt with multiple images by including multiple `createPartFromUri` objects in the `contents` array.

**Supported Image Formats:**
*   PNG - image/png
*   JPEG - image/jpeg
*   WEBP - image/webp
*   HEIC - image/heic
*   HEIF - image/heif

### Handling Document Files (PDFs)

The Gemini API can process PDF documents, understanding not just the text but also the images, diagrams, and tables within them. For large PDFs, the File API is the recommended approach.

Here's how to upload a PDF from a local file:

```javascript
import { createPartFromUri, GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: "YOUR_API_KEY" });

async function main() {
  const file = await ai.files.upload({
    file: 'path-to-localfile.pdf',
    config: {
      displayName: 'My Document.pdf',
    },
  });

  // Wait for the file to be processed
  let getFile = await ai.files.get({ name: file.name });
  while (getFile.state === 'PROCESSING') {
    getFile = await ai.files.get({ name: file.name });
    console.log(`current file status: ${getFile.state}`);
    console.log('File is still processing, retrying in 5 seconds');
    await new Promise((resolve) => {
      setTimeout(resolve, 5000);
    });
  }

  if (file.state === 'FAILED') {
    throw new Error('File processing failed.');
  }

  const content = [
    'Summarize this document',
  ];
  if (file.uri && file.mimeType) {
    const fileContent = createPartFromUri(file.uri, file.mimeType);
    content.push(fileContent);
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: content,
  });
  console.log(response.text);
}

main();
```

You can also upload a PDF from a URL. The Gemini API can also process multiple PDF documents in a single request.

### Handling Video Files

The Gemini API can process videos to describe, segment, and extract information. For videos larger than 20MB or when you want to reuse a video, use the File API.

Here is an example of uploading and using a video file:

```javascript
import { GoogleGenAI, createUserContent, createPartFromUri } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: "YOUR_API_KEY" });

async function main() {
  const myfile = await ai.files.upload({
    file: "path/to/sample.mp4",
    config: {
      mimeType: "video/mp4"
    },
  });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: createUserContent([
      createPartFromUri(myfile.uri, myfile.mimeType),
      "Summarize this video. Then create a quiz with an answer key based on the information in this video.",
    ]),
  });
  console.log(response.text);
}

main();
```

**Supported Video Formats:**
*   video/mp4
*   video/mpeg
*   video/mov
*   video/avi
*   video/x-flv
*   video/mpg
*   video/webm
*   video/wmv
*   video/3gpp

### Handling Audio Files

The Gemini API can analyze and understand audio input for tasks like transcription and summarization. The File API should be used for audio files larger than 20MB.

This is how you can upload and use an audio file:

```javascript
import { GoogleGenAI, createUserContent, createPartFromUri } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: "YOUR_API_KEY" });

async function main() {
  const myfile = await ai.files.upload({
    file: "path/to/sample.mp3",
    config: {
      mimeType: "audio/mp3"
    },
  });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: createUserContent([
      createPartFromUri(myfile.uri, myfile.mimeType),
      "Describe this audio clip",
    ]),
  });
  console.log(response.text);
}

main();
```

You can also get a transcript of the audio by simply asking for it in the prompt.

**Supported Audio Formats:**
*   WAV - audio/wav
*   MP3 - audio/mp3
*   AIFF - audio/aiff
*   AAC - audio/aac
*   OGG Vorbis - audio/ogg
*   FLAC - audio/flac
