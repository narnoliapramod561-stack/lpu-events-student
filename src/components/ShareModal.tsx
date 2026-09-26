import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  Copy, 
  Check, 
  Share2, 
  QrCode, 
  Download, 
  Mail, 
  Sparkles
} from "lucide-react";
import { 
  getStudentEventUrl, 
  generateQrDataUrl, 
  downloadQrCode,
  formatEventDateRange,
  trackEvent 
} from "@lpu-events/shared";
import { getEventImage } from "../utils/images";
import { ProgressiveImage } from "./ProgressiveImage";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: any;
}

const WhatsAppIcon = () => (
  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
    <path d="M17.472 14.382c-.301-.15-1.782-.879-2.058-.98-.276-.1-.477-.15-.678.15-.2.3-.778.98-.954 1.18-.176.2-.351.226-.653.075-.301-.15-1.272-.469-2.423-1.496-.896-.799-1.501-1.786-1.677-2.087-.176-.301-.019-.464.132-.614.136-.135.301-.351.452-.527.15-.176.2-.301.301-.502.1-.2.05-.376-.025-.527-.075-.15-.678-1.634-.929-2.238-.244-.588-.493-.509-.678-.518-.176-.01-.376-.01-.577-.01-.201 0-.527.075-.803.376s-1.054 1.03-1.054 2.511 1.079 2.912 1.23 3.113c.15.201 2.124 3.243 5.145 4.549.719.31 1.28.496 1.718.636.722.23 1.378.198 1.897.12.578-.088 1.782-.728 2.033-1.432.251-.703.251-1.305.176-1.432-.075-.126-.276-.201-.577-.351z"/>
    <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.98-1.399C8.423 21.498 10.155 22 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18.182c-1.636 0-3.15-.47-4.437-1.284l-.318-.198-2.964.832.846-2.887-.215-.342A8.161 8.161 0 013.818 12c0-4.512 3.67-8.182 8.182-8.182 4.512 0 8.182 3.67 8.182 8.182 0 4.512-3.67 8.182-8.182 8.182z"/>
  </svg>
);

const TelegramIcon = () => (
  <svg className="w-4 h-4 fill-current ml-0.5" viewBox="0 0 24 24">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.19-.08-.05-.19-.02-.27 0-.12.03-1.99 1.27-5.62 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.06-.49-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.75 3.99-1.74 6.66-2.89 8-3.46 3.82-1.59 4.62-1.87 5.14-1.88.11 0 .37.03.54.17.14.12.18.28.2.45-.02.07-.02.2-.04.38z"/>
  </svg>
);

