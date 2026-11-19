import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Loader2,
  RefreshCw,
  ScanSearch,
  Upload,
  X,
} from 'lucide-react';
import { catalogApi } from '../api/index.ts';
import type {
  ImageSearchAnalysis,
  ImageSearchResultItem,
} from '../types/nearestyou.ts';
import { TRANSLATIONS, type AppLanguage } from '../utils/i18n.ts';

interface ImageSearchModalProps {
  open: boolean;
  initialMode: 'camera' | 'upload';
  userLat: number;
  userLng: number;
  radiusKm: number;
  language: AppLanguage;
  onClose: () => void;
  onResults: (payload: {
    previewUrl: string;
    analysis: ImageSearchAnalysis;
    results: ImageSearchResultItem[];
  }) => void;
}

async function compressImageSource(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number
): Promise<{ dataUrl: string; base64: string; mimeType: string }> {
  const maxDim = 1024;
  const scale = Math.min(1, maxDim / Math.max(sourceWidth, sourceHeight, 1));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not process image frame.');
  }
  ctx.drawImage(source, 0, 0, width, height);
  const mimeType = 'image/jpeg';
  const dataUrl = canvas.toDataURL(mimeType, 0.85);
  const commaIdx = dataUrl.indexOf(',');
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  return { dataUrl, base64, mimeType };
}

async function compressFileToJpeg(
  file: File
): Promise<{ dataUrl: string; base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        try {
          const compressed = await compressImageSource(img, img.width, img.height);
          resolve(compressed);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Unsupported or corrupted image file.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.readAsDataURL(file);
  });
}

