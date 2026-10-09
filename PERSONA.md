# Persona

Open Settings → Persona and enable **Give the assistant a persona**. Choose **Save as a new persona** to create the first card. Edit its name, description, speech style and example exchanges; changes save automatically. **Show the assembled prompt** displays the final system prompt and example messages. **Test this persona** sends a real request to the selected model without adding it to your conversation.

Example exchanges are sent before live history and are never saved as conversation messages. Variables are expanded only in description, speech style and greeting fields. Unknown names remain visible with a warning. Prompts above 16,000 characters are refused rather than truncated.

By default, switching personas starts a new conversation and clears saved history. Choose Keep or Ask in Persona Library if you want different behavior. Import/export uses `.persona.json`; exported cards include your name and personal context but no API keys. Imports preview the card, reject files above 64 KB and omit preferred voices unless you check the separate consent option.

Greetings are Off by default. A fixed greeting makes no model request; generated greetings use the selected provider. Greetings do not interrupt input or generation. Failed generated greetings show no error bubble. Daily frequency is stored separately in `greeting-state.json` using the local date. Greetings enter history as assistant messages without a synthetic user message.

The Helpful companion preset switches to Persona-driven when enabled. Custom prompts remain unchanged until you choose **Fix it for me**. Injection and greeting are global settings; Save/Duplicate copy the card fields. Cards and their assets can be replaced without code changes.

Voice preferences and greeting speech have not received new runtime testing under the user's voice-test waiver. Native provider protocol checks pass; live hosted character quality still depends on your selected endpoint/model.
