import { writeFile } from 'node:fs/promises';

const sampleRate = 48000;
const duration = 30;
const samples = sampleRate * duration;
const data = Buffer.alloc(samples * 2);
const tones = [196, 246.94, 293.66, 369.99];

for (let index = 0; index < samples; index += 1) {
  const time = index / sampleRate;
  const beat = Math.floor(time * 2) % tones.length;
  const phase = time % 0.5;
  const envelope = Math.exp(-phase * 6.5);
  const pad = Math.sin(2 * Math.PI * tones[beat] * time) * 0.22;
  const high = Math.sin(2 * Math.PI * tones[beat] * 2 * time) * 0.06;
  const pulse = phase < 0.035 ? Math.sin(2 * Math.PI * 82 * time) * (1 - phase / 0.035) * 0.3 : 0;
  const value = Math.max(-1, Math.min(1, (pad + high) * envelope + pulse));
  data.writeInt16LE(Math.round(value * 32767), index * 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

await writeFile(new URL('../public/bed.wav', import.meta.url), Buffer.concat([header, data]));
