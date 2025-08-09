# Comprehensive Guide: Using the File API in JavaScript with Gemini API

The Gemini File API enables you to handle various media types including images, documents (PDFs), videos, and audio files in JavaScript applications. This guide covers all essential operations for working with multimodal content using the File API.

## Prerequisites

Before getting started, ensure you have:
- The Gemini JavaScript SDK installed: `npm install @google/genai`
- A valid Gemini API key
- Basic understanding of async/await in JavaScript

## Basic Setup

```javascript
import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "YOUR_GEMINI_API_KEY" });
```

## Core File API Operations

### Uploading Files

Use the File API when you want to reuse files across multiple requests:

```javascript
async function uploadFile(filePath, mimeType) {
  const file = await ai.files.upload({
    file: filePath,
    config: { mimeType: mimeType },
  });
  
  // Wait for processing (important for large files)
  let getFile = await ai.files.get({ name: file.name });
  while (getFile.state === 'PROCESSING') {
    console.log(`File status: ${getFile.state}`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    getFile = await ai.files.get({ name: file.name });
  }
  
  if (getFile.state === 'FAILED') {
    throw new Error('File processing failed.');
  }
  
  return file;
}
```

### Getting File Metadata

```javascript
async function getFileInfo(fileName) {
  const fileInfo = await ai.files.get({ name: fileName });
  console.log(fileInfo);
  return fileInfo;
}
```

## Working with Images

### Upload and Process Images

```javascript
async function processImage(imagePath, prompt = "Caption this image.") {
  // Upload image using File API
  const imageFile = await ai.files.upload({
    file: imagePath,
    config: { mimeType: "image/jpeg" },
  });

  // Generate content
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: createUserContent([
      createPartFromUri(imageFile.uri, imageFile.mimeType),
      prompt,
    ]),
  });

  return response.text;
}
```

### Multiple Images Processing

```javascript
async function processMultipleImages(image1Path, image2Path) {
  // Upload first image
  const image1 = await ai.files.upload({
    file: image1Path,
    config: { mimeType: "image/jpeg" },
  });

  // Upload second image
  const image2 = await ai.files.upload({
    file: image2Path,
    config: { mimeType: "image/png" },
  });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: createUserContent([
      "What is different between these two images?",
      createPartFromUri(image1.uri, image1.mimeType),
      createPartFromUri(image2.uri, image2.mimeType),
    ]),
  });

  return response.text;
}
```

## Working with Documents (PDFs)

### Upload and Process PDF Documents

```javascript
async function processPDF(pdfPath, prompt = "Summarize this document") {
  const pdfFile = await ai.files.upload({
    file: pdfPath,
    config: { mimeType: "application/pdf" },
  });

  // Wait for processing
  let getFile = await ai.files.get({ name: pdfFile.name });
  while (getFile.state === 'PROCESSING') {
    console.log(`PDF processing status: ${getFile.state}`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    getFile = await ai.files.get({ name: pdfFile.name });
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: createUserContent([
      createPartFromUri(pdfFile.uri, pdfFile.mimeType),
      prompt,
    ]),
  });

  return response.text;
}
```

### Processing PDFs from URLs

```javascript
async function processPDFFromURL(pdfUrl, prompt = "Summarize this document") {
  const pdfBuffer = await fetch(pdfUrl)
    .then(response => response.arrayBuffer());

  const fileBlob = new Blob([pdfBuffer], { type: 'application/pdf' });

  const file = await ai.files.upload({
    file: fileBlob,
    config: {
      displayName: 'Remote_PDF.pdf',
    },
  });

  // Wait for processing
  let getFile = await ai.files.get({ name: file.name });
  while (getFile.state === 'PROCESSING') {
    await new Promise(resolve => setTimeout(resolve, 5000));
    getFile = await ai.files.get({ name: file.name });
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: createUserContent([
      createPartFromUri(file.uri, file.mimeType),
      prompt,
    ]),
  });

  return response.text;
}
```

### Processing Multiple PDFs

