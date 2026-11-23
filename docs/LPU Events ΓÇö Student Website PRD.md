# LPU Events — Student Website PRD

**Product:** LPU Events  
**Platform:** Student Website  
**Document:** Product Requirements Document  
**Version:** 1.0  
**Date:** 13 August 2026  
**Primary Users:** LPU Students

---

# 1. Product Overview

LPU Events is an **event discovery platform for Lovely Professional University**.

The Student Website allows students to discover events happening at LPU, explore event information, search and filter events, and access the appropriate registration destination when an event requires registration.

The Student Website is **not a ticketing or booking platform**.

### Core principle

> **LPU Events discovers and presents events. Registration happens externally.**

If an event requires registration, the Student Website provides the organizer-configured external registration link. The student leaves LPU Events and completes registration on the external platform.

---

# 2. Product Scope

The Student Website is responsible for:

- Event discovery.
- Event browsing.
- Event search.
- Event filtering.
- Event categorization.
- Event details.
- Event registration information.
- External registration redirection.
- Homepage experience.
- Advertisements displayed to students.
- Featured event discovery.
- Event memories discovery.
- Student profile.
- Student notifications.
- Dark/light mode.
- Responsive student-facing experience.

---

# 3. Explicitly Out of Scope

The Student Website must **not** provide:

- Ticket booking.
- Internal event registration.
- Payment processing.
- Razorpay integration.
- UPI payment processing.
- Seat reservation.
- Ticket inventory management.
- Ticket generation.
- QR-code ticket generation.
- Ticket verification.
- Refund processing.
- Booking cancellation.
- Booking history.
- My Tickets.
- Payment history.
- Internal checkout.
- Shopping cart.
- Registration forms hosted by LPU Events.

If an event uses tickets or paid registration, those processes belong to the external registration platform.

---

# 4. Event Discovery Model

Every eligible LPU event should be discoverable through LPU Events regardless of how students ultimately register.

An event may be:

### No Registration

The event does not require registration.

The student simply views the event information.

### External Registration

The event requires registration somewhere outside LPU Events.

The student selects the registration action and is redirected to the configured external registration URL.

There is **no third registration mode handled internally by LPU Events**.

---

# 5. Student Website Information Architecture

The Student Website should contain the following primary areas:

- Home
- Events
- Event Details
- Search
- Filters
- Profile
- Notifications

The exact visual navigation may differ between desktop and mobile, but the underlying information architecture should remain consistent.

---

# 6. Header

The website header must contain:

- LPU Events logo.
- Search bar.
- Notifications.
- Dark/light mode control.
- Profile area.

The header should remain consistent across the major student-facing pages.

---

# 7. Homepage

The homepage is the primary event-discovery surface.

The homepage must contain:

1. Header.
2. Hero Carousel.
3. Advertisement Bar.
4. Happening Today.
5. Filter Bar.
6. Events Hub.

The homepage should prioritize discovering events quickly rather than presenting administrative or transactional functionality.

---

# 8. Hero Carousel

The homepage contains a dedicated Hero Carousel.

The carousel can present:

- Featured Events.
- Advertisements.
- Event Memories.

These are presented as homepage content and are not separate event-registration systems.

The carousel should reference the relevant content rather than duplicating event information.

---

# 9. Carousel Behavior

The carousel should have:

- Five slides by default.
- Support for additional slides.
- Ordered slides.
- Enabled/disabled slides.
- Different content types per slide.
- Selected content per slide.
- Thumbnail previews.
- Configurable slide duration.

Default duration:

**5 seconds**

Allowed duration:

**3–15 seconds**

The carousel has a global **Auto Play** setting.

---

# 10. Student Carousel Interaction

Students must always be able to manually control the carousel.

Supported interactions:

- Swipe.
- Drag.
- Previous arrow.
- Next arrow.
- Indicator dots.

If Auto Play is enabled and the student manually interacts with the carousel, the timer for the current slide must reset before autoplay resumes.

---

# 11. Happening Today

The homepage must contain a **Happening Today** section.

It displays events occurring on the current day.

The section should provide a quick way for students to discover what is happening at LPU today.

Each event should provide access to its Event Details page.

---

# 12. Events Hub

The Events Hub is the main event-discovery component.

It should contain events from across LPU rather than only selected or featured events.

Featured Events are a curated homepage experience and must not replace the complete Events Hub.

---

# 13. Event Cards

Event cards should provide enough information for students to understand the event before opening it.

