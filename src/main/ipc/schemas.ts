import { z } from 'zod';
import { configSchema, configSectionSchema } from '../../shared/config';
import { appErrorSchema } from '../../shared/errors';
export const emptySchema = z.object({}).strict();
export const configSetSchema = z
  .object({ section: configSectionSchema, value: z.unknown() })
  .strict();
export const configResetSchema = z.object({ section: configSectionSchema }).strict();
export const configPatchSchema = z
  .object({
    section: configSectionSchema,
    value: z
      .record(z.unknown())
      .refine((value) => Object.keys(value).length <= 100, 'Too many settings'),
  })
  .strict();
export const settingsRequestSchema = z
  .object({
    panel: z
      .enum([
        'General',
        'Sprites',
        'Model',
        'Persona',
        'Voice',
        'Voice Input',
        'Appearance',
        'Advanced',
      ])
      .default('General'),
  })
  .strict();
export const booleanSchema = z.boolean();
export const moveSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
export const spriteAnchorSchema = z
  .object({
    x: z.number().min(0).max(10000),
    y: z.number().min(0).max(10000),
    width: z.number().positive().max(10000),
    height: z.number().positive().max(10000),
  })
  .strict();
export const resizeSchema = z
  .object({
    width: z.number().int().min(1).max(10000),
    height: z.number().int().min(1).max(10000),
    anchor: spriteAnchorSchema.optional(),
  })
  .strict();
export const resultSchema = <T extends z.ZodTypeAny>(value: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value }),
    z.object({ ok: z.literal(false), error: appErrorSchema }),
  ]);
export const configResultSchema = resultSchema(configSchema);
export const voidResultSchema = resultSchema(z.null());
export const visibilitySchema = z.object({ visible: z.boolean() }).strict();
export const dpiSchema = z.object({ scaleFactor: z.number().positive() }).strict();
export const externalUrlSchema = z
  .object({
    url: z
      .string()
      .url()
      .max(4096)
      .refine((value) => {
        try {
          return ['http:', 'https:', 'mailto:'].includes(new URL(value).protocol);
        } catch {
          return false;
        }
      }, 'Unsupported link scheme'),
  })
  .strict();
export const wheelSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    deltaX: z.number().min(-10000).max(10000),
    deltaY: z.number().min(-10000).max(10000),
    mode: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    ctrl: z.boolean(),
    shift: z.boolean(),
  })
  .strict();