```javascript
async function processMultiplePDFs(pdf1Url, pdf2Url) {
  async function uploadPDF(url, displayName) {
    const pdfBuffer = await fetch(url)
      .then(response => response.arrayBuffer());

    const fileBlob = new Blob([pdfBuffer], { type: 'application/pdf' });

    const file = await ai.files.upload({
      file: fileBlob,
      config: { displayName },
    });

    // Wait for processing
    let getFile = await ai.files.get({ name: file.name });
    while (getFile.state === 'PROCESSING') {
      await new Promise(resolve => setTimeout(resolve, 5000));
      getFile = await ai.files.get({ name: file.name });
    }

    return file;
  }

  const [file1, file2] = await Promise.all([
    uploadPDF(pdf1Url, "PDF 1"),
    uploadPDF(pdf2Url, "PDF 2")
  ]);

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: createUserContent([
      "Compare these two documents and highlight key differences",
      createPartFromUri(file1.uri, file1.mimeType),
      createPartFromUri(file2.uri, file2.mimeType),
    ]),
  });

  return response.text;
}
```

## Working with Videos

### Upload and Process Videos

```javascript
async function processVideo(videoPath, prompt = "Summarize this video") {
  const videoFile = await ai.files.upload({
    file: videoPath,
    config: { mimeType: "video/mp4" },
  });

  // Wait for processing (important for videos)
  let getFile = await ai.files.get({ name: videoFile.name });
  while (getFile.state === 'PROCESSING') {
    console.log(`Video processing status: ${getFile.state}`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    getFile = await ai.files.get({ name: videoFile.name });
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: createUserContent([
      createPartFromUri(videoFile.uri, videoFile.mimeType),
      prompt,
    ]),
  });

  return response.text;
}
```

## Working with Audio Files

### Upload and Process Audio

```javascript
async function processAudio(audioPath, prompt = "Describe this audio clip") {
  const audioFile = await ai.files.upload({
    file: audioPath,
    config: { mimeType: "audio/mp3" },
  });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: createUserContent([
      createPartFromUri(audioFile.uri, audioFile.mimeType),
      prompt,
    ]),
  });

  return response.text;
}
```

### Audio Transcription with Timestamps

```javascript
async function transcribeAudioWithTimestamps(audioPath, startTime = "02:30", endTime = "03:29") {
  const audioFile = await ai.files.upload({
    file: audioPath,
    config: { mimeType: "audio/mp3" },
  });

  const prompt = `Provide a transcript of the speech from ${startTime} to ${endTime}.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: createUserContent([
      createPartFromUri(audioFile.uri, audioFile.mimeType),
      prompt,
    ]),
  });

  return response.text;
}
```

## Advanced Operations

### Error Handling

```javascript
async function processFileWithErrorHandling(filePath, mimeType, prompt) {
  try {
    const file = await ai.files.upload({
      file: filePath,
      config: { mimeType },
    });

    // Wait for processing with timeout
    let getFile = await ai.files.get({ name: file.name });
    let attempts = 0;
    const maxAttempts = 20; // 100 seconds timeout

    while (getFile.state === 'PROCESSING' && attempts < maxAttempts) {
      console.log(`File status: ${getFile.state} (${attempts + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      getFile = await ai.files.get({ name: file.name });
      attempts++;
    }

    if (getFile.state === 'FAILED') {
      throw new Error('File processing failed');
    }

    if (attempts >= maxAttempts) {
      throw new Error('File processing timeout');
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: createUserContent([
        createPartFromUri(file.uri, file.mimeType),
        prompt,
      ]),
    });

    return response.text;

  } catch (error) {
    console.error('Error processing file:', error);
    throw error;
  }
}
```

## File Storage Limits and Best Practices

### Storage Information
- **Storage limit**: 20 GB per project
- **File retention**: Files are automatically deleted after 48 hours
- **Maximum file size**: 2 GB per file

### Best Practices

1. **Use File API for reusable files**: Use the File API when reusing files across multiple requests

2. **Wait for processing**: Always check file processing status before using uploaded files

3. **Handle different file types appropriately**:
   - Images: Support PNG, JPEG, WEBP, HEIC, HEIF
   - Documents: PDF format recommended for best results
   - Videos: Support MP4, MPEG, MOV, AVI, FLV, MPG, WEBM, WMV, 3GPP
   - Audio: Support WAV, MP3, AIFF, AAC, OGG, FLAC

4. **Error handling**: Implement proper error handling and timeouts for file processing
