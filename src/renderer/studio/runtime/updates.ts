import type { StudioApi, UpdateInfo } from '@shared/ipc';
import type { StudioStoreApi } from '../store/studio-store';

type UpdateApi = Pick<StudioApi, 'update'>;

/** Mirrors the main process' update events into the store. Returns a disposer. */
export function wireUpdates(api: UpdateApi, store: StudioStoreApi): () => void {
  let latest: UpdateInfo | null = null;
  const u = api.update;
  const set = store.getState().setUpdate;

  const offs = [
    u.onAvailable((info) => {
      latest = info;
      set({ phase: 'available', info });
    }),
    u.onProgress(({ percent }) => set({ phase: 'downloading', percent })),
    u.onDownloaded(() => set({ phase: 'restarting' })),
    u.onError((message) => {
      // errors while merely checking are not worth interrupting the user for
      if (store.getState().update.phase === 'downloading') set({ phase: 'failed', message, info: latest });
    }),
  ];
  return () => offs.forEach((off) => off());
}

/** Click on "Update": start the download and surface a failed request. */
export async function startUpdateDownload(api: UpdateApi, store: StudioStoreApi): Promise<void> {
  const current = store.getState().update;
  const info =
    current.phase === 'available' ? current.info : current.phase === 'failed' ? current.info : null;
  store.getState().setUpdate({ phase: 'downloading', percent: 0 });
  const result = await api.update.download();
  if (!result.ok) store.getState().setUpdate({ phase: 'failed', message: result.error, info });
}
