import { BrowserWindow, screen, powerMonitor, Menu, app, ipcMain, nativeTheme } from 'electron';
import { resizeSchema, booleanSchema, moveSchema } from '../ipc/schemas';
import { CHANNELS } from '../ipc/channels';
import type { ConfigStore } from '../services/configStore';
import { preloadPath, secureWindow, loadRenderer } from './security';
import { clampPosition, defaultPosition, snapPosition } from './placement';
import {
  arrangePet,
  bubbleLimits,
  petLayoutRequestSchema,
  petViewportSchema,
  type PetViewport,
} from '../../shared/petLayout';
import { emptySchema, resultSchema } from '../ipc/schemas';
import { normalizeError } from '../../shared/errors';
import { wheelSchema } from '../ipc/schemas';
import { forwardWheel } from '../platform/win32/wheel';
import { preventMouseActivation } from '../platform/win32/focus';
import { geometryFitScale, scaleGeometry } from '../../shared/spriteGeometry';
import { frameGeometry, type SpriteGeometry } from '../../shared/spriteGeometry';
import { capturePlacement, placedOrigin } from './spritePlacement';
export async function createPetWindow(
  config: ConfigStore,
  settings: (panel: string) => void,
  created?: (win: BrowserWindow) => void,
  idleDimensions?: () => Promise<{ width: number; height: number }>,
): Promise<BrowserWindow> {
  const cfg = config.get().window;
  let idleSize = { width: 128, height: 128 };
  try {
    if (idleDimensions) idleSize = await idleDimensions();
  } catch {
    /* The renderer reports invalid artwork; keep a recoverable window. */
  }
  const displays = screen.getAllDisplays();
  const display =
    cfg.displayTarget === 'cursor'
      ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
      : (displays.find((d) => String(d.id) === cfg.displayTarget) ?? screen.getPrimaryDisplay());
  const idleGeometry = (dpi: number, area = display.workArea) => {
    const sprite = config.get().sprite;
    const geometry = frameGeometry(
      idleSize.width,
      idleSize.height,
      sprite.scale / (sprite.scaleMode === 'fixed' ? dpi : 1),
      sprite.idle.anchor,
      sprite.flipHorizontal,
    );
    return scaleGeometry(geometry, geometryFitScale(geometry, area, dpi));
  };
  let geometry: SpriteGeometry = idleGeometry(display.scaleFactor);
  const size = {
    width: Math.max(1, Math.round(geometry.width)),
    height: Math.max(1, Math.round(geometry.height)),
  };
  const saved = cfg.restorePosition ? cfg.positions[String(display.id)] : undefined;
  const position = clampPosition(
    saved ?? defaultPosition(size, display.workArea, cfg.defaultAnchor, cfg.edgeMarginPx),
    size,
    display.workArea,
  );
  let placement = capturePlacement(
    position,
    geometry,
    display.workArea,
    cfg.edgeMarginPx,
    saved ? undefined : cfg.defaultAnchor,
  );
  const win = new BrowserWindow({
    ...size,
    ...position,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    skipTaskbar: !cfg.showInTaskbar,
    hasShadow: false,
    alwaysOnTop: true,
    fullscreenable: false,
    focusable: true,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The visible companion normally stays unfocused. Its explicit visibility
      // gate pauses rAF when hidden; Chromium must not throttle visible animation.
      backgroundThrottling: false,
    },
  });
  secureWindow(win);
  preventMouseActivation(win.getNativeWindowHandle());
  win.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform !== 'win32')
    win.setVisibleOnAllWorkspaces(cfg.allWorkspaces, { visibleOnFullScreen: false });
  win.setContentProtection(cfg.contentProtection);
  let viewport: PetViewport = {
    ...arrangePet({ ...position, ...size }, null, display.workArea, 'auto', 12),
    dpi: display.scaleFactor,
    dark: nativeTheme.shouldUseDarkColors,
  };
  const view = () => ({
    ...viewport,
    window: win.getBounds(),
    workArea: screen.getDisplayMatching(win.getBounds()).workArea,
    dark: nativeTheme.shouldUseDarkColors,
  });
  const emitViewport = () => {
    if (!win.isDestroyed()) win.webContents.send(CHANNELS.windowViewportChanged, view());
  };
  // Native move events also accompany layout/size changes. Only external moves
  // may replace the logical placement or run drag snapping/persistence.
  let expectedPosition = win.getPosition();
  const setLayoutBounds = (bounds: PetViewport['window']) => {
    const x = Math.round(bounds.x),
      y = Math.round(bounds.y);
    expectedPosition = [x, y];
    win.setBounds({ ...bounds, x, y });
    expectedPosition = win.getPosition();
  };
  const persistPlacement = () => {
    if (win.isDestroyed()) return;
    const current = screen.getDisplayMatching(win.getBounds()),
      now = config.get().window;
    const idle = idleGeometry(current.scaleFactor, current.workArea);
    const point = clampPosition(
      placedOrigin(placement, idle, current.workArea),
      idle,
      current.workArea,
    );
    config.set('window', { ...now, positions: { ...now.positions, [String(current.id)]: point } });
  };
  let bubbleSize: { width: number; height: number } | null = null;
  const applyLayout = (current = screen.getDisplayMatching(win.getBounds())) => {
    const cfg = config.get(),
      limits = bubbleLimits(cfg, current.workArea, current.scaleFactor);
    viewport = {
      ...arrangePet(
        {
          ...placedOrigin(placement, geometry, current.workArea),
          width: geometry.width,
          height: geometry.height,
        },
        bubbleSize,
        current.workArea,
        cfg.bubble.bubblePlacement,
        cfg.bubble.gapFromSpritePx,
        geometry.anchor.x / geometry.width,
        70 * limits.scale,
      ),
      dpi: current.scaleFactor,
      dark: nativeTheme.shouldUseDarkColors,
    };
    setLayoutBounds(viewport.window);
  };
  ipcMain.handle(CHANNELS.windowForwardWheel, (event, payload: unknown) => {
    try {
      if (
        event.sender !== win.webContents ||
        event.senderFrame !== win.webContents.mainFrame ||
        config.get().bubble.wheelBehavior !== 'passthrough'
      )
        throw new Error('Wheel forwarding is not enabled');
      const value = wheelSchema.parse(payload),
        bounds = win.getBounds();
      if (
        value.x < bounds.x ||
        value.y < bounds.y ||
        value.x >= bounds.x + bounds.width ||
        value.y >= bounds.y + bounds.height
      )
        throw new Error('Wheel point is outside the companion');
      const point = screen.dipToScreenPoint({ x: value.x, y: value.y });
      forwardWheel(win.getNativeWindowHandle(), point, value);
      return { ok: true, value: null };
    } catch (error) {
      return { ok: false, error: normalizeError(error) };
    }
  });
  ipcMain.handle(CHANNELS.windowViewport, (event, payload: unknown) => {
    try {
      if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
        throw new Error('Untrusted viewport sender');
      emptySchema.parse(payload);
      return resultSchema(petViewportSchema).parse({ ok: true, value: view() });
    } catch (error) {
      return { ok: false, error: normalizeError(error) };
    }
  });
  ipcMain.handle(CHANNELS.windowLayout, (event, payload: unknown) => {
    try {
      if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
        throw new Error('Untrusted layout sender');
      const request = petLayoutRequestSchema.parse(payload),
        bounds = win.getBounds(),
        current = screen.getDisplayMatching(bounds);
      const nextGeometry: SpriteGeometry = {
        ...request.sprite,
        anchor: request.anchor ?? { x: request.sprite.width / 2, y: request.sprite.height },
      };
      geometry = nextGeometry;
      bubbleSize = request.bubble;
      applyLayout(current);
      return resultSchema(petViewportSchema).parse({ ok: true, value: viewport });
    } catch (error) {
      return { ok: false, error: normalizeError(error) };
    }
  });
  win.once('ready-to-show', () => {
    if (!cfg.startMinimized) win.showInactive();
  });
  const reassert = () => {
    if (!win.isDestroyed()) {
      win.setAlwaysOnTop(true, 'screen-saver');
      const bounds = win.getBounds();
      const current = screen.getDisplayMatching(bounds);
      applyLayout(current);
      win.webContents.send(CHANNELS.windowDpi, { scaleFactor: current.scaleFactor });
      emitViewport();
    }
  };
  screen.on('display-metrics-changed', reassert);
  screen.on('display-removed', reassert);
  powerMonitor.on('resume', reassert);
  nativeTheme.on('updated', emitViewport);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let artworkGeneration = 0;
  let windowConfig = cfg;
  const removeConfig = config.onChange((section, changed) => {
    if (section === 'window') {
      const now = changed.window,
        previous = windowConfig;
      windowConfig = now;
      if (now.showInTaskbar !== previous.showInTaskbar) win.setSkipTaskbar(!now.showInTaskbar);
      if (now.allWorkspaces !== previous.allWorkspaces)
        if (process.platform !== 'win32')
          win.setVisibleOnAllWorkspaces(now.allWorkspaces, { visibleOnFullScreen: false });
      if (
        now.displayTarget !== previous.displayTarget ||
        (!now.restorePosition &&
          (now.defaultAnchor !== previous.defaultAnchor ||
            now.edgeMarginPx !== previous.edgeMarginPx ||
            previous.restorePosition))
      ) {
        const target =
          now.displayTarget === 'cursor'
            ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
            : (screen.getAllDisplays().find((value) => String(value.id) === now.displayTarget) ??
              screen.getPrimaryDisplay());
        const idle = idleGeometry(target.scaleFactor, target.workArea);
        const origin = now.restorePosition ? now.positions[String(target.id)] : undefined;
        const point =
          origin ?? defaultPosition(idle, target.workArea, now.defaultAnchor, now.edgeMarginPx);
        placement = capturePlacement(
          point,
          idle,
          target.workArea,
          now.edgeMarginPx,
          origin ? undefined : now.defaultAnchor,
        );
        applyLayout(target);
        win.webContents.send(CHANNELS.windowDpi, { scaleFactor: target.scaleFactor });
        emitViewport();
      } else if (now.keepOnScreen && !previous.keepOnScreen) reassert();
    }
    if (section !== 'sprite' || !idleDimensions) return;
    const epoch = ++artworkGeneration;
    void idleDimensions()
      .then((value) => {
        if (epoch !== artworkGeneration || win.isDestroyed()) return;
        idleSize = value;
        persistPlacement();
      })
      .catch(() => {
        /* Existing geometry stays recoverable until valid artwork is restored. */
      });
  });
  win.on('move', () => {
    const bounds = win.getBounds();
    if (bounds.x === expectedPosition[0] && bounds.y === expectedPosition[1]) return;
    const current = screen.getDisplayMatching(bounds),
      now = config.get().window;
    const sprite = { x: bounds.x + viewport.sprite.x, y: bounds.y + viewport.sprite.y };
    const snap = now.snapToEdges
      ? snapPosition(sprite, geometry, current.workArea, now.snapDistancePx)
      : sprite;
    const point = now.keepOnScreen ? clampPosition(snap, geometry, current.workArea) : snap;
    placement = capturePlacement(point, geometry, current.workArea, now.edgeMarginPx);
    expectedPosition = win.getPosition();
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (win.isDestroyed()) return;
      applyLayout();
      persistPlacement();
      emitViewport();
    }, 150);
  });
  win.on('show', () => win.webContents.send(CHANNELS.windowVisibility, { visible: true }));
  win.on('hide', () => win.webContents.send(CHANNELS.windowVisibility, { visible: false }));
  ipcMain.on(CHANNELS.windowIgnoreMouse, (event, value: unknown) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) return;
    const parsed = booleanSchema.safeParse(value);
    if (parsed.success)
      win.setIgnoreMouseEvents(
        config.get().advanced.clickThrough === 'never' ? false : parsed.data,
        { forward: true },
      );
  });
  ipcMain.on(CHANNELS.windowMove, (event, value: unknown) => {
    if (
      event.sender !== win.webContents ||
      event.senderFrame !== win.webContents.mainFrame ||
      !config.get().advanced.dragEnabled
    )
      return;
    const parsed = moveSchema.safeParse(value);
    if (!parsed.success) return;
    const sprite = { x: parsed.data.x + viewport.sprite.x, y: parsed.data.y + viewport.sprite.y };
    const area = screen.getDisplayNearestPoint(sprite).workArea;
    const point = config.get().window.keepOnScreen ? clampPosition(sprite, geometry, area) : sprite;
    win.setPosition(
      Math.round(point.x - viewport.sprite.x),
      Math.round(point.y - viewport.sprite.y),
    );
  });
  ipcMain.on(CHANNELS.windowResize, (event, value: unknown) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) return;
    const payload = resizeSchema.safeParse(value);
    if (!payload.success) return;
    const bounds = win.getBounds(),
      area = screen.getDisplayMatching(bounds).workArea;
    const size = {
      width: Math.min(payload.data.width, area.width),
      height: Math.min(payload.data.height, area.height),
    };
    const p = clampPosition(
      { x: bounds.x + bounds.width - size.width, y: bounds.y + bounds.height - size.height },
      size,
      area,
    );
    setLayoutBounds({ ...p, ...size });
  });
  win.webContents.on('context-menu', () =>
    Menu.buildFromTemplate([
      { label: 'Settings', click: () => settings('General') },
      { label: 'Hide', click: () => win.hide() },
      { label: 'Quit', click: () => app.quit() },
    ]).popup({ window: win }),
  );
  win.once('closed', () => {
    removeConfig();
    clearTimeout(timer);
    screen.removeListener('display-metrics-changed', reassert);
    screen.removeListener('display-removed', reassert);
    powerMonitor.removeListener('resume', reassert);
    nativeTheme.removeListener('updated', emitViewport);
  });
  // A first launch establishes its saved idle position; layout moves never do.
  if (!saved) persistPlacement();
  created?.(win);
  await loadRenderer(win, 'pet');
  return win;
}
