import React from 'react';
import { Composition } from 'remotion';
import { WigolinkLaunch } from './WigolinkLaunch.jsx';

export function VideoRoot() {
  return (
    <Composition
      id="WigolinkLaunch"
      component={WigolinkLaunch}
      durationInFrames={930}
      fps={30}
      width={1080}
      height={1920}
    />
  );
}
