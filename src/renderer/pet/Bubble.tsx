import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Config } from '../../shared/config';
import type { PetViewport } from '../../shared/petLayout';
import { bubbleLimits } from '../../shared/petLayout';
import surface from '../../../assets/figma/2016-89-imgBubbleSurface.svg';
import inset from '../../../assets/figma/2016-89-imgInnerBorder.svg';
import continuation from '../../../assets/figma/2016-89-imgDialogueContinuation.svg';
import { dialogueHtml } from './markdown';
import { useReveal } from './useReveal';
import styles from './Bubble.module.css';
export function Bubble({
  name,
  text,
  config,
  viewport,
  onMeasure,
  streaming = false,
  onStop,
  onRegenerate,
  error,
}: {
  name: string;
  text: string;
  config: Config;
  viewport: PetViewport;
  onMeasure: (size: { width: number; height: number }) => void;
  streaming?: boolean;
  onStop?: () => void;
  onRegenerate?: () => void;
  error?: string;
}) {
  const root = useRef<HTMLElement>(null),
    content = useRef<HTMLDivElement>(null),
    [suspended, setSuspended] = useState(false),
    [pending, setPending] = useState(false),
    [scrolling, setScrolling] = useState(false),
    [height, setHeight] = useState(232);
  const cfg = config.bubble,
    limits = bubbleLimits(config, viewport.workArea, viewport.dpi, viewport.sprite.height),
    scale = limits.scale;
  const revealed = useReveal(text, config.llm.stream ? cfg.textReveal : 'instant', cfg.revealRate),
    html = useMemo(
      () => (cfg.renderMarkdown ? dialogueHtml(revealed) : null),
      [cfg.renderMarkdown, revealed],
    );
  const dark = cfg.theme === 'dark' || (cfg.theme === 'system' && viewport.dark);
  const colors =
    cfg.theme === 'custom'
      ? { background: cfg.backgroundColor, text: cfg.textColor, accent: cfg.accentColor }
      : cfg.theme === 'high-contrast'
        ? { background: '#000000', text: '#ffffff', accent: '#ffff00' }
        : dark
          ? { background: '#11161d', text: '#f5f7fa', accent: '#71b7ff' }
          : { background: '#ffffff', text: '#202124', accent: '#1768b2' };
  const original =
    cfg.theme === 'custom' &&
    colors.background === '#7897d6' &&
    Math.abs(cfg.backgroundOpacity - 199 / 255) < 0.001 &&
    colors.accent === '#e4e9ff' &&
    cfg.border === 'thin' &&
    cfg.cornerRadiusPx === 0;
  const padding = cfg.paddingPx * scale,
    border = cfg.border === 'none' ? 0 : cfg.border === 'thick' ? 2 : 1;
  const style = {
    width: limits.width,
    maxHeight: limits.height,
    fontFamily: cfg.fontFamily,
    fontSize: cfg.fontSizePx * scale,
    lineHeight: cfg.lineHeight,
    color: colors.text,
    padding: `${Math.max(4, padding - 6 * scale)}px ${padding}px ${padding + 14 * scale}px`,
    borderRadius: cfg.cornerRadiusPx * scale,
    '--bubble-accent': colors.accent,
    '--bubble-background': colors.background,
    '--bubble-opacity': cfg.backgroundOpacity,
    '--bubble-scale': scale,
    '--bubble-border': border,
    '--bubble-tail': cfg.showTail ? 'block' : 'none',
    filter:
      cfg.shadow === 'none'
        ? 'none'
        : cfg.shadow === 'soft'
          ? 'drop-shadow(0 4px 8px #0004)'
          : 'drop-shadow(0 8px 16px #0008)',
  } as CSSProperties;
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const bounds = element.getBoundingClientRect();
      setHeight((old) => (Math.abs(old - bounds.height) < 0.1 ? old : bounds.height));
      onMeasure({ width: bounds.width, height: bounds.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [onMeasure]);
  useEffect(() => {
    const element = content.current;
    if (!element) return;
    if (cfg.autoScroll && !suspended) {
      element.scrollTop = element.scrollHeight;
      setPending(false);
    } else if (suspended) setPending(true);
  }, [revealed, cfg.autoScroll, suspended]);
  useEffect(() => {
    const element = content.current,
      child = element?.firstElementChild;
    if (!element || !child) return;
    const observer = new ResizeObserver(() => {
      if (cfg.autoScroll && !suspended) element.scrollTop = element.scrollHeight;
    });
    observer.observe(child);
    return () => observer.disconnect();
  }, [cfg.autoScroll, cfg.renderMarkdown, suspended]);
  useEffect(() => {
    if (!scrolling) return;
    const timer = setTimeout(() => setScrolling(false), 700);
    return () => clearTimeout(timer);
  }, [scrolling, revealed]);
  useEffect(() => {
    const element = root.current;
    if (!element || cfg.wheelBehavior !== 'passthrough') return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      void window.companion.forwardWheel({
        x: window.screenX + event.clientX,
        y: window.screenY + event.clientY,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        mode: event.deltaMode === 1 ? 1 : event.deltaMode === 2 ? 2 : 0,
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
      });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [cfg.wheelBehavior]);
  useEffect(() => () => window.companion.hoverBubble(false), []);
  const latest = () => {
    const element = content.current;
    if (element) element.scrollTop = element.scrollHeight;
    setSuspended(false);
    setPending(false);
  };
  const horizontal = viewport.placement === 'left' || viewport.placement === 'right',
    rotation =
      viewport.placement === 'below'
        ? 180
        : viewport.placement === 'left'
          ? -90
          : viewport.placement === 'right'
            ? 90
            : 0,
    mirror = viewport.placement === 'below' ? !viewport.mirror : viewport.mirror;
  const decoration = {
    width: horizontal ? height : limits.width,
    height: horizontal ? limits.width : height,
    left: horizontal ? (limits.width - height) / 2 : 0,
    top: horizontal ? (height - limits.width) / 2 : 0,
    transform: `rotate(${rotation}deg) ${mirror ? 'scaleX(-1)' : ''}`,
  };
  return (
    <section
      ref={root}
      style={style}
      className={styles.bubble}
      data-testid="bubble"
      data-streaming={streaming}
      data-interactive
      data-scrollbar={cfg.scrollbar}
      data-scrolling={scrolling}
      data-autoscroll={suspended ? 'suspended' : 'following'}
      data-code-theme={cfg.codeTheme}
      onMouseEnter={() => window.companion.hoverBubble(true)}
      onMouseLeave={() => window.companion.hoverBubble(false)}
    >
      {original ? (
        <div className={styles.decoration} style={decoration}>
          <div
            className={styles.surface}
            style={{
              borderImageSource: `url("${surface.replaceAll('"', '%22')}")`,
              borderImageSlice: '1 1 22 1 fill',
              clipPath: cfg.showTail ? undefined : `inset(0 0 ${22 * scale}px)`,
            }}
          />
          <div
            className={styles.inset}
            style={{ borderImageSource: `url("${inset.replaceAll('"', '%22')}")` }}
          />
        </div>
      ) : (
        <div
          className={styles.decoration}
          style={{ ...decoration, borderRadius: cfg.cornerRadiusPx * scale }}
        >
          <div className={styles.customSurface} />
        </div>
      )}
      <p className={styles.name}>{name}</p>
      {error && (
        <span role="alert" className={styles.unavailable}>
          {error}
        </span>
      )}
      <div
        ref={content}
        className={styles.content}
        data-testid="bubble-content"
        onScroll={() => {
          const element = content.current;
          if (element) {
            const above = element.scrollHeight - element.clientHeight - element.scrollTop > 24;
            setSuspended(above);
            if (!above) setPending(false);
            setScrolling(true);
          }
        }}
        onWheel={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          const copy = target.closest('button[data-copy-code]');
          if (copy) {
            void window.companion.copyText(
              copy.parentElement?.querySelector('code')?.textContent ?? '',
            );
            return;
          }
          const link = target.closest('a');
          if (link) {
            event.preventDefault();
            if (link.href) void window.companion.openExternal(link.href);
          }
        }}
      >
        {html !== null ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div className={styles.plain}>{revealed}</div>
        )}
      </div>
      <footer className={styles.footer}>
        {cfg.showTokenCount && <span>{text.length} chars</span>}
        <button onClick={() => void window.companion.copyText(text)}>Copy reply</button>
        <button onClick={onRegenerate}>Regenerate</button>
        {streaming && <button onClick={onStop}>Stop</button>}
        {pending && <button onClick={latest}>↓ New messages</button>}
      </footer>
      <button
        className={styles.continuation}
        aria-label="Dismiss dialogue"
        onClick={() => void window.companion.dismissBubble()}
      >
        <img src={continuation} alt="" />
      </button>
      {cfg.backdropBlur === 'acrylic' && (
        <span className={styles.unavailable} role="alert">
          Strong acrylic is unavailable in this build. Choose None or Subtle.
        </span>
      )}
    </section>
  );
}
