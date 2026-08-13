import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';

const { fontFamily } = loadFont('normal', {
  weights: ['500', '600', '700', '800'],
  subsets: ['latin'],
});

const BLUE = '#0878ff';
const INK = '#101828';

const steps = [
  { from: 105, image: '01-transport.png', kicker: '1. CHOISIS', title: 'Ton moyen de transport' },
  { from: 195, image: '02-route.png', kicker: '2. INDIQUE', title: 'Ton itinéraire' },
  { from: 285, image: '03-date.png', kicker: '3. AJOUTE', title: 'Ta date de départ' },
  { from: 375, image: '04-capacity.png', kicker: '4. PRÉCISE', title: 'La place disponible' },
  { from: 465, image: '05-price.png', kicker: '5. FIXE', title: 'Ton prix' },
  { from: 555, image: '06-preview.png', kicker: '6. VÉRIFIE', title: 'Et publie ton trajet' },
];

export function WigolinkLaunch() {
  return (
    <AbsoluteFill style={{ fontFamily, background: '#eef5ff', color: INK }}>
      <Background />
      <Audio src={staticFile('voiceover.mp3')} volume={0.96} />
      <Audio src={staticFile('bed.wav')} volume={0.14} loop />
      <Sequence from={0} durationInFrames={120}><Hook /></Sequence>
      {steps.map((step) => (
        <Sequence key={step.image} from={step.from} durationInFrames={105}>
          <ProductStep {...step} />
        </Sequence>
      ))}
      <Sequence from={645} durationInFrames={150}><Benefit /></Sequence>
      <Sequence from={780} durationInFrames={150}><FinalCta /></Sequence>
      <ProgressBar />
    </AbsoluteFill>
  );
}

function Background() {
  const frame = useCurrentFrame();
  const shift = Math.sin(frame / 45) * 35;
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(145deg, #f7fbff 0%, #e8f4ff 52%, #f3efff 100%)' }} />
      <div style={{ position: 'absolute', width: 720, height: 720, borderRadius: '50%', background: 'rgba(8,120,255,.10)', top: -230 + shift, right: -320 }} />
      <div style={{ position: 'absolute', width: 590, height: 590, borderRadius: '50%', background: 'rgba(25,194,198,.10)', bottom: -210 - shift, left: -300 }} />
    </AbsoluteFill>
  );
}

function Hook() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 125 } });
  const second = spring({ frame: frame - 42, fps, config: { damping: 16, stiffness: 120 } });
  return (
    <AbsoluteFill style={{ padding: '130px 78px 150px', justifyContent: 'space-between' }}>
      <Brand compact />
      <div>
        <div style={{ fontSize: 96, lineHeight: 1.03, fontWeight: 800, transform: `translateY(${(1 - enter) * 70}px)`, opacity: enter }}>
          Tu voyages<br />bientôt&nbsp;?
        </div>
        <div style={{ marginTop: 42, fontSize: 54, lineHeight: 1.2, fontWeight: 600, color: '#475467', transform: `translateY(${(1 - second) * 55}px)`, opacity: second }}>
          Ta valise a encore<br /><span style={{ color: BLUE }}>de la place&nbsp;?</span>
        </div>
      </div>
      <RouteGraphic frame={frame} />
    </AbsoluteFill>
  );
}

function ProductStep({ image, kicker, title }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 115 } });
  const exit = interpolate(frame, [85, 104], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const opacity = enter * exit;
  return (
    <AbsoluteFill style={{ padding: '78px 74px 54px', alignItems: 'center', opacity }}>
      <Brand compact />
      <div style={{ marginTop: 46, textAlign: 'center' }}>
        <div style={{ color: BLUE, fontWeight: 800, fontSize: 28, letterSpacing: 1.8 }}>{kicker}</div>
        <div style={{ fontWeight: 800, fontSize: 51, marginTop: 10 }}>{title}</div>
      </div>
      <div style={{ marginTop: 44, width: 720, height: 1556, borderRadius: 44, padding: 14, background: 'rgba(255,255,255,.78)', boxShadow: '0 42px 95px rgba(16,24,40,.18)', transform: `translateY(${(1 - enter) * 90}px) scale(${0.96 + enter * 0.04})` }}>
        <Img src={staticFile(image)} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 32 }} />
      </div>
    </AbsoluteFill>
  );
}

function Benefit() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 15, stiffness: 100 } });
  return (
    <AbsoluteFill style={{ padding: '120px 74px', justifyContent: 'center', alignItems: 'center', textAlign: 'center', opacity: enter }}>
      <div style={{ width: 190, height: 190, borderRadius: 52, background: BLUE, display: 'grid', placeItems: 'center', boxShadow: '0 30px 60px rgba(8,120,255,.30)', transform: `scale(${enter}) rotate(${(1 - enter) * -10}deg)` }}>
        <span style={{ fontSize: 104, color: 'white' }}>↗</span>
      </div>
      <div style={{ fontSize: 82, lineHeight: 1.05, fontWeight: 800, marginTop: 68 }}>
        Rends service.<br /><span style={{ color: BLUE }}>Rentabilise ton voyage.</span>
      </div>
      <div style={{ fontSize: 38, lineHeight: 1.35, color: '#475467', fontWeight: 600, marginTop: 40 }}>
        Publie gratuitement ton trajet<br />en quelques secondes.
      </div>
    </AbsoluteFill>
  );
}

function FinalCta() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 110 } });
  return (
    <AbsoluteFill style={{ padding: '130px 74px', justifyContent: 'center', alignItems: 'center', textAlign: 'center', background: BLUE, color: 'white' }}>
      <Img src={staticFile('logo.png')} style={{ width: 220, height: 220, objectFit: 'contain', transform: `scale(${enter})` }} />
      <div style={{ fontSize: 94, fontWeight: 800, marginTop: 25, letterSpacing: 0 }}>Wigolink</div>
      <div style={{ fontSize: 45, lineHeight: 1.25, fontWeight: 600, marginTop: 30, opacity: .9 }}>Ton voyage peut<br />faire la différence.</div>
      <div style={{ marginTop: 74, background: 'white', color: BLUE, borderRadius: 24, padding: '27px 54px', fontSize: 36, fontWeight: 800, boxShadow: '0 24px 50px rgba(0,0,0,.16)' }}>Publie ton trajet</div>
      <div style={{ fontSize: 34, marginTop: 44, fontWeight: 700 }}>wigolink.com</div>
    </AbsoluteFill>
  );
}

function Brand({ compact = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, alignSelf: 'flex-start' }}>
      <Img src={staticFile('logo.png')} style={{ width: compact ? 88 : 112, height: compact ? 70 : 90, objectFit: 'contain' }} />
      <span style={{ fontSize: compact ? 41 : 50, fontWeight: 800 }}>Wigolink</span>
    </div>
  );
}

function RouteGraphic({ frame }) {
  const progress = interpolate(frame, [18, 104], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, fontSize: 34, fontWeight: 700 }}>
      <span>Bruxelles</span>
      <div style={{ height: 4, flex: 1, background: '#c4d8ef', position: 'relative', borderRadius: 5 }}>
        <div style={{ width: `${progress * 100}%`, height: '100%', background: BLUE }} />
        <div style={{ position: 'absolute', left: `${progress * 92}%`, top: -31, color: BLUE, fontSize: 55 }}>✈</div>
      </div>
      <span>Paris</span>
    </div>
  );
}

function ProgressBar() {
  const frame = useCurrentFrame();
  return <div style={{ position: 'absolute', bottom: 0, left: 0, height: 10, width: `${(frame / 929) * 100}%`, background: BLUE }} />;
}