export const ImageSearchModal: React.FC<ImageSearchModalProps> = ({
  open,
  initialMode,
  userLat,
  userLng,
  radiusKm,
  language,
  onClose,
  onResults,
}) => {
  const t = TRANSLATIONS[language].discover;
  const [mode, setMode] = useState<'camera' | 'upload'>(initialMode);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<{
    base64: string;
    mimeType: string;
    dataUrl: string;
  } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setPreviewUrl(null);
      setPendingImage(null);
      setScanError(null);
      setCameraError(null);
    } else {
      stopCameraStream();
    }
  }, [open, initialMode, stopCameraStream]);

  useEffect(() => {
    if (!open || mode !== 'camera' || previewUrl) {
      stopCameraStream();
      return;
    }

    let cancelled = false;
    const startCamera = async () => {
      setCameraError(null);
      setCameraReady(false);
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('Live camera access is unavailable in this browser. Select or scan an image file instead.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setCameraReady(true);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg =
            err instanceof Error && err.name === 'NotAllowedError'
              ? 'Camera permission was denied. You can allow camera access or scan an uploaded image below.'
              : 'Could not start camera stream on this device. You can upload or capture via file picker instead.';
          setCameraError(msg);
        }
      }
    };

    startCamera();
    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [open, mode, facingMode, previewUrl, stopCameraStream]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopCameraStream();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, stopCameraStream]);

  const executeImageSearch = useCallback(
    async (img: { base64: string; mimeType: string; dataUrl: string }) => {
      setScanning(true);
      setScanError(null);
      try {
        const res = await catalogApi.searchByImage({
          imageBase64: img.base64,
          mimeType: img.mimeType,
          lat: userLat,
          lng: userLng,
          radiusKm,
        });
        const data = res.data;
        const analysis: ImageSearchAnalysis = data?.analysis || {
          detectedItem: 'Scanned Item',
          primaryQuery: '',
          keywords: [],
        };
        const results: ImageSearchResultItem[] = Array.isArray(data?.results) ? data.results : [];
        stopCameraStream();
        onResults({
          previewUrl: img.dataUrl,
          analysis,
          results,
        });
        onClose();
      } catch (err: any) {
        const apiMessage =
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          'Failed to scan image. Please verify backend connection and try again.';
        setScanError(String(apiMessage));
      } finally {
        setScanning(false);
      }
    },
    [userLat, userLng, radiusKm, onResults, onClose, stopCameraStream]
  );

  const handleCaptureFrame = async () => {
    if (!videoRef.current || !cameraReady || scanning) return;
    const video = videoRef.current;
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    try {
      const captured = await compressImageSource(video, vw, vh);
      setPreviewUrl(captured.dataUrl);
      setPendingImage(captured);
      stopCameraStream();
      await executeImageSearch(captured);
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : 'Failed to capture camera frame.');
    }
  };

  const handleSelectedFile = async (file: File | undefined | null) => {
    if (!file) return;
    setScanError(null);
    try {
      const processed = await compressFileToJpeg(file);
      setPreviewUrl(processed.dataUrl);
      setPendingImage(processed);
      await executeImageSearch(processed);
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : 'Could not read the selected image.');
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.imageModalTitle}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#172B3A]/60 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#172B3A]/15 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#172B3A]/10 px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#172B3A]">{t.imageModalTitle}</h2>
            <p className="mt-0.5 text-xs text-[#172B3A]/70">{t.imageModalSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCameraStream();
              onClose();
            }}
            aria-label="Close image search"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#172B3A]/60 hover:bg-[#F4F6F5] hover:text-[#172B3A]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Switch */}
        <div className="grid grid-cols-2 gap-2 border-b border-[#172B3A]/10 bg-[#F4F6F5] p-2">
          <button
            type="button"
            onClick={() => {
              setMode('camera');
              setPreviewUrl(null);
              setPendingImage(null);
              setScanError(null);
            }}
            className={`inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              mode === 'camera'
                ? 'bg-[#176B52] text-white'
                : 'bg-white text-[#172B3A]/75 hover:text-[#172B3A]'
            }`}
          >
            <Camera className="h-4 w-4" />
            {t.tabCamera}
          </button>

          <button
            type="button"
            onClick={() => {
              stopCameraStream();
              setMode('upload');
              setScanError(null);
            }}
            className={`inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              mode === 'upload'
                ? 'bg-[#176B52] text-white'
                : 'bg-white text-[#172B3A]/75 hover:text-[#172B3A]'
            }`}
          >
            <ScanSearch className="h-4 w-4" />
            {t.tabUpload}
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5">
          {previewUrl ? (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-xl border border-[#172B3A]/15 bg-[#172B3A]">
                <img
                  src={previewUrl}
                  alt="Scanned preview"
                  className="max-h-72 w-full object-contain"
                />
                {scanning && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#172B3A]/70 text-white">
                    <Loader2 className="h-7 w-7 animate-spin text-[#F4A62A]" />
                    <span className="text-xs font-semibold">{t.analyzingImage}</span>
                  </div>
                )}
              </div>

              {!scanning && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewUrl(null);
                      setPendingImage(null);
                      setScanError(null);
                    }}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#172B3A]/20 bg-white px-3.5 py-2 text-xs font-semibold text-[#172B3A] hover:bg-[#F4F6F5]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t.retakePhoto}
                  </button>

                  {pendingImage && (
                    <button
                      type="button"
                      onClick={() => executeImageSearch(pendingImage)}
                      className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#176B52] px-4 py-2 text-xs font-semibold text-white hover:bg-[#125641]"
                    >
                      <ScanSearch className="h-4 w-4" />
                      {t.scanSelectedImage}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : mode === 'camera' ? (
            <div className="space-y-3">
              {cameraError ? (
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                  <p className="font-medium">{cameraError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      stopCameraStream();
                      setMode('upload');
                    }}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#176B52] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#125641]"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {t.chooseImageFile}
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative overflow-hidden rounded-xl border border-[#172B3A]/15 bg-[#172B3A]">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="h-64 w-full object-cover sm:h-72"
                    />
                    {!cameraReady && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#172B3A] text-white/80">
                        <Loader2 className="h-6 w-6 animate-spin text-[#F4A62A]" />
                        <span className="text-xs">Starting camera...</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
                      }
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#172B3A]/20 bg-white px-3 py-2 text-xs font-semibold text-[#172B3A] hover:bg-[#F4F6F5]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {t.switchCamera}
                    </button>

                    <button
                      type="button"
                      disabled={!cameraReady || scanning}
                      onClick={handleCaptureFrame}
                      className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#176B52] px-4 py-2 text-xs font-semibold text-white hover:bg-[#125641] disabled:opacity-50"
                    >
                      <Camera className="h-4 w-4" />
                      {t.captureSearch}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                handleSelectedFile(e.dataTransfer.files?.[0]);
              }}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                dragActive
                  ? 'border-[#176B52] bg-emerald-50/60'
                  : 'border-[#172B3A]/20 bg-[#F4F6F5]/70'
              }`}
            >
              <Upload className="h-8 w-8 text-[#176B52]" />
              <p className="mt-3 text-sm font-semibold text-[#172B3A]">{t.chooseImageFile}</p>
              <p className="mt-1 text-xs text-[#172B3A]/65">
                PNG, JPG, WEBP — drop here or tap below to scan
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleSelectedFile(e.target.files?.[0])}
              />

              <button
                type="button"
                disabled={scanning}
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#176B52] px-4 py-2 text-xs font-semibold text-white hover:bg-[#125641] disabled:opacity-50"
              >
                <ScanSearch className="h-4 w-4" />
                {t.chooseImageFile}
              </button>
            </div>
          )}

          {scanError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              {scanError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
