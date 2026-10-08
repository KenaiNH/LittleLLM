import { z } from 'zod';
import { configSchema } from './config';
export const SETTINGS_FONTS = [
  'Courier Prime',
  'Inter',
  'Cousine',
  'Segoe UI',
  'Segoe UI Variable',
  'Arial',
  'Calibri',
  'Consolas',
  'Cascadia Mono',
  'Georgia',
  'Tahoma',
  'Times New Roman',
  'Verdana',
];
export const secretIdSchema = z.enum([
  'llm.openai-compatible',
  'llm.anthropic',
  'tts.openai-compatible-tts',
  'tts.elevenlabs',
  'tts.custom-http',
  'stt.openai-compatible-stt',
  'stt.custom-http',
]);
export type SecretId = z.infer<typeof secretIdSchema>;
export const secretRequestSchema = z.object({ id: secretIdSchema }).strict();
export const secretSetSchema = secretRequestSchema
  .extend({ value: z.string().min(1).max(4096) })
  .strict();
export const secretStatusSchema = z
  .object({ has: z.boolean(), last4: z.string().max(4), revision: z.string().max(64) })
  .strict();
export type SecretStatus = z.infer<typeof secretStatusSchema>;
export const settingsEnvironmentSchema = z
  .object({
    displays: z.array(z.object({ id: z.string(), label: z.string() }).strict()).max(64),
    fonts: z.array(z.string().max(128)).max(5000),
    version: z.string(),
    electron: z.string(),
    chromium: z.string(),
    node: z.string(),
    configPath: z.string(),
    packaged: z.boolean(),
    updateFeedConfigured: z.boolean(),
    historyWarning: z.string().nullable(),
  })
  .strict();
export type SettingsEnvironment = z.infer<typeof settingsEnvironmentSchema>;
export const settingsPanelSchema = z.enum([
  'General',
  'Sprites',
  'Model',
  'Persona',
  'Voice',
  'Voice Input',
  'Appearance',
  'Advanced',
]);
export const resetPanelSchema = z.object({ panel: settingsPanelSchema }).strict();
export const resetPanelResultSchema = z
  .object({ config: configSchema, reset: z.boolean() })
  .strict();
