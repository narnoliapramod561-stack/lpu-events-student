import React, { useState, useRef, useCallback } from "react";
import { getLowResPlaceholderUrl } from "../utils/images";

// Bounded in-memory cache of already loaded HD image URLs to prevent re-blurring on scroll/route navigation
const MAX_IMAGE_CACHE_ENTRIES = 300;
const loadedHdImageCache = new Set<string>();

const recordLoadedImage = (url: string) => {
  if (!url) return;
  if (loadedHdImageCache.size >= MAX_IMAGE_CACHE_ENTRIES) {
    const firstKey = loadedHdImageCache.values().next().value;
    if (firstKey) loadedHdImageCache.delete(firstKey);
  }
  loadedHdImageCache.add(url);
};

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

  // Sync internal state only when the image source truly changes
  React.useEffect(() => {
    if (src !== imgSrc) {
      setImgSrc(src);
      setHasFailed(false);
      setIsHdLoaded(loadedHdImageCache.has(src) || isEager);
    }
  }, [src, isEager, imgSrc]);

  // If the browser already has the image decoded into memory, mark ready immediately
  React.useLayoutEffect(() => {
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      recordLoadedImage(imgSrc);
      setIsHdLoaded(true);
    }
  }, [imgSrc]);

  const handleImageLoad = useCallback(() => {
    if (imgSrc) recordLoadedImage(imgSrc);
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
  const hasDistinctPlaceholder = Boolean(
    placeholderUrl && 
    placeholderUrl !== imgSrc && 
    !isAlreadyLoaded && 
    !isHdLoaded && 
    !isEager
  );

  return (
    <div className={`${overflowSafeContainerClass} ${aspectRatioClass} ${bgClass}`}>
      {/* Optimized Ambient Backdrop Surface — High visual fidelity with low VRAM footprint */}
      {ambientBackdrop && (
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div
            className="absolute -inset-[15%] w-[130%] h-[130%] bg-cover bg-center filter blur-xl saturate-150 brightness-105 opacity-80"
            style={{ backgroundImage: `url(${imgSrc})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/20 pointer-events-none" />
        </div>
      )}

      {/* 1. Low-Res Blurred Placeholder (Only rendered before HD is ready) */}
      {hasDistinctPlaceholder && !isHdLoaded && (
        <img
          src={placeholderUrl}
          alt=""
          aria-hidden="true"
          loading={loading}
          decoding="async"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
          className={`absolute inset-0 w-full h-full ${placeholderFit} filter blur-md opacity-100 z-[2]`}
          style={isFill ? { objectFit: "fill" } : undefined}
        />
      )}

      {/* 2. Full HD Image — Stable zero-flicker native async decode */}
      {!hasFailed ? (
        <img
          ref={imgRef}
          src={imgSrc}
          alt={alt}
          loading={loading}
          fetchPriority={fetchPriority}
          decoding="async"
          onLoad={handleImageLoad}
          onError={handleImageError}
          className={`${className} opacity-100 ${ambientBackdrop ? "relative z-10 drop-shadow-[0_4px_16px_rgba(0,0,0,0.22)]" : ""}`}
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