const LinkedInIcon = () => (
  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
  </svg>
);

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  event
}) => {
  const [copied, setCopied] = useState(false);
  const [activeView, setActiveView] = useState<"share" | "qr">("share");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const eventName = event?.name || "Campus Event";
  const eventId = event?.id || "";
  const shareUrl = getStudentEventUrl(eventId, eventName);

  const dateFormatted = event?.start_at 
    ? formatEventDateRange(event.start_at, event.end_at) 
    : "Date to be announced";

  const timeFormatted = (() => {
    if (!event?.start_at) return "Time TBA";
    try {
      const start = new Date(event.start_at);
      const startStr = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      if (event.end_at) {
        const end = new Date(event.end_at);
        const endStr = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
        return `${startStr} – ${endStr}`;
      }
      return startStr;
    } catch {
      return "Time TBA";
    }
  })();

  const venueFormatted = event?.venue_name || "LPU Campus";

  const shareText = `🎉 Check out *${eventName}* at LPU!\n📅 Date: ${dateFormatted}\n⏰ Time: ${timeFormatted}\n📍 Venue: ${venueFormatted}\n\n👉 View details & register: ${shareUrl}`;

  useEffect(() => {
    if (!shareUrl) return;
    generateQrDataUrl(shareUrl, { width: 420, margin: 2 })
      .then(setQrDataUrl)
      .catch((err) => console.error("QR Code Error:", err));
  }, [shareUrl]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      showToast("Link copied to clipboard! Ready to share 🎉");
      trackEvent("event_share_clicked", { event_id: eventId, share_method: "copy_link" });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast("Link copied to clipboard!");
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: eventName,
          text: `Check out ${eventName} on LPU Events!`,
          url: shareUrl,
        });
        trackEvent("event_share_clicked", { event_id: eventId, share_method: "native_share" });
        onClose();
      } catch {
        // User dismissed
      }
    } else {
      handleCopyLink();
    }
  };

  const handleSocialShare = (platform: "whatsapp" | "telegram" | "linkedin" | "twitter" | "email") => {
    let url = "";
    switch (platform) {
      case "whatsapp":
        url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
        break;
      case "telegram":
        url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`Check out ${eventName} at LPU!`)}`;
        break;
      case "linkedin":
        url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
        break;
      case "twitter":
        url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out ${eventName} at LPU!`)}&url=${encodeURIComponent(shareUrl)}&hashtags=LPU,LPUEvents,Campus`;
        break;
      case "email":
        url = `mailto:?subject=${encodeURIComponent(`${eventName} — LPU Events`)}&body=${encodeURIComponent(shareText)}`;
        break;
    }
    trackEvent("event_share_clicked", { event_id: eventId, share_method: platform });
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/65 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          className="relative w-full max-w-lg bg-white/95 dark:bg-[#2c2c2e]/95 backdrop-blur-2xl rounded-[28px] sm:rounded-[32px] border border-white/80 dark:border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.5)] overflow-hidden z-10 flex flex-col my-auto"
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between px-5 sm:px-6 pt-5 sm:pt-6 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-orange-500/10 dark:bg-white/10 text-primary dark:text-white flex items-center justify-center">
                <Share2 className="w-4 h-4" />
              </div>
              <h3 className="font-heading font-black text-lg sm:text-xl text-gray-900 dark:text-white">
                Share Event
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer"
              aria-label="Close share dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab Switcher: Share Links vs QR Code */}
          <div className="flex px-5 sm:px-6 mb-3">
            <div className="grid grid-cols-2 p-1 w-full rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
              <button
                type="button"
                onClick={() => setActiveView("share")}
                className={`py-2 px-3 rounded-xl font-heading font-bold text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  activeView === "share"
                    ? "bg-white dark:bg-white/15 text-primary dark:text-white shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Quick Share</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveView("qr")}
                className={`py-2 px-3 rounded-xl font-heading font-bold text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  activeView === "qr"
                    ? "bg-white dark:bg-white/15 text-primary dark:text-white shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>QR Code</span>
              </button>
            </div>
          </div>

          {/* Event Mini Preview Card */}
          <div className="px-5 sm:px-6 mb-4">
            <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-orange-500/[0.06] dark:bg-white/[0.04] border border-orange-500/20 dark:border-white/10">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-slate-900/40 shrink-0 border border-white/20">
                <ProgressiveImage
                  src={getEventImage(event, "event-card", 400)}
                  alt={eventName}
                  containerClassName="w-full h-full"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[9px] sm:text-[10px] font-black uppercase text-orange-700 dark:text-gray-300 font-heading tracking-wider">
                  {event?.categories?.name || "Campus Event"}
                </span>
                <h4 className="font-heading font-bold text-sm sm:text-base text-gray-900 dark:text-white truncate">
                  {eventName}
                </h4>
                <div className="flex items-center gap-2 text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
                  <span className="truncate">{dateFormatted}</span>
                  <span>•</span>
                  <span className="truncate">{venueFormatted}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Content Body based on Active View */}
          {activeView === "share" ? (
            <div className="px-5 sm:px-6 pb-6 flex flex-col gap-4">
              {/* Direct Channels */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 font-heading">
                  Share Via
                </span>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5">
                  {/* WhatsApp */}
                  <button
                    type="button"
                    onClick={() => handleSocialShare("whatsapp")}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] transition-all cursor-pointer group hover:scale-104 active:scale-95"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-md">
                      <WhatsAppIcon />
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-bold font-heading text-gray-800 dark:text-gray-200">
                      WhatsApp
                    </span>
                  </button>

                  {/* Telegram */}
                  <button
                    type="button"
                    onClick={() => handleSocialShare("telegram")}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-[#229ED9]/10 hover:bg-[#229ED9]/20 border border-[#229ED9]/30 text-[#229ED9] transition-all cursor-pointer group hover:scale-104 active:scale-95"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#229ED9] text-white flex items-center justify-center shadow-md">
                      <TelegramIcon />
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-bold font-heading text-gray-800 dark:text-gray-200">
                      Telegram
                    </span>
                  </button>

                  {/* LinkedIn */}
                  <button
                    type="button"
                    onClick={() => handleSocialShare("linkedin")}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-[#0A66C2]/10 hover:bg-[#0A66C2]/20 border border-[#0A66C2]/30 text-[#0A66C2] transition-all cursor-pointer group hover:scale-104 active:scale-95"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#0A66C2] text-white flex items-center justify-center shadow-md">
                      <LinkedInIcon />
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-bold font-heading text-gray-800 dark:text-gray-200">
                      LinkedIn
                    </span>
                  </button>

                  {/* X / Twitter */}
                  <button
                    type="button"
                    onClick={() => handleSocialShare("twitter")}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-black/10 dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15 border border-black/20 dark:border-white/20 text-gray-900 dark:text-white transition-all cursor-pointer group hover:scale-104 active:scale-95"
                  >
                    <div className="w-8 h-8 rounded-full bg-zinc-900 dark:bg-white/14 text-white dark:text-white dark:border dark:border-white/18 flex items-center justify-center shadow-md font-bold text-xs">
                      𝕏
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-bold font-heading text-gray-800 dark:text-gray-200">
                      Twitter
                    </span>
                  </button>

                  {/* Email */}
                  <button
                    type="button"
                    onClick={() => handleSocialShare("email")}
                    className="hidden sm:flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-orange-500/10 dark:bg-white/10 hover:bg-orange-500/20 dark:hover:bg-white/15 border border-orange-500/30 dark:border-white/15 text-primary dark:text-white transition-all cursor-pointer group hover:scale-104 active:scale-95"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary dark:bg-white/14 text-white dark:text-white dark:border dark:border-white/18 flex items-center justify-center shadow-md">
                      <Mail className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-bold font-heading text-gray-800 dark:text-gray-200">
                      Email
                    </span>
                  </button>
                </div>
              </div>

              {/* Copy URL Box */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 font-heading">
                  Event Link
                </span>
                <div className="flex items-center gap-2 p-2 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
                  <span className="flex-1 px-2.5 text-xs font-mono text-gray-700 dark:text-gray-300 truncate select-all">
                    {shareUrl}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className={`px-4 py-2.5 rounded-xl font-heading font-black text-xs transition-all cursor-pointer flex items-center gap-1.5 shrink-0 shadow-sm ${
                      copied
                        ? "bg-emerald-500 text-white shadow-emerald-500/30"
                        : "bg-primary dark:bg-white/14 dark:hover:bg-white/22 text-white dark:text-white dark:border dark:border-white/18 shadow-orange-500/30 dark:shadow-none active:scale-95"
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Mobile Native Share Button */}
              {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="w-full py-3 rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-800 dark:text-gray-200 font-heading font-bold text-xs sm:text-sm border border-black/10 dark:border-white/10 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Share2 className="w-4 h-4" />
                  <span>More Sharing Options (Device Sheet)</span>
                </button>
              )}
            </div>
          ) : (
            /* QR Code View */
            <div className="px-5 sm:px-6 pb-6 flex flex-col items-center gap-4 text-center">
              <div className="p-4 bg-white rounded-3xl border-2 border-orange-500/30 dark:border-white/20 shadow-xl inline-block">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR code for ${eventName}`}
                    className="w-48 h-48 sm:w-56 sm:h-56 object-contain rounded-xl"
                  />
                ) : (
                  <div className="w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center text-xs text-gray-400 font-medium">
                    Generating QR code...
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1 max-w-sm">
                <p className="font-heading font-bold text-sm text-gray-900 dark:text-white">
                  Scan to View Directly
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Students can scan this code with any mobile camera to open this event with zero login required.
                </p>
              </div>

              {/* Download QR Code Actions */}
              <div className="flex gap-2.5 w-full max-w-xs">
                <button
                  type="button"
                  onClick={() => downloadQrCode(shareUrl, eventName, "png")}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-primary dark:bg-white/14 dark:hover:bg-white/22 text-white dark:text-white dark:border dark:border-white/18 font-heading font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PNG</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadQrCode(shareUrl, eventName, "svg")}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-gray-900 dark:text-white font-heading font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-black/10 dark:border-white/10 active:scale-95"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Vector SVG</span>
                </button>
              </div>
            </div>
          )}

          {/* Toast Notification Banner */}
          <AnimatePresence>
            {toastMessage && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-4 left-4 right-4 bg-zinc-900/95 text-white dark:bg-zinc-800/95 dark:text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-bold font-heading border border-white/20 z-20"
              >
                <Sparkles className="w-4 h-4 text-orange-400 dark:text-white shrink-0 animate-bounce" />
                <span className="flex-1">{toastMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
