export type ChatMessage={role:'user'|'assistant';content:string};
export type ChatDelta={type:'text';text:string}|{type:'done'}|{type:'error';message:string};
export interface LLMProvider {id:string;supportsImages:boolean;chat(messages:ChatMessage[],opts:{signal:AbortSignal;model:string;systemPrompt?:string}):AsyncIterable<ChatDelta>;}
