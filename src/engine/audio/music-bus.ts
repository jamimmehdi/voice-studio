/**
 * The music path of the audio graph. It deliberately bypasses the voice effects:
 *
 *   <audio> -> volume -> duck -> safety limiter -> destination (game / virtual cable)
 *                  \-> monitor gain -> monitor destination (your headphones)
 */
export class MusicBus {
  readonly element: HTMLAudioElement;
  private readonly volume: GainNode;
  private readonly duck: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly monitor: GainNode;
  /** soundboard clips enter here: not ducked by your voice, but limited and monitored */
  readonly soundInput: GainNode;

  constructor(
    private readonly ctx: AudioContext,
    monitorDestination: AudioNode,
    initialVolume: number,
  ) {
    this.element = new Audio();
    this.element.preload = 'auto';

    const source = ctx.createMediaElementSource(this.element);
    this.volume = ctx.createGain();
    this.volume.gain.value = initialVolume;
    this.duck = ctx.createGain();
    this.monitor = ctx.createGain();
    this.monitor.gain.value = 1; // you always hear your own music

    // gentle safety limiter so a loud track can never clip the cable
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.15;

    this.soundInput = ctx.createGain();
    this.soundInput.gain.value = 0.7;

    source.connect(this.volume);
    this.volume.connect(this.duck);
    this.duck.connect(this.limiter);
    this.limiter.connect(ctx.destination);
    this.volume.connect(this.monitor);
    this.monitor.connect(monitorDestination);

    this.soundInput.connect(this.limiter);
    this.soundInput.connect(this.monitor);
  }

  /** 0..1 */
  setSoundVolume(volume: number): void {
    this.soundInput.gain.value = Math.max(0, Math.min(1, volume));
  }

  /** 0..1 */
  setVolume(volume: number): void {
    this.volume.gain.value = Math.max(0, Math.min(1, volume));
  }

  setDuck(gain: number, timeConstant: number): void {
    this.duck.gain.setTargetAtTime(gain, this.ctx.currentTime, timeConstant);
  }

  dispose(): void {
    this.element.pause();
    this.element.removeAttribute('src');
    this.element.load();
  }
}
