import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Avatar, POSES, FACES, defaultAvatar, defaultFaceFor, type AvatarConfig, type Pose, type Face} from '../avatar/Avatar';
import {RasterHost} from '../avatar/RasterHost';

type Opts = {prevPose?: Pose; prevFace?: Face; sinceChange?: number; viseme?: number; talk?: number; lookX?: number; attention?: number; flip?: boolean};
/** The same drawing the video renders, as an SVG string for the studio page. */
export function avatarSVG(c: AvatarConfig, pose: Pose, face: Face | undefined, mouth: number, frame: number, opts: Opts = {}): string {
  return renderToStaticMarkup(
    React.createElement(Avatar, {config: c, pose, face, mouth, frame, prevPose: opts.prevPose, prevFace: opts.prevFace, sinceChange: opts.sinceChange, viseme: opts.viseme, talk: opts.talk, lookX: opts.lookX, attention: opts.attention, flip: opts.flip, width: undefined, style: {width: '100%', height: 'auto', display: 'block'}}),
  );
}
/** The painted host as an SVG string; `base` is the folder holding the layer PNGs. */
export function hostSVG(base: string, pose: Pose, face: Face | undefined, mouth: number, frame: number, opts: Opts = {}): string {
  return renderToStaticMarkup(
    React.createElement(RasterHost, {pose, face, mouth, frame, prevPose: opts.prevPose, prevFace: opts.prevFace, sinceChange: opts.sinceChange, viseme: opts.viseme, talk: opts.talk, lookX: opts.lookX, attention: opts.attention, flip: opts.flip, src: (n: string) => base + n, style: {width: '100%', height: 'auto', display: 'block'}}),
  );
}
export {POSES, FACES, defaultAvatar, defaultFaceFor};
