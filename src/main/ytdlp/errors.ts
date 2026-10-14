/** Turns yt-dlp's stderr into one short sentence a user can act on. */
export function friendlyYtdlpError(stderr: string): string {
  const text = stderr || '';
  if (/confirm your age|age-restricted/i.test(text)) {
    return 'This video is age-restricted – YouTube needs a logged-in account for it. Download the mp3 elsewhere and use "Add files".';
  }
  if (/private video|members-only/i.test(text)) return 'This video is private or members-only.';
  if (/not a bot/i.test(text)) return 'YouTube asked for a bot check. Try again later or use another video.';
  if (/unavailable|not available/i.test(text))
    return 'This video is unavailable (removed or blocked in your region).';

  const lines = text.split(/\r?\n/).filter(Boolean);
  const errorLine = [...lines].reverse().find((l) => /ERROR/.test(l));
  const message = errorLine ?? lines[lines.length - 1] ?? 'Unknown error';
  return message.slice(0, 220);
}

/** Only absolute https links are handed to the downloader (no flags, no local paths). */
export function isAcceptableUrl(url: string): boolean {
  return typeof url === 'string' && /^https:\/\/\S+$/i.test(url) && !url.startsWith('-');
}

/** Last line of `--print after_move:%(title)s|||%(filepath)s` output. */
export function parsePrintedResult(stdout: string): { title: string; file: string } | null {
  const line = stdout.trim().split(/\r?\n/).pop() ?? '';
  const idx = line.indexOf('|||');
  if (idx < 0) return null;
  const title = line.slice(0, idx);
  const file = line.slice(idx + 3);
  return file ? { title, file } : null;
}
