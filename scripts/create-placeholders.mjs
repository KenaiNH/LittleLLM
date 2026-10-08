import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
// Deterministic temporary geometric artwork; runtime knows only imported PNG files.
await mkdir('assets/default-sprites',{recursive:true});
for (const [state,color,mouth,accent] of [
  ['idle','#8db5df','',''],
  ['thinking','#e9b44c','<circle cx="64" cy="78" r="4" fill="#182642"/>','<text x="99" y="28" font-size="26" fill="#e9b44c">?</text>'],
  ['speaking','#68c99b','<ellipse cx="64" cy="78" rx="9" ry="10" fill="#182642"/>','<path d="M102 52l9-5m-9 13h12m-12 8l9 5" stroke="#68c99b" stroke-width="4"/>'],
]) {
  const expression=state==='idle'?'<path d="M56 78h16" stroke="#182642" stroke-width="3"/>':mouth;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><ellipse cx="64" cy="103" rx="28" ry="15" fill="${color}"/><circle cx="64" cy="65" r="30" fill="${color}"/><circle cx="53" cy="62" r="3" fill="#182642"/><circle cx="75" cy="62" r="3" fill="#182642"/>${expression}${accent}<ellipse cx="45" cy="117" rx="13" ry="5" fill="${color}"/><ellipse cx="83" cy="117" rx="13" ry="5" fill="${color}"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`assets/default-sprites/${state}.png`);
}
