import { spawn } from 'node:child_process';
import { z } from 'zod';

// Fixed code only. Text/voice values travel as JSON on stdin, never shell source.
const script = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType=WindowsRuntime]
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesisStream, Windows.Media.SpeechSynthesis, ContentType=WindowsRuntime]
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
if ($request.action -eq 'voices') {
  $voices = @([Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | ForEach-Object {
    @{ id = $_.Id; name = ($_.DisplayName + ' — ' + $_.Language) }
  })
  ConvertTo-Json -InputObject $voices -Compress
  exit
}
$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
try {
  if ($request.voice -and $request.voice -ne 'alloy') {
    $voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.Id -eq $request.voice } | Select-Object -First 1
    if (-not $voice) { throw 'The selected Windows voice is no longer installed.' }
    $synth.Voice = $voice
  }
  $text = [System.Security.SecurityElement]::Escape([string]$request.text)
  $lang = [System.Security.SecurityElement]::Escape($synth.Voice.Language)
  $rate = ([double]$request.speed * 100).ToString('0.##', [Globalization.CultureInfo]::InvariantCulture) + '%'
  $pitch = ([double]$request.pitch * 2).ToString('+0.##;-0.##;0', [Globalization.CultureInfo]::InvariantCulture) + '%'
  $ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="' + $lang + '"><prosody rate="' + $rate + '" pitch="' + $pitch + '">' + $text + '</prosody></speak>'
  $operation = $synth.SynthesizeSsmlToStreamAsync($ssml)
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Length -eq 1 -and $_.GetParameters().Length -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation' + [char]96 + '1' } | Select-Object -First 1
  $task = $method.MakeGenericMethod([Windows.Media.SpeechSynthesis.SpeechSynthesisStream]).Invoke($null, @($operation))
  $task.Wait()
  $stream = $task.Result
  $inputStream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
  $memory = New-Object System.IO.MemoryStream
  try {
    $inputStream.CopyTo($memory)
    if ($memory.Length -gt 33554432) { throw 'Audio exceeds the per-utterance budget.' }
    [Console]::Out.Write([Convert]::ToBase64String($memory.ToArray()))
  } finally { $memory.Dispose(); $inputStream.Dispose(); $stream.Dispose() }
} finally { $synth.Dispose() }
`;
export const windowsVoiceSchema = z
  .array(z.object({ id: z.string().max(200), name: z.string().max(200) }).strict())
  .max(1000);
export function windowsSpeech(
  request:
    | { action: 'voices' }
    | { action: 'speak'; text: string; voice: string; speed: number; pitch: number },
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  if (process.platform !== 'win32')
    return Promise.reject(new Error('Windows speech requires Windows.'));
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ],
      {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    const parts: Buffer[] = [];
    let bytes = 0,
      failed = false;
    const fail = (error: Error) => {
      failed = true;
      child.kill();
      reject(error);
    };
    const abort = () => fail(new DOMException('Cancelled', 'AbortError'));
    const timer = setTimeout(() => fail(new Error('Windows speech timed out.')), 60000);
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (part: Buffer) => {
      bytes += part.length;
      if (bytes > 45 * 1024 * 1024) fail(new Error('Windows audio exceeds its size budget.'));
      else parts.push(part);
    });
    // Do not expose native stderr, which can include spoken text or user paths.
    child.stderr.resume();
    child.stdin.on('error', () => undefined);
    child.on('error', fail);
    child.once('close', (code) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (!failed) {
        if (code === 0)
          resolve(
            Buffer.concat(parts)
              .toString('utf8')
              .replace(/^\uFEFF/, '')
              .trim(),
          );
        else
          reject(new Error('Windows could not synthesize speech. Check installed Windows voices.'));
      }
    });
    child.stdin.end(JSON.stringify(request), 'utf8');
    if (signal.aborted) abort();
  });
}
