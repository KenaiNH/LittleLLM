import DOMPurify from 'dompurify';
import { marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
import bash from 'highlight.js/lib/languages/bash';
for (const [name, grammar] of Object.entries({ javascript, typescript, python, json, css, bash }))
  hljs.registerLanguage(name, grammar);
export function dialogueHtml(text: string): string {
  const safe = DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true, breaks: true }), {
    FORBID_TAGS: [
      'style',
      'form',
      'input',
      'button',
      'textarea',
      'select',
      'iframe',
      'object',
      'video',
      'audio',
    ],
    FORBID_ATTR: ['style', 'id'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
  });
  const document = new DOMParser().parseFromString(safe, 'text/html');
  for (const img of document.querySelectorAll('img')) {
    const source = img.getAttribute('src') ?? '';
    if (/^https?:\/\//i.test(source)) img.src = `companion://images/${encodeURIComponent(source)}`;
    else if (!/^data:image\/(png|jpeg|gif|webp);base64,/i.test(source)) img.remove();
  }
  for (const link of document.querySelectorAll('a')) {
    const href = link.getAttribute('href');
    if (!href || !/^(https?:|mailto:)/i.test(href)) link.removeAttribute('href');
  }
  for (const pre of document.querySelectorAll('pre')) {
    const code = pre.querySelector('code'),
      language = code?.className.match(/\blanguage-([\w-]+)/)?.[1];
    if (
      code &&
      language &&
      hljs.getLanguage(language) &&
      code.textContent &&
      code.textContent.length <= 32000
    )
      code.innerHTML = DOMPurify.sanitize(
        hljs.highlight(code.textContent, { language, ignoreIllegals: true }).value,
        { ALLOWED_TAGS: ['span'], ALLOWED_ATTR: ['class'] },
      );
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Copy code';
    button.dataset.copyCode = 'true';
    pre.prepend(button);
  }
  return document.body.innerHTML;
}
