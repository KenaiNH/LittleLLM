import type { Config } from '../../shared/config';
export function processTranscript(text: string, cfg: Config['stt']) {
  let result = text.trim();
  if (cfg.spokenPunctuation) {
    const punctuation: Record<string, string> = {
      'new paragraph': '\n\n',
      'new line': '\n',
      'question mark': '?',
      'exclamation mark': '!',
      period: '.',
      comma: ',',
    };
    result = result
      .replace(
        /\b(new paragraph|new line|question mark|exclamation mark|period|comma)\b/gi,
        (word) => punctuation[word.toLowerCase()] ?? word,
      )
      .replace(/ +([.,?!])/g, '$1')
      .replace(/ *\n */g, '\n');
  }
  if (cfg.trimFillers)
    result = result
      .replace(/\b(?:um|uh|er|like)\b[ ,]*/gi, '')
      .replace(/ {2,}/g, ' ')
      .trim();
  if (cfg.autoCapitalize && result) {
    result = result.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase());
    if (!/[.!?。！？]["'”’)]*$/.test(result)) result += '.';
  }
  return result.slice(0, 32000);
}
export function insertTranscript(
  draft: string,
  text: string,
  start: number,
  end: number,
  mode: Config['stt']['insertMode'],
) {
  if (mode === 'replace') return text.slice(0, 32000);
  if (mode === 'append')
    return (draft.trimEnd() + (draft.trim() ? ' ' : '') + text).slice(0, 32000);
  const left = draft.slice(0, Math.min(start, draft.length)),
    right = draft.slice(Math.max(start, end));
  return (
    left +
    (left && !/\s$/.test(left) ? ' ' : '') +
    text +
    (right && !/^\s/.test(right) ? ' ' : '') +
    right
  ).slice(0, 32000);
}