A card may contain:

- Event poster.
- Event name.
- Date.
- Time.
- Venue.
- Category.
- Subcategory.
- Event status.
- Registration information.
- Primary action.

The card design should remain visually consistent across the Student Website.

---

# 14. Events Hub Initial Loading

The Events Hub initially displays:

**10 event cards**

When the student selects **Show More**, an additional:

**5 events**

are loaded.

Both values are configurable system settings and should not be permanently hardcoded into the frontend.

Therefore:

- Initial event count = configurable.
- Show More increment = configurable.

---

# 15. Past Events

Past events should remain available on the Student Website.

Students should be able to discover previously completed events.

Past events should have their own clear presentation and use a **Show More** mechanism.

The interface should visually distinguish past events from upcoming events.

---

# 16. Search

The Student Website must provide event search.

The global header contains a search bar.

Students should be able to search for events using relevant event information, primarily:

- Event name.
- Searchable event metadata.

Search should return relevant events quickly.

Search results should use the same event-card structure as the rest of the Student Website where appropriate.

---

# 17. Event Filters

The Student Website must provide a filter bar for event discovery.

Filtering should support:

- Category.
- Subcategory.
- Date.
- Event status.
- Registration requirement.
- Other approved event-discovery attributes.

Multiple filters should be usable together.

The filter interface should be easy to use on both desktop and mobile.

---

# 18. Categories and Subcategories

The Student Website must use the official LPU Events event taxonomy.

The project's authoritative taxonomy definition is:

`taxonomy.js`

The Student Website must use the same category/subcategory structure consistently.

The taxonomy must be reflected in:

- Events Hub.
- Search.
- Filters.
- Event cards.
- Event Details.
- Other event-discovery interfaces.

### Important requirement

The Student Website must **not invent, rename, merge, or independently redefine** categories or subcategories.

The exact category and subcategory values must come from the project's authoritative `taxonomy.js`.

---

# 19. Event Details Page

Every event must have a dedicated Event Details page.

The page must contain:

- Banner image.
- Event name.
- Date.
- Time.
- Venue.
- Advertisement bar.
- About the Event.
- Additional/more event cards.

The page should provide enough information for a student to understand the event without needing to visit another page.

---

# 20. Event Banner

The Event Details page must display the event's banner/poster prominently.

The image should:

- Preserve the intended aspect ratio.
- Load responsively.
- Use the appropriate optimized image variant.
- Support both light and dark UI environments.

Event images are stored through the project's configured media infrastructure.

---

# 21. Event Information

The Event Details page must clearly display:

### Event Name

The official event name.

### Date

The event date.

### Time

The event start/end time where available.

### Venue

The event location.

### Registration Information

Whether registration is required and, if applicable, where the student should register.

---

# 22. About the Event

The About the Event section must support **organizer-defined headings**.

There is no fixed number of headings.

The organizer may create multiple sections, each containing:

- Heading.
- Corresponding content.

Possible examples include:

- About.
- Rules.
- Eligibility.
- Schedule.
- Prizes.
- Requirements.

These are examples only.

The actual headings are determined by the event content.

---

# 23. About the Event Navigation

The headings should be displayed using a horizontally sliding/tabbed interface.

Students can select a heading to view its corresponding content.

The interface must support any number of headings.

The Student Website must not assume that every event has the same sections.

---

# 24. Additional Events

The Event Details page must provide additional event cards after the main event information.

These cards allow students to continue discovering other LPU events.

The recommendation/listing logic should prioritize relevant or appropriate events according to the product's event-discovery rules.

---

# 25. Registration Experience

LPU Events does not process registration.

The Student Website only communicates the registration requirement and provides the external destination.

---

# 26. Event With No Registration

For an event that does not require registration:

The student can:

**View Details → Read Event Information**

No registration button is required.

---

# 27. Event With External Registration

For an event that requires registration:

The Event Details page provides an appropriate action such as:

**Register Now**

or

**Register Externally**

When selected:

**Student → External Registration Website**

The student completes the entire registration process on the external platform.

---

# 28. External Registration Link

Each externally registered event can have an organizer-provided external registration URL.

The Student Website must use the configured URL.

The Student Website does not manage:

- External registration forms.
- External registration submissions.
- External payments.
- External tickets.
- External confirmation emails.
- External refunds.

Those belong to the external registration system.

---

# 29. External Registration Disclaimer

