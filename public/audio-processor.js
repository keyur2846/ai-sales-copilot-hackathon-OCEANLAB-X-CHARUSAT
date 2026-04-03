/**
 * AudioWorklet processor that captures mic audio, downsamples from the
 * browser's native sample rate (typically 48 kHz) to 8 kHz, converts
 * float32 to int16 PCM, and posts the buffer to the main thread.
 *
 * Chunk size: 320 samples at 8 kHz (40 ms) to satisfy Exotel's requirement
 * of PCM buffers that are multiples of 320 bytes (320 int16 samples = 640 bytes).
 */
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(0);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // mono channel

    // Accumulate incoming samples into the running buffer
    const newBuffer = new Float32Array(this._buffer.length + channelData.length);
    newBuffer.set(this._buffer);
    newBuffer.set(channelData, this._buffer.length);
    this._buffer = newBuffer;

    // Downsample from native sampleRate to 8000 Hz
    // Emit chunks of 320 samples at 8 kHz (40 ms frames)
    const ratio = sampleRate / 8000;
    const targetSamples = 320;
    const sourceSamplesNeeded = Math.ceil(targetSamples * ratio);

    while (this._buffer.length >= sourceSamplesNeeded) {
      const chunk = this._buffer.slice(0, sourceSamplesNeeded);
      this._buffer = this._buffer.slice(sourceSamplesNeeded);

      // Downsample via nearest-neighbour and convert float32 -> int16 PCM
      const downsampled = new Int16Array(targetSamples);
      for (let i = 0; i < targetSamples; i++) {
        const srcIndex = Math.min(Math.floor(i * ratio), chunk.length - 1);
        const sample = Math.max(-1, Math.min(1, chunk[srcIndex]));
        downsampled[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }

      // Transfer ownership of the underlying ArrayBuffer to the main thread
      this.port.postMessage(downsampled.buffer, [downsampled.buffer]);
    }

    return true;
  }
}

registerProcessor("audio-processor", AudioProcessor);
