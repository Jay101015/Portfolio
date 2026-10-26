import React from 'react';
import type {Brand} from '../types';
import {useLayout} from './layout';

/** Small on-screen attribution for footage and stills, only when the script asks for it (`credits: screen`);
 * otherwise the credits go to credits.txt for the description. */
export const CreditTag: React.FC<{brand: Brand; credit?: string}> = ({brand, credit}) => {
  const {u, pad} = useLayout();
  if (!credit || !brand.creditsOnScreen) return null;
  return (
    <div style={{position: 'absolute', top: 36 * u, right: pad, fontSize: 20 * u, color: brand.text, opacity: 0.75, background: 'rgba(0,0,0,0.45)', padding: `${6 * u}px ${14 * u}px`, borderRadius: 8 * u, letterSpacing: 0.5}}>
      {credit}
    </div>
  );
};
