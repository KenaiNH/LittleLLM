import { useEffect, useRef, useState } from 'react';
import type { Config } from '../../shared/config';
import { PROMPT_PRESETS } from '../../shared/promptPresets';
import type { Setting } from './definitions';
import { useSettingsStore } from './store';
import on from '../../../assets/figma/2004-411-imgToggleOn.svg';
import off from '../../../assets/figma/16-205-imgToggleOff.svg';
import styles from './Settings.module.css';
export function SettingRow({
  definition: d,
  config,
  verified = false,
  models = [],
  refreshModels,
  testing = false,
  fallbackValue,
  choices,
}: {
  definition: Setting;
  config: Config;
  verified?: boolean;
  models?: string[];
  refreshModels?: () => void;
  testing?: boolean;
  fallbackValue?: unknown;
  choices?: readonly (readonly [string, string])[];
}) {
  const { patch, invalid, drafts, draft, markInvalid, environment } = useSettingsStore();
  let value: unknown = config[d.section];
  for (const key of d.key.split('.'))
    value =
      value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
  value ??= fallbackValue;
  const key = `${d.section}.${d.key}`,
    multiplier = d.multiplier ?? 1;
  const displayed = typeof value === 'number' ? Number((value / multiplier).toFixed(4)) : value;
  const [text, setText] = useState(drafts[key] ?? String(displayed ?? ''));
  const [tagText, setTagText] = useState('');
  const dirty = useRef(Boolean(drafts[key])),
    timer = useRef<ReturnType<typeof setTimeout>>();
  const editEpoch = useRef(0);
  const disabled = d.disabled?.(config) ?? false;
  useEffect(() => {
    if (!dirty.current) setText(String(displayed ?? ''));
  }, [displayed]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const save = async (raw: unknown) => {
    const epoch = editEpoch.current;
    clearTimeout(timer.current);
    let next = raw;
    if (d.kind === 'font' && typeof raw === 'string' && raw !== 'system-ui') {
      await document.fonts.ready;
      const context = document.createElement('canvas').getContext('2d');
      const sample = 'mmmmmmmmmmWWWW0123456789';
      const differs = ['monospace', 'serif'].some((fallback) => {
        if (!context) return false;
        context.font = '24px ' + fallback;
        const width = context.measureText(sample).width;
        context.font = '24px ' + JSON.stringify(raw) + ', ' + fallback;
        return Math.abs(context.measureText(sample).width - width) > 0.01;
      });
      if (!differs) {
        markInvalid(
          key,
          'This font is unavailable. Choose a suggested font or enter an installed family name.',
        );
        return false;
      }
    }
    if (typeof value === 'number' || d.kind === 'number' || d.kind === 'range') {
      if (raw === '' || !Number.isFinite(Number(raw))) {
        markInvalid(key, 'Enter a number.');
        return false;
      }
      const number = Number(raw);
      if (
        d.step &&
        d.min !== undefined &&
        Math.abs((number - d.min) / d.step - Math.round((number - d.min) / d.step)) > 0.00001
      ) {
        markInvalid(key, `Use steps of ${d.step}.`);
        return false;
      }
      next = number * multiplier;
    }
    const changes: Record<string, unknown> = { [d.key]: next };
    if (key === 'llm.systemPrompt') changes.promptPreset = 'custom';
    if (key === 'llm.promptPreset' && typeof next === 'string' && PROMPT_PRESETS[next])
      changes.systemPrompt = PROMPT_PRESETS[next];
    if (key === 'bubble.maxWidthPx') changes.baseWidthPx = next;
    if (key === 'llm.provider') {
      if (next === 'anthropic') changes.baseUrl = 'https://api.anthropic.com';
      if (next === 'ollama') changes.baseUrl = 'http://localhost:11434';
      if (next === 'openai-compatible' && config.llm.provider === 'anthropic')
        changes.baseUrl = 'https://api.openai.com/v1';
    }
    if (key === 'tts.provider') {
      if (next === 'windows-sapi') {
        changes.voice = '';
        if (config.tts.onFailure === 'sapi') changes.onFailure = 'text-only';
      }
      if (next === 'openai-compatible-tts' && config.tts.provider === 'windows-sapi')
        changes.voice = 'alloy';
    }
    const [target, ...path] = d.key.split('.');
    const error =
      d.section === 'sprite' && path.length && target
        ? await useSettingsStore
            .getState()
            .patchState(target as import('../../shared/spriteImport').SpriteTarget, {
              [path.join('.')]: next,
            })
        : await patch(d.section, changes);
    if (epoch !== editEpoch.current) return false;
    markInvalid(key, error);
    if (!error) {
      dirty.current = false;
      draft(key, null);
    }
    return !error;
  };
  const edit = (raw: string, immediate = false) => {
    editEpoch.current++;
    setText(raw);
    dirty.current = true;
    draft(key, raw);
    clearTimeout(timer.current);
    if (immediate) void save(raw);
    else timer.current = setTimeout(() => void save(raw), 400);
  };
  let options = [...(choices ?? d.options ?? [])];
  if (key === 'tts.onFailure' && config.tts.provider === 'windows-sapi')
    options = options.filter(([id]) => id !== 'sapi');
  if (key === 'window.displayTarget') {
    options.push(
      ...(environment?.displays.map((display) => [display.id, display.label] as const) ?? []),
    );
    if (!options.some(([id]) => id === value)) options.push([String(value), 'Unavailable display']);
  }
  if (key === 'llm.provider' && !config.advanced.developerMode)
    options = options.filter(([id]) => id !== 'mock');
  if (d.kind === 'font')
    options = [
      ['system-ui', 'System UI default'],
      ...(environment?.fonts.map((name) => [name, name] as const) ?? []),
    ];
  const common = {
    id: key,
    'aria-label': d.label,
    disabled,
    'aria-invalid': Boolean(invalid[key]),
    'aria-describedby': invalid[key] ? key + '-error' : undefined,
  };
  const numeric = (
    <input
      {...common}
      className={styles.numeric}
      type="number"
      value={text}
      min={d.min}
      max={d.max}
      step={d.step ?? 1}
      onChange={(event) => edit(event.target.value, true)}
      onBlur={() => {
        if (dirty.current) void save(text);
      }}
    />
  );
  let control;
  if (d.kind === 'toggle')
    control = (
      <button
        {...common}
        role="switch"
        aria-checked={Boolean(value)}
        className={styles.switch}
        onClick={() => void save(!value)}
      >
        <img src={value ? on : off} alt="" />
      </button>
    );
  else if (d.kind === 'select')
    control = (
      <select {...common} value={String(value)} onChange={(event) => void save(event.target.value)}>
        {options.map(([id, label]) => (
          <option
            key={id}
            value={id}
            disabled={
              (d.key === 'mouth.driver' && id === 'amplitude' && config.tts.provider === 'none') ||
              (key === 'bubble.backdropBlur' && id === 'acrylic') ||
              d.unavailableOptions?.includes(id)
            }
          >
            {label}
          </option>
        ))}
      </select>
    );
  else if (d.kind === 'range')
    control = (
      <>
        <input
          {...common}
          aria-label={d.label + ' slider'}
          type="range"
          className={styles.range}
          min={d.min}
          max={d.max}
          step={d.step ?? 1}
          value={Number(text)}
          onChange={(event) => edit(event.target.value, true)}
        />
        {numeric}
        <span className={styles.suffix}>{d.suffix}</span>
      </>
    );
  else if (d.kind === 'number')
    control = (
      <>
        {numeric}
        <span className={styles.suffix}>{d.suffix}</span>
      </>
    );
  else if (d.kind === 'tags')
    control = (
      <div className={styles.tags}>
        {(Array.isArray(value) ? (value as string[]) : []).map((tag, index) => (
          <span className={styles.tag} key={index}>
            {tag}
            <button
              aria-label={`Remove stop sequence ${index + 1}`}
              onClick={() => void save((value as string[]).filter((_, at) => at !== index))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          {...common}
          value={tagText}
          placeholder="Add a stop sequence"
          maxLength={200}
          onChange={(event) => setTagText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && tagText.trim() && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void save([...(value as string[]), tagText]).then((saved) => {
                if (saved) setTagText('');
              });
            }
          }}
        />
      </div>
    );
  else {
    const props = {
      ...common,
      value: text,
      maxLength: d.maxLength,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        edit(event.target.value),
      onBlur: () => {
        if (dirty.current) void save(text);
      },
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' && d.kind !== 'textarea' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          void save(text);
        }
      },
    };
    control = (
      <>
        {d.kind === 'color' && (
          <input
            type="color"
            aria-label={d.label + ' picker'}
            className={styles.color}
            value={String(value)}
            onChange={(event) => edit(event.target.value, true)}
          />
        )}
        {d.kind === 'textarea' ? (
          <textarea {...props} rows={d.rows} />
        ) : (
          <input
            {...props}
            type="text"
            list={d.kind === 'model' ? key + '-choices' : d.kind === 'font' ? 'fonts' : undefined}
          />
        )}
        {d.kind === 'model' && (
          <datalist id={key + '-choices'}>
            {models.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
        )}
        {d.kind === 'font' && (
          <datalist id="fonts">
            {options.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </datalist>
        )}
        {d.kind === 'model' && refreshModels && (
          <button
            className={styles.button}
            aria-label="Refresh models"
            disabled={testing || Boolean(invalid['llm.baseUrl'])}
            onClick={refreshModels}
          >
            ↻
          </button>
        )}
      </>
    );
  }
  return (
    <div className={styles.row} data-control={d.id} title={disabled ? d.disabledHint : undefined}>
      <label className={styles.label} htmlFor={key}>
        {d.label}
        {d.restart && <span className={styles.badge}>Restart required</span>}
        {(key === 'llm.baseUrl' || key === 'tts.baseUrl') && (
          <span
            className={styles.dot}
            data-verified={verified && !dirty.current}
            title={verified && !dirty.current ? 'Verified' : 'Not yet verified'}
          />
        )}
      </label>
      <div
        className={styles.control}
        data-invalid={Boolean(invalid[key])}
        data-unverified={
          (key === 'llm.baseUrl' || key === 'tts.baseUrl') && (!verified || dirty.current)
        }
      >
        {control}
      </div>
      {d.kind === 'textarea' && d.maxLength && (
        <div className={styles.counter}>
          {text.length} / {d.maxLength}
        </div>
      )}
      {invalid[key] && (
        <div role="alert" id={key + '-error'} className={styles.error}>
          {invalid[key]}
        </div>
      )}
      {d.hint && <div className={styles.hint}>{d.hint}</div>}
      {key === 'llm.topP' && config.llm.provider === 'anthropic' && (
        <div className={styles.hint}>
          Anthropic uses Top P when it differs from 1; otherwise it uses Temperature.
        </div>
      )}
      {key === 'llm.systemPrompt' && config.persona.enabled && (
        <div className={styles.hint}>
          A persona is active and will be added to this prompt.{' '}
          <button
            className={styles.textButton}
            onClick={() => void window.companion.openSettings('Persona')}
          >
            View the assembled prompt
          </button>
        </div>
      )}
    </div>
  );
}
