import { useState, useEffect } from "react";
import { X, Calendar, Clock, MapPin, Users, ShieldAlert, ExternalLink } from "lucide-react";
import { lpuClient } from "../supabase";
import { Event, formatEventDateRange } from "@lpu-events/shared";
import { getEventImage } from "../utils/images";
import { ProgressiveImage } from "./ProgressiveImage";
import { BookingDisclaimerModal } from "./BookingDisclaimerModal";

export const EventDetailsModal = ({ eventId, onClose }: {
  eventId: string;
  onClose: () => void;
}) => {
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);

  useEffect(() => {
    if (!eventId) return;

    const loadDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchErr } = await lpuClient.fetchEventDetails(eventId);
        if (fetchErr) {
          setError(fetchErr.message || "Failed to load event details");
        } else {
          setEvent(data);
        }
      } catch (err: any) {
        setError(err.message || "An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    };

    loadDetails();
    lpuClient.incrementEventView(eventId).catch(() => {});
  }, [eventId]);

  if (!eventId) return null;

  const handleRegisterRedirect = () => {
    if (event?.external_registration_url) {
      setDisclaimerOpen(true);
    }
  };

  const handleConfirmRedirect = () => {
    if (event?.external_registration_url) {
      window.open(event.external_registration_url, "_blank", "noopener,noreferrer");
      setDisclaimerOpen(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 animate-in fade-in duration-300">
      <div className="relative w-[95vw] sm:w-full max-w-4xl max-h-[88vh] overflow-y-auto rounded-[26px] sm:rounded-[32px] border border-white/95 dark:border-white/10 glass-panel text-gray-900 dark:text-white shadow-[0_25px_70px_rgba(15,23,42,0.2)] flex flex-col hide-scrollbar animate-in zoom-in-95 duration-300">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 sm:right-4 sm:top-4 z-40 flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full glass-pill border border-white/95 dark:border-white/15 bg-white/90 dark:bg-black/70 text-gray-800 dark:text-white transition-all hover:scale-110 active:scale-95 cursor-pointer touch-target shadow-md"
          aria-label="Close details"
        >
          <X className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            <p className="text-gray-600 dark:text-on-surface-muted text-xs sm:text-sm font-bold font-heading">Loading event details...</p>
          </div>
        ) : error || !event ? (
          <div className="flex flex-col items-center justify-center py-16 p-6 text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white font-heading">Failed to Load Event</h3>
            <p className="text-gray-600 dark:text-on-surface-muted text-xs sm:text-sm max-w-md">{error || "Event detail not found."}</p>
          </div>
        ) : (
          <>
            {/* Banner Image Stage (Full Cover Stretched to fill the space like Paper Mâché) */}
            <div className="w-full h-[260px] xs:h-[290px] sm:h-[340px] md:h-[380px] relative overflow-hidden border-b border-white/80 dark:border-white/10 shrink-0 bg-slate-950">
              <ProgressiveImage
                src={getEventImage(event, 'event-banner', 1440)}
                alt={event.name}
                containerClassName="absolute inset-0 w-full h-full"
                className="w-full h-full object-fill object-center relative z-10"
                style={{ objectFit: "fill" }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none z-20" />
              <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 pr-4 sm:pr-6 z-20">
                <span className="px-3 py-1 glass-badge text-orange-400 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-wider border border-orange-400/40 font-heading shadow-md">
                  {event.pricing_type}
                </span>
                <h2 className="text-xl sm:text-2xl md:text-4xl font-black font-heading text-white mt-2 sm:mt-3 drop-shadow-md leading-tight break-safe">
                  {event.name}
                </h2>
              </div>
            </div>

            {/* Content area */}
            <div className="p-4 sm:p-6 md:p-10 grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
              
              {/* Left Column */}
              <div className="lg:col-span-2 flex flex-col gap-4 sm:gap-6">
                <div className="flex flex-col gap-2 sm:gap-3">
                  <h3 className="font-heading text-sm sm:text-base font-black text-primary uppercase tracking-wider">About the Event</h3>
                  <p className="text-gray-700 dark:text-zinc-200 text-sm sm:text-[15px] md:text-base leading-[1.8] tracking-[-0.011em] font-sans antialiased break-safe">
                    {event.description}
                  </p>
                </div>

                {/* Dynamic Content Sections */}
                {((event as any).event_content_sections || []).length > 0 && (
                  <div className="flex flex-col gap-4 sm:gap-6 border-t border-gray-200/80 dark:border-white/10 pt-4 sm:pt-6">
                    {((event as any).event_content_sections)
                      .sort((a: any, b: any) => a.sort_order - b.sort_order)
                      .map((sec: any) => (
                        <div key={sec.id} className="flex flex-col gap-2 sm:gap-3">
                          <h4 className="font-heading text-sm sm:text-base font-bold text-gray-900 dark:text-white tracking-tight break-safe">{sec.title}</h4>
                          {sec.section_type === "rules" && sec.content?.rules_list ? (
                            <ul className="space-y-2 text-gray-700 dark:text-zinc-200 text-sm sm:text-[15px] leading-relaxed font-sans">
                              {sec.content.rules_list.map((rule: string, i: number) => (
                                <li key={i} className="flex items-start gap-2.5 break-safe">
                                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-2 shrink-0" />
                                  <span>{rule}</span>
                                </li>
                              ))}
                            </ul>
                          ) : sec.section_type === "timeline" && sec.content?.schedule ? (
                            <div className="flex flex-col gap-2 border border-white/90 dark:border-white/10 glass-card rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-sm font-sans">
                              {sec.content.schedule.map((item: any, i: number) => (
                                <div key={i} className="flex flex-col xs:flex-row gap-1 xs:gap-4 border-b border-gray-200/60 dark:border-white/10 last:border-0 pb-2 last:pb-0">
                                  <span className="font-heading font-bold text-primary text-xs sm:text-sm shrink-0">{item.time}</span>
                                  <span className="text-gray-800 dark:text-zinc-200 text-xs sm:text-sm break-safe">{item.details}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-700 dark:text-zinc-200 text-sm sm:text-[15px] md:text-base leading-[1.8] tracking-[-0.011em] font-sans antialiased break-safe">
                              {typeof sec.content === "string" ? sec.content : JSON.stringify(sec.content)}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Right Column */}
              <div className="flex flex-col gap-4 sm:gap-6 lg:border-l lg:border-gray-200/80 dark:lg:border-white/10 lg:pl-8">
                <div className="flex flex-col gap-3 sm:gap-4 glass-card border border-white/95 dark:border-white/10 rounded-[22px] sm:rounded-[26px] p-4 sm:p-5 shadow-sm">
                  <h4 className="font-heading text-xs sm:text-sm font-black uppercase text-gray-500 dark:text-gray-400 tracking-wider">Event Schedule</h4>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/15 border border-orange-300/60 flex items-center justify-center shrink-0">
                      <Calendar className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider font-heading">Date</span>
                      <span className="text-xs sm:text-sm font-bold truncate text-gray-900 dark:text-white">{formatEventDateRange(event.start_at, event.end_at)}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-300/60 flex items-center justify-center shrink-0">
                      <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider font-heading">Time</span>
                      <span className="text-xs sm:text-sm font-bold truncate text-gray-900 dark:text-white">
                        {new Date(event.start_at).toLocaleTimeString("en-US", { hour: 'numeric', minute: '2-digit', hour12: true })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-300/60 flex items-center justify-center shrink-0">
                      <MapPin className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider font-heading">Venue</span>
                      <span className="text-xs sm:text-sm font-bold truncate text-gray-900 dark:text-white">{event.venue_name}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/15 border border-orange-300/60 flex items-center justify-center shrink-0">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider font-heading">Organizer</span>
                      <span className="text-xs sm:text-sm font-bold text-primary truncate">{(event as any).organizations?.name || "LPU Club"}</span>
                    </div>
                  </div>
                </div>

                {event.registration_mode === "EXTERNAL" && event.external_registration_url ? (
                  <button
                    onClick={handleRegisterRedirect}
                    className="w-full flex items-center justify-center gap-2 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl glass-btn-primary font-black text-xs sm:text-sm cursor-pointer touch-target font-heading shadow-md"
                  >
                    <span>Book Ticket</span>
                    <ExternalLink className="h-4 w-4" />
                  </button>
                ) : (
                  <div className="p-3.5 sm:p-4 glass-panel text-gray-600 dark:text-gray-400 text-xs font-semibold text-center rounded-xl sm:rounded-2xl border border-white/90 dark:border-white/10 shadow-xs">
                    No external registration link provided. Attendee check-in is handled at the venue.
                  </div>
                )}
              </div>

            </div>
          </>
        )}
      </div>

      {/* External Booking Disclaimer Modal */}
      <BookingDisclaimerModal
        isOpen={disclaimerOpen}
        onClose={() => setDisclaimerOpen(false)}
        onConfirm={handleConfirmRedirect}
        event={event}
      />
    </div>
  );
};
