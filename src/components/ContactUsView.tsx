import React, { useState } from "react";
import { ArrowLeft, Mail, MapPin, Send, CheckCircle2, Clock, Globe, HelpCircle } from "lucide-react";
import { LpuLogo } from "./LpuLogo";

interface ContactUsViewProps {
  onBack: () => void;
}

export const ContactUsView: React.FC<ContactUsViewProps> = ({ onBack }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("General Inquiry");
  const [message, setMessage] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !message) return;
    
    // Construct mailto link fallback for instant student communication
    const mailtoUri = `mailto:contact@lpuevents.live?subject=${encodeURIComponent(`[LPU Events Inquiry] ${subject} - from ${name}`)}&body=${encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`)}`;
    window.open(mailtoUri, "_blank");
    setIsSubmitted(true);
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
            Have questions about an upcoming event, need technical support, want to report an inaccurate listing, or inquire about platform partnerships? Reach out to us directly through any of our official channels below.
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

            <div className="space-y-3 text-xs sm:text-sm">
              <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-gray-200/60 dark:border-white/5">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block mb-1">
                  General & Student Inquiries
                </span>
                <a href="mailto:contact@lpuevents.live" className="text-primary font-bold hover:underline break-all">
                  contact@lpuevents.live
                </a>
              </div>

              <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-gray-200/60 dark:border-white/5">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block mb-1">
                  Privacy & Data Inquiries
                </span>
                <a href="mailto:privacy@lpuevents.live" className="text-primary font-bold hover:underline break-all">
                  privacy@lpuevents.live
                </a>
              </div>

              <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-gray-200/60 dark:border-white/5">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block mb-1">
                  Organizer Access & Partnerships
                </span>
                <a href="mailto:admin@lpuevents.live" className="text-primary font-bold hover:underline break-all">
                  admin@lpuevents.live
                </a>
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
              <Clock className="h-3.5 w-3.5" />
              <span>Response time: Typically within 24–48 hours</span>
            </div>
          </div>
        </div>

        {/* Right: Message Form (7 cols) */}
        <div className="md:col-span-7">
          <div className="glass-panel rounded-[20px] sm:rounded-[32px] p-6 sm:p-8 border border-white/95 dark:border-white/10 shadow-xl h-full flex flex-col justify-between">
            {isSubmitted ? (
              <div className="flex flex-col items-center justify-center text-center p-8 space-y-4 my-auto">
                <div className="w-14 h-14 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-lg border border-emerald-500/30">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <h3 className="font-heading font-black text-xl text-gray-900 dark:text-white">
                  Message Prepared!
                </h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-zinc-300 max-w-sm leading-relaxed">
                  Your message has been initiated via your mail client. Our student support team will follow up at <strong className="text-primary">{email}</strong> shortly.
                </p>
                <button
                  type="button"
                  onClick={() => setIsSubmitted(false)}
                  className="px-6 py-2.5 rounded-full glass-pill text-xs font-heading font-black text-primary hover:scale-103 active:scale-97 transition-all cursor-pointer"
                >
                  Send Another Message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <h3 className="font-heading font-black text-lg sm:text-xl text-gray-900 dark:text-white mb-1">
                    Send Us a Message
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                    Fill out the form below and we will get back to you promptly.
                  </p>
                </div>

                <div>
                  <label htmlFor="contact-name" className="block text-xs font-heading font-bold text-gray-700 dark:text-zinc-300 mb-1">
                    Your Full Name *
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full px-4 py-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-gray-200/80 dark:border-white/10 text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label htmlFor="contact-email" className="block text-xs font-heading font-bold text-gray-700 dark:text-zinc-300 mb-1">
                    Email Address *
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. yourname@lpu.in"
                    className="w-full px-4 py-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-gray-200/80 dark:border-white/10 text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label htmlFor="contact-subject" className="block text-xs font-heading font-bold text-gray-700 dark:text-zinc-300 mb-1">
                    Topic / Category
                  </label>
                  <select
                    id="contact-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-gray-200/80 dark:border-white/10 text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="General Inquiry" className="dark:bg-slate-900">General Inquiry</option>
                    <option value="Event Listing Correction" className="dark:bg-slate-900">Event Listing Correction / Feedback</option>
                    <option value="Organizer Portal Access" className="dark:bg-slate-900">Organizer Portal Access</option>
                    <option value="Technical Issue" className="dark:bg-slate-900">Technical / Website Issue</option>
                    <option value="AdSense & Partnership Inquiry" className="dark:bg-slate-900">AdSense & Partnership Inquiry</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="contact-message" className="block text-xs font-heading font-bold text-gray-700 dark:text-zinc-300 mb-1">
                    Message Details *
                  </label>
                  <textarea
                    id="contact-message"
                    required
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe your inquiry, event feedback, or questions..."
                    className="w-full px-4 py-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-gray-200/80 dark:border-white/10 text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl glass-btn-primary font-heading font-black text-xs sm:text-sm shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
                >
                  <Send className="h-4 w-4" />
                  <span>Send Inquiry</span>
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
