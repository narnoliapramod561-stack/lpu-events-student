import React, { useState, useRef, useCallback, useEffect } from "react";
import { getLowResPlaceholderUrl } from "../utils/images";

// Cache only successfully loaded primary sources. Eager priority is not proof
// that the browser has downloaded and decoded an image.
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
  src, lowResSrc, fallbackSrc, alt = "",
  className = "w-full h-full object-cover",
  containerClassName = "relative w-full h-full overflow-hidden",
  aspectRatioClass = "", onLoadComplete, ambientBackdrop = false,
  loading = "lazy", fetchPriority, style, ...rest
}) => {
  const defaultFallback = fallbackSrc !== undefined
    ? fallbackSrc
    : "/defaults/events/subcategories/academics_seminar.webp";
  const isEager = loading === "eager" || fetchPriority === "high";
  const [imgSrc, setImgSrc] = useState(src);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">(
    loadedHdImageCache.has(src) ? "loaded" : "loading"
  );
  const fallbackAttemptedForSrcRef = useRef<string | null>(null);
  const sourcePropRef = useRef(src);

  // Derive source changes synchronously without confusing a chosen fallback
  // URL with a new src prop. This avoids a one-frame flash of the prior slide.
  const sourceChanged = sourcePropRef.current !== src;
  const effectiveSrc = sourceChanged ? src : imgSrc;
  const effectiveState = sourceChanged
    ? (loadedHdImageCache.has(src) ? "loaded" : "loading")
    : loadState;

  useEffect(() => {
    sourcePropRef.current = src;
    setImgSrc(src);
    setLoadState(loadedHdImageCache.has(src) ? "loaded" : "loading");
  }, [src]);

  const handleImageLoad = useCallback(() => {
    if (effectiveSrc === src) loadedHdImageCache.add(src);
    setLoadState("loaded");
    onLoadComplete?.();
  }, [effectiveSrc, src, onLoadComplete]);

  const handleImageError = useCallback(() => {
    const canUseFallback = effectiveSrc === src && Boolean(defaultFallback) &&
      defaultFallback !== src && fallbackAttemptedForSrcRef.current !== src;
    if (canUseFallback) {
      fallbackAttemptedForSrcRef.current = src;
      setImgSrc(defaultFallback);
      setLoadState("loading");
      return;
    }
    // No retry loop: leave the stable frame background visible if fallback fails.
    setLoadState("error");
  }, [defaultFallback, effectiveSrc, src]);

  const bgClass = ambientBackdrop ? "" : containerClassName.includes("bg-") ? "" : "bg-slate-900/40";
  const isContain = className.includes("object-contain");
  const isFill = className.includes("object-fill") || Boolean(style && (style as any).objectFit === "fill");
  const placeholderFit = isFill ? "object-fill" : isContain ? "object-contain" : "object-cover";
  const overflowSafeContainerClass = containerClassName.includes("overflow-") ? containerClassName : containerClassName + " overflow-hidden";
  const placeholderUrl = lowResSrc || getLowResPlaceholderUrl(src);
  const shouldShowPlaceholder = !isEager && effectiveState === "loading" &&
    Boolean(placeholderUrl) && placeholderUrl !== src && placeholderUrl !== effectiveSrc;

  return (
    <div className={overflowSafeContainerClass + " " + aspectRatioClass + " " + bgClass} style={{ contain: "layout paint" }}>
      {ambientBackdrop && effectiveSrc && (
        <div aria-hidden="true"
          className="absolute inset-0 w-full h-full bg-cover bg-center blur-2xl saturate-150 brightness-105 scale-125 opacity-90 pointer-events-none transform-gpu"
          style={{ backgroundImage: "url(" + effectiveSrc + ")", contain: "strict" }}
        />
      )}
      {shouldShowPlaceholder && (
        <img key={"placeholder:" + placeholderUrl} src={placeholderUrl} alt="" aria-hidden="true"
          loading="eager" decoding="async"
          onError={(event) => { event.currentTarget.style.display = "none"; }}
          className={"absolute inset-0 w-full h-full " + placeholderFit + " filter blur-md transition-opacity duration-300 ease-out opacity-100 z-[2]"}
          style={isFill ? { objectFit: "fill" } : undefined}
        />
      )}
      {effectiveState === "error" && (
        <div aria-hidden="true" className="absolute inset-0 z-[1] bg-black/[0.03] dark:bg-white/[0.04]" />
      )}
      <img key={effectiveSrc} src={effectiveSrc} alt={alt} loading={loading} fetchPriority={fetchPriority}
        decoding={isEager ? "sync" : "async"} onLoad={handleImageLoad} onError={handleImageError}
        className={className + " transition-opacity duration-300 ease-out " +
          (effectiveState === "error" ? "opacity-0" : isEager || effectiveState === "loaded" ? "opacity-100" : "opacity-0") +
          (ambientBackdrop ? " relative z-10 [mask-image:linear-gradient(to_right,transparent,black_2.5%,black_97.5%,transparent)]" : "")}
        style={{ imageRendering: "-webkit-optimize-contrast", ...(isFill ? { objectFit: "fill" } : {}), ...style }}
        {...rest}
      />
    </div>
  );
};
