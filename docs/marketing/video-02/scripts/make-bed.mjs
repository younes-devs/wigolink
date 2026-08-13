import { writeFile } from 'node:fs/promises';

const sampleRate = 48000;
const duration = 27;
const samples = sampleRate * duration;
const data = Buffer.alloc(samples * 2);
const tones = [174.61, 220, 261.63, 293.66];

for (let index = 0; index < samples; index += 1) {
  const time = index / sampleRate;
  const beat = Math.floor(time * 2) % tones.length;
  const phase = time % 0.5;
  const envelope = Math.exp(-phase * 7.2);
  const body = Math.sin(2 * Math.PI * tones[beat] * time) * .18;
  const air = Math.sin(2 * Math.PI * tones[beat] * 2 * time) * .04;
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, (body + air) * envelope)) * 32767), index * 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
header.write('data', 36); header.writeUInt32LE(data.length, 40);
await writeFile(new URL('../public/bed.wav', import.meta.url), Buffer.concat([header, data]));
