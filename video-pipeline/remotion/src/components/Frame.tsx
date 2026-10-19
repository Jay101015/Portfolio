import React from 'react';
import type {Brand} from '../types';
import {useLayout} from './layout';

/** A hand-drawn TV/screen frame for borrowed footage and stills: tilted, inked, with a hard shadow. */
export const Frame: React.FC<{brand: Brand; width: number; height: number; tilt?: number; children: React.ReactNode; credit?: string; label?: string}> = ({brand, width, height, tilt = -1.5, children, credit, label}) => {
  const {u} = useLayout();
  const b = 7 * u;
  return (
    <div style={{position: 'relative', width, transform: `rotate(${tilt}deg)`}}>
      <div style={{width, height, border: `${b}px solid ${brand.ink}`, borderRadius: 26 * u, overflow: 'hidden', background: '#111', boxShadow: `${14 * u}px ${14 * u}px 0 ${brand.ink}`, position: 'relative'}}>
        {children}
      </div>
      {label ? (
        <div style={{position: 'absolute', top: -34 * u, left: 30 * u, background: brand.accent, color: '#fff', fontFamily: brand.display, fontSize: 40 * u, padding: `${4 * u}px ${22 * u}px`, border: `${5 * u}px solid ${brand.ink}`, borderRadius: 14 * u, transform: 'rotate(-3deg)', boxShadow: `${6 * u}px ${6 * u}px 0 ${brand.ink}`}}>
          {label}
        </div>
      ) : null}
      {credit ? <div style={{marginTop: 26 * u, fontFamily: brand.font, fontSize: 26 * u, color: brand.muted}}>{credit}</div> : null}
    </div>
  );
};
