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
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640;
  const defaultFallback = fallbackSrc !== undefined 
    ? fallbackSrc 
    : (isMobile ? '/defaults/events/general_default_mobile.webp' : '/defaults/events/general_default_tablet.webp');
  const isEager = loading === "eager";
  const isCached = loadedHdImageCache.has(src) || isEager;
  const [isHdLoaded, setIsHdLoaded] = useState<boolean>(isCached);
  const [currentSrc, setCurrentSrc] = useState<string>(
    isCached ? src : (lowResSrc || getLowResPlaceholderUrl(src))
  );
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) return;

    if (isEager || loadedHdImageCache.has(src)) {
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
  }, [src, lowResSrc, defaultFallback, onLoadComplete, isEager]);

  const bgClass = containerClassName.includes("bg-") ? "" : "bg-slate-900/40";
  const isContain = className.includes("object-contain");
  const isFill = className.includes("object-fill") || Boolean(style && (style as any).objectFit === "fill");
  const placeholderFit = isFill ? "object-fill" : isContain ? "object-contain" : "object-cover";

  return (
    <div className={`${containerClassName} ${aspectRatioClass} ${bgClass}`}>
      {/* 1. Low-Res Blurred Placeholder (Visible instantly until HD arrives, skipped for eager LCP) */}
      {!isHdLoaded && !isEager && (
        <img
          src={lowResSrc || getLowResPlaceholderUrl(src)}
          alt={alt}
          aria-hidden="true"
          onError={(e) => {
            // Silently suppress placeholder errors without triggering heavy asset downloads
            e.currentTarget.style.display = "none";
          }}
          className={`absolute inset-0 w-full h-full ${placeholderFit} filter blur-md transition-opacity duration-500 ease-out opacity-100`}
          style={isFill ? { objectFit: "fill" } : undefined}
        />
      )}

      {/* 2. Full HD Image (Direct paint for eager, crossfades seamlessly for lazy) */}
      <img
        ref={imgRef}
        src={currentSrc}
        alt={alt}
        loading={loading}
        fetchPriority={fetchPriority}
        decoding={isEager ? "sync" : "async"}
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
          ...(isFill ? { objectFit: "fill" } : {}),
          ...style,
        }}
        {...rest}
      />
    </div>
  );
};
