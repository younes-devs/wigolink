import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';

const { fontFamily } = loadFont('normal', {
  weights: ['500', '600', '700', '800'],
  subsets: ['latin'],
});

const BLUE = '#0878ff';
const INK = '#101828';
const clickFrames = [115, 146, 235, 292, 326, 383, 416, 473, 510, 563, 645];

export function WigolinkDemo() {
  return (
    <AbsoluteFill style={{ fontFamily, background: '#edf4fc', color: INK }}>
      <Audio src={staticFile('bed.wav')} volume={0.07} loop />
      {clickFrames.map((from) => (
        <Sequence key={from} from={from} durationInFrames={8}>
          <Audio src={staticFile('mouse-click.wav')} volume={0.42} />
        </Sequence>
      ))}
      <Sequence from={0} durationInFrames={75}><Opening /></Sequence>
      <Sequence from={60} durationInFrames={105}><TransportScene /></Sequence>
      <Sequence from={150} durationInFrames={170}><RouteScene /></Sequence>
      <Sequence from={305} durationInFrames={95}><SimpleScene image="03-date.png" cursorPath={[[760,1180],[548,1380],[548,1380],[820,1740]]} clickAt={58} /></Sequence>
      <Sequence from={385} durationInFrames={100}><SimpleScene image="04-capacity.png" cursorPath={[[770,1180],[370,1430],[370,1430],[820,1740]]} clickAt={42} /></Sequence>
      <Sequence from={470} durationInFrames={105}><PriceScene /></Sequence>
      <Sequence from={560} durationInFrames={105}><PreviewScene /></Sequence>
      <Sequence from={650} durationInFrames={160}><Finish /></Sequence>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, background: 'rgba(8,120,255,.12)' }}>
        <Progress />
      </div>
    </AbsoluteFill>
  );
}

function Opening() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ padding: '150px 76px', justifyContent: 'center' }}>
      <Brand />
      <div style={{ marginTop: 110, fontSize: 87, lineHeight: 1.04, fontWeight: 800, opacity: interpolate(frame, [4, 18], [0, 1], clamp), translate: `0 ${interpolate(frame, [4,18], [45,0], clamp)}px` }}>
        Tu voyages<br />bientôt&nbsp;?
      </div>
      <div style={{ marginTop: 34, fontSize: 43, lineHeight: 1.25, color: '#475467', fontWeight: 600, opacity: interpolate(frame, [22, 38], [0, 1], clamp) }}>
        Voici comment publier ton trajet<br />sur Wigolink.
      </div>
      <div style={{ marginTop: 90, width: 185, height: 6, borderRadius: 9, background: BLUE }} />
    </AbsoluteFill>
  );
}

function TransportScene() {
  const frame = useCurrentFrame();
  const point = cursorPoint(frame, [[770,1110],[285,900],[285,900],[815,1765]]);
  return <AppFrame image="01-transport.png" cursor={point} click={frame >= 52 && frame <= 61} />;
}

function RouteScene() {
  const frame = useCurrentFrame();
  const departure = typedText('Bruxelles', frame, 20, 4);
  const arrival = typedText('Paris', frame, 82, 5);
  const point = frame < 75
    ? cursorPoint(frame, [[780,850],[340,695],[340,695]])
    : cursorPoint(frame - 75, [[340,695],[340,1010],[340,1010],[810,1765]]);
  return (
    <AppFrame image="02-route.png" cursor={point} click={(frame >= 22 && frame <= 30) || (frame >= 83 && frame <= 91)}>
      <FieldCover top={646} text={departure} caret={frame >= 25 && frame < 75} />
      <FieldCover top={963} text={arrival} caret={frame >= 86 && frame < 137} />
    </AppFrame>
  );
}

function SimpleScene({ image, cursorPath, clickAt }) {
  const frame = useCurrentFrame();
  return <AppFrame image={image} cursor={cursorPoint(frame, cursorPath)} click={frame >= clickAt && frame <= clickAt + 8} />;
}

function PriceScene() {
  const frame = useCurrentFrame();
  const text = typedText('30', frame, 26, 9);
  const point = frame < 65
    ? cursorPoint(frame, [[780,900],[340,780],[340,780]])
    : cursorPoint(frame - 65, [[340,780],[815,1765]]);
  return (
    <AppFrame image="05-price.png" cursor={point} click={frame >= 25 && frame <= 33}>
      <div style={{ position: 'absolute', left: 42, top: 735, width: 190, height: 112, background: 'white', display: 'flex', alignItems: 'center', paddingLeft: 29, fontSize: 43, color: '#20242b' }}>
        {text}<Caret visible={frame >= 27 && frame < 64} />
      </div>
    </AppFrame>
  );
}

