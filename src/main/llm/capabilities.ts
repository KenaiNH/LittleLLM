import type { Config } from '../../shared/config';
import type { ImageCapability } from '../../shared/attachments';
import type { LLMProvider } from './types';
export function knownImageSupport(provider: string, model: string): boolean | null {
  const name = model.toLowerCase();
  if (provider === 'mock') return false;
  if (provider === 'anthropic')
    return /^claude-(?:instant|2)(?:[-.:]|$)/.test(name)
      ? false
      : /^claude-/.test(name)
        ? true
        : null;
  if (/^(?:text-|embedding|gpt-3\.5|davinci|babbage|o1-mini|o1-preview)(?:.*)$/.test(name))
    return false;
  if (/^(?:gpt-4o|gpt-4\.1|gpt-5|o3|o4-mini)(?:[-.:]|$)/.test(name)) return true;
  if (
    /^(?:smollm2?|qwen2(?:\.5)?|mistral|gemma2|llama3(?:\.1)?)(?:[:/]|$)/.test(name) &&
    !/vision|vl/.test(name)
  )
    return false;
  if (/(?:llava|moondream|vision|smolvlm|qwen.*-vl)/.test(name)) return true;
  return null;
}
export async function imageCapability(
  config: Config,
  provider: LLMProvider,
): Promise<ImageCapability> {
  if (!config.llm.enableImages)
    return {
      allowed: false,
      supportsImages: null,
      reason: 'Enable image attachments in Model settings.',
    };
  if (!provider.supportsImages)
    return {
      allowed: false,
      supportsImages: false,
      reason: 'This provider does not support image attachments.',
    };
  let support = knownImageSupport(config.llm.provider, config.llm.model);
  if (provider.imageSupport) {
    try {
      const probed = await provider.imageSupport(config.llm.model);
      if (probed !== null) support = probed;
    } catch {
      /* Keep known support; an unavailable probe is not a negative result. */
    }
  }
  return {
    allowed: support !== false,
    supportsImages: support,
    reason:
      support === false
        ? 'The selected model is text-only. Choose a vision model to attach images.'
        : support === null
          ? 'Vision support is unverified. This model may reject images.'
          : '',
  };
}
