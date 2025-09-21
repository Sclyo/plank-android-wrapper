import { useEffect, useRef, useState } from 'react';

interface MediaPipeHook {
  isLoaded: boolean;
  isInitialized: boolean;
  error: string | null;
  initializeCamera: (videoElement: HTMLVideoElement) => Promise<void>;
  stopCamera: () => void;
  onResults: (callback: (results: any) => void) => void;
}

export function useMediaPipe(): MediaPipeHook {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const poseRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const resultsCallbackRef = useRef<((results: any) => void) | null>(null);

  useEffect(() => {
    const loadMediaPipeFromCDN = async () => {
      try {
        console.log('Loading MediaPipe directly from CDN...');
        
        // Load MediaPipe scripts directly from CDN
        const loadScript = (src: string): Promise<void> => {
          return new Promise((resolve, reject) => {
            // Check if script is already loaded
            if (document.querySelector(`script[src="${src}"]`)) {
              resolve();
              return;
            }
            
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
          });
        };

        // Load required MediaPipe scripts in order
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js');
        
        // Wait for MediaPipe to be available
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Check if MediaPipe is loaded
        if (typeof window === 'undefined' || !(window as any).Pose) {
          throw new Error('MediaPipe Pose not available after loading scripts');
        }
        
        const Pose = (window as any).Pose;
        console.log('MediaPipe loaded successfully from CDN');
        
        // Initialize Pose
        poseRef.current = new Pose({
          locateFile: (file: string) => {
            console.log('MediaPipe requesting file:', file);
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
          }
        });

        // Configure for mobile optimization
        poseRef.current.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          minDetectionConfidence: 0.3,
          minTrackingConfidence: 0.3
        });

        // Set up results callback
        poseRef.current.onResults((results: any) => {
          if (results.poseLandmarks && results.poseLandmarks.length > 0) {
            console.log('Pose landmarks detected:', results.poseLandmarks.length);
          }
          if (resultsCallbackRef.current) {
            resultsCallbackRef.current(results);
          }
        });

        console.log('MediaPipe pose initialized successfully');
        setIsLoaded(true);
      } catch (err) {
        console.error('MediaPipe CDN loading error:', err);
        setError('Failed to load MediaPipe from CDN: ' + (err as Error).message);
      }
    };

    loadMediaPipeFromCDN();
  }, []);

  const initializeCamera = async (videoElement: HTMLVideoElement) => {
    console.log('Initializing camera...');
    if (!isLoaded || !poseRef.current) {
      throw new Error('MediaPipe not loaded');
    }

    try {
      // Use the Camera constructor loaded from CDN
      if (typeof window === 'undefined' || !(window as any).Camera) {
        throw new Error('MediaPipe Camera not available');
      }
      
      const Camera = (window as any).Camera;
      console.log('Using Camera from CDN');
      
      cameraRef.current = new Camera(videoElement, {
        onFrame: async () => {
          if (poseRef.current && videoElement.videoWidth > 0) {
            await poseRef.current.send({ image: videoElement });
          }
        },
        width: 640,
        height: 480
      });

      console.log('Starting camera...');
      await cameraRef.current.start();
      console.log('Camera started successfully');
      setIsInitialized(true);
    } catch (err) {
      console.error('Camera initialization error:', err);
      setError('Failed to initialize camera: ' + (err as Error).message);
      throw err;
    }
  };

  const stopCamera = () => {
    if (cameraRef.current) {
      cameraRef.current.stop();
      cameraRef.current = null;
    }
    setIsInitialized(false);
  };

  const onResults = (callback: (results: any) => void) => {
    resultsCallbackRef.current = callback;
  };

  return {
    isLoaded,
    isInitialized,
    error,
    initializeCamera,
    stopCamera,
    onResults,
  };
}
