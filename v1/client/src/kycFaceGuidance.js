import { useEffect, useRef, useState } from 'react';

const STABLE_CAPTURE_MS = 1200;
const DETECTION_INTERVAL_MS = 110;
const LIGHT_INTERVAL_MS = 330;
const MEDIAPIPE_WASM = {
  wasmLoaderPath: '/mediapipe/vision_wasm_internal.js',
  wasmBinaryPath: '/mediapipe/vision_wasm_internal.wasm',
};

let faceLandmarkerPromise;

async function createFaceLandmarker() {
  const { FaceLandmarker } = await import('@mediapipe/tasks-vision');
  const options = {
    baseOptions: {
      modelAssetPath: '/mediapipe/face_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 2,
    minFaceDetectionConfidence: 0.62,
    minFacePresenceConfidence: 0.62,
    minTrackingConfidence: 0.62,
  };

  try {
    return await FaceLandmarker.createFromOptions(MEDIAPIPE_WASM, options);
  } catch {
    return FaceLandmarker.createFromOptions(MEDIAPIPE_WASM, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: 'CPU' },
    });
  }
}

function getFaceLandmarker() {
  if (!faceLandmarkerPromise) {
    faceLandmarkerPromise = createFaceLandmarker().catch((error) => {
      faceLandmarkerPromise = null;
      throw error;
    });
  }
  return faceLandmarkerPromise;
}

function measureLight(video, canvas) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let luminance = 0;
  for (let index = 0; index < pixels.length; index += 16) {
    luminance += (pixels[index] * 0.2126) + (pixels[index + 1] * 0.7152) + (pixels[index + 2] * 0.0722);
  }
  return luminance / (pixels.length / 16);
}

export function analyzeKycFace(result, light) {
  const faces = result?.faceLandmarks || [];
  if (faces.length === 0) return 'noFace';
  if (faces.length > 1) return 'multiple';
  if (light < 48) return 'light';
  if (light > 238) return 'tooBright';

  const landmarks = faces[0];
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const point of landmarks) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  if (width < 0.17 || height < 0.26) return 'closer';
  if (width > 0.66 || height > 0.82) return 'back';
  if (centerX < 0.35 || centerX > 0.65) return 'center';
  if (centerY > 0.62) return 'higher';
  if (centerY < 0.27) return 'lower';

  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  if (leftEye && rightEye) {
    const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI);
    if (Math.abs(roll) > 11) return 'straight';
  }

  return 'good';
}

export function useKycFaceGuidance({ videoRef, active, onStable }) {
  const [state, setState] = useState({ status: active ? 'loading' : 'idle', progress: 0, canCapture: !active });
  const stableSinceRef = useRef(0);
  const capturedRef = useRef(false);
  const onStableRef = useRef(onStable);

  useEffect(() => { onStableRef.current = onStable; }, [onStable]);

  useEffect(() => {
    if (!active) {
      setState({ status: 'idle', progress: 0, canCapture: true });
      return undefined;
    }

    let cancelled = false;
    let frameId = 0;
    let lastDetectionAt = 0;
    let lastLightAt = 0;
    let currentLight = 128;
    const lightCanvas = document.createElement('canvas');
    lightCanvas.width = 32;
    lightCanvas.height = 24;
    capturedRef.current = false;
    stableSinceRef.current = 0;
    setState({ status: 'loading', progress: 0, canCapture: false });

    const run = async () => {
      try {
        const landmarker = await getFaceLandmarker();
        if (cancelled) return;

        const detect = (now) => {
          if (cancelled) return;
          const video = videoRef.current;
          if (!video || video.readyState < 2 || !video.videoWidth) {
            frameId = requestAnimationFrame(detect);
            return;
          }
          if (now - lastDetectionAt < DETECTION_INTERVAL_MS) {
            frameId = requestAnimationFrame(detect);
            return;
          }

          lastDetectionAt = now;
          if (now - lastLightAt >= LIGHT_INTERVAL_MS) {
            currentLight = measureLight(video, lightCanvas);
            lastLightAt = now;
          }

          const status = analyzeKycFace(landmarker.detectForVideo(video, now), currentLight);
          if (status !== 'good') {
            stableSinceRef.current = 0;
            setState((previous) => (
              previous.status === status && previous.progress === 0
                ? previous
                : { status, progress: 0, canCapture: false }
            ));
          } else {
            if (!stableSinceRef.current) stableSinceRef.current = now;
            const progress = Math.min(1, (now - stableSinceRef.current) / STABLE_CAPTURE_MS);
            setState({ status: progress === 1 ? 'ready' : 'holdStill', progress, canCapture: progress === 1 });
            if (progress === 1 && !capturedRef.current) {
              capturedRef.current = true;
              window.setTimeout(() => {
                if (!cancelled) onStableRef.current?.();
              }, 120);
              return;
            }
          }
          frameId = requestAnimationFrame(detect);
        };

        frameId = requestAnimationFrame(detect);
      } catch {
        if (!cancelled) setState({ status: 'unavailable', progress: 0, canCapture: true });
      }
    };

    void run();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [active, videoRef]);

  return state;
}
