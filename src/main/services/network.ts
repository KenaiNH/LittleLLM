import { session } from 'electron';
import type { ConfigStore } from './configStore';
export async function configureNetwork(config: ConfigStore) {
  let revision = 0;
  let network = session.fromPartition('littlellm-network-0', { cache: false });
  let pending = Promise.resolve();
  const update = () => {
    const cfg = config.get().advanced;
    pending = pending
      .catch(() => undefined)
      .then(async () => {
        const next = session.fromPartition(`littlellm-network-${++revision}`, { cache: false });
        certificatePolicy(next);
        await next.setProxy(
          cfg.proxyMode === 'manual' && cfg.proxyUrl
            ? {
                mode: 'fixed_servers',
                proxyRules: cfg.proxyUrl,
                proxyBypassRules: cfg.proxyBypass
                  .split(',')
                  .map((value) => value.trim())
                  .join(';'),
              }
            : { mode: cfg.proxyMode === 'system' ? 'system' : 'direct' },
        );
        await network.closeAllConnections();
        network = next;
      });
    return pending;
  };
  const certificatePolicy = (target: Electron.Session) =>
    target.setCertificateVerifyProc((request, callback) => {
      const cfg = config.get();
      const trusted = [cfg.llm.baseUrl, cfg.tts.baseUrl, cfg.tts.custom.url]
        .filter(Boolean)
        .some((url) => {
          try {
            return new URL(url ?? '').hostname === request.hostname;
          } catch {
            return false;
          }
        });
      callback(
        cfg.advanced.allowSelfSigned &&
          trusted &&
          request.verificationResult === 'net::ERR_CERT_AUTHORITY_INVALID'
          ? 0
          : -3,
      );
    });
  await update();
  const scope = () => {
    const cfg = config.get();
    return JSON.stringify([
      cfg.advanced.proxyMode,
      cfg.advanced.proxyUrl,
      cfg.advanced.proxyBypass,
      cfg.advanced.allowSelfSigned,
      cfg.llm.baseUrl,
      cfg.tts.baseUrl,
      cfg.tts.custom.url,
    ]);
  };
  let signature = scope();
  config.onChange((section, cfg) => {
    if (!['advanced', 'llm', 'tts'].includes(section)) return;
    void cfg;
    const next = scope();
    if (next !== signature) {
      signature = next;
      void update().catch(() => console.warn('Network proxy could not be applied.'));
    }
  });
  // Main providers retain WHATWG streams and cancellation while Windows/PAC/SOCKS
  // settings now govern the actual requests, rather than Node's direct fetch.
  globalThis.fetch = async (input, init) => {
    await pending;
    return network.fetch(input instanceof URL ? input.href : input, {
      ...init,
      credentials: 'omit',
    });
  };
}
