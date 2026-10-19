import React from 'react';
import {Composition} from 'remotion';
import {Video} from './Video';
import {AvatarSheet} from './AvatarSheet';
import {demoStoryboard} from './demo';
import type {Storyboard} from './types';

const FPS = 30;
const meta = ({props}: {props: Storyboard}) => ({durationInFrames: Math.max(1, Math.ceil(props.durationSec * FPS)), fps: FPS});

export const Root: React.FC = () => {
  return (
    <>
      <Composition id="Main" component={Video} width={1920} height={1080} fps={FPS} durationInFrames={FPS * demoStoryboard.durationSec} defaultProps={demoStoryboard} calculateMetadata={meta} />
      <Composition id="Vertical" component={Video} width={1080} height={1920} fps={FPS} durationInFrames={FPS * demoStoryboard.durationSec} defaultProps={demoStoryboard} calculateMetadata={meta} />
      <Composition id="AvatarSheet" component={AvatarSheet} width={1920} height={1080} fps={FPS} durationInFrames={FPS * 4} defaultProps={{avatar: {}, theme: 'toon'}} />
    </>
  );
};
