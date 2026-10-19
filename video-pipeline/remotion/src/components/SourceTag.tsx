import React from 'react';
import type {Brand} from '../types';
import {useLayout} from './layout';

export const SourceTag: React.FC<{brand: Brand; source?: string; style?: React.CSSProperties}> = ({brand, source, style}) => {
  const {u} = useLayout();
  if (!source) return null;
  return (
    <div
      style={{
        fontSize: 22 * u,
        color: brand.muted,
        letterSpacing: 0.5,
        ...style,
      }}
    >
      Source: {source}
    </div>
  );
};
