# Next Bridge Group
## Client Experience Presentation

**Prepared:** 16 September 2026  
**Product:** NBG coastal residences website and private client portal

---

## 1. Project Purpose

Next Bridge Group is building a considered digital front door for coastal residences in Nyali, Mombasa. The experience should help a prospective buyer discover the development, understand the ownership journey, and move into a secure client workspace when they are ready.

The product is designed around three promises:

- **Clarity:** verified project, availability, construction, and payment information.
- **Confidence:** secure registration, private documents, support, and profile controls.
- **Continuity:** a connected journey from first enquiry to reservation and handover.

## 2. What Is Ready

### Public experience

- NBG-branded homepage with coastal hero imagery and clear calls to action.
- Residences, availability, construction progress, gallery, location, contact, and investor routes.
- WhatsApp, phone, private viewing, and enquiry flows.
- Branded Privacy Notice and Terms of Engagement routes linked from the footer.
- Document verification route for NBG-generated client documents.

### Client portal

- Secure magic-link, password sign-in, registration, and password reset flows.
- Responsive private workspace with mobile navigation.
- Overview dashboard with welcome state, notifications, reservation journey, next payment, and quick actions.
- Interactive stat cards for projects, updates, availability, and notices.
- Project progress, payment schedule, statement download, investment planning, available homes, document vault, secure support, profile, and security controls.
- Explicit acceptance of the NBG Privacy Notice and Terms of Engagement during registration.

### Operations foundation

- Supabase-backed projects, units, construction updates, leads, payments, investments, support tickets, profiles, and documents.
- Role-aware admin dashboard and audit trail migrations.
- Generated document engine with verification metadata and client storage access.

## 3. Experience Direction

The visual language uses deep coastal teal, sea-glass aqua, warm ivory, editorial serif headlines, restrained motion, and image-led storytelling. The intent is premium but calm: a buyer should feel informed and welcomed rather than pushed through a sales funnel.

The homepage hero and its benefit band are now separate responsive sections. This creates a clean pause between the first impression and the supporting value propositions on desktop and mobile.

## 4. Client Portal Walkthrough

1. **Sign in or register** with email, password, or a secure magic link.
2. **See the overview** with the most important account signals at a glance.
3. **Open an interactive stat** to acknowledge the current signal and use the navigation for the full section.
4. **Track the journey** from enquiry through handover.
5. **Review payments and documents** in one private workspace.
6. **Contact the NBG team** through secure support or direct contact channels.
7. **Keep the profile current** so NBG can personalize the next step.

## 5. Responsive Readiness

The client portal adapts across the main device ranges:

- Desktop: fixed navigation rail, spacious dashboard grid, two-column content where useful.
- Tablet: off-canvas navigation, two-column stat layout, flexible content panels.
- Mobile: menu trigger, single-column cards, stacked forms, scrollable data tables, touch-sized controls, and no fixed-width dashboard content.

## 6. Privacy and Terms Position

The public legal routes are intentionally written in plain language and carry the NBG brand voice. They explain:

- how enquiry, account, and portal information is used;
- that NBG does not sell enquiry information;
- how users can request correction or removal of their details;
- that published pricing, availability, progress, imagery, and completion dates may change;
- that an enquiry or viewing request is not a reservation or purchase contract;
- that binding commitments require written confirmation from an authorized NBG representative.

**Launch note:** before production release, have the final legal text reviewed and approved by NBG's appointed legal adviser, and confirm the data-retention, cookie, and communications policy.

## 7. Recommended Demonstration Today

### Five-minute flow

1. Start on the homepage and point out the separated hero, value band, and primary actions.
2. Open **Client Portal** and demonstrate registration consent using the Privacy Notice and Terms links.
3. Sign in with a demo client account.
4. Click the overview stat cards and show the responsive mobile menu.
5. Open Payments, Documents & Support, and Profile & Security.
6. Return to the public site and demonstrate the contact or private viewing form.

### Talking points

- The public site creates interest; the portal carries the relationship forward.
- Verified information is separated from future or placeholder content.
- Clients can see what matters without asking the team for every update.
- The experience is ready for real project data and controlled publishing.

## 8. Final Preparation Checklist

- Replace concept photography with approved NBG project photography.
- Confirm project names, locations, unit data, pricing, and completion dates.
- Confirm production Supabase URL, keys, redirect URLs, storage policies, and email templates.
- Approve Privacy Notice and Terms of Engagement with counsel.
- Add confirmed NBG office hours, social profile URLs, and support SLA.
- Create demo client, staff, and admin accounts for the presentation.
- Test registration confirmation, password reset, document download, payment statement, and mobile navigation on real devices.
- Run `npm run typecheck`, `npm run build`, and a final browser smoke test before launch.

## 9. Closing

Next Bridge Group is positioned to offer more than a property catalogue. It offers a visible, accountable path from first conversation to ownership, with a digital experience that reflects the quality and permanence of the homes being created.
