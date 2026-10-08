import type { Page } from '@playwright/test';
export async function configureMock(page: Page, model = 'echo') {
  await page.evaluate(async (model) => {
    const result = await window.companion.getConfig();
    if (!result.ok) throw new Error(result.error.userMessage);
    await window.companion.setConfig('advanced', { ...result.value.advanced, developerMode: true });
    await window.companion.setConfig('llm', {
      ...result.value.llm,
      provider: 'mock',
      model,
      mockReplySpeed: 1000,
    });
    await window.companion.setConfig('bubble', { ...result.value.bubble, textReveal: 'instant' });
  }, model);
}
