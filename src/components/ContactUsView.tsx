import React, { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Mail, MapPin, Send, CheckCircle2, Clock, Globe, HelpCircle, ShieldAlert, Loader2, AlertCircle, PauseCircle } from "lucide-react";
import { LpuLogo } from "./LpuLogo";
import { supabase } from "../supabase";

interface ContactUsViewProps {
  onBack: () => void;
}

const MAX_WORDS = 200;
const MAX_CHARS = 1200;
const COOLDOWN_SECONDS = 300; // 5-minute anti-spam client cooldown

function formatCooldown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s > 0 ? `${s}s` : ''}`.trim();
}

// Persistent anonymous device fingerprint to minimize database hits
function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "anon_server_render";
  const KEY = "lpu_student_device_id";
  try {
    let id = localStorage.getItem(KEY);
    if (!id || id.length < 16) {
      id = "dev_" + Math.random().toString(36).substring(2, 12) + "_" + Date.now().toString(36);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "dev_ephemeral_" + Math.random().toString(36).substring(2, 10);
  }
}

export const ContactUsView: React.FC<ContactUsViewProps> = ({ onBack }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("General Inquiry");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState(""); // Anti-bot honeypot

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submissionId, setSubmissionId] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Platform admin kill-switch state
  const [isReceptionActive, setIsReceptionActive] = useState<boolean>(true);
  const [pausedNotice, setPausedNotice] = useState<string | null>(null);

  // Cooldown countdown state
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);

  // Check reception status from platform config on mount
  useEffect(() => {
    const checkReceptionStatus = async () => {
      try {
        const { data } = await supabase
          .from("global_settings")
          .select("value")
          .eq("key", "contact_messages_config")
          .maybeSingle();

        if (data?.value && typeof data.value === "object") {
          const cfg = data.value as any;
          if (cfg.is_enabled === false) {
            setIsReceptionActive(false);
            setPausedNotice(
              cfg.paused_notice ||
                "The message desk is currently paused by platform administrators. For urgent matters, please email contact@lpuevents.live directly."
            );
          } else {
            setIsReceptionActive(true);
            setPausedNotice(null);
          }
        }
      } catch {}
    };

    checkReceptionStatus();
  }, []);

  // Check cooldown on mount and tick
  useEffect(() => {
    const checkCooldown = () => {
      try {
        const lastSentStr = localStorage.getItem("lpu_last_inquiry_ts");
        if (lastSentStr) {
          const lastSent = parseInt(lastSentStr, 10);
          const elapsedSec = Math.floor((Date.now() - lastSent) / 1000);
          const remaining = Math.max(0, COOLDOWN_SECONDS - elapsedSec);
          setCooldownRemaining(remaining);
        }
      } catch {}
    };

    checkCooldown();
    const timer = setInterval(checkCooldown, 1000);
    return () => clearInterval(timer);
  }, []);

  // Real-time word calculation
  const wordsCount = useMemo(() => {
    const trimmed = message.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
  }, [message]);

  const isOverWordLimit = wordsCount > MAX_WORDS;
  const isOverCharLimit = message.length > MAX_CHARS;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // 0. Kill-switch check
    if (!isReceptionActive) {
      setErrorMessage(pausedNotice || "Message reception is currently paused by platform administrators.");
      return;
    }

    // 1. Cyber Specialist Defense: Honeypot trap check
    // If a hidden bot field is filled, silently discard without touching database
    if (honeypot.trim().length > 0) {
      setIsSubmitted(true);
      setSubmissionId("BOT-" + Math.random().toString(36).substring(2, 8).toUpperCase());
      return;
    }

    // 2. Client-side validation
    const trimmedName = name.trim();
    const trimmedMessage = message.trim();
    const trimmedEmail = email.trim();

    if (trimmedName.length < 2) {
      setErrorMessage("Please enter a valid full name (at least 2 characters).");
      return;
    }

    if (wordsCount < 3) {
      setErrorMessage("Please provide a slightly more descriptive message (at least 3 words).");
      return;
    }

    if (isOverWordLimit) {
      setErrorMessage(`Your message exceeds the ${MAX_WORDS}-word limit (${wordsCount} words). Please condense your message.`);
      return;
    }

    if (isOverCharLimit) {
      setErrorMessage(`Your message exceeds the ${MAX_CHARS}-character limit. Please shorten your message.`);
      return;
    }

    // 3. Client-side Anti-Spam Cooldown check (Zero database hit)
    if (cooldownRemaining > 0) {
      setErrorMessage(`Anti-spam cooldown active. Please wait ${formatCooldown(cooldownRemaining)} before sending another inquiry.`);
      return;
    }

    setIsSubmitting(true);
    const deviceId = getOrCreateDeviceId();

    try {
      // 4. Try submitting through Cloudflare Edge Gateway first (Cloudflare D1 / Worker rate limiting)
      let submittedSuccessfully = false;
      let returnedId = "";

      try {
        const edgeRes = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            email: trimmedEmail || null,
            subject,
            message: trimmedMessage,
            device_id: deviceId,
            honeypot: honeypot || undefined
          })
        });

        if (edgeRes.ok) {
          const json = await edgeRes.json().catch(() => ({}));
          if (json.ok) {
            submittedSuccessfully = true;
            returnedId = json.id || "";
          }
        }
      } catch {
        // Fallback to Supabase direct RPC if edge API is not routed locally
      }

      // 5. Fallback: Call Supabase rate-limited RPC
      if (!submittedSuccessfully) {
        const { data, error } = await supabase.rpc("submit_student_inquiry", {
          p_name: trimmedName,
          p_email: trimmedEmail || null,
          p_subject: subject,
          p_message: trimmedMessage,
          p_device_id: deviceId
        });

        if (error) throw error;

        if (data && typeof data === "object") {
          const resp = data as any;
          if (resp.ok === false) {
            if (resp.code === "DAILY_LIMIT") {
              throw new Error("You have already submitted an inquiry today from this device. Please check back tomorrow.");
            }
            throw new Error(resp.error || "Inquiry could not be recorded. Please try again.");
          }
        }
      }

      // Record successful cooldown timestamp
      try {
        localStorage.setItem("lpu_last_inquiry_ts", Date.now().toString());
        setCooldownRemaining(COOLDOWN_SECONDS);
      } catch {}

      setSubmissionId(returnedId || ("INQ-" + Math.random().toString(36).substring(2, 8).toUpperCase()));
      setIsSubmitted(true);
    } catch (err: any) {
      console.error("Inquiry submission error:", err);
      setErrorMessage(err.message || "Failed to submit inquiry. Please try again or email contact@lpuevents.live directly.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-4 sm:py-8 animate-fade-in text-gray-900 dark:text-white">
      {/* Top Navigation & Back Button */}
      <div className="mb-6 sm:mb-8 flex items-center justify-between">
        <button
          onClick={onBack}
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-full glass-pill hover:text-primary transition-all text-xs sm:text-sm font-heading font-black cursor-pointer shadow-sm hover:scale-103 active:scale-97 border border-white/95 dark:border-white/10 touch-target"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Events</span>
        </button>

        <span className="text-[11px] sm:text-xs font-heading font-black text-gray-500 dark:text-gray-400 tracking-wider uppercase">
          Support & Inquiries
        </span>
      </div>

      {/* Header Banner */}
      <div className="relative glass-panel rounded-[20px] sm:rounded-[36px] p-6 sm:p-10 mb-8 border border-white/95 dark:border-white/10 shadow-xl overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none dark:hidden" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none dark:hidden" />

        <div className="relative z-10 flex flex-col items-start gap-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-badge text-primary dark:text-white font-heading text-xs font-black tracking-wider uppercase border border-primary/30 dark:border-white/20 shadow-xs">
            <Mail className="h-3.5 w-3.5" />
            Official Contact Channel
          </div>

          <div className="flex items-center gap-3.5 sm:gap-5 mt-2">
            <LpuLogo className="h-16 w-16 sm:h-20 sm:w-20 shrink-0 drop-shadow-md" />
            <div>
              <h1 className="font-heading text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-gray-900 dark:text-white leading-tight">
                Contact LPU Events Team
              </h1>
              <p className="text-xs sm:text-sm font-heading font-semibold text-primary dark:text-gray-300 mt-0.5">
                We're here to assist students, organizers, and campus visitors
              </p>
            </div>
          </div>

          <p className="text-sm sm:text-base text-gray-700 dark:text-zinc-200 leading-relaxed mt-2 break-safe">
            Have questions about an upcoming event, need technical support, want to report an inaccurate listing, or inquire about platform partnerships? Reach out to us directly through our official channel below.
          </p>
        </div>
      </div>

      {/* Grid: Contact Info Cards + Form */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-8 mb-8 sm:mb-12">
        {/* Left: Contact Info Column (5 cols) */}
        <div className="md:col-span-5 space-y-4 sm:space-y-6">
          <div className="glass-panel rounded-[20px] sm:rounded-[28px] p-5 sm:p-6 border border-white/95 dark:border-white/10 shadow-md space-y-4">
            <h3 className="font-heading font-black text-sm sm:text-base text-gray-900 dark:text-white flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Direct Communication
            </h3>

            {/* Only contact@lpuevents.live is listed */}
            <div className="space-y-3 text-xs sm:text-sm">
              <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-gray-200/60 dark:border-white/5 space-y-1.5">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block">
                  Official Inquiries & Support
                </span>
                <a 
                  href="mailto:contact@lpuevents.live" 
                  className="text-primary font-bold hover:underline break-all text-sm sm:text-base flex items-center gap-1.5"
                >
                  <Mail className="h-4 w-4 shrink-0" />
                  <span>contact@lpuevents.live</span>
                </a>
                <p className="text-[11px] text-gray-500 dark:text-zinc-400 pt-1">
                  Central official inbox for student queries, organizer support, and university feedback.
                </p>
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-[20px] sm:rounded-[28px] p-5 sm:p-6 border border-white/95 dark:border-white/10 shadow-md space-y-3">
            <h3 className="font-heading font-black text-sm sm:text-base text-gray-900 dark:text-white flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Campus Location
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-zinc-300 leading-relaxed break-safe">
              Lovely Professional University,<br />
              Jalandhar - Delhi G.T. Road, Phagwara,<br />
              Punjab 144411, India
            </p>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 pt-1">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>Response time: Typically within 24–48 hours</span>
            </div>
          </div>

          {/* Cyber Security Assurance Badge */}
          <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 text-xs text-gray-600 dark:text-zinc-300 space-y-1">
            <div className="flex items-center gap-2 font-bold text-gray-900 dark:text-white">
              <ShieldAlert className="h-4 w-4 text-primary" />
              <span>Spam-Protected Message Dispatch</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Messages are routed through Cloudflare edge protection with rate-limiting to protect platform infrastructure from automated abuse.
            </p>
          </div>
        </div>

        {/* Right: Message Form (7 cols) */}
        <div className="md:col-span-7">
          <div className="glass-panel rounded-[20px] sm:rounded-[32px] p-6 sm:p-8 border border-white/95 dark:border-white/10 shadow-xl h-full flex flex-col justify-between">
            {isSubmitted ? (
              <div className="flex flex-col items-center justify-center text-center p-8 space-y-4 my-auto animate-fade-in">
                <div className="w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-lg border border-emerald-500/30">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="font-heading font-black text-xl text-gray-900 dark:text-white">
                  Message Dispatched!
                </h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-zinc-300 max-w-sm leading-relaxed">
                  Your message has been delivered directly to the <strong className="text-primary font-bold">LPU Events SuperAdmin Message Center</strong>. Our moderation team reviews incoming messages daily.
                </p>

                {submissionId && (
                  <div className="px-3.5 py-1.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] border border-gray-200/80 dark:border-white/10 text-xs font-mono font-bold text-gray-600 dark:text-zinc-300">
                    Ref ID: #{submissionId.slice(-8).toUpperCase()}
                  </div>
                )}

                <div className="pt-4">
                  <button
                    type="button"
                    disabled={cooldownRemaining > 0}
                    onClick={() => {
                      setIsSubmitted(false);
                      setMessage("");
                    }}
                    className={`px-6 py-2.5 rounded-full text-xs font-heading font-black transition-all cursor-pointer ${
                      cooldownRemaining > 0
                        ? "bg-gray-200 dark:bg-white/10 text-gray-400 cursor-not-allowed"
                        : "glass-pill text-primary hover:scale-103 active:scale-97 shadow-sm"
                    }`}
                  >
                    {cooldownRemaining > 0 ? `Wait ${formatCooldown(cooldownRemaining)} to send another` : "Send Another Message"}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <h3 className="font-heading font-black text-lg sm:text-xl text-gray-900 dark:text-white mb-1">
                    Send Us a Message
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                    Submit your question or feedback directly to the administration message desk.
                  </p>
                </div>

                {!isReceptionActive && (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs sm:text-sm space-y-2 animate-fade-in">
                    <div className="flex items-center gap-2 font-bold font-heading text-amber-900 dark:text-amber-200">
                      <PauseCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>Message Requests Temporarily Paused</span>
                    </div>
                    <p className="leading-relaxed text-[11px] sm:text-xs">
                      {pausedNotice || "The message desk is currently paused by platform administrators. For urgent matters, please email contact@lpuevents.live directly."}
                    </p>
                    <div className="pt-0.5">
                      <a href="mailto:contact@lpuevents.live" className="inline-flex items-center gap-1.5 font-bold text-primary dark:text-orange-400 hover:underline text-xs">
                        <Mail className="h-3.5 w-3.5" />
                        <span>contact@lpuevents.live</span>
                      </a>
                    </div>
                  </div>
                )}

                {errorMessage && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Honeypot field (invisible to real users, catches bots) */}
                <div className="hidden" aria-hidden="true" style={{ display: "none" }}>
                  <input
                    type="text"
                    name="_hp_company_url"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>

                {/* 1. Full Name */}
                <div>
                  <label htmlFor="contact-name" className="block text-xs font-heading font-bold text-gray-700 dark:text-zinc-300 mb-1">
                    Your Full Name *
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    required
                    disabled={!isReceptionActive || isSubmitting}
                    maxLength={60}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full px-4 py-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-gray-200/80 dark:border-white/10 text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  />
                </div>

                {/* 2. Topic / Category */}
                <div>
                  <label htmlFor="contact-subject" className="block text-xs font-heading font-bold text-gray-700 dark:text-zinc-300 mb-1">
                    Topic / Category *
                  </label>
                  <select
                    id="contact-subject"
                    required
                    disabled={!isReceptionActive || isSubmitting}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-gray-200/80 dark:border-white/10 text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <option value="General Inquiry" className="dark:bg-slate-900">General Inquiry</option>
                    <option value="Event Listing Feedback / Correction" className="dark:bg-slate-900">Event Listing Feedback / Correction</option>
                    <option value="Organizer Portal Access" className="dark:bg-slate-900">Organizer Portal Access</option>
                    <option value="Technical / Website Issue" className="dark:bg-slate-900">Technical / Website Issue</option>
                    <option value="Campus Collaboration & Partnership" className="dark:bg-slate-900">Campus Collaboration & Partnership</option>
                    <option value="Other" className="dark:bg-slate-900">Other</option>
                  </select>
                </div>

                {/* 3. Message with Word Counter & Limits */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="contact-message" className="block text-xs font-heading font-bold text-gray-700 dark:text-zinc-300">
                      Message Details *
                    </label>
                    <div className="flex items-center gap-1.5 text-[11px] font-mono">
                      <span className={isOverWordLimit ? "text-red-500 font-bold" : "text-gray-500 dark:text-gray-400"}>
                        {wordsCount} / {MAX_WORDS} words
                      </span>
                      <span className="text-gray-400">({message.length}/{MAX_CHARS})</span>
                    </div>
                  </div>
                  <textarea
                    id="contact-message"
                    required
                    disabled={!isReceptionActive || isSubmitting}
                    rows={4}
                    maxLength={MAX_CHARS}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={!isReceptionActive ? "Message desk is currently paused." : "Briefly describe your question, issue, or feedback (max 200 words)..."}
                    className={`w-full px-4 py-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border ${
                      isOverWordLimit ? "border-red-500 ring-1 ring-red-500" : "border-gray-200/80 dark:border-white/10"
                    } text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed resize-none transition-all`}
                  />
                  {isOverWordLimit && (
                    <p className="text-[11px] text-red-500 font-bold mt-1">
                      ⚠️ Word limit exceeded! Please shorten your message to under {MAX_WORDS} words before sending.
                    </p>
                  )}
                </div>

                {/* 4. Optional Contact Email for direct response */}
                <div>
                  <label htmlFor="contact-email" className="block text-xs font-heading font-bold text-gray-700 dark:text-zinc-300 mb-0.5">
                    Your Email <span className="text-[11px] text-gray-500 dark:text-gray-400 font-normal">(Optional — only needed if you want an email reply)</span>
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    disabled={!isReceptionActive || isSubmitting}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. rahul@lpu.in (optional)"
                    className="w-full px-4 py-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-gray-200/80 dark:border-white/10 text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  />
                </div>

                {/* Submit button with cyber security safeguards */}
                <button
                  type="submit"
                  disabled={!isReceptionActive || isSubmitting || isOverWordLimit || cooldownRemaining > 0}
                  className={`w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-heading font-black text-xs sm:text-sm shadow-md transition-all cursor-pointer ${
                    !isReceptionActive || isSubmitting || isOverWordLimit || cooldownRemaining > 0
                      ? "bg-gray-300 dark:bg-white/10 text-gray-500 cursor-not-allowed"
                      : "glass-btn-primary hover:scale-[1.01] active:scale-[0.99]"
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Transmitting Message...</span>
                    </>
                  ) : !isReceptionActive ? (
                    <>
                      <PauseCircle className="h-4 w-4 text-amber-500" />
                      <span>Message Requests Paused</span>
                    </>
                  ) : cooldownRemaining > 0 ? (
                    <>
                      <Clock className="h-4 w-4" />
                      <span>Cooldown active ({formatCooldown(cooldownRemaining)})</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span>Send Message to Message Center</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Frequently Asked Questions */}
      <div className="glass-panel rounded-[20px] sm:rounded-[32px] p-6 sm:p-8 md:p-10 mb-8 border border-white/95 dark:border-white/10 shadow-lg">
        <h2 className="font-heading text-xl sm:text-2xl font-black text-gray-900 dark:text-white mb-6 flex items-center gap-2.5">
          <HelpCircle className="h-5 w-5 text-primary" />
          Frequently Asked Questions
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
          <div className="p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-gray-200/60 dark:border-white/5 space-y-1.5">
            <h4 className="font-heading font-black text-gray-900 dark:text-white">
              How do student clubs list their events?
            </h4>
            <p className="text-gray-600 dark:text-zinc-300 leading-relaxed break-safe">
              Registered university student organizations, clubs, and departments can request organizer access to create, manage, and feature verified events.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-gray-200/60 dark:border-white/5 space-y-1.5">
            <h4 className="font-heading font-black text-gray-900 dark:text-white">
              Is registration done on LPU Events?
            </h4>
            <p className="text-gray-600 dark:text-zinc-300 leading-relaxed break-safe">
              LPU Events acts as the central discovery index. When you click "Register Now", you are connected directly to the organizer's official external registration form or university portal.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Back Button */}
      <div className="text-center pt-2 pb-6">
        <button
          onClick={onBack}
          type="button"
          className="inline-flex items-center gap-2 px-8 py-3 rounded-full glass-pill hover:text-primary font-heading font-black text-sm cursor-pointer shadow-md hover:scale-103 active:scale-95 transition-all touch-target border border-white/95 dark:border-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Return to Homepage</span>
        </button>
      </div>
    </div>
  );
};
