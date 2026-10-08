import { describe,it,expect } from 'vitest';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import UPNG from 'upng-js';
import { decodeImage } from '../../src/main/services/imageDecoder';
import { spriteStateSchema } from '../../src/shared/config';
import { naturalSort } from '../../src/main/services/spriteLoader';
describe('production sprite decoder',()=>{
  it('extracts sheet cells in configured order',async()=>{const dir=await mkdtemp(join(tmpdir(),'sprite-sheet-'));try{const path=join(dir,'sheet.png');await sharp({create:{width:8,height:4,channels:4,background:'#ff0000'}}).png().toFile(path);const frames=await decodeImage(path,spriteStateSchema.parse({mode:'sheet',frameWidth:4,frameHeight:4}),1024);expect(frames).toHaveLength(2);expect(frames[0]?.pixels[0]).toBe(255);expect(frames[0]?.width).toBe(4);}finally{await rm(dir,{recursive:true,force:true});}});
  it('predecodes animated PNG with file timing',async()=>{const dir=await mkdtemp(join(tmpdir(),'sprite-apng-'));try{const path=join(dir,'animation.apng');const a=new Uint8Array(16*16*4).fill(255),b=new Uint8Array(16*16*4);b[3]=255;const bytes=UPNG.encode([a.buffer,b.buffer],16,16,0,[100,200]);await writeFile(path,Buffer.from(bytes));const frames=await decodeImage(path,spriteStateSchema.parse({}),4096);expect(frames).toHaveLength(2);expect(frames.map(f=>f.delayMs)).toEqual([100,200]);expect(frames[1]?.pixels[0]).toBe(0);}finally{await rm(dir,{recursive:true,force:true});}});
  it('enforces decoded memory budget',async()=>await expect(decodeImage('assets/default-sprites/idle.png',spriteStateSchema.parse({}),16)).rejects.toThrow());
  it('sorts natural filenames',()=>expect(naturalSort(['frame10.png','frame2.png','frame1.png'])).toEqual(['frame1.png','frame2.png','frame10.png']));
});
