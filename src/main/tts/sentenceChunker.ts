// Runs before Markdown stripping, so a split fence/link is never spoken prematurely.
const abbreviations = /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e)|\b[A-Z])\.$/i;
export class SentenceChunker {
  private pending = '';
  constructor(private markdown = true) {}
  push(delta: string, final = false): string[] {
    this.pending += delta;
    const units: string[] = [];
    let start = 0,
      fence = '',
      fenceLength = 0,
      inline = 0,
      brackets = 0,
      parentheses = 0;
    for (let i = 0; i < this.pending.length; i++) {
      const text = this.pending,
        char = text[i];
      if (this.markdown && (char === '`' || char === '~')) {
        let length = 1;
        while (text[i + length] === char) length++;
        const prefix = text.slice(text.lastIndexOf('\n', i - 1) + 1, i);
        if (length >= 3 && /^[ \t>]*(?:[-*+]|\d+[.)])?[ \t]*$/.test(prefix)) {
          if (!fence && !inline) {
            fence = char;
            fenceLength = length;
          } else if (fence === char && length >= fenceLength) {
            const end = text.indexOf('\n', i + length);
            if (end === -1 && !final) break;
            if (!text.slice(i + length, end === -1 ? text.length : end).trim()) {
              fence = '';
              const at = end === -1 ? text.length : end + 1;
              units.push(text.slice(start, at));
              start = at;
              i = at - 1;
              continue;
            }
          }
          i += length - 1;
          continue;
        }
        if (!fence && char === '`' && text[i - 1] !== '\\') {
          if (!inline) inline = length;
          else if (inline === length) inline = 0;
          i += length - 1;
          continue;
        }
      }
      if (fence) continue;
      if (inline) continue;
      if (this.markdown && char === '[' && text[i - 1] !== '\\') brackets++;
      if (char === ']' && text[i - 1] !== '\\') brackets = Math.max(0, brackets - 1);
      if (this.markdown && char === '(' && (text[i - 1] === ']' || parentheses)) parentheses++;
      if (char === ')' && parentheses) parentheses--;
      if (brackets || parentheses || (this.markdown && char === ']' && !text[i + 1] && !final))
        continue;
      const after = text[i + 1];
      if (!after && !final) continue;
      const part = text.slice(start, i + 1);
      const boundary =
        /[。！？]/u.test(char ?? '') ||
        (/[.!?]/.test(char ?? '') &&
          (!after || /\s/.test(after)) &&
          !(char === '.' && (abbreviations.test(part) || text[i + 1] === '.')));
      if (
        boundary ||
        (i + 1 - start >= 200 && /\s/.test(char ?? '')) ||
        (!this.markdown && i + 1 - start >= 240 && !/[\uD800-\uDBFF]/.test(char ?? ''))
      ) {
        units.push(part);
        start = i + 1;
      }
    }
    this.pending = this.pending.slice(start);
    if (final && this.pending.trim()) {
      units.push(this.pending);
      this.pending = '';
    }
    return units;
  }
}
