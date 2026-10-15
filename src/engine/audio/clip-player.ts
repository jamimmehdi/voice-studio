import { encodeWav16Mono } from './wav';

type SinkTarget = { setSinkId?: (id: string) => Promise<void> };

export interface ClipHandle {
  stop(): void;
  /** resolves when playback ends or is stopped */
  done: Promise<void>;
}

/** Plays a recorded clip on a chosen output device (your headphones), outside the engine graph. */
export async function playClip(
  samples: Float32Array,
  sampleRate: number,
  deviceId: string,
): Promise<ClipHandle> {
  const wav = encodeWav16Mono([samples], sampleRate);
  const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
  const el = new Audio(url);
  const sink = el as unknown as SinkTarget;
  if (deviceId !== 'default' && typeof sink.setSinkId === 'function') {
    try {
      await sink.setSinkId(deviceId);
    } catch {
      /* keep the default device */
    }
  }
  const done = new Promise<void>((resolve) => {
    const finish = (): void => {
      URL.revokeObjectURL(url);
      resolve();
    };
    el.addEventListener('ended', finish, { once: true });
    el.addEventListener('error', finish, { once: true });
    el.addEventListener('pause', finish, { once: true });
  });
  await el.play();
  return {
    stop: () => {
      el.pause();
    },
    done,
  };
}
