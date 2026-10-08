import { configSections, configSchema, CONFIG_SCHEMA_VERSION, defaults, type Config } from '../../shared/config';
export class FutureConfigError extends Error {constructor(){super('This settings file was created by a newer version of the app.');}}
type Migration=(value:Record<string,unknown>)=>Record<string,unknown>;
const migrations:Record<number,Migration>={0:cfg=>({...cfg,schemaVersion:1})};
export function recoverConfig(raw:unknown):{config:Config;recovered:string[]} {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {config:defaults(),recovered:['root']};
  let source={...raw} as Record<string,unknown>;
  let version=source.schemaVersion??0;
  if(typeof version!=='number'||!Number.isInteger(version)||version<0)return {config:defaults(),recovered:['schemaVersion']};
  if(version>CONFIG_SCHEMA_VERSION)throw new FutureConfigError();
  while(version<CONFIG_SCHEMA_VERSION){const migrate=migrations[version];if(!migrate)throw new Error('Missing config migration');source=migrate(source);version++;}
  const cfg:Record<string,unknown>={schemaVersion:CONFIG_SCHEMA_VERSION};const recovered:string[]=[];
  for(const[key,schema]of Object.entries(configSections)){const result=schema.safeParse(source[key]===undefined?{}:source[key]);if(result.success)cfg[key]=result.data;else{cfg[key]=schema.parse({});recovered.push(key);}}
  return {config:configSchema.parse(cfg),recovered};
}
