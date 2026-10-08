// Runs before Markdown stripping, so a split fence/link is never spoken prematurely.
const abbreviations = /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e)|\b[A-Z])\.$/i;
export class SentenceChunker {
  private pending = '';
  constructor(private markdown = true) {}
  push(delta: string, final = false): string[] {
    this.pending += delta;
    const units: string[] = [];
    let start = 0, fence = '', inline = false, brackets = 0, parentheses = 0;
    for (let i = 0; i < this.pending.length; i++) {
      const text = this.pending, char = text[i];
      if (this.markdown && (char === '`' || char === '~') && (i === 0 || text[i - 1] === '\n') && text.slice(i, i + 3) === char.repeat(3)) {
        if (!fence) fence = char;
        else if (fence === char) fence = '';
        i += 2;
        if (!fence) {
          const end = text.indexOf('\n', i + 1);
          if (end === -1 && !final) break;
          const at = end === -1 ? text.length : end + 1;
          units.push(text.slice(start, at)); start = at; i = at - 1;
        }
        continue;
      }
      if (fence) continue;
      if (this.markdown && char === '`' && text[i - 1] !== '\\') inline = !inline;
      if (inline) continue;
      if (this.markdown && char === '[' && text[i - 1] !== '\\') brackets++;
      if (char === ']' && text[i - 1] !== '\\') brackets = Math.max(0, brackets - 1);
      if (this.markdown && char === '(' && (text[i - 1] === ']' || parentheses)) parentheses++;
      if (char === ')' && parentheses) parentheses--;
      if (brackets || parentheses || (this.markdown && char === ']' && !text[i + 1] && !final)) continue;
      const after = text[i + 1];
      if (!after && !final) continue;
      const part = text.slice(start, i + 1);
      const boundary = /[。！？]/u.test(char ?? '') || (/[.!?]/.test(char ?? '') && (!after || /\s/.test(after)) && !(char === '.' && (abbreviations.test(part) || text[i + 1] === '.')));
      if (boundary || (i + 1 - start >= 200 && /\s/.test(char ?? '')) || (!this.markdown && i + 1 - start >= 240 && !/[\uD800-\uDBFF]/.test(char ?? ''))) {
        units.push(part); start = i + 1;
      }
    }
    this.pending = this.pending.slice(start);
    if (final && this.pending.trim()) { units.push(this.pending); this.pending = ''; }
    return units;
  }
}
