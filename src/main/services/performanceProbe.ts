import { app, type BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
// Opt-in isolated test run only. No debugger or Playwright connection is needed.
export async function performanceProbe(pet: BrowserWindow, directory: string, started: number) {
  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  let painted = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      painted = await pet.webContents.executeJavaScript(
        '(()=>{const canvas=document.querySelector("canvas[data-testid=sprite]"); return Boolean(canvas && canvas.width && canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data.some((value,index)=>index%4===3 && value>0));})()',
      );
    } catch {
      /* Renderer is starting. */
    }
    if (painted && pet.isVisible()) break;
    await wait(10);
  }
  const coldStartMs = Date.now() - started;
  const metrics = () =>
    app
      .getAppMetrics()
      .map((value) => ({
        type: value.type,
        cpu: value.cpu.percentCPUUsage,
        workingSetMb: value.memory.workingSetSize / 1024,
        privateMb: (value.memory.privateBytes ?? 0) / 1024,
      }));
  const sample = async () => {
    metrics();
    const values = [];
    for (let at = 0; at < 6; at++) {
      await wait(500);
      values.push(metrics());
    }
    return {
      cpuAverage:
        values.reduce((sum, items) => sum + items.reduce((sum, item) => sum + item.cpu, 0), 0) /
        values.length,
      workingSetMb: values.at(-1)?.reduce((sum, item) => sum + item.workingSetMb, 0),
      privateMb: values.at(-1)?.reduce((sum, item) => sum + item.privateMb, 0),
      processes: values.at(-1),
    };
  };
  await wait(2000);
  const visible = await sample();
  pet.hide();
  await wait(1000);
  const hidden = await sample();
  writeFileSync(
    join(directory, 'performance.json'),
    JSON.stringify({ packaged: app.isPackaged, painted, coldStartMs, visible, hidden }, null, 2),
  );
  app.quit();
}
