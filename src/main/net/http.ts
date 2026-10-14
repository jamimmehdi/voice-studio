import { createWriteStream, renameSync } from 'node:fs';
import { get as httpsGet } from 'node:https';
import type { IncomingMessage } from 'node:http';

const USER_AGENT = 'voice-studio';
const MAX_REDIRECTS = 6;

/** GET with redirect following. Rejects on non-200 responses. */
export function httpGet(url: string, redirects = MAX_REDIRECTS): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    httpsGet(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location && redirects > 0) {
        res.resume();
        resolve(httpGet(new URL(location, url).toString(), redirects - 1));
        return;
      }
      if (status !== 200) {
        res.resume();
        reject(new Error(`HTTP ${status}`));
        return;
      }
      resolve(res);
    }).on('error', reject);
  });
}

export async function getText(url: string): Promise<string> {
  const res = await httpGet(url);
  const chunks: Buffer[] = [];
  for await (const chunk of res) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** Downloads to `dest` through a `.part` file so a partial download never looks complete. */
export async function downloadToFile(url: string, dest: string): Promise<string> {
  const res = await httpGet(url);
  const tmp = `${dest}.part`;
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(tmp);
    res.pipe(out);
    out.on('finish', () => out.close(() => resolve()));
    out.on('error', reject);
    res.on('error', reject);
  });
  renameSync(tmp, dest);
  return dest;
}
