import React, { useState, useEffect, useRef } from "react";
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
  loading = "lazy",
  fetchPriority,
  style,
  ...rest
}) => {
  const defaultFallback = fallbackSrc !== undefined ? fallbackSrc : '/defaults/events/general_default.webp';
  const isCached = loadedHdImageCache.has(src);
  const [isHdLoaded, setIsHdLoaded] = useState<boolean>(isCached);
  const [currentSrc, setCurrentSrc] = useState<string>(
    isCached ? src : (lowResSrc || getLowResPlaceholderUrl(src))
  );
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) return;

    if (loadedHdImageCache.has(src)) {
      setIsHdLoaded(true);
      setCurrentSrc(src);
      return;
    }

    // Set initial instant preview
    const placeholder = lowResSrc || getLowResPlaceholderUrl(src);
    setCurrentSrc(placeholder);
    setIsHdLoaded(false);

    // Asynchronously pre-load Full HD image in the background
    let isCancelled = false;
    const hdImage = new Image();
    hdImage.src = src;

    hdImage.onload = () => {
      if (!isCancelled) {
        loadedHdImageCache.add(src);
        setCurrentSrc(src);
        setIsHdLoaded(true);
        if (onLoadComplete) onLoadComplete();
      }
    };

    hdImage.onerror = () => {
      if (!isCancelled) {
        if (defaultFallback) {
          setCurrentSrc(defaultFallback);
        }
        setIsHdLoaded(true);
      }
    };

    return () => {
      isCancelled = true;
    };
  }, [src, lowResSrc, defaultFallback, onLoadComplete]);

  return (
    <div className={`${containerClassName} ${aspectRatioClass} bg-slate-900/40`}>
      {/* 1. Low-Res Blurred Placeholder (Visible instantly until HD arrives) */}
      {!isHdLoaded && (
        <img
          src={lowResSrc || getLowResPlaceholderUrl(src)}
          alt={alt}
          aria-hidden="true"
          onError={(e) => {
            const target = e.currentTarget;
            if (defaultFallback && target.src !== defaultFallback) {
              target.src = defaultFallback;
            }
          }}
          className={`absolute inset-0 w-full h-full object-cover scale-105 filter blur-md transition-opacity duration-500 ease-out ${
            isHdLoaded ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        />
      )}

      {/* 2. Full HD Image (Crossfades seamlessly in place) */}
      <img
        ref={imgRef}
        src={currentSrc}
        alt={alt}
        loading={loading}
        fetchPriority={fetchPriority}
        decoding="async"
        onError={(e) => {
          const target = e.currentTarget;
          if (defaultFallback && target.src !== defaultFallback) {
            target.src = defaultFallback;
          }
        }}
        className={`${className} transition-all duration-500 ease-out ${
          isHdLoaded ? "opacity-100 filter-none" : "opacity-90 filter blur-[2px]"
        }`}
        style={{
          imageRendering: "-webkit-optimize-contrast",
          ...style,
        }}
        {...rest}
      />
    </div>
  );
};