function PreviewScene() {
  const frame = useCurrentFrame();
  const point = cursorPoint(frame, [[780,950],[815,1765],[815,1765]]);
  return <AppFrame image="06-preview.png" cursor={point} click={frame >= 79 && frame <= 89} />;
}

function AppFrame({ image, cursor, click = false, children }) {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 10], [0.985, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ padding: '35px 28px 25px', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: 900, height: 1840, overflow: 'hidden', borderRadius: 42, background: 'white', boxShadow: '0 36px 90px rgba(16,24,40,.20)', scale: enter }}>
        <Img src={staticFile(image)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {children}
        <Mouse x={cursor[0]} y={cursor[1]} click={click} />
      </div>
    </AbsoluteFill>
  );
}

function FieldCover({ top, text, caret }) {
  return (
    <div style={{ position: 'absolute', left: 40, top, width: 820, height: 102, background: 'white', border: `2px solid ${caret ? BLUE : '#e5e7eb'}`, borderRadius: 14, display: 'flex', alignItems: 'center', paddingLeft: 40, fontSize: 39, color: '#20242b' }}>
      {text}<Caret visible={caret} />
    </div>
  );
}

function Caret({ visible }) {
  const frame = useCurrentFrame();
  if (!visible || Math.floor(frame / 9) % 2) return null;
  return <span style={{ width: 2, height: 43, background: '#20242b', marginLeft: 3 }} />;
}

function Mouse({ x, y, click }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, zIndex: 20, width: 42, height: 52, filter: 'drop-shadow(0 3px 4px rgba(0,0,0,.35))' }}>
      {click && <div style={{ position: 'absolute', width: 72, height: 72, borderRadius: '50%', border: `4px solid ${BLUE}`, left: -23, top: -20, opacity: .65 }} />}
      <svg viewBox="0 0 28 36" width="42" height="52"><path d="M2 2 L2 29 L9 22 L14 34 L20 31 L15 20 L25 20 Z" fill="white" stroke="#111827" strokeWidth="2.2" strokeLinejoin="round" /></svg>
    </div>
  );
}

function Finish() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: BLUE, color: 'white', padding: '150px 74px', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      <Img src={staticFile('logo.png')} style={{ width: 220, height: 180, objectFit: 'contain', scale: interpolate(frame, [0,18], [.7,1], { ...clamp, easing: Easing.out(Easing.back(1.4)) }) }} />
      <div style={{ fontSize: 85, fontWeight: 800, marginTop: 30 }}>Trajet publié.</div>
      <div style={{ fontSize: 39, lineHeight: 1.3, marginTop: 28, opacity: .9, fontWeight: 600 }}>Tu peux maintenant recevoir<br />des demandes sur ton trajet.</div>
      <div style={{ marginTop: 65, background: 'white', color: BLUE, borderRadius: 22, padding: '25px 48px', fontSize: 35, fontWeight: 800 }}>wigolink.com</div>
    </AbsoluteFill>
  );
}

function Brand() {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}><Img src={staticFile('logo.png')} style={{ width: 95, height: 78, objectFit: 'contain' }} /><span style={{ fontSize: 45, fontWeight: 800 }}>Wigolink</span></div>;
}

function Progress() {
  const frame = useCurrentFrame();
  return <div style={{ height: '100%', width: `${frame / 809 * 100}%`, background: BLUE }} />;
}

function typedText(text, frame, start, framesPerLetter) {
  const length = Math.max(0, Math.min(text.length, Math.floor((frame - start) / framesPerLetter)));
  return text.slice(0, length);
}

function cursorPoint(frame, points) {
  if (points.length === 1) return points[0];
  const segmentLength = 25;
  const segment = Math.min(points.length - 2, Math.max(0, Math.floor(frame / segmentLength)));
  const local = frame - segment * segmentLength;
  const progress = interpolate(local, [0, 22], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  return [
    points[segment][0] + (points[segment + 1][0] - points[segment][0]) * progress,
    points[segment][1] + (points[segment + 1][1] - points[segment][1]) * progress,
  ];
}

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
