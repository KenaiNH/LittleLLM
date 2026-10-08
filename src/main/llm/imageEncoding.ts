import type { ChatMessage } from './types';
import type { Config } from '../../shared/config';
export function openAiMessages(messages: ChatMessage[], detail: Config['llm']['imageDetail']) {
  return messages.map(({ role, content, images }) => ({
    role,
    content: images?.length
      ? [
          { type: 'text', text: content },
          ...images.map((image) => ({
            type: 'image_url',
            image_url: { url: `data:${image.mediaType};base64,${image.data}`, detail },
          })),
        ]
      : content,
  }));
}
export function anthropicMessages(messages: ChatMessage[]) {
  return messages.map(({ role, content, images }) => ({
    role,
    content: images?.length
      ? [
          ...images.map((image) => ({
            type: 'image',
            source: { type: 'base64', media_type: image.mediaType, data: image.data },
          })),
          { type: 'text', text: content },
        ]
      : content,
  }));
}
export function ollamaMessages(messages: ChatMessage[]) {
  return messages.map(({ role, content, images }) => ({
    role,
    content,
    ...(images?.length ? { images: images.map((image) => image.data) } : {}),
  }));
}
