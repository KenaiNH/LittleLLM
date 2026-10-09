import Store from 'electron-store';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configSchema, configSections, type Config, type ConfigSection } from '../../shared/config';
import { recoverConfig } from './configRecovery';
export class ConfigStore {
  private store: Store<Config>;
  private listeners = new Set<(section: ConfigSection, config: Config) => void>();
  readonly recovered: string[];
  readonly backupPath: string | undefined;
  readonly firstRun: boolean;
  constructor(directory: string) {
    const path = join(directory, 'config.json');
    this.firstRun = !existsSync(path);
    let raw: unknown = {};
    if (!this.firstRun) {
      try {
        raw = JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        raw = null;
      }
    }
    const recovery = recoverConfig(raw);
    this.recovered = recovery.recovered;
    if (recovery.recovered.length) {
      this.backupPath = join(
        directory,
        `config.corrupt.${new Date().toISOString().replace(/:/g, '-')}.json`,
      );
      if (existsSync(path)) copyFileSync(path, this.backupPath);
    }
    writeFileSync(path, JSON.stringify(recovery.config, null, 2));
    this.store = new Store<Config>({ cwd: directory, name: 'config', clearInvalidConfig: false });
  }
  get(): Config {
    return configSchema.parse(this.store.store);
  }
  set(section: ConfigSection, value: unknown): Config {
    const data = configSections[section].parse(value);
    this.store.set(section, data);
    const config = this.get();
    for (const listener of this.listeners) listener(section, config);
    return config;
  }
  reset(section: ConfigSection): Config {
    return this.set(section, {});
  }
  setSections(sections: Partial<Record<ConfigSection, unknown>>): Config {
    const next = configSchema.parse({ ...this.get(), ...sections });
    this.store.store = next;
    for (const section of Object.keys(sections) as ConfigSection[])
      for (const listener of this.listeners) listener(section, next);
    return next;
  }
  onChange(listener: (section: ConfigSection, config: Config) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  replace(value: Config) {
    const cfg = configSchema.parse(value);
    this.store.store = cfg;
    for (const section of Object.keys(configSections) as ConfigSection[])
      for (const listener of this.listeners) listener(section, cfg);
    return cfg;
  }
}
