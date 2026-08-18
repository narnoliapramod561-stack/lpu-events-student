import { useState, useEffect } from "react";
import { X, Calendar, Clock, MapPin, Users, ShieldAlert, ExternalLink } from "lucide-react";
import { lpuClient } from "../supabase";
import { Event } from "@lpu-events/shared";
import { getEventImage } from "../utils/images";

export const EventDetailsModal = ({ eventId, onClose }: {
  eventId: string;
  onClose: () => void;
}) => {
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, [eventId]);

  if (!eventId) return null;

  const handleRegisterRedirect = () => {
    if (event?.external_registration_url) {
      window.open(event.external_registration_url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-[95vw] sm:w-full max-w-4xl max-h-[88vh] overflow-y-auto rounded-[22px] sm:rounded-[28px] border border-outline bg-surface text-on-surface shadow-2xl flex flex-col hide-scrollbar animate-in zoom-in-95 duration-300">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 sm:right-4 sm:top-4 z-40 flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors border border-white/10 cursor-pointer touch-target"
          aria-label="Close details"
        >
          <X className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            <p className="text-on-surface-muted text-xs sm:text-sm">Loading event details...</p>
          </div>
        ) : error || !event ? (
          <div className="flex flex-col items-center justify-center py-16 p-6 text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-on-surface">Failed to Load Event</h3>
            <p className="text-on-surface-muted text-xs sm:text-sm max-w-md">{error || "Event detail not found."}</p>
          </div>
        ) : (
          <>
            {/* Banner Image */}
            <div className="h-[200px] xs:h-[240px] sm:h-[300px] md:h-[340px] w-full relative overflow-hidden bg-surface-2 border-b border-outline shrink-0">
              <img
                src={getEventImage(event, 'event-banner')}
                alt={event.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    "https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=1200&auto=format&fit=crop";
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 pr-4 sm:pr-6">
                <span className="px-2.5 sm:px-3 py-0.5 sm:py-1 bg-primary/20 backdrop-blur-md text-primary rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider border border-primary/30 font-heading">
                  {event.pricing_type}
                </span>
                <h2 className="text-xl sm:text-2xl md:text-4xl font-black font-heading text-white mt-1.5 sm:mt-3 drop-shadow-md leading-tight break-safe">
                  {event.name}
                </h2>
              </div>
            </div>

            {/* Content area */}
            <div className="p-4 sm:p-6 md:p-10 grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
              
              {/* Left Column */}
              <div className="lg:col-span-2 flex flex-col gap-4 sm:gap-6">
                <div className="flex flex-col gap-2 sm:gap-3">
                  <h3 className="font-heading text-base sm:text-lg font-bold text-primary uppercase tracking-wider">About the Event</h3>
                  <p className="text-on-surface-variant text-xs sm:text-sm md:text-base leading-relaxed break-safe">
                    {event.description}
                  </p>
                </div>

                {/* Dynamic Content Sections */}
                {((event as any).event_content_sections || []).length > 0 && (
                  <div className="flex flex-col gap-4 sm:gap-6 border-t border-outline/30 pt-4 sm:pt-6">
                    {((event as any).event_content_sections)
                      .sort((a: any, b: any) => a.sort_order - b.sort_order)
                      .map((sec: any) => (
                        <div key={sec.id} className="flex flex-col gap-2 sm:gap-3">
                          <h4 className="font-heading text-sm sm:text-base font-bold text-on-surface break-safe">{sec.title}</h4>
                          {sec.section_type === "rules" && sec.content?.rules_list ? (
                            <ul className="list-disc list-inside space-y-1 text-on-surface-variant text-xs sm:text-sm md:text-base leading-relaxed">
                              {sec.content.rules_list.map((rule: string, i: number) => (
                                <li key={i} className="break-safe">{rule}</li>
                              ))}
                            </ul>
                          ) : sec.section_type === "timeline" && sec.content?.schedule ? (
                            <div className="flex flex-col gap-2 border border-outline bg-surface-2/30 rounded-xl sm:rounded-2xl p-3 sm:p-4">
                              {sec.content.schedule.map((item: any, i: number) => (
                                <div key={i} className="flex flex-col xs:flex-row gap-1 xs:gap-4 border-b border-outline/20 last:border-0 pb-2 last:pb-0">
                                  <span className="font-bold text-primary text-xs sm:text-sm shrink-0">{item.time}</span>
                                  <span className="text-on-surface-variant text-xs sm:text-sm break-safe">{item.details}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-on-surface-variant text-xs sm:text-sm md:text-base leading-relaxed break-safe">
                              {typeof sec.content === "string" ? sec.content : JSON.stringify(sec.content)}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Right Column */}
              <div className="flex flex-col gap-4 sm:gap-6 lg:border-l lg:border-outline/30 lg:pl-8">
                <div className="flex flex-col gap-3 sm:gap-4 bg-surface-2/40 border border-outline rounded-[20px] sm:rounded-[24px] p-4 sm:p-5">
                  <h4 className="font-heading text-xs sm:text-sm font-black uppercase text-on-surface-muted tracking-wider">Event Schedule</h4>

                  <div className="flex items-start gap-3">
                    <Calendar className="h-4.5 w-4.5 text-primary shrink-0 mt-0.5" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-semibold text-on-surface-muted">Date</span>
                      <span className="text-xs sm:text-sm font-bold truncate">{new Date(event.start_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Clock className="h-4.5 w-4.5 text-primary shrink-0 mt-0.5" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-semibold text-on-surface-muted">Time</span>
                      <span className="text-xs sm:text-sm font-bold truncate">
                        {new Date(event.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <MapPin className="h-4.5 w-4.5 text-primary shrink-0 mt-0.5" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-semibold text-on-surface-muted">Venue</span>
                      <span className="text-xs sm:text-sm font-bold truncate">{event.venue_name}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Users className="h-4.5 w-4.5 text-primary shrink-0 mt-0.5" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-semibold text-on-surface-muted">Organizer</span>
                      <span className="text-xs sm:text-sm font-bold text-primary truncate">{(event as any).organizations?.name || "LPU Club"}</span>
                    </div>
                  </div>
                </div>

                {event.registration_mode === "EXTERNAL" && event.external_registration_url ? (
                  <button
                    onClick={handleRegisterRedirect}
                    className="w-full flex items-center justify-center gap-2 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl bg-gradient-to-r from-primary to-primary-dim text-on-primary font-black text-xs sm:text-sm hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 shadow-orange hover:shadow-lg cursor-pointer touch-target font-heading"
                  >
                    <span>Book Ticket</span>
                    <ExternalLink className="h-4 w-4" />
                  </button>
                ) : (
                  <div className="p-3 sm:p-4 bg-outline/10 text-on-surface-muted text-xs font-medium text-center rounded-xl sm:rounded-2xl border border-outline">
                    No external registration link provided. Attendee check-in is handled at the venue.
                  </div>
                )}
              </div>

            </div>
          </>
        )}
      </div>
    </div>
  );
};
