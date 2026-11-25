import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import '../fonts';

// The thumbnail for a one-sheet video: the line to the flag, the two numbers, and him. Two things to read, no more.
const INK = '#14213d';
const GREEN = '#1a8f55';
const PAPER = '#f7f4ea';

export const SheetThumb: React.FC<{big: string; small: string; pose: string}> = ({big, small, pose}) => {
  const pts: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const p = i / 60;
    pts.push(`${(40 + p * 920).toFixed(1)},${(690 - (Math.pow(1.105, p * 42) - 1) / (Math.pow(1.105, 42) - 1) * 300).toFixed(1)}`);
  }
  return (
    <AbsoluteFill style={{background: PAPER}}>
      <svg width={1280} height={720} style={{position: 'absolute', inset: 0}}>
        <path d={`M${pts.join(' L')} L960,690 L40,690 Z`} fill="#d9f0e2" />
        <line x1={40} y1={690} x2={1240} y2={690} stroke={INK} strokeWidth={6} strokeLinecap="round" />
        <path d={`M${pts.join(' L')}`} fill="none" stroke={INK} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
        <line x1={960} y1={390} x2={960} y2={350} stroke={INK} strokeWidth={8} strokeLinecap="round" />
        <circle cx={960} cy={390} r={12} fill={INK} />
      </svg>
      <div style={{position: 'absolute', left: 50, top: 36, fontFamily: 'Fraunces', fontWeight: 900, fontSize: 168, lineHeight: 0.95, letterSpacing: -5, color: INK}}>{big}</div>
      <div style={{position: 'absolute', left: 56, top: 212, fontFamily: 'Fraunces', fontWeight: 900, fontSize: 100, lineHeight: 1, letterSpacing: -3, color: GREEN, background: PAPER, padding: '0 14px 6px 0'}}>{small}</div>
      <Img src={staticFile(`poses/${pose}.png`)} style={{position: 'absolute', right: 24, bottom: 26, height: 440}} />
    </AbsoluteFill>
  );
};
