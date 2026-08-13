import React from 'react';
import { Composition } from 'remotion';
import { WigolinkAd } from './wigolink-ad.jsx';
export const Root = () => <Composition id="WigolinkAd" component={WigolinkAd} durationInFrames={750} fps={30} width={1080} height={1920} />;
