import { writeFile, mkdir } from 'node:fs/promises';
// Build-time Unicode CLDR data only; speech never fetches descriptions at runtime.
const decode = text => text.replace(/&(amp|quot|apos|lt|gt);/g, (_, key) => ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'})[key]);
const names = {};
for (const directory of ['annotations', 'annotationsDerived']) {
  const response = await fetch(`https://raw.githubusercontent.com/unicode-org/cldr/main/common/${directory}/en.xml`);
  if (!response.ok) throw new Error('CLDR download failed');
  for (const match of (await response.text()).matchAll(/<annotation cp="([^"]+)" type="tts">([^<]+)<\/annotation>/g)) {
    const emoji = decode(match[1]);
    if (/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(emoji) && !match[2].includes('↑')) names[emoji.replace(/\ufe0f/g, '')] = decode(match[2]);
  }
}
await mkdir('assets/speech', {recursive:true});
await writeFile('assets/speech/emoji-descriptions.json', JSON.stringify(names, null, 2) + '\n');
const license = await fetch('https://www.unicode.org/license.txt');
if (!license.ok) throw new Error('Unicode license download failed');
await writeFile('assets/speech/UNICODE-LICENSE.txt', await license.text());
console.log(`Bundled ${Object.keys(names).length} CLDR emoji descriptions.`);
