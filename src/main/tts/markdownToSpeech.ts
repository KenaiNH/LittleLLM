import { marked, type Token, type Tokens } from 'marked';
import type { Config } from '../../shared/config';
import descriptions from '../../../assets/speech/emoji-descriptions.json';
type Options = Pick<Config['tts'], 'codeBlockSpeech' | 'linkSpeech' | 'emojiSpeech'>;
const names: Record<string, string> = descriptions;
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
function speechTokens(tokens: Token[], opts: Options): string {
  return tokens
    .map((token) => {
      if (token.type === 'code')
        return opts.codeBlockSpeech === 'read'
          ? token.text
          : opts.codeBlockSpeech === 'announce'
            ? 'code block'
            : '';
      if (token.type === 'html') return '';
      if (token.type === 'link')
        return opts.linkSpeech === 'skip'
          ? ''
          : opts.linkSpeech === 'full-url'
            ? token.href
            : speechTokens(token.tokens ?? [], opts);
      if (token.type === 'image') return opts.linkSpeech === 'skip' ? '' : token.text;
      if (token.type === 'list')
        return (
          ' ' +
          (token as Tokens.List).items.map((item) => speechTokens(item.tokens, opts)).join(' ') +
          ' '
        );
      if (token.type === 'table')
        return [...token.header, ...token.rows.flat()]
          .map((cell) => speechTokens(cell.tokens, opts))
          .join(' ');
      if (token.type === 'br' || token.type === 'hr' || token.type === 'space') return ' ';
      if ('tokens' in token && token.tokens)
        return (
          speechTokens(token.tokens, opts) +
          (['paragraph', 'heading', 'blockquote'].includes(token.type) ? ' ' : '')
        );
      return 'text' in token ? String(token.text) : '';
    })
    .join('');
}
export function markdownToSpeech(markdown: string, opts: Options): string {
  const text = speechTokens(marked.lexer(markdown), opts).replace(
    /&(?:amp|lt|gt|quot|apos|#39|#x27);/g,
    (entity) =>
      ({
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&apos;': "'",
        '&#39;': "'",
        '&#x27;': "'",
      })[entity] ?? '',
  );
  return [...segmenter.segment(text)]
    .map(({ segment }) => {
      if (!/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(segment)) return segment;
      return opts.emojiSpeech === 'skip'
        ? ' '
        : ' ' + (names[segment.replace(/\ufe0f/g, '')] ?? 'emoji') + ' ';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
