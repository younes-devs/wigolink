import React from 'react';
import { AbsoluteFill, Audio, Easing, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';

const { fontFamily } = loadFont('normal', { weights: ['500', '600', '700', '800'], subsets: ['latin'] });
const blue = '#0878ff';
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

export function WigolinkAd() {
  return <AbsoluteFill style={{ background: '#f5f8fc', color: '#111827', fontFamily }}>
    <Audio src={staticFile('music.wav')} volume={0.23} />
    <Sequence from={0} durationInFrames={66}><Hook /></Sequence>
    <Sequence from={48} durationInFrames={642}><Demo /></Sequence>
    <Sequence from={670} durationInFrames={80}><End /></Sequence>
  </AbsoluteFill>;
}

function Hook() {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ background: '#0878ff', color: 'white', padding: '150px 72px', justifyContent: 'center' }}>
    <div style={{ fontSize: 48, fontWeight: 700, opacity: .85 }}>Tu voyages bientôt ?</div>
    <div style={{ fontSize: 91, lineHeight: 1.02, fontWeight: 800, marginTop: 24, letterSpacing: 0, translate: `0 ${interpolate(frame,[0,18],[55,0],{...clamp,easing:Easing.out(Easing.cubic)})}px`, opacity: interpolate(frame,[0,15],[0,1],clamp) }}>
      Ton espace vide<br/>peut être utile.
    </div>
    <div style={{ width: interpolate(frame,[18,46],[0,270],{...clamp,easing:Easing.out(Easing.cubic)}), height: 8, background: 'white', marginTop: 58, borderRadius: 8 }} />
  </AbsoluteFill>;
}

function Demo() {
  const frame = useCurrentFrame();
  const lines = frame < 105 ? ['Publie ton trajet.', 'En quelques étapes.'] : frame < 300 ? ['Bruxelles → Paris', 'Date, capacité, prix.'] : frame < 510 ? ['Tu gardes le contrôle.', 'Tu choisis tes conditions.'] : ['Vérifie. Publie.', 'C’est prêt.'];
  const enter = interpolate(frame,[0,16],[80,0],{...clamp,easing:Easing.out(Easing.cubic)});
  return <AbsoluteFill style={{ background: 'linear-gradient(145deg,#f7faff 0%,#edf6ff 55%,#f4f0ff 100%)', alignItems: 'center' }}>
    <div style={{ position: 'absolute', top: 86, left: 64, right: 64 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><Img src={staticFile('logo.png')} style={{ width: 62, height: 48, objectFit: 'contain' }} /><b style={{ fontSize: 34 }}>Wigolink</b></div>
      <div style={{ fontSize: 55, lineHeight: 1.06, fontWeight: 800, marginTop: 25 }}>{lines[0]}</div>
      <div style={{ fontSize: 31, color: '#667085', fontWeight: 600, marginTop: 10 }}>{lines[1]}</div>
    </div>
    <div style={{ position: 'absolute', top: 315 + enter, width: 790, height: 1518, borderRadius: 48, padding: 13, background: '#101828', boxShadow: '0 34px 90px rgba(16,24,40,.25)' }}>
      <div style={{ position: 'absolute', width: 126, height: 22, background: '#101828', borderRadius: 20, left: '50%', translate: '-50% -1px', zIndex: 4 }} />
      <OffthreadVideo src={staticFile('raw-real-demo.webm')} playbackRate={1.12} muted style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 37 }} />
    </div>
    <div style={{ position: 'absolute', bottom: 28, width: 150, height: 6, background: '#d0d5dd', borderRadius: 8 }} />
  </AbsoluteFill>;
}

function End() {
  const frame = useCurrentFrame();
  const scale = interpolate(frame,[0,22],[.88,1],{...clamp,easing:Easing.out(Easing.back(1.25))});
  return <AbsoluteFill style={{ background: '#0878ff', color: 'white', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
    <Img src={staticFile('logo.png')} style={{ width: 170, height: 130, objectFit: 'contain', scale }} />
    <div style={{ fontSize: 78, lineHeight: 1.04, fontWeight: 800, marginTop: 28 }}>Voyage utile.<br/>Envoi plus simple.</div>
    <div style={{ marginTop: 45, fontSize: 37, fontWeight: 700 }}>Publie ton trajet sur</div>
    <div style={{ marginTop: 18, padding: '23px 46px', borderRadius: 18, background: 'white', color: blue, fontSize: 39, fontWeight: 800 }}>wigolink.com</div>
  </AbsoluteFill>;
}