Where appropriate, the Student Website should make it clear that selecting the registration action takes the student to an external website.

The purpose is to prevent confusion about which platform is responsible for registration.

---

# 30. Registration Status

The Student Website should clearly communicate applicable registration states, such as:

- Registration Not Started.
- Registration Open.
- Registration Closed.
- Registration Deadline Passed.

If the event does not require registration, the UI should communicate that instead.

LPU Events does not enforce external platform registration availability unless the organizer explicitly provides the relevant status information.

---

# 31. Event Cancellation

If an event is cancelled, the Student Website must clearly display its cancelled state.

For example:

**Cancelled**

The Student Website does not process:

- Ticket cancellation.
- Booking cancellation.
- Refunds.

If students registered through an external platform, they must follow the cancellation/refund process provided by the organizer or external registration platform.

---

# 32. Event Updates

If event information changes, the Student Website should display the latest approved information.

Possible updates include:

- Date.
- Time.
- Venue.
- Description.
- Registration deadline.
- External registration URL.
- Event status.

---

# 33. Advertisements

Advertisements may appear throughout the Student Website according to the configured placement rules.

Supported placements include:

- Homepage top.
- Homepage feed.
- Event details top.
- Event details bottom.

The Student Website only renders the advertisement information supplied by the platform.

---

# 34. Advertisement Feed Placement

Advertisements may be inserted among event cards.

The configured rule determines after how many event cards an advertisement appears.

Example:

**5 Event Cards → Advertisement → 5 Event Cards → Advertisement**

The placement should remain consistent with the configured rule.

---

# 35. Advertisement Interaction

Clicking an advertisement opens its configured redirect destination.

The Student Website does not process any purchase or registration associated with that destination.

---

# 36. Student Profile

The Student Website provides a student profile area.

The profile should provide access to student-facing functionality such as:

- Student information.
- Notifications.
- Preferences/settings.

The profile must **not** contain ticket or booking functionality.

---

# 37. Profile Avatar

The profile avatar uses initials.

The initials are generated using:

- First letter of the first name.
- First letter of the surname.

No profile photo upload is supported.

---

# 38. Notifications

The Student Website should provide notifications for relevant LPU Events updates.

Examples:

- Important event updates.
- Event changes.
- Event cancellation.
- Platform announcements.
- Other relevant student-facing notifications.

Notifications should not falsely represent external booking/payment events as being processed by LPU Events.

---

# 39. Dark / Light Mode

The Student Website must support:

- Light Mode.
- Dark Mode.

Both modes must maintain proper:

- Contrast.
- Text readability.
- Button visibility.
- Card readability.
- Navigation visibility.
- Image presentation.
- Form usability.

---

# 40. Responsive Design

The Student Website must support:

- Desktop.
- Laptop.
- Tablet.
- Mobile.

Responsive behavior must be intentionally designed rather than simply shrinking the desktop interface.

Particular attention should be given to:

- Header.
- Search.
- Filters.
- Carousel.
- Event cards.
- Event Details.
- External registration buttons.
- Horizontally sliding About sections.

---

# 41. Accessibility

The Student Website should provide:

- Keyboard navigation.
- Accessible controls.
- Visible focus states.
- Appropriate contrast.
- Screen-reader-compatible labels.
- Accessible carousel controls.
- Meaningful alternative text for images.
- Clear status indicators.
- Clear validation/error messages.

Important information must not be communicated through color alone.

---

# 42. Performance Requirements

The Student Website should prioritize fast event discovery.

Requirements include:

- Efficient homepage loading.
- Cached homepage payload.
- Optimized event images.
- CDN-based static/media delivery.
- Pagination or incremental loading for event lists.
- Minimal unnecessary database requests.
- Avoidance of unnecessary realtime subscriptions.
- Efficient search/filter queries.

---

# 43. Homepage Caching

The homepage should use a **precomputed cached homepage payload**.

The payload should contain the information required to render the homepage efficiently, including relevant:

- Carousel content.
- Featured content.
- Advertisements.
- Happening Today data.
- Other homepage-specific information.

The frontend should not need to assemble the homepage from numerous independent requests.

---

# 44. Image Optimization

Event images should be optimized for web delivery.

Preferred format:

**WebP**

The system should maintain appropriate image variants, such as:

- Thumbnail.
- Medium.
- Original.

The Student Website should request the appropriate size for each UI context rather than unnecessarily downloading the original image.

---

# 45. Student Data Security

Students must only access data they are authorized to access.

