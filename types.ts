
export interface UploadedImage {
  id: string;
  file: File;
  dataUrl: string;
  width: number;
  height: number;
}

export type PanDirection = 'random' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down';

export interface EffectSettings {
  durationPerImage: number; // seconds
  transitionDuration: number; // seconds
  kenBurns: {
    enabled: boolean;
    zoomFactor: number; // e.g., 1.1 (10% zoom)
    panDirection: PanDirection;
  };
  videoWidth: number;
  videoHeight: number;
  imageFit: 'cover' | 'contain';
}

export interface VideoGenerationProgress {
  percentage: number;
  currentTask: string;
}

export const PAN_DIRECTIONS: PanDirection[] = ['random', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down'];

