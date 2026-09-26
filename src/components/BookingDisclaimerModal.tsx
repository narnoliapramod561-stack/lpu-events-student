import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Ticket, ArrowUpRight, ShieldAlert, Sparkles } from "lucide-react";

interface BookingDisclaimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  event: any;
}

export const BookingDisclaimerModal: React.FC<BookingDisclaimerModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  event
}) => {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !event) return null;

  const eventName = event.name || "this event";
  const organizerName = event.organizations?.name || "the event organizer";
  const targetUrl = event.external_registration_url || "";
  
  let targetHost = "External Partner";
  try {
    if (targetUrl) {
      const parsed = new URL(targetUrl);
      targetHost = parsed.hostname.replace(/^www\./, '');
    }
  } catch {
    targetHost = "External Partner";
  }

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/65 backdrop-blur-md overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
      >
        {/* Backdrop click */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 cursor-pointer"
        />

        {/* Premium Rounded Dialog Box */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-[490px] rounded-[32px] sm:rounded-[36px] bg-white/95 dark:bg-[#2c2c2e]/95 border border-black/[0.08] dark:border-white/[0.12] p-6 sm:p-8 text-gray-900 dark:text-white shadow-[0_30px_90px_rgba(0,0,0,0.50)] backdrop-blur-2xl z-10 font-sans overflow-hidden"
        >
          {/* Subtle Ambient Glow in background */}
          <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-orange-500/15 blur-3xl pointer-events-none dark:hidden" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 rounded-full bg-amber-500/10 blur-3xl pointer-events-none dark:hidden" />

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 sm:right-5 sm:top-5 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/[0.04] dark:bg-white/[0.08] hover:bg-black/[0.08] dark:hover:bg-white/[0.14] text-gray-500 dark:text-gray-300 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Header Badge */}
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-heading tracking-wide uppercase bg-orange-500/10 dark:bg-white/10 text-primary dark:text-white border border-orange-500/20 dark:border-white/15">
              <Sparkles className="h-3 w-3" />
              <span>External Ticketing</span>
            </span>
          </div>

          {/* Title & Introduction */}
          <div className="space-y-2 mb-6">
            <h3 id="booking-modal-title" className="text-xl sm:text-2xl font-black font-heading tracking-tight text-gray-950 dark:text-white">
              You are leaving LPU Events
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              You are being redirected to <span className="font-bold text-gray-900 dark:text-white">{targetHost}</span> to book tickets for <strong className="text-primary dark:text-white font-bold">{eventName}</strong>.
            </p>
          </div>

          {/* Two Clean Highlight Cards */}
          <div className="space-y-3 mb-7">
            {/* Card 1: Organizer Info */}
            <div className="flex items-start gap-3.5 p-4 rounded-[22px] bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.08] transition-colors">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 dark:bg-white/10 text-primary dark:text-white mt-0.5">
                <Ticket className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs sm:text-sm font-bold font-heading text-gray-900 dark:text-white mb-0.5">
                  Managed by {organizerName}
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  Ticket pricing, seat allocation, and booking confirmations are handled directly by the organizer on {targetHost}.
                </p>
              </div>
            </div>

            {/* Card 2: Simple Plain English Disclaimer */}
            <div className="flex items-start gap-3.5 p-4 rounded-[22px] bg-amber-50/50 dark:bg-white/[0.04] border border-amber-200/60 dark:border-white/10 transition-colors">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 dark:bg-white/10 text-amber-700 dark:text-white mt-0.5">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs sm:text-sm font-bold font-heading text-gray-900 dark:text-white mb-0.5">
                  Important Notice
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                  LPU Events is a campus discovery directory only. <strong>This site is not responsible for ticket bookings, cancellations, payments, or refunds.</strong> Please contact the organizer for any booking assistance.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-1/3 h-12 rounded-2xl bg-black/[0.04] hover:bg-black/[0.07] dark:bg-white/[0.08] dark:hover:bg-white/[0.12] text-gray-700 dark:text-gray-200 font-bold text-sm font-heading transition-all cursor-pointer flex items-center justify-center active:scale-[0.98]"
            >
              Go Back
            </button>

            <button
              type="button"
              onClick={onConfirm}
              className="w-full sm:w-2/3 h-12 rounded-2xl bg-gradient-to-r from-[#FF5E00] via-[#FF6A00] to-[#FF7A00] dark:from-white/16 dark:to-white/20 dark:hover:from-white/25 dark:hover:to-white/30 text-white dark:text-white dark:border dark:border-white/20 dark:shadow-none hover:brightness-105 active:scale-[0.98] font-bold text-sm font-heading transition-all shadow-[0_6px_22px_rgba(255,94,0,0.35)] flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Continue to Book Ticket</span>
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
