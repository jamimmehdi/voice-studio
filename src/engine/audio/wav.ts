/**
 * Encodes mono float samples (chunks, -1..1) as a 16-bit PCM WAV file.
 * Pure function so it can be unit-tested without any audio hardware.
 */
export function encodeWav16Mono(chunks: readonly Float32Array[], sampleRate: number): ArrayBuffer {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const buffer = new ArrayBuffer(44 + total * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + total * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeText(36, 'data');
  view.setUint32(40, total * 2, true);

  let offset = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, chunk[i]!));
      view.setInt16(offset, Math.round(s * 32767), true);
    }
  }
  return buffer;
}

/** `voice-studio-2026-10-14T10-20-30.wav` */
export function recordingFileName(date: Date): string {
  const stamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `voice-studio-${stamp}.wav`;
}
