import React from 'react';
import { Composition } from 'remotion';
import { WigolinkDemo } from './WigolinkDemo.jsx';

export function VideoRoot() {
  return (
    <Composition
      id="WigolinkDemo"
      component={WigolinkDemo}
      durationInFrames={810}
      fps={30}
      width={1080}
      height={1920}
    />
  );
}
