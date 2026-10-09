import { describe, it, expect, vi, afterEach } from 'vitest';
import { configSchema, personaCardSchema } from '../../src/shared/config';
import {
  buildSystemPrompt,
  previewSystemPrompt,
  personaExamples,
  resolvePersonaText,
} from '../../src/main/llm/persona';
import { historyMessages } from '../../src/main/llm/history';
import { GreetingScheduler } from '../../src/main/llm/greeting';
const id = '00000000-0000-4000-8000-000000000001';
const card = personaCardSchema.parse({
  id,
  name: 'Mira',
  description: 'A fox.',
  speechStyle: 'Warm.',
  replyLength: 'none',
  characterBreak: 'none',
});
const cfg = () =>
  configSchema.parse({
    llm: { systemPrompt: 'BASE' },
    persona: { enabled: true, activeId: id, library: [card] },
  });
const block =
  '# Character\nYou are Mira.\nA fox.\n\n## How you speak\nWarm.\nDo not write physical actions or stage directions.';
describe('persona prompt', () => {
  it('keeps Off and None byte-identical, including whitespace', () => {
    const config = cfg();
    config.llm.systemPrompt = '  BASE\n';
    config.persona.enabled = false;
    expect(buildSystemPrompt(config).text).toBe('  BASE\n');
    config.persona.enabled = true;
    config.persona.activeId = null;
    expect(buildSystemPrompt(config).text).toBe('  BASE\n');
  });
  it.each(['after', 'before', 'replace'] as const)(
    'assembles exact %s order without blank sections',
    (injection) => {
      const config = cfg();
      config.persona.injection = injection;
      expect(buildSystemPrompt(config).text).toBe(
        injection === 'after'
          ? 'BASE\n\n' + block
          : injection === 'before'
            ? block + '\n\nBASE'
            : block,
      );
      expect(buildSystemPrompt(config).text).not.toContain('undefined');
    },
  );
  it('uses every fixed clause independently and omits empty sections', () => {
    for (const replyLength of ['none', 'one-two', 'paragraph', 'unbounded'] as const)
      for (const characterBreak of ['none', 'always', 'technical'] as const)
        for (const allowRoleplayActions of [false, true]) {
          const config = cfg();
          config.persona.library = [
            {
              ...card,
              speechStyle: '',
              description: '',
              replyLength,
              characterBreak,
              allowRoleplayActions,
            },
          ];
          const text = buildSystemPrompt(config).text;
          expect(text.includes('one or two sentences')).toBe(replyLength === 'one-two');
          expect(text.includes('short paragraph at most')).toBe(replyLength === 'paragraph');
          expect(text.includes('Stay in character at all times.')).toBe(
            characterBreak === 'always',
          );
          expect(text.includes('drop the voice')).toBe(characterBreak === 'technical');
          expect(text.includes('You may include short physical actions')).toBe(
            allowRoleplayActions,
          );
          expect(text).not.toContain('## About');
        }
  });
  it('resolves only whitelisted variables and leaves unknown and prototype names literal', () => {
    const config = cfg(),
      context = { date: '10/8/2026', time: '1:15 PM', weekday: 'Thursday', state: 'idle' };
    expect(
      resolvePersonaText(
        '{{persona.name}} {{user.name}} {{date}} {{time}} {{weekday}} {{app.state}} {{typo}} {{toString}}',
        config,
        context,
      ),
    ).toEqual({
      text: 'Mira there 10/8/2026 1:15 PM Thursday idle {{typo}} {{toString}}',
      unknown: ['typo', 'toString'],
    });
    config.persona.library = [{ ...card, userNotes: '{{date}}', description: '{{date}}' }];
    expect(buildSystemPrompt(config, context).text).toContain('10/8/2026');
    expect(buildSystemPrompt(config, context).text).toContain(
      "## About the person you're talking to\n{{date}}",
    );
  });
  it('refuses overlong resolved prompts and preserves examples while trimming all live history', () => {
    const config = cfg();
    config.persona.library = [
      {
        ...card,
        name: 'a'.repeat(48),
        description: '{{persona.name}}'.repeat(260),
        exampleDialogue: [
          { user: 'hello', assistant: 'welcome' },
          { user: '', assistant: 'blank' },
        ],
      },
    ];
    config.llm.systemPrompt = 'b'.repeat(8000);
    expect(previewSystemPrompt(config).tooLong).toBe(true);
    expect(() => buildSystemPrompt(config)).toThrow('16,000');
    const examples = personaExamples(config);
    expect(examples).toHaveLength(2);
    expect(
      historyMessages(
        [{ user: 'old', assistant: 'old reply' }],
        'new',
        { ...config.llm, contextMode: 'token-budget', tokenBudget: 512 },
        'system',
        examples,
      ),
    ).toEqual([...examples, { role: 'user', content: 'new' }]);
  });
});
describe('greeting visibility', () => {
  afterEach(() => vi.useRealTimers());
  it('debounces shows and fires once per launch across cycles', () => {
    vi.useFakeTimers();
    const config = cfg();
    config.persona.greeting.mode = 'static';
    const fire = vi.fn(),
      store = { get: () => null, set: vi.fn() };
    const greeting = new GreetingScheduler(
      () => config,
      () => false,
      fire,
      store,
    );
    greeting.show();
    vi.advanceTimersByTime(1000);
    greeting.hide();
    greeting.show();
    vi.advanceTimersByTime(3000);
    greeting.hide();
    greeting.show();
    vi.advanceTimersByTime(3000);
    expect(fire).toHaveBeenCalledTimes(1);
  });
  it('drops focused/busy cycles and daily state survives a fresh scheduler', () => {
    vi.useFakeTimers();
    const config = cfg();
    config.persona.greeting.mode = 'static';
    config.persona.greeting.frequency = 'daily';
    let busy = true,
      day: string | null = null;
    const fire = vi.fn(),
      store = {
        get: () => day,
        set: (value: string) => {
          day = value;
        },
      },
      now = () => new Date(2026, 9, 8, 12);
    const greeting = new GreetingScheduler(
      () => config,
      () => busy,
      fire,
      store,
      now,
    );
    greeting.show();
    vi.advanceTimersByTime(3000);
    busy = false;
    vi.advanceTimersByTime(10000);
    expect(fire).not.toHaveBeenCalled();
    greeting.show();
    vi.advanceTimersByTime(3000);
    expect(day).toBe('2026-10-8');
    new GreetingScheduler(
      () => config,
      () => false,
      fire,
      store,
      now,
    ).show();
    vi.advanceTimersByTime(3000);
    expect(fire).toHaveBeenCalledTimes(1);
  });
});