The Student Website must not expose:

- Other students' private information.
- Admin information.
- Organizer administrative data.
- Internal system credentials.
- Internal operational information.

Student authentication uses Supabase Auth.

Student authorization is based on the student-side authorization model.

---

# 46. No Administrative Functionality

The Student Website must not contain:

- Event creation.
- Event editing.
- Event approval.
- Organizer management.
- Advertisement management.
- Carousel management.
- Featured Event management.
- Event Memory management.
- Global settings.
- Operations Console.
- Administrative analytics.

These belong to the separate Admin Website and are outside this PRD.

---

# 47. Core Student User Journeys

## Journey 1 — Discover an Event

**Home → Events Hub → Search/Filter → Event Card → Event Details**

---

## Journey 2 — Event Without Registration

**Event Details → Read Event Information**

No further action is required.

---

## Journey 3 — Event With External Registration

**Event Details → Register Now → External Registration Website**

The student completes registration outside LPU Events.

---

## Journey 4 — Discover Today's Events

**Home → Happening Today → Event → Event Details**

---

## Journey 5 — Discover Past Events

**Home/Events → Past Events → Show More → Event Details**

---

# 48. Functional Requirements

| Feature | Requirement |
|---|---|
| Homepage | Required |
| Header | Required |
| Search | Required |
| Events Hub | Required |
| Event cards | Required |
| Event filters | Required |
| Categories | Required |
| Subcategories | Required |
| Event Details | Required |
| Dynamic About sections | Required |
| Happening Today | Required |
| Past Events | Required |
| Show More | Required |
| Hero Carousel | Required |
| Featured Events display | Required |
| Event Memories display | Required |
| Advertisements | Required |
| External registration link | Required |
| Student profile | Required |
| Notifications | Required |
| Dark/light mode | Required |
| Responsive UI | Required |
| Ticket booking | **Not supported** |
| Internal registration | **Not supported** |
| Payment | **Not supported** |
| Razorpay | **Not supported** |
| UPI | **Not supported** |
| Ticket generation | **Not supported** |
| QR verification | **Not supported** |
| Refunds | **Not supported** |
| Booking history | **Not supported** |
| My Tickets | **Not supported** |
| Seat reservation | **Not supported** |

---

# 49. Acceptance Criteria

The Student Website is considered complete when:

- Students can discover LPU events.
- Students can search for events.
- Students can filter events.
- Categories and subcategories are displayed according to the authoritative taxonomy.
- The homepage contains all required sections.
- The homepage carousel works correctly.
- Students can manually control the carousel.
- Auto Play behaves correctly.
- Happening Today displays applicable events.
- Events Hub initially displays the configured number of events.
- Show More loads the configured incremental number.
- Past events are available through the appropriate interface.
- Advertisements appear according to their configured placement.
- Event Details contains all required information.
- About the Event supports any number of organizer-defined headings.
- Events requiring registration provide an external registration link.
- Selecting the registration action takes the student to the external platform.
- LPU Events does not process the external registration.
- No ticket booking functionality exists.
- No payment functionality exists.
- No internal reservation functionality exists.
- No ticket generation functionality exists.
- No QR verification functionality exists.
- Student profile works correctly.
- Profile avatars use initials.
- Dark/light mode works correctly.
- The website is responsive.
- The website meets the defined accessibility requirements.
- The homepage and event discovery experience remain performant.

---

# 50. Non-Negotiable Product Rules

The following rules must be treated as hard requirements:

### Rule 1 — Discovery Only

LPU Events is an event discovery platform.

### Rule 2 — No Internal Registration

LPU Events does not provide its own registration system.

### Rule 3 — External Registration Only

If registration is required, the student is redirected to the organizer's configured external registration URL.

### Rule 4 — No Ticketing

LPU Events does not create, store, deliver, or verify tickets.

### Rule 5 — No Payments

LPU Events does not process event payments.

### Rule 6 — No Booking

LPU Events does not reserve seats or maintain ticket inventory.

### Rule 7 — Student Website Separation

This PRD describes **only the Student Website**.

Administrative functionality must be documented separately.

---

# 51. Final Product Definition

**The LPU Events Student Website is a student-facing event discovery platform for Lovely Professional University. It allows students to discover, search, filter, and explore events, view complete event information, and access external registration platforms when registration is required. LPU Events itself does not handle registration, ticket booking, payments, reservations, tickets, QR codes, refunds, or ticket verification.**