import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {H, W} from './brand';
import {Thumb, type ThumbProps} from './Thumb';

// One still, 1280x720: the YouTube thumbnail. pipeline/thumbnail.py builds the props (and enforces the rules);
// render.mjs bundles this entry once and renders any number of thumbnails from it.
const defaults: ThumbProps = {
  layout: 'figure',
  figure: '£50,000',
  line: 'still a good salary?',
  figureTone: 'plain',
  lineTone: 'plain',
  photo: '',
  photoW: 0,
  photoH: 0,
  focus: [0.5, 0.4],
  zoom: 1,
  hideText: false,
};

// This file has no JSX, and createElement cannot infer the composition's prop type, so the frame takes loose props
// and hands them to Thumb.
const Frame: React.FC<Record<string, unknown>> = (props) => React.createElement(Thumb, props as ThumbProps);

const Root: React.FC = () =>
  React.createElement(Composition, {id: 'Thumb', component: Frame, width: W, height: H, fps: 30, durationInFrames: 1, defaultProps: defaults});

registerRoot(Root);
