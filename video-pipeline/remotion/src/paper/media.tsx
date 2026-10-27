import React from 'react';
import {Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Gif} from '@remotion/gif';

/**
 * A picture, GIF or video placed in a frame, with the edits made in the studio applied without touching the file:
 *
 *   focus="50 30"    the point of the picture kept in view when it is cropped to the frame (percent x, percent y)
 *   mag=1.4          extra zoom on top of the crop
 *   rotate=90        quarter turns (0, 90, 180, 270)
 *   flip=h | v | hv  mirror
 *   bright=1.1 contrast=1.2 sat=0.8   colour adjustments (1 = unchanged)
 *   bw               black and white
 *   look=sketch      the picture traced as marker lines, so a photo sits on the whiteboard like a drawing
 *   zoom=in | out | none   the slow push-in over the scene (in by default)
 *   from=3.5         for a video, where in the file to start (seconds)
 *
 * The same attributes drive the studio's preview, so what is set there is what renders.
 */

export type MediaProps = Record<string, unknown>;

export const isGif = (src: string) => /\.gif$/i.test(src);
export const isVideo = (src: string) => /\.(mp4|webm|mov|m4v)$/i.test(src);

const num = (v: unknown, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/** CSS filter for the colour edits; the sketch look goes through the SVG filter defined by SketchFilterDefs */
export const mediaFilter = (p: MediaProps): string | undefined => {
  const parts: string[] = [];
  const b = num(p.bright, 1);
  const c = num(p.contrast, 1);
  const s = num(p.sat, 1);
  if (p.look === 'sketch') parts.push('url(#mm-sketch)');
  if (b !== 1) parts.push(`brightness(${b})`);
  if (c !== 1) parts.push(`contrast(${c})`);
  if (s !== 1) parts.push(`saturate(${s})`);
  if (p.bw === true || p.bw === 'true' || p.bw === '1') parts.push('grayscale(1)');
  return parts.length ? parts.join(' ') : undefined;
};

/**
 * Edge-traced "drawing" of a photo: grey, softened, edges found with a Laplacian, then inverted and pushed so the
 * page stays white and the edges come out as dark marker lines.
 */
export const SketchFilterDefs: React.FC = () => (
  <svg width={0} height={0} style={{position: 'absolute'}} aria-hidden>
    <filter id="mm-sketch" colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
      <feColorMatrix type="saturate" values="0" result="g" />
      <feGaussianBlur in="g" stdDeviation="0.8" result="b" />
      <feConvolveMatrix in="b" order="3" kernelMatrix="-1 -1 -1 -1 8 -1 -1 -1 -1" preserveAlpha="true" result="e" />
      <feComponentTransfer in="e">
        <feFuncR type="linear" slope="-5" intercept="1.02" />
        <feFuncG type="linear" slope="-5" intercept="1.02" />
        <feFuncB type="linear" slope="-5" intercept="1.02" />
      </feComponentTransfer>
    </filter>
  </svg>
);

/**
 * The picture itself, filling its parent (which sets the frame's size and clips it). `durationFrames` is the
 * scene's length, for the push-in.
 */
export const Media: React.FC<{src: string; props: MediaProps; durationFrames: number; width: number; height: number}> = ({src, props, durationFrames, width, height}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const kb = String(props.zoom ?? 'in');
  const push = kb === 'none' ? 1 : interpolate(frame, [0, Math.max(1, durationFrames)], kb === 'out' ? [1.1, 1.0] : [1.0, 1.1], {extrapolateRight: 'clamp'});
  const mag = Math.max(1, num(props.mag, 1));
  const rot = ((Math.round(num(props.rotate, 0) / 90) * 90) % 360 + 360) % 360;
  const flip = String(props.flip ?? '');
  const sx = flip.includes('h') ? -1 : 1;
  const sy = flip.includes('v') ? -1 : 1;
  const [fx, fy] = String(props.focus ?? '50 50').split(/[\s,]+/).map((v) => num(v, 50));
  // a quarter turn swaps the box the picture is cut to, so it still covers the frame after turning
  const turned = rot === 90 || rot === 270;
  const boxW = turned ? height : width;
  const boxH = turned ? width : height;
  const style: React.CSSProperties = {
    position: 'absolute',
    left: (width - boxW) / 2,
    top: (height - boxH) / 2,
    width: boxW,
    height: boxH,
    objectFit: 'cover',
    objectPosition: `${fx}% ${fy}%`,
    transformOrigin: `${fx}% ${fy}%`,
    transform: `rotate(${rot}deg) scale(${sx * mag * push}, ${sy * mag * push})`,
    filter: mediaFilter(props),
  };
  const file = staticFile(src);
  if (isGif(src)) return <Gif src={file} width={boxW} height={boxH} fit="cover" style={style} />;
  // footage is silent unless the scene asks for its sound (vol=1: a "watch next" preview of another video)
  const vol = num(props.vol, 0);
  if (isVideo(src)) return <OffthreadVideo src={file} muted={vol <= 0} volume={Math.max(0, vol)} startFrom={Math.round(num(props.from, 0) * fps)} style={style} />;
  return <Img src={file} style={style} />;
};
