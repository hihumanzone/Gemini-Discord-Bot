import path from 'path';

const TEXT_ATTACHMENT_EXTENSIONS = new Set([
  '.html',
  '.js',
  '.css',
  '.json',
  '.xml',
  '.csv',
  '.py',
  '.java',
  '.sql',
  '.log',
  '.md',
  '.txt',
  '.docx',
  '.pptx',
]);

function normalizeContentType(contentType = '') {
  return contentType.toLowerCase();
}

export function getAttachmentExtension(attachmentOrName) {
  const fileName = typeof attachmentOrName === 'string'
    ? attachmentOrName
    : attachmentOrName?.name ?? '';

  return path.extname(fileName).toLowerCase();
}

export function isUploadableAttachment(attachment) {
  const contentType = normalizeContentType(attachment?.contentType);

  return (
    (contentType.startsWith('image/') && contentType !== 'image/gif') ||
    contentType.startsWith('audio/') ||
    contentType.startsWith('video/') ||
    contentType.startsWith('application/pdf') ||
    contentType.startsWith('application/x-pdf')
  );
}

export function isTextExtractableAttachment(attachment) {
  return TEXT_ATTACHMENT_EXTENSIONS.has(getAttachmentExtension(attachment));
}

export function isSupportedAttachment(attachment) {
  return isUploadableAttachment(attachment) || isTextExtractableAttachment(attachment);
}

export function hasSupportedAttachments(message) {
  return Array.from(message.attachments.values()).some(isSupportedAttachment);
}

export function isOfficeDocumentExtension(fileExtension) {
  return ['.docx', '.pptx'].includes((fileExtension || '').toLowerCase());
}

export function sanitizeFileName(fileName = 'file') {
  const { name, ext } = path.parse(fileName);
  const sanitizedBaseName = (name || fileName)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '');
  const sanitizedExtension = ext.toLowerCase().replace(/[^a-z0-9]/g, '');

  return sanitizedExtension
    ? `${sanitizedBaseName || 'file'}.${sanitizedExtension}`
    : sanitizedBaseName || 'file';
}
