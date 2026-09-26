import React from 'react';
import { LpuEventsLogo } from './LpuEventsLogo';

export interface LpuLogoProps {
  className?: string;
  size?: number;
  id?: string;
}

export const LpuLogo: React.FC<LpuLogoProps> = ({ className = 'w-16 h-16', size, id }) => {
  return <LpuEventsLogo className={className} size={size} id={id} />;
};
