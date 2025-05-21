
import React from 'react';
import { useState, useCallback, useRef } from 'react';
import type { UploadedImage, EffectSettings, VideoGenerationProgress } from '../types';

const MIME_TYPE_MP4 = 'video/mp4; codecs="avc1.42E01E"'; // A common H.264 MP4 codec string
const MIME_TYPE_WEBM = 'video/webm; codecs="vp8, opus"'; // VP8 for video, Opus for audio (though no audio here)


const getSupportedMimeType = (): string => {
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(MIME_TYPE_MP4)) {
    return MIME_TYPE_MP4;
  }
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(MIME_TYPE_WEBM)) {
    return MIME_TYPE_WEBM;
  }
  return MIME_TYPE_WEBM; // Fallback, or could throw error if neither supported
};

export const useVideoGenerator = (
  images: UploadedImage[],
  settings: EffectSettings
) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<VideoGenerationProgress>({ percentage: 0, currentTask: '' });
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatedMimeType, setGeneratedMimeType] = useState<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const cleanup = useCallback(() => {
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
    }
  }, [videoUrl]);

  const generateVideo = useCallback(async () => {
    if (images.length === 0) {
      setError("No images selected.");
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setError("MediaRecorder API not supported in this browser.");
      return;
    }

    cleanup();
    setIsGenerating(true);
    setError(null);
    setProgress({ percentage: 0, currentTask: 'Initializing...' });

    const actualMimeType = getSupportedMimeType();
    setGeneratedMimeType(actualMimeType);

    const canvas = document.createElement('canvas');
    canvas.width = settings.videoWidth;
    canvas.height = settings.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError("Failed to get canvas context.");
      setIsGenerating(false);
      return;
    }
    canvasRef.current = canvas; // For potential debugging or direct access

    try {
      const stream = canvas.captureStream(30); // 30 FPS
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: actualMimeType });
    } catch (e) {
      console.error("MediaRecorder initialization error:", e);
      setError(`Failed to initialize MediaRecorder with ${actualMimeType}. Try another browser or check console. Common issue: Hardware acceleration disabled.`);
      setIsGenerating(false);
      return;
    }
    
    recordedChunksRef.current = [];

    mediaRecorderRef.current.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: actualMimeType });
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setIsGenerating(false);
      setProgress({ percentage: 100, currentTask: 'Video generated!' });
    };
    
    mediaRecorderRef.current.onerror = (event) => {
      console.error('MediaRecorder error:', event);
      setError(`MediaRecorder error. Check console. Your browser might not support ${actualMimeType} encoding reliably.`);
      setIsGenerating(false);
      cleanup();
    };

    mediaRecorderRef.current.start();

    let totalDuration = images.length * settings.durationPerImage;
    if (images.length > 1) {
        totalDuration += (images.length -1) * settings.transitionDuration; // Account for transitions overlapping image durations slightly.
    }

    let overallTime = 0;
    const frameDuration = 1000 / 30; // 30 FPS

    const imageElements: HTMLImageElement[] = await Promise.all(
      images.map(img => new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = img.dataUrl;
      }))
    );

    const drawFrame = () => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
        return;
      }

      ctx.fillStyle = '#000000'; // Black background for letterboxing/pillarboxing
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let currentTimeInVideo = overallTime / 1000;
      
      let currentImageIndex = -1;
      let timeIntoCurrentImage = 0;
      let cumulativeTime = 0;

      for (let i = 0; i < images.length; i++) {
          const imageDisplayStartTime = i * settings.durationPerImage - (i > 0 ? settings.transitionDuration : 0);
          const imageDisplayEndTime = imageDisplayStartTime + settings.durationPerImage + (i < images.length - 1 ? settings.transitionDuration : 0);

          if (currentTimeInVideo >= imageDisplayStartTime && currentTimeInVideo < imageDisplayEndTime) {
              currentImageIndex = i;
              timeIntoCurrentImage = currentTimeInVideo - imageDisplayStartTime;
              break;
          }
      }
      
      if (currentImageIndex === -1 && currentTimeInVideo >= totalDuration) { // End condition
         if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
         }
         return;
      }
      if (currentImageIndex === -1) { // Should not happen if logic is correct
          currentImageIndex = images.length -1;
          timeIntoCurrentImage = settings.durationPerImage;
      }


      const img = imageElements[currentImageIndex];
      const progressInImage = Math.min(1, timeIntoCurrentImage / settings.durationPerImage);

      // --- Draw current image ---
      ctx.save();
      let alpha = 1;

      // Handle transition (crossfade)
      const transitionProgress = (timeIntoCurrentImage > settings.durationPerImage) 
                               ? (timeIntoCurrentImage - settings.durationPerImage) / settings.transitionDuration 
                               : (timeIntoCurrentImage < settings.transitionDuration && currentImageIndex > 0) 
                                 ? timeIntoCurrentImage / settings.transitionDuration 
                                 : 1;

      if (timeIntoCurrentImage > settings.durationPerImage && currentImageIndex < images.length - 1) { // Fading out current
          alpha = 1 - Math.min(1, transitionProgress);
      } else if (timeIntoCurrentImage < settings.transitionDuration && currentImageIndex > 0) { // Fading in current
          alpha = Math.min(1, transitionProgress);
      }
      ctx.globalAlpha = alpha;
      applyKenBurnsAndDraw(ctx, img, settings, progressInImage, canvas.width, canvas.height);
      ctx.restore();


      // --- Draw next image (for transition) ---
      if (timeIntoCurrentImage > settings.durationPerImage && currentImageIndex < images.length - 1) {
          const nextImageIndex = currentImageIndex + 1;
          const nextImg = imageElements[nextImageIndex];
          const nextImageProgress = (timeIntoCurrentImage - settings.durationPerImage) / settings.durationPerImage; // Simplified, use 0 for start of KB
          ctx.save();
          ctx.globalAlpha = Math.min(1, transitionProgress);
          applyKenBurnsAndDraw(ctx, nextImg, settings, 0, canvas.width, canvas.height); // Start Ken Burns for next image
          ctx.restore();
      }


      overallTime += frameDuration;
      const percentage = Math.min(100, (overallTime / (totalDuration * 1000)) * 100);
      setProgress({ percentage, currentTask: `Encoding frame for image ${currentImageIndex + 1}/${images.length}` });

      if (overallTime < totalDuration * 1000) {
        animationFrameIdRef.current = requestAnimationFrame(drawFrame);
      } else {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }
    };
    
    animationFrameIdRef.current = requestAnimationFrame(drawFrame);

  }, [images, settings, cleanup]);

  const applyKenBurnsAndDraw = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    currentSettings: EffectSettings,
    progressInImage: number, // 0 to 1
    canvasWidth: number,
    canvasHeight: number
  ) => {
    const { kenBurns, imageFit } = currentSettings;
    let imgWidth = img.width;
    let imgHeight = img.height;
    let sx = 0, sy = 0, sWidth = img.width, sHeight = img.height; // Source rect
    let dx = 0, dy = 0, dWidth = canvasWidth, dHeight = canvasHeight; // Destination rect

    const canvasAspect = canvasWidth / canvasHeight;
    const imgAspect = imgWidth / imgHeight;

    if (imageFit === 'cover') {
      if (imgAspect > canvasAspect) { // Image wider than canvas
        sHeight = img.height;
        sWidth = sHeight * canvasAspect;
        sx = (img.width - sWidth) / 2;
      } else { // Image taller than canvas
        sWidth = img.width;
        sHeight = sWidth / canvasAspect;
        sy = (img.height - sHeight) / 2;
      }
    } else { // contain
      if (imgAspect > canvasAspect) { // Image wider
        dWidth = canvasWidth;
        dHeight = dWidth / imgAspect;
        dy = (canvasHeight - dHeight) / 2;
      } else { // Image taller or same aspect
        dHeight = canvasHeight;
        dWidth = dHeight * imgAspect;
        dx = (canvasWidth - dWidth) / 2;
      }
    }
    
    if (kenBurns.enabled) {
        const zoom = 1 + (kenBurns.zoomFactor - 1) * progressInImage;
        const newSWidth = sWidth / zoom;
        const newSHeight = sHeight / zoom;

        // Pan logic (simple version: pan from center outwards or fixed direction)
        let panX = (sWidth - newSWidth) / 2; // Default: center zoom
        let panY = (sHeight - newSHeight) / 2;

        // Example for 'pan-right': start left, move to center as it zooms
        // This needs a more sophisticated pan logic tied to panDirection
        // For simplicity, we'll stick to a centered zoom for now or a slight random shift.
        
        const maxPanOffset = 0.1 * sWidth; // Max pan 10% of image width/height
        let offsetX = 0;
        let offsetY = 0;

        if (kenBurns.panDirection !== 'random' && kenBurns.panDirection !== 'zoom-in' && kenBurns.panDirection !== 'zoom-out') {
             // Fixed direction panning needs more complex start/end point calculation
             // Placeholder: simple shift based on progress
             if(kenBurns.panDirection === 'pan-left') offsetX = -maxPanOffset * progressInImage;
             if(kenBurns.panDirection === 'pan-right') offsetX = maxPanOffset * progressInImage;
             if(kenBurns.panDirection === 'pan-up') offsetY = -maxPanOffset * progressInImage;
             if(kenBurns.panDirection === 'pan-down') offsetY = maxPanOffset * progressInImage;
        }
        // Random needs to be determined once per image, not per frame. Store random factors if using.
        // For now, let's focus on zoom being effective. Pan needs more state.

        sx = sx + panX + offsetX;
        sy = sy + panY + offsetY;
        sWidth = newSWidth;
        sHeight = newSHeight;
    }

    ctx.drawImage(img, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
  };


  // Effect to cleanup on unmount
  React.useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return { isGenerating, progress, videoUrl, error, generateVideo, cleanup, generatedMimeType };
};

