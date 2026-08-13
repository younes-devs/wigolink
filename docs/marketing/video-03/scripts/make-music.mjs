import { mkdir, writeFile } from 'node:fs/promises';

const rate = 48000;
const duration = 25;
const samples = rate * duration;
const data = Buffer.alloc(samples * 2);
const bpm = 112;
for (let i = 0; i < samples; i++) {
  const t = i / rate;
  const beat = (t * bpm / 60) % 1;
  const eighth = (t * bpm / 30) % 1;
  const kick = Math.sin(2 * Math.PI * (72 - 28 * beat) * t) * Math.exp(-beat * 15) * .32;
  const tick = (Math.random() * 2 - 1) * Math.exp(-eighth * 35) * .055;
  const chord = [196, 246.94, 293.66][Math.floor(t * bpm / 240) % 3];
  const pad = Math.sin(2 * Math.PI * chord * t) * .035 + Math.sin(2 * Math.PI * chord * 1.5 * t) * .018;
  const value = Math.max(-1, Math.min(1, kick + tick + pad));
  data.writeInt16LE(Math.round(value * 32767), i * 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
header.write('data', 36); header.writeUInt32LE(data.length, 40);
await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/music.wav', import.meta.url), Buffer.concat([header, data]));
