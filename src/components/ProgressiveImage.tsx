import React, { useState, useRef, useCallback } from "react";
import { getLowResPlaceholderUrl } from "../utils/images";

// In-memory cache of already loaded HD image URLs to prevent re-blurring on route navigation
const loadedHdImageCache = new Set<string>();

export interface ProgressiveImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  lowResSrc?: string;
  fallbackSrc?: string;
  alt?: string;
  className?: string;
  containerClassName?: string;
  aspectRatioClass?: string;
  onLoadComplete?: () => void;
  ambientBackdrop?: boolean;
}

export const ProgressiveImage: React.FC<ProgressiveImageProps> = ({
  src,
  lowResSrc,
  fallbackSrc,
  alt = "",
  className = "w-full h-full object-cover",
  containerClassName = "relative w-full h-full overflow-hidden",
  aspectRatioClass = "",
  onLoadComplete,
  ambientBackdrop = false,
  loading = "lazy",
  fetchPriority,
  style,
  ...rest
}) => {
  const defaultFallback = fallbackSrc !== undefined ? fallbackSrc : "";
  const isEager = loading === "eager" || fetchPriority === "high";
  const isAlreadyLoaded = loadedHdImageCache.has(src) || isEager;
  const [isHdLoaded, setIsHdLoaded] = useState<boolean>(isAlreadyLoaded);
  const [imgSrc, setImgSrc] = useState<string>(src);
  const [hasFailed, setHasFailed] = useState<boolean>(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Sync internal state when source prop changes dynamically
  React.useEffect(() => {
    setImgSrc(src);
    setHasFailed(false);
    setIsHdLoaded(loadedHdImageCache.has(src) || isEager);
  }, [src, isEager]);

  const handleImageLoad = useCallback(() => {
    if (imgSrc) loadedHdImageCache.add(imgSrc);
    setIsHdLoaded(true);
    setHasFailed(false);
    if (onLoadComplete) onLoadComplete();
  }, [imgSrc, onLoadComplete]);

  const handleImageError = useCallback(() => {
    if (defaultFallback && imgSrc !== defaultFallback) {
      // Gracefully switch to the deterministic category/subcategory default WebP
      setImgSrc(defaultFallback);
    } else {
      // Both primary and fallback failed; enter fallback state gracefully
      setHasFailed(true);
      setIsHdLoaded(true);
    }
  }, [defaultFallback, imgSrc]);

  const bgClass = ambientBackdrop ? "" : containerClassName.includes("bg-") ? "" : "bg-slate-900/40";
  const isContain = className.includes("object-contain");
  const isFill = className.includes("object-fill") || Boolean(style && (style as any).objectFit === "fill");
  const placeholderFit = isFill ? "object-fill" : isContain ? "object-contain" : "object-cover";
  const overflowSafeContainerClass = containerClassName.includes("overflow-")
    ? containerClassName
    : `${containerClassName} overflow-hidden`;

  const placeholderUrl = lowResSrc || getLowResPlaceholderUrl(src);

  return (
    <div className={`${overflowSafeContainerClass} ${aspectRatioClass} ${bgClass}`} style={{ contain: 'layout paint' }}>
      {/* Seamless Horizon Dual-Surface Engine (100% Space Filled, Zero Black Bars, Zero Info Loss) */}
      {ambientBackdrop && (
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          {/* Surface 1A: Overscan Horizon Dispersion (Extends 25% outside canvas to completely eliminate edge-blur fade) */}
          <div
            className="absolute -inset-[25%] w-[150%] h-[150%] bg-cover bg-center filter blur-3xl saturate-200 brightness-110 transform-gpu opacity-95"
            style={{ backgroundImage: `url(${imgSrc})` }}
          />
          {/* Surface 1B: High-Fidelity Luminance & Texture Equalizer */}
          <div
            className="absolute -inset-[15%] w-[130%] h-[130%] bg-cover bg-center filter blur-xl saturate-150 brightness-100 transform-gpu opacity-45 mix-blend-overlay"
            style={{ backgroundImage: `url(${imgSrc})` }}
          />
          {/* Surface 1C: Atmospheric Lighting & Edge Continuity Vignette */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-black/15 pointer-events-none" />
        </div>
      )}

      {/* 1. Low-Res Blurred Placeholder (Visible instantly until HD arrives, skipped for eager LCP) */}
      {!isHdLoaded && !isEager && placeholderUrl && (
        <img
          src={placeholderUrl}
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="async"
          onError={(e) => {
            // Silently suppress placeholder errors
            e.currentTarget.style.display = "none";
          }}
          className={`absolute inset-0 w-full h-full ${placeholderFit} filter blur-md transition-opacity duration-300 ease-out opacity-100 z-[2]`}
          style={isFill ? { objectFit: "fill" } : undefined}
        />
      )}

      {/* 2. Full HD Image (Native direct paint with zero duplicate Image instantiation) */}
      {!hasFailed ? (
        <img
          ref={imgRef}
          src={imgSrc}
          alt={alt}
          loading={loading}
          fetchPriority={fetchPriority}
          decoding={isEager ? "sync" : "async"}
          onLoad={handleImageLoad}
          onError={handleImageError}
          className={`${className} ${
            isEager
              ? "opacity-100"
              : `transition-opacity duration-300 ease-out ${isHdLoaded ? "opacity-100" : "opacity-0"}`
          } ${ambientBackdrop ? "relative z-10 drop-shadow-[0_4px_16px_rgba(0,0,0,0.22)]" : ""}`}
          style={{
            imageRendering: "-webkit-optimize-contrast",
            ...(isFill ? { objectFit: "fill" } : {}),
            ...style,
          }}
          {...rest}
        />
      ) : (
        <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/50">
            <span className="font-heading font-black text-xs uppercase tracking-wider">LPU</span>
          </div>
        </div>
      )}
    </div>
  );
};

