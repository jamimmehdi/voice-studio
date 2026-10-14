import { useEffect, useRef, useState } from 'react';
import { eqCurveDb } from '@engine/dsp/eq-curve';
import { clamp } from '@shared/params';
import { Card } from '../../../ui/Card';
import { useWheel } from '../../../ui/use-wheel';
import {
  SCOPE_DB_SPAN,
  SCOPE_F_MAX,
  SCOPE_F_MIN,
  dbToY,
  freqToX,
  hitHandle,
  idleBars,
  spectrumBars,
  xToFreq,
  yToDb,
  type Handle,
} from '../../../lib/scope-math';
import { useRuntime, useStudio } from '../../runtime/react';
import { drawScope } from './scope-draw';
import styles from './LiveOutput.module.css';

const DEFAULT_RATE = 48000;

/** Live spectrum with the EQ curve on top. EQ band handles can be dragged (freq / gain) and scrolled (Q). */
export function LiveOutput(): React.ReactElement {
  const { engine, store } = useRuntime();
  const { params, setEqBand } = useStudio((s) => ({ params: s.params, setEqBand: s.setEqBand }));
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState(false);
  const hoverRef = useRef(false);
  hoverRef.current = hover; // readable from the draw loop without re-creating it
  const drag = useRef<number | null>(null);
  const spectrum = useRef<Float32Array | null>(null);

  /** Handle positions in CSS pixels for the current params and canvas size. */
  const handlesFor = (width: number, height: number): Handle[] =>
    store.getState().params.eq.bands.map((b, i) => ({
      index: i,
      x: freqToX(b.freq, width),
      y: dbToY(clamp(b.gain, -SCOPE_DB_SPAN, SCOPE_DB_SPAN), height),
    }));

  // draw loop
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return undefined;
    let raf = 0;

    const render = (): void => {
      raf = requestAnimationFrame(render);
      if (document.hidden) return;
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const rate = engine.context?.sampleRate ?? DEFAULT_RATE;
      let bars = idleBars();
      const analyser = engine.analyser;
      if (analyser) {
        if (!spectrum.current || spectrum.current.length !== analyser.frequencyBinCount) {
          spectrum.current = new Float32Array(analyser.frequencyBinCount);
        }
        analyser.getFloatFrequencyData(spectrum.current as Float32Array<ArrayBuffer>);
        bars = spectrumBars(spectrum.current, rate / analyser.fftSize);
      }

      const current = store.getState();
      const curveY: number[] = [];
      for (let x = 0; x <= w; x += 2) {
        const f = xToFreq(x, w);
        curveY.push(dbToY(clamp(eqCurveDb(current.params, f, rate), -SCOPE_DB_SPAN, SCOPE_DB_SPAN), h));
      }
      const handles = handlesFor(w, h).map((hd) => ({
        ...hd,
        active: current.params.eq.on && (current.params.eq.bands[hd.index]?.on ?? false),
      }));
      drawScope(ctx, { width: w, height: h, bars, curveY, handles, showHandles: current.stage === 'eq' || hoverRef.current || drag.current !== null });
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, store]);

  const local = (e: { clientX: number; clientY: number }): { x: number; y: number; w: number; h: number } => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  };

  useWheel(canvas, (e) => {
    const el = canvas.current;
    if (!el) return;
    const { x, y, w, h } = local(e);
    const hit = hitHandle(handlesFor(w, h), x, y);
    if (!hit) return;
    e.preventDefault();
    const band = store.getState().params.eq.bands[hit.index];
    if (band) setEqBand(hit.index, { q: clamp(band.q * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.3, 8) });
  });

  return (
    <Card title="Live output" aside="20 Hz – 20 kHz">
      <div className={styles.box}>
        <canvas
          ref={canvas}
          className={styles.canvas}
          data-testid="scope"
          aria-label="Live spectrum and EQ curve. Drag a numbered dot to change a band; scroll over it to change its width."
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
          onPointerDown={(e) => {
            const { x, y, w, h } = local(e);
            const hit = hitHandle(handlesFor(w, h), x, y);
            if (!hit) return;
            drag.current = hit.index;
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* pointer released */
            }
          }}
          onPointerMove={(e) => {
            const { x, y, w, h } = local(e);
            if (drag.current === null) {
              e.currentTarget.style.cursor = hitHandle(handlesFor(w, h), x, y) ? 'grab' : 'default';
              return;
            }
            const freq = clamp(xToFreq(clamp(x, 0, w), w), SCOPE_F_MIN, SCOPE_F_MAX);
            const gain = Math.round(clamp(yToDb(y, h), -18, 18) * 10) / 10;
            setEqBand(drag.current, { freq, gain });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onDoubleClick={(e) => {
            const { x, y, w, h } = local(e);
            const hit = hitHandle(handlesFor(w, h), x, y);
            if (hit) setEqBand(hit.index, { gain: 0 });
          }}
        />
      </div>
      <div className={`${styles.axis} mono`}>
        <span>50</span>
        <span>200</span>
        <span>1k</span>
        <span>5k</span>
        <span>20k</span>
      </div>
      <span className={styles.srOnly}>{`High-pass ${params.hpf.on ? 'on' : 'off'}, EQ ${params.eq.on ? 'on' : 'off'}`}</span>
    </Card>
  );
}
