import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand} from '../types';
import {rnd} from './motion';

export const Background: React.FC<{brand: Brand}> = ({brand}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  if (brand.toon) {
    // flat paper with a faint fibre texture (static: a full-frame noise filter is the single most expensive thing to redraw)
    const seed = 3;
    void frame;
    return (
      <AbsoluteFill style={{backgroundColor: brand.bg}}>
        <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>
          <filter id="paper">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={seed} />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width={width} height={height} filter="url(#paper)" opacity={0.07} />
        </svg>
        <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, transparent 60%, rgba(60,40,20,0.10) 100%)'}} />
      </AbsoluteFill>
    );
  }
  // Motion-graphics look: two slow colour blobs, a faint grid, a drift of soft dots, a light band that crosses every half minute.
  const t = frame / 900;
  const x1 = 20 + Math.sin(t) * 10;
  const y1 = 25 + Math.cos(t * 0.8) * 10;
  const x2 = 80 + Math.cos(t * 0.7) * 10;
  const y2 = 75 + Math.sin(t * 0.9) * 10;
  const grid = Math.round(Math.min(width, height) / 12);
  const u = Math.min(width, height) / 1080;
  const dots = Array.from({length: 22}, (_, i) => {
    const speed = 0.08 + rnd(i) * 0.12; // px per frame, upward
    const x = rnd(i + 50) * width;
    const y = (((rnd(i + 100) * height) - frame * speed * u) % (height + 80 * u) + height + 80 * u) % (height + 80 * u) - 40 * u;
    const r = (3 + rnd(i + 150) * 5) * u;
    const a = 0.08 + rnd(i + 200) * 0.12;
    return {x, y, r, a, c: i % 3 === 0 ? brand.accent2 : brand.accent};
  });
  const band = ((frame / 900) % 1) * (width + height) - height; // a diagonal light band drifting across
  return (
    <AbsoluteFill style={{backgroundColor: brand.bg}}>
      <AbsoluteFill style={{background: `radial-gradient(circle at ${x1}% ${y1}%, ${brand.accent}26 0%, transparent 40%), radial-gradient(circle at ${x2}% ${y2}%, ${brand.accent2}22 0%, transparent 42%)`}} />
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${brand.text}0a 1px, transparent 1px), linear-gradient(90deg, ${brand.text}0a 1px, transparent 1px)`,
          backgroundSize: `${grid}px ${grid}px`,
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 85%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 85%)',
        }}
      />
      <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.c} opacity={d.a} />
        ))}
        <polygon points={`${band},0 ${band + 260 * u},0 ${band + 260 * u - height},${height} ${band - height},${height}`} fill={brand.text} opacity={0.025} />
      </svg>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)'}} />
    </AbsoluteFill>
  );
};
