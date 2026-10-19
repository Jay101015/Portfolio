import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand} from '../types';

export const Background: React.FC<{brand: Brand}> = ({brand}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  if (brand.toon) {
    // flat paper with a faint fibre texture; the texture re-seeds slowly so the page feels alive, not static
    const seed = Math.floor(frame / 12) % 7;
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
  const t = frame / 900;
  const x1 = 20 + Math.sin(t) * 10;
  const y1 = 25 + Math.cos(t * 0.8) * 10;
  const x2 = 80 + Math.cos(t * 0.7) * 10;
  const y2 = 75 + Math.sin(t * 0.9) * 10;
  const grid = Math.round(Math.min(width, height) / 12);
  return (
    <AbsoluteFill style={{backgroundColor: brand.bg}}>
      <AbsoluteFill style={{background: `radial-gradient(circle at ${x1}% ${y1}%, ${brand.accent}22 0%, transparent 38%), radial-gradient(circle at ${x2}% ${y2}%, ${brand.accent2}1f 0%, transparent 40%)`}} />
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${brand.text}0a 1px, transparent 1px), linear-gradient(90deg, ${brand.text}0a 1px, transparent 1px)`,
          backgroundSize: `${grid}px ${grid}px`,
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 85%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 85%)',
        }}
      />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)'}} />
    </AbsoluteFill>
  );
};
