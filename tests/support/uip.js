// Call the uip CLI and return the parsed JSON envelope's Data.
// uip prints progress/telemetry lines around the JSON, so slice from the
// first "{" to the last "}" before parsing.

import { execFileSync } from 'node:child_process';

export function uip(args) {
  let out;
  try {
    out = execFileSync('uip', [...args, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
  }
  const start = out.indexOf('{'), end = out.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`uip ${args.slice(0, 3).join(' ')}: no JSON in output\n${out}`);
  const env = JSON.parse(out.slice(start, end + 1));
  if (env.Result !== 'Success') throw new Error(`uip ${args.slice(0, 3).join(' ')}: ${env.Message || env.Result}`);
  return env.Data;
}

