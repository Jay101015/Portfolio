import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand} from '../types';

export const Background: React.FC<{brand: Brand}> = ({brand}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const t = frame / 900; // slow drift
  const x1 = 20 + Math.sin(t) * 10;
  const y1 = 25 + Math.cos(t * 0.8) * 10;
  const x2 = 80 + Math.cos(t * 0.7) * 10;
  const y2 = 75 + Math.sin(t * 0.9) * 10;
  const grid = Math.round(Math.min(width, height) / 12);
  return (
    <AbsoluteFill style={{backgroundColor: brand.bg}}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${x1}% ${y1}%, ${brand.accent}22 0%, transparent 38%), radial-gradient(circle at ${x2}% ${y2}%, ${brand.accent2}1f 0%, transparent 40%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${brand.text}0a 1px, transparent 1px), linear-gradient(90deg, ${brand.text}0a 1px, transparent 1px)`,
          backgroundSize: `${grid}px ${grid}px`,
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 85%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 85%)',
        }}
      />
      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};
