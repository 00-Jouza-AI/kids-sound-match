/** Microphone recording with the browser's MediaRecorder (parents only, from the item editor). */
export type RecorderProblem = 'insecure' | 'unsupported' | 'blocked' | 'failed';

export interface ActiveRecording {
  /** 0..1 input level, for the live meter. */
  level(): number;
  stop(): Promise<Blob>;
  cancel(): void;
}

export function recordingProblem(): RecorderProblem | null {
  // Browsers only give pages the microphone on HTTPS or localhost.
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return window.isSecureContext ? 'unsupported' : 'insecure';
  if (typeof MediaRecorder === 'undefined') return 'unsupported';
  return null;
}

export async function startRecording(): Promise<ActiveRecording> {
  const problem = recordingProblem();
  if (problem) throw Object.assign(new Error(problem), { problem });
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    const name = (e as DOMException).name;
    throw Object.assign(new Error(name), { problem: name === 'NotAllowedError' ? 'blocked' : 'failed' });
  }

  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  // Level meter.
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);

  const release = () => {
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => undefined);
  };

  recorder.start();
  return {
    level() {
      analyser.getFloatTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v));
      return Math.min(1, peak * 1.6);
    },
    stop() {
      return new Promise((resolve) => {
        recorder.onstop = () => {
          release();
          resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
        };
        if (recorder.state === 'inactive') recorder.onstop?.(new Event('stop'));
        else recorder.stop();
      });
    },
    cancel() {
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
      release();
    },
  };
}
