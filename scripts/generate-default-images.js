import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Canonical Category & Subcategory Taxonomy (13 Categories, 81 Subcategories)
export const TAXONOMY_CONFIG = [
  // 1. Academics
  {
    categoryKey: 'academics',
    categoryName: 'Academics',
    subcategories: [
      { key: 'seminar', name: 'Seminar', accent: '#2563EB', icon: 'podium', desc: 'Academic podium, speaker presentation screen, tiered lecture hall silhouette' },
      { key: 'guest-lecture', name: 'Guest Lecture', accent: '#3B82F6', icon: 'lecture', desc: 'Distinguished guest lectern, spotlight beams, auditorium ambiance' },
      { key: 'workshop', name: 'Workshop', accent: '#60A5FA', icon: 'gears', desc: 'Hands-on interactive lab desk, interlocking gears, modular study tools' },
      { key: 'internship', name: 'Internship', accent: '#0284C7', icon: 'career', desc: 'Corporate high-rise blueprint, career path compass, ascending career stairs' },
      { key: 'capstone', name: 'Capstone', accent: '#6366F1', icon: 'capstone', desc: 'Academic graduation beacon, thesis manuscript scroll, radiant milestone star' },
      { key: 'others', name: 'Others', accent: '#4F46E5', icon: 'academic-book', desc: 'Open hardbound academic textbook, glowing knowledge sphere, quill' }
    ]
  },
  // 2. Cultural
  {
    categoryKey: 'cultural',
    categoryName: 'Cultural',
    subcategories: [
      { key: 'music', name: 'Music', accent: '#9333EA', icon: 'music', desc: 'Concert soundwaves, glowing acoustic guitar, dynamic neon equalizer frequency bars' },
      { key: 'dance', name: 'Dance', accent: '#C026D3', icon: 'dance', desc: 'Fluid dynamic motion ribbons, rhythmic dancer silhouette, radiant stage lights' },
      { key: 'theatre', name: 'Theatre', accent: '#E11D48', icon: 'theatre', desc: 'Classic drama comedy & tragedy masks, velvet stage curtain drape, spotlight beam' },
      { key: 'social-media', name: 'Social Media', accent: '#F43F5E', icon: 'social', desc: 'Creator studio ring-light, digital livestream feed frames, floating viral pulse sparks' },
      { key: 'others', name: 'Others', accent: '#A855F7', icon: 'cultural-spark', desc: 'Festive cultural mandala, radiant heritage kaleidoscope, glowing sparks' }
    ]
  },
  // 3. Innovation
  {
    categoryKey: 'innovation',
    categoryName: 'Innovation',
    subcategories: [
      { key: 'hackathon', name: 'Hackathon', accent: '#06B6D4', icon: 'hackathon', desc: 'Glowing terminal code IDE, dual laptop screens, high-tech neon circuit pathways' },
      { key: 'technical-events', name: 'Technical Events', accent: '#0EA5E9', icon: 'tech-event', desc: 'Hardware microcontroller PCB, robotic sensor eye, logic gate network' },
      { key: 'project-expo', name: 'Project Expo', accent: '#10B981', icon: 'expo-cube', desc: 'Isometric demonstration pedestal, glowing holographic tech prototype model' },
      { key: 'workshop', name: 'Workshop', accent: '#14B8A6', icon: 'tech-tools', desc: 'Hardware prototyping breadboard, precision oscilloscope, soldering station' },
      { key: 'seminar', name: 'Seminar', accent: '#0891B2', icon: 'keynote', desc: 'Future technology keynote screen, AI neural network projection, audience' },
      { key: 'others', name: 'Others', accent: '#22D3EE', icon: 'rocket', desc: 'Deep-tech launch rocket, orbital planetary satellites, glowing hyper-speed trails' }
    ]
  },
  // 4. Entrepreneurship
  {
    categoryKey: 'entrepreneurship',
    categoryName: 'Entrepreneurship',
    subcategories: [
      { key: 'b-plan', name: 'B-Plan Competition', accent: '#059669', icon: 'bplan', desc: 'Business model canvas matrix, ascending valuation chart, corporate executive strategy' },
      { key: 'pitch-fest', name: 'Pitch Fest', accent: '#10B981', icon: 'pitch', desc: 'Investor pitch spotlight, glowing growth trajectory chart, microphone pedestal' },
      { key: 'conclave', name: 'Conclave', accent: '#D97706', icon: 'summit', desc: 'Executive leadership round table, global commerce globe, boardroom seating' },
      { key: 'bootcamp', name: 'Bootcamp', accent: '#EA580C', icon: 'bootcamp', desc: 'High-velocity startup sprint whiteboard, sticky ideation cards, sprint timer' },
      { key: 'panel-discussion', name: 'Panel Discussion', accent: '#B45309', icon: 'panel', desc: 'Executive stage armchairs, multiple discussion microphones, panelist backdrop' },
      { key: 'expo', name: 'Expo', accent: '#F59E0B', icon: 'venture-booth', desc: 'Startup venture exhibition pavilion, trade banner stands, product showcase' },
      { key: 'seminar', name: 'Seminar', accent: '#047857', icon: 'business-talk', desc: 'Venture capital keynote presentation, market trends bar graph projection' },
      { key: 'others', name: 'Others', accent: '#15803D', icon: 'bulb-growth', desc: 'Glowing innovation lightbulb sprouting upward financial growth foliage' }
    ]
  },
  // 5. Schools (Engineering & Technology, Arts & Design, Business & Law, Health & Education)
  {
    categoryKey: 'schools',
    categoryName: 'Schools',
    subcategories: [
      // A. Engineering & Technology
      { key: 'school-ai-emerging', name: 'School of AI and Emerging Technologies', accent: '#6366F1', icon: 'ai-brain', desc: 'Artificial intelligence synaptic brain network, quantum computation cube, neural nodes' },
      { key: 'school-bio', name: 'School of Bio Engineering and Biosciences', accent: '#10B981', icon: 'dna-helix', desc: 'Luminous DNA double-helix, laboratory bio-reactor flask, microscopic cells' },
      { key: 'school-chemical', name: 'School of Chemical Engineering and Physical Sciences', accent: '#F59E0B', icon: 'chemistry', desc: 'Chemical laboratory glassware condenser, atomic molecular orbitals, crystalline lattice' },
      { key: 'school-ca', name: 'School of Computer Applications', accent: '#0284C7', icon: 'app-dev', desc: 'Cloud server infrastructure racks, mobile application UI wireframes, database nodes' },
      { key: 'school-cse', name: 'School of Computer Science and Engineering', accent: '#2563EB', icon: 'cse-binary', desc: 'Algorithm data structure tree, binary matrix waterfall, high-performance CPU processor' },
      { key: 'school-cai', name: 'School of Computing and Artificial Intelligence', accent: '#8B5CF6', icon: 'robotics-ai', desc: 'Autonomous humanoid robotics vision sensor, matrix tensor operations, vector embeddings' },
      { key: 'school-eee', name: 'School of Electronics and Electrical Engineering', accent: '#EC4899', icon: 'circuit-pcb', desc: 'Electromagnetic power transformer coils, semiconductor microchip wafer, circuit voltage waves' },
      { key: 'school-me', name: 'School of Mechanical Engineering', accent: '#F97316', icon: 'mechanical-cad', desc: 'Precision industrial turbine engine, 3D CAD wireframe gear assembly, robotic arm joint' },

      // B. Arts, Design & Architecture
      { key: 'school-arch', name: 'Lovely School of Architecture and Design', accent: '#38BDF8', icon: 'architecture', desc: 'Architectural structural blueprint, draftsman compass calipers, modernist geometric pavilion' },
      { key: 'school-design-fashion', name: 'School of Design (Fashion Design & Technology)', accent: '#F43F5E', icon: 'fashion-tech', desc: 'Haute couture dressmaker mannequin, luxury silk fabric drapes, sewing shears' },
      { key: 'school-design-interior', name: 'School of Design (Interior & Product Design)', accent: '#FB923C', icon: 'interior', desc: 'Spatial 3D interior isometric room, minimalist furniture silhouette, mood board swatch' },
      { key: 'school-design-multimedia', name: 'School of Design (Multimedia)', accent: '#A855F7', icon: 'multimedia', desc: 'Digital motion canvas, 3D polygonal sculpture wireframe, interactive graphics stylus' },
      { key: 'school-arts-films', name: 'School of Liberal and Creative Arts (Films, Theatre and Music)', accent: '#E11D48', icon: 'cinema', desc: 'Cinematography camera lens, director clapperboard, audio mixing console faders' },
      { key: 'school-arts-fine', name: 'School of Liberal and Creative Arts (Fine Arts)', accent: '#D97706', icon: 'fine-art', desc: 'Artist wooden easel canvas, dynamic acrylic brushstrokes, painter color palette' },
      { key: 'school-arts-journalism', name: 'School of Liberal and Creative Arts (Journalism and Mass Communication)', accent: '#0D9488', icon: 'broadcast', desc: 'Broadcast news studio microphone, broadcast camera viewfinder, press headline printing press' },
      { key: 'school-arts-social', name: 'School of Liberal and Creative Arts (Social Sciences and Languages)', accent: '#475569', icon: 'social-sciences', desc: 'World globe cartography, classical open anthology manuscript, multilingual dialogue rings' },

      // C. Business, Law & Management
      { key: 'school-business', name: 'Mittal School of Business', accent: '#1E293B', icon: 'business-school', desc: 'Global financial stock indices candlestick chart, executive boardroom glass skyscrapers' },
      { key: 'school-agriculture', name: 'School of Agriculture', accent: '#65A30D', icon: 'agriculture', desc: 'Golden wheat sheaves, smart precision agrarian drone, greenhouse plant foliage' },
      { key: 'school-hotel-tourism', name: 'School of Hotel Management and Tourism', accent: '#CA8A04', icon: 'hospitality', desc: 'Silver cloche dome service tray, five-star hospitality concierge bell, travel compass' },
      { key: 'school-law', name: 'School of Law', accent: '#991B1B', icon: 'law-justice', desc: 'Brass Lady Justice balance scales, courtroom judge wooden gavel, legal law pillars' },

      // D. Health, Education & Professional
      { key: 'school-medical', name: 'School of Allied Medical Sciences', accent: '#0D9488', icon: 'medical-pulse', desc: 'Cardiogram ECG pulse line, clinical diagnostic stethoscope, healthcare cross emblem' },
      { key: 'school-education', name: 'School of Education', accent: '#2563EB', icon: 'education-lamp', desc: 'Illuminated lamp of knowledge, graduation scholar cap, pedagogy library books' },
      { key: 'school-phys-ed', name: 'School of Education (Physical Education)', accent: '#EA580C', icon: 'sports-track', desc: 'Athletic Olympic stadium track lanes, dynamic sports relay baton, championship victory cup' },
      { key: 'school-pharma', name: 'School of Pharmaceutical Sciences', accent: '#06B6D4', icon: 'pharmacy', desc: 'Pharmaceutical medical capsules, biochemical mortar and pestle, molecular synthesis' },
      { key: 'school-polytechnic', name: 'School of Polytechnic', accent: '#475569', icon: 'polytechnic', desc: 'Precision industrial vernier calipers, electrical circuit breadboard, engineering blueprints' }
    ]
  },
  // 6. Community Services
  {
    categoryKey: 'community-services',
    categoryName: 'Community Services',
    subcategories: [
      { key: 'donation-drives', name: 'Donation Drives', accent: '#DC2626', icon: 'donation-box', desc: 'Hands holding a warm glowing heart-relief gift box, charity donation parcels' },
      { key: 'environment', name: 'Environment', accent: '#16A34A', icon: 'eco-leaf', desc: 'Vibrant green oak tree leaves, clean ecological solar sphere, planet Earth biome' },
      { key: 'healthcare', name: 'Healthcare', accent: '#0284C7', icon: 'first-aid', desc: 'Clinical medical red cross shield, stethoscope, blood donation heart droplet' },
      { key: 'others', name: 'Others', accent: '#E11D48', icon: 'community-hands', desc: 'Interconnected circle of diverse hands reaching together, humanitarian unity emblem' }
    ]
  },
  // 7. Day Celebrations
  {
    categoryKey: 'day-celebrations',
    categoryName: 'Day Celebrations',
    subcategories: [
      { key: 'national-days', name: 'National Days', accent: '#EA580C', icon: 'national-flag', desc: 'Historic national monument silhouette, patriotic tri-color flowing ribbons, flag mast' },
      { key: 'cultural-days', name: 'Cultural Days', accent: '#D97706', icon: 'heritage-fest', desc: 'Traditional folk musical instruments, ethnic decorative floral rangoli, glowing oil lamps' },
      { key: 'fest-days', name: 'Fest Days', accent: '#E11D48', icon: 'campus-fest', desc: 'Grand university campus fest mainstage, bursting celebratory fireworks, festival banners' },
      { key: 'awareness-days', name: 'Awareness Days', accent: '#0D9488', icon: 'awareness-ribbon', desc: 'Global awareness satin ribbon, illuminated educational lighthouse beacon, world globe' },
      { key: 'others', name: 'Others', accent: '#8B5CF6', icon: 'celebration-stars', desc: 'Radiant festive celebration confetti, golden sparkles, jubilee celebration crown' }
    ]
  },
  // 8. Co-Curricular
  {
    categoryKey: 'co-curricular',
    categoryName: 'Co-Curricular',
    subcategories: [
      { key: 'competitions', name: 'Competitions', accent: '#EAB308', icon: 'trophy', desc: 'Golden champion victory trophy, laurel wreath of excellence, 1st place podium' },
      { key: 'skill-dev', name: 'Skill Development', accent: '#6366F1', icon: 'skill-growth', desc: 'Ascending talent skill tree nodes, interlocking precision gear mechanism, level-up badge' },
      { key: 'certifications', name: 'Certifications', accent: '#059669', icon: 'certificate', desc: 'Distinguished diploma parchment scroll, gold embossed certification seal with ribbon' },
      { key: 'training', name: 'Training Programs', accent: '#2563EB', icon: 'training-board', desc: 'Structured professional training curriculum board, milestone roadmap, targeted drills' },
      { key: 'others', name: 'Others', accent: '#9333EA', icon: 'star-badge', desc: 'Medal of merit ribbon badge, radiant stellar achievement emblem' }
    ]
  },
  // 9. Student Clubs & Org
  {
    categoryKey: 'student-clubs',
    categoryName: 'Student Clubs & Org',
    subcategories: [
      { key: 'tech-clubs', name: 'Technical Clubs', accent: '#06B6D4', icon: 'dev-club', desc: 'Developer club terminal terminal window, connected node graph, tech badge' },
      { key: 'cultural-clubs', name: 'Cultural Clubs', accent: '#D946EF', icon: 'arts-club', desc: 'Creative studio paint palette, music notation clef, theatrical comedy mask' },
      { key: 'startup-clubs', name: 'Startup Clubs', accent: '#F97316', icon: 'startup-pod', desc: 'Student incubator launchpad, ascending venture graph, brainstorming lightbulb' },
      { key: 'literary-clubs', name: 'Literary Clubs', accent: '#10B981', icon: 'quill-book', desc: 'Vintage fountain quill pen, open leatherbound literature volume, ink parchment' },
      { key: 'others', name: 'Others', accent: '#8B5CF6', icon: 'club-flags', desc: 'Interlinked student community shields, university club organization banner' }
    ]
  },
  // 10. NCC
  {
    categoryKey: 'ncc',
    categoryName: 'NCC',
    subcategories: [
      { key: 'camps', name: 'Camps', accent: '#15803D', icon: 'ncc-camp', desc: 'Military camouflage field camp tents, tactical navigation compass, pine ridge terrain' },
      { key: 'training', name: 'Training', accent: '#B45309', icon: 'ncc-obstacle', desc: 'Obstacle training assault course, discipline drill target, endurance stopwatch' },
      { key: 'parades', name: 'Parades', accent: '#1E3A8A', icon: 'ncc-parade', desc: 'Cadet precision ceremonial march formation, brass bugle horn, salute tri-color pennant' },
      { key: 'others', name: 'Others', accent: '#334155', icon: 'ncc-crest', desc: 'NCC cadet national shield crest, unity and discipline sword and tricolor badge' }
    ]
  },
  // 11. NSS
  {
    categoryKey: 'nss',
    categoryName: 'NSS',
    subcategories: [
      { key: 'social-work', name: 'Social Work', accent: '#DC2626', icon: 'nss-wheel', desc: 'Iconic NSS Sun-Chariot Konark wheel badge, volunteer humanitarian gear pack' },
      { key: 'campaigns', name: 'Campaigns', accent: '#2563EB', icon: 'megaphone', desc: 'Community outreach broadcast megaphone, public awareness banners, marching volunteers' },
      { key: 'awareness-drives', name: 'Awareness Drives', accent: '#059669', icon: 'light-beam', desc: 'Illuminated health and literacy roadside stand, informational charts, public forum' },
      { key: 'others', name: 'Others', accent: '#EA580C', icon: 'service-hands', desc: 'Not Me But You NSS service ethos badge, supporting community hands and emblem' }
    ]
  },
  // 12. Fashion
  {
    categoryKey: 'fashion',
    categoryName: 'Fashion',
    subcategories: [
      { key: 'shows', name: 'Shows', accent: '#F43F5E', icon: 'catwalk', desc: 'Haute couture fashion runway catwalk, overhead floodlights, chic silhouette models' },
      { key: 'exhibitions', name: 'Exhibitions', accent: '#FB7185', icon: 'fashion-rack', desc: 'Designer collection garment display pedestals, luxury velvet drapery, lookbook showcase' },
      { key: 'others', name: 'Others', accent: '#0F172A', icon: 'haute-couture', desc: 'Avant-garde styling accessories, geometric diamond gem facets, elegance crest' }
    ]
  },
  // 13. Others
  {
    categoryKey: 'others',
    categoryName: 'Others',
    subcategories: [
      { key: 'miscellaneous', name: 'Miscellaneous Events', accent: '#FF6B00', icon: 'discovery-prism', desc: 'Multi-faceted refractive crystal prism casting radiant spectrum light rays, dynamic LPU campus life' }
    ]
  }
];

// High-Definition SVG Icon Metaphors
function getIconSvg(icon, accent) {
  const secondary = '#FF6B00'; // LPU Brand Orange
  switch (icon) {
    case 'podium':
      return `
        <!-- Academic Podium & Keynote Screen -->
        <defs>
          <linearGradient id="podG" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${accent}" stop-opacity="0.9"/>
            <stop offset="100%" stop-color="${secondary}" stop-opacity="0.8"/>
          </linearGradient>
        </defs>
        <rect x="220" y="80" width="360" height="200" rx="16" fill="none" stroke="url(#podG)" stroke-width="3" stroke-dasharray="6 6"/>
        <rect x="240" y="100" width="320" height="160" rx="12" fill="${accent}" fill-opacity="0.12" stroke="${accent}" stroke-width="2"/>
        <line x1="280" y1="140" x2="440" y2="140" stroke="#FFF" stroke-width="4" stroke-linecap="round"/>
        <line x1="280" y1="170" x2="520" y2="170" stroke="${accent}" stroke-width="3" stroke-linecap="round"/>
        <line x1="280" y1="200" x2="380" y2="200" stroke="${secondary}" stroke-width="3" stroke-linecap="round"/>
        <!-- Podium -->
        <polygon points="360,250 440,250 460,370 340,370" fill="url(#podG)" opacity="0.85"/>
        <rect x="330" y="240" width="140" height="16" rx="8" fill="#FFF"/>
        <path d="M375,240 Q390,200 405,215" fill="none" stroke="${secondary}" stroke-width="4" stroke-linecap="round"/>
        <circle cx="405" cy="215" r="8" fill="${secondary}"/>
        <!-- Audience Silhouettes -->
        <ellipse cx="200" cy="400" rx="70" ry="40" fill="${accent}" fill-opacity="0.3"/>
        <ellipse cx="400" cy="410" rx="90" ry="45" fill="#0c0d12" stroke="${accent}" stroke-width="1.5" stroke-opacity="0.4"/>
        <ellipse cx="600" cy="400" rx="70" ry="40" fill="${accent}" fill-opacity="0.3"/>
      `;
    case 'lecture':
      return `
        <!-- Distinguished Guest Lecture -->
        <circle cx="400" cy="180" r="80" fill="none" stroke="${accent}" stroke-width="2" stroke-dasharray="4 8"/>
        <circle cx="400" cy="180" r="50" fill="${accent}" fill-opacity="0.2" stroke="${secondary}" stroke-width="3"/>
        <polygon points="400,40 260,360 540,360" fill="url(#gradSpot)" opacity="0.25"/>
        <polygon points="360,240 440,240 450,350 350,350" fill="${accent}" opacity="0.8"/>
        <circle cx="400" cy="160" r="28" fill="#FFF"/>
        <path d="M360,230 Q400,200 440,230" fill="none" stroke="#FFF" stroke-width="3"/>
      `;
    case 'hackathon':
      return `
        <!-- Code Window & Circuit Network -->
        <rect x="180" y="80" width="440" height="260" rx="16" fill="#050608" stroke="${accent}" stroke-width="2.5"/>
        <rect x="180" y="80" width="440" height="40" rx="16" fill="${accent}" fill-opacity="0.15"/>
        <circle cx="210" cy="100" r="6" fill="#EF4444"/>
        <circle cx="230" cy="100" r="6" fill="#F59E0B"/>
        <circle cx="250" cy="100" r="6" fill="#10B981"/>
        <line x1="220" y1="150" x2="320" y2="150" stroke="${secondary}" stroke-width="4" stroke-linecap="round"/>
        <line x1="220" y1="180" x2="480" y2="180" stroke="${accent}" stroke-width="3" stroke-linecap="round"/>
        <line x1="260" y1="210" x2="400" y2="210" stroke="#A855F7" stroke-width="3" stroke-linecap="round"/>
        <line x1="260" y1="240" x2="350" y2="240" stroke="#FFF" stroke-width="3" stroke-linecap="round"/>
        <line x1="220" y1="270" x2="520" y2="270" stroke="${accent}" stroke-width="3" stroke-linecap="round"/>
        <!-- Laptop Base -->
        <polygon points="120,340 680,340 640,365 160,365" fill="${accent}" fill-opacity="0.6" stroke="${secondary}" stroke-width="2"/>
        <line x1="360" y1="352" x2="440" y2="352" stroke="#FFF" stroke-width="3" stroke-linecap="round"/>
      `;
    case 'music':
      return `
        <!-- Sound Waves & Concert Stage -->
        <circle cx="400" cy="200" r="90" fill="${accent}" fill-opacity="0.15" stroke="${accent}" stroke-width="2"/>
        <circle cx="400" cy="200" r="60" fill="none" stroke="${secondary}" stroke-width="3" stroke-dasharray="8 6"/>
        <circle cx="400" cy="200" r="30" fill="${accent}" opacity="0.8"/>
        <!-- Equalizer Bars -->
        <rect x="220" y="240" width="16" height="80" rx="8" fill="${accent}"/>
        <rect x="260" y="190" width="16" height="130" rx="8" fill="${secondary}"/>
        <rect x="300" y="150" width="16" height="170" rx="8" fill="${accent}"/>
        <rect x="340" y="110" width="16" height="210" rx="8" fill="#FFF"/>
        <rect x="444" y="110" width="16" height="210" rx="8" fill="#FFF"/>
        <rect x="484" y="150" width="16" height="170" rx="8" fill="${accent}"/>
        <rect x="524" y="190" width="16" height="130" rx="8" fill="${secondary}"/>
        <rect x="564" y="240" width="16" height="80" rx="8" fill="${accent}"/>
        <!-- Music Notes -->
        <path d="M400,100 L400,180 A20,20 0 1,1 370,160 L370,110 L440,95 L440,165 A20,20 0 1,1 410,145 L410,100 Z" fill="${secondary}"/>
      `;
    case 'dance':
      return `
        <!-- Dynamic Rhythmic Ribbons -->
        <path d="M200,320 C280,100 360,340 440,120 C520,300 600,80 640,240" fill="none" stroke="${accent}" stroke-width="6" stroke-linecap="round"/>
        <path d="M220,300 C300,120 380,320 460,140 C540,280 620,100 660,260" fill="none" stroke="${secondary}" stroke-width="3" stroke-linecap="round" stroke-dasharray="6 4"/>
        <circle cx="440" cy="120" r="14" fill="#FFF"/>
        <circle cx="520" cy="240" r="18" fill="${secondary}" fill-opacity="0.8"/>
        <circle cx="360" cy="220" r="10" fill="${accent}"/>
      `;
    case 'theatre':
      return `
        <!-- Drama Comedy & Tragedy Masks -->
        <ellipse cx="330" cy="200" rx="65" ry="85" fill="${accent}" fill-opacity="0.25" stroke="${accent}" stroke-width="3"/>
        <circle cx="310" cy="180" r="8" fill="#FFF"/>
        <circle cx="350" cy="180" r="8" fill="#FFF"/>
        <path d="M305,230 Q330,260 355,230" fill="none" stroke="#FFF" stroke-width="4" stroke-linecap="round"/>
        
        <ellipse cx="470" cy="220" rx="65" ry="85" fill="${secondary}" fill-opacity="0.25" stroke="${secondary}" stroke-width="3"/>
        <circle cx="450" cy="200" r="8" fill="#FFF"/>
        <circle cx="490" cy="200" r="8" fill="#FFF"/>
        <path d="M445,255 Q470,225 495,255" fill="none" stroke="#FFF" stroke-width="4" stroke-linecap="round"/>
      `;
    case 'pitch':
    case 'bplan':
      return `
        <!-- Business Growth Chart & Pitch Spotlight -->
        <rect x="220" y="100" width="360" height="220" rx="16" fill="#06070a" stroke="${accent}" stroke-width="2"/>
        <polyline points="260,260 330,220 400,240 480,150 540,130" fill="none" stroke="${secondary}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        <polygon points="520,130 545,130 545,155" fill="${secondary}"/>
        <!-- Bars -->
        <rect x="260" y="260" width="24" height="40" rx="4" fill="${accent}" fill-opacity="0.5"/>
        <rect x="330" y="220" width="24" height="80" rx="4" fill="${accent}" fill-opacity="0.6"/>
        <rect x="400" y="240" width="24" height="60" rx="4" fill="${accent}" fill-opacity="0.7"/>
        <rect x="480" y="150" width="24" height="150" rx="4" fill="${secondary}" fill-opacity="0.8"/>
      `;
    case 'ai-brain':
      return `
        <!-- AI Synapse Network -->
        <circle cx="400" cy="200" r="90" fill="none" stroke="${accent}" stroke-width="2" stroke-dasharray="6 6"/>
        <circle cx="400" cy="200" r="40" fill="${accent}" fill-opacity="0.3" stroke="#FFF" stroke-width="2"/>
        <circle cx="320" cy="140" r="16" fill="${secondary}"/>
        <circle cx="480" cy="140" r="16" fill="${accent}"/>
        <circle cx="320" cy="260" r="16" fill="${accent}"/>
        <circle cx="480" cy="260" r="16" fill="${secondary}"/>
        <circle cx="400" cy="90" r="12" fill="#FFF"/>
        <circle cx="400" cy="310" r="12" fill="#FFF"/>
        <!-- Links -->
        <line x1="320" y1="140" x2="400" y2="200" stroke="${accent}" stroke-width="2"/>
        <line x1="480" y1="140" x2="400" y2="200" stroke="${secondary}" stroke-width="2"/>
        <line x1="320" y1="260" x2="400" y2="200" stroke="${secondary}" stroke-width="2"/>
        <line x1="480" y1="260" x2="400" y2="200" stroke="${accent}" stroke-width="2"/>
        <line x1="400" y1="90" x2="400" y2="200" stroke="#FFF" stroke-width="2"/>
        <line x1="400" y1="310" x2="400" y2="200" stroke="#FFF" stroke-width="2"/>
      `;
    case 'dna-helix':
      return `
        <!-- DNA Double Helix -->
        <path d="M280,100 C340,160 340,240 280,300 C220,360 220,440 280,500" fill="none" stroke="${accent}" stroke-width="4"/>
        <path d="M520,100 C460,160 460,240 520,300 C580,360 580,440 520,500" fill="none" stroke="${secondary}" stroke-width="4"/>
        <line x1="300" y1="130" x2="500" y2="130" stroke="#FFF" stroke-width="3"/>
        <line x1="335" y1="200" x2="465" y2="200" stroke="${accent}" stroke-width="3"/>
        <line x1="300" y1="270" x2="500" y2="270" stroke="${secondary}" stroke-width="3"/>
        <line x1="335" y1="340" x2="465" y2="340" stroke="#FFF" stroke-width="3"/>
      `;
    case 'architecture':
      return `
        <!-- Architectural Calipers & Arches -->
        <path d="M260,320 L400,100 L540,320" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round"/>
        <circle cx="400" cy="100" r="14" fill="${secondary}"/>
        <path d="M310,240 A120,120 0 0,1 490,240" fill="none" stroke="#FFF" stroke-width="3"/>
        <line x1="280" y1="320" x2="520" y2="320" stroke="${secondary}" stroke-width="3"/>
      `;
    case 'trophy':
    case 'competitions':
      return `
        <!-- Victory Cup Podium -->
        <path d="M320,100 L480,100 L460,210 C460,260 410,290 400,290 C390,290 340,260 340,210 Z" fill="${accent}" fill-opacity="0.8" stroke="#FFF" stroke-width="3"/>
        <!-- Handles -->
        <path d="M330,120 C270,120 270,200 345,200" fill="none" stroke="${secondary}" stroke-width="4"/>
        <path d="M470,120 C530,120 530,200 455,200" fill="none" stroke="${secondary}" stroke-width="4"/>
        <!-- Base -->
        <rect x="385" y="290" width="30" height="40" fill="#FFF"/>
        <rect x="340" y="330" width="120" height="24" rx="6" fill="${secondary}"/>
      `;
    case 'law-justice':
      return `
        <!-- Justice Scales -->
        <line x1="400" y1="80" x2="400" y2="330" stroke="#FFF" stroke-width="5"/>
        <line x1="270" y1="140" x2="530" y2="140" stroke="${secondary}" stroke-width="4"/>
        <circle cx="400" cy="80" r="12" fill="${accent}"/>
        <!-- Left Pan -->
        <line x1="270" y1="140" x2="230" y2="220" stroke="${accent}" stroke-width="2"/>
        <line x1="270" y1="140" x2="310" y2="220" stroke="${accent}" stroke-width="2"/>
        <path d="M220,220 Q270,260 320,220 Z" fill="${accent}" opacity="0.8"/>
        <!-- Right Pan -->
        <line x1="530" y1="140" x2="490" y2="220" stroke="${accent}" stroke-width="2"/>
        <line x1="530" y1="140" x2="570" y2="220" stroke="${accent}" stroke-width="2"/>
        <path d="M480,220 Q530,260 580,220 Z" fill="${accent}" opacity="0.8"/>
        <rect x="350" y="330" width="100" height="18" rx="6" fill="${secondary}"/>
      `;
    case 'ncc-camp':
    case 'ncc-parade':
    case 'ncc-obstacle':
    case 'ncc-crest':
      return `
        <!-- Tactical Military Shield & Chevrons -->
        <path d="M400,80 L520,130 L520,240 C520,310 400,360 400,360 C400,360 280,310 280,240 L280,130 Z" fill="${accent}" fill-opacity="0.3" stroke="#FFF" stroke-width="3"/>
        <path d="M330,170 L400,230 L470,170" fill="none" stroke="${secondary}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M330,210 L400,270 L470,210" fill="none" stroke="#FFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      `;
    case 'nss-wheel':
    case 'megaphone':
    case 'light-beam':
    case 'service-hands':
      return `
        <!-- NSS Sun-Chariot Wheel Badge -->
        <circle cx="400" cy="200" r="100" fill="none" stroke="${accent}" stroke-width="5"/>
        <circle cx="400" cy="200" r="75" fill="${accent}" fill-opacity="0.2" stroke="${secondary}" stroke-width="2"/>
        <circle cx="400" cy="200" r="30" fill="${secondary}"/>
        <!-- 8 Spokes -->
        <line x1="400" y1="100" x2="400" y2="300" stroke="#FFF" stroke-width="3"/>
        <line x1="300" y1="200" x2="500" y2="200" stroke="#FFF" stroke-width="3"/>
        <line x1="329" y1="129" x2="471" y2="271" stroke="#FFF" stroke-width="3"/>
        <line x1="329" y1="271" x2="471" y2="129" stroke="#FFF" stroke-width="3"/>
      `;
    case 'catwalk':
    case 'fashion-rack':
    case 'haute-couture':
      return `
        <!-- Haute Couture Runway & Spotlight -->
        <polygon points="340,360 460,360 420,140 380,140" fill="${accent}" opacity="0.6"/>
        <ellipse cx="400" cy="140" rx="40" ry="12" fill="${secondary}"/>
        <!-- Spotlights -->
        <line x1="200" y1="60" x2="380" y2="240" stroke="#FFF" stroke-width="2" stroke-opacity="0.4"/>
        <line x1="600" y1="60" x2="420" y2="240" stroke="#FFF" stroke-width="2" stroke-opacity="0.4"/>
        <circle cx="200" cy="60" r="14" fill="${accent}"/>
        <circle cx="600" cy="60" r="14" fill="${secondary}"/>
      `;
    default:
      return `
        <!-- Universal Discovery Prism -->
        <polygon points="400,90 530,310 270,310" fill="${accent}" fill-opacity="0.25" stroke="${accent}" stroke-width="3"/>
        <polygon points="400,90 470,310 330,310" fill="${secondary}" fill-opacity="0.35" stroke="${secondary}" stroke-width="2"/>
        <circle cx="400" cy="90" r="12" fill="#FFF"/>
        <circle cx="530" cy="310" r="10" fill="${secondary}"/>
        <circle cx="270" cy="310" r="10" fill="${accent}"/>
      `;
  }
}

// Generate an ultra-premium SVG template for 16:9 widescreen (1280x720)
function generateSubcategorySvg(categoryKey, categoryName, sub) {
  const width = 1280;
  const height = 720;
  const accent = sub.accent || '#38BDF8';
  const brandOrange = '#FF6B00';

  const iconSvg = getIconSvg(sub.icon, accent);
  const safeCatName = escapeXml(categoryName.toUpperCase());
  const safeSubName = escapeXml(sub.name);

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Background Radial & Linear Gradients -->
        <radialGradient id="bgGlow" cx="50%" cy="45%" r="70%">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.22"/>
          <stop offset="45%" stop-color="${brandOrange}" stop-opacity="0.08"/>
          <stop offset="80%" stop-color="#0c0d12" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="#050608" stop-opacity="1"/>
        </radialGradient>
        <linearGradient id="gradSpot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFF" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="glassBorder" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#FFF" stop-opacity="0.45"/>
          <stop offset="50%" stop-color="${brandOrange}" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="${accent}" stop-opacity="0.15"/>
        </linearGradient>
        
        <!-- Filter glow -->
        <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="30" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      <!-- Base Canvas Background -->
      <rect width="${width}" height="${height}" fill="#06070a"/>
      <rect width="${width}" height="${height}" fill="url(#bgGlow)"/>

      <!-- Ambient Decorative Circles & Tech Mesh Grid -->
      <g opacity="0.15">
        <circle cx="150" cy="150" r="300" fill="none" stroke="${accent}" stroke-width="1.5" stroke-dasharray="8 8"/>
        <circle cx="1130" cy="570" r="280" fill="none" stroke="${brandOrange}" stroke-width="1.5" stroke-dasharray="6 6"/>
        <line x1="0" y1="200" x2="1280" y2="200" stroke="#FFF" stroke-width="0.5" stroke-dasharray="4 16"/>
        <line x1="0" y1="520" x2="1280" y2="520" stroke="#FFF" stroke-width="0.5" stroke-dasharray="4 16"/>
        <line x1="280" y1="0" x2="280" y2="720" stroke="#FFF" stroke-width="0.5" stroke-dasharray="4 16"/>
        <line x1="1000" y1="0" x2="1000" y2="720" stroke="#FFF" stroke-width="0.5" stroke-dasharray="4 16"/>
      </g>

      <!-- Center Apple Glassmorphic Frame -->
      <g transform="translate(240, 100)">
        <!-- Frosted Glass Backing -->
        <rect x="0" y="0" width="800" height="480" rx="28" fill="#0d0e14" fill-opacity="0.6" stroke="url(#glassBorder)" stroke-width="1.5"/>
        
        <!-- Central Art Illustration Area -->
        <g transform="translate(0, 10)">
          ${iconSvg}
        </g>
      </g>

      <!-- Top-Left Category Badge -->
      <g transform="translate(60, 50)">
        <rect x="0" y="0" width="240" height="38" rx="19" fill="#12131a" fill-opacity="0.85" stroke="url(#glassBorder)" stroke-width="1.2"/>
        <circle cx="20" cy="19" r="6" fill="${brandOrange}"/>
        <text x="36" y="24" fill="#E2E8F0" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="700" letter-spacing="1.2">
          ${safeCatName}
        </text>
      </g>

      <!-- Top-Right LPU Events Watermark Badge -->
      <g transform="translate(1040, 50)">
        <rect x="0" y="0" width="180" height="38" rx="19" fill="#12131a" fill-opacity="0.85" stroke="url(#glassBorder)" stroke-width="1.2"/>
        <rect x="16" y="12" width="14" height="14" rx="4" fill="${brandOrange}"/>
        <text x="38" y="24" fill="#94A3B8" font-family="Outfit, Inter, sans-serif" font-size="13" font-weight="600" letter-spacing="0.5">
          LPU EVENTS
        </text>
      </g>

      <!-- Bottom Subcategory Banner Glass Strip -->
      <g transform="translate(240, 600)">
        <rect x="0" y="0" width="800" height="64" rx="20" fill="#0d0e14" fill-opacity="0.9" stroke="url(#glassBorder)" stroke-width="1.5"/>
        <circle cx="36" cy="32" r="8" fill="${accent}"/>
        <text x="58" y="39" fill="#FFFFFF" font-family="Outfit, Inter, sans-serif" font-size="22" font-weight="700" letter-spacing="0.5">
          ${safeSubName}
        </text>
        <text x="760" y="38" text-anchor="end" fill="#94A3B8" font-family="Inter, sans-serif" font-size="13" font-weight="500">
          Official Default
        </text>
      </g>
    </svg>
  `;
}

// Generate and export all 81 subcategory images
async function generateAll() {
  const studentDir = path.resolve('/Users/subhamkumar/Desktop/lpu1/lpu-events-student/public/defaults/events');
  const monorepoDir = path.resolve('/Users/subhamkumar/Desktop/lpu1/lpu-events/apps/student-web/public/defaults/events');

  fs.mkdirSync(studentDir, { recursive: true });
  fs.mkdirSync(monorepoDir, { recursive: true });

  let totalCount = 0;
  const manifest = {};

  for (const cat of TAXONOMY_CONFIG) {
    manifest[cat.categoryKey] = {
      name: cat.categoryName,
      subcategories: {}
    };

    for (const sub of cat.subcategories) {
      const fileNameBase = `${cat.categoryKey}_${sub.key}`;
      const svgContent = generateSubcategorySvg(cat.categoryKey, cat.categoryName, sub);

      const webpPath1 = path.join(studentDir, `${fileNameBase}.webp`);
      const jpgPath1 = path.join(studentDir, `${fileNameBase}.jpg`);
      const webpPath2 = path.join(monorepoDir, `${fileNameBase}.webp`);
      const jpgPath2 = path.join(monorepoDir, `${fileNameBase}.jpg`);

      // Convert SVG to high-quality WebP and JPG using sharp
      const imageBuffer = Buffer.from(svgContent);
      
      const webpBuf = await sharp(imageBuffer)
        .resize(1280, 720)
        .webp({ quality: 90, effort: 6 })
        .toBuffer();

      const jpgBuf = await sharp(imageBuffer)
        .resize(1280, 720)
        .jpeg({ quality: 90 })
        .toBuffer();

      fs.writeFileSync(webpPath1, webpBuf);
      fs.writeFileSync(jpgPath1, jpgBuf);
      fs.writeFileSync(webpPath2, webpBuf);
      fs.writeFileSync(jpgPath2, jpgBuf);

      manifest[cat.categoryKey].subcategories[sub.key] = {
        name: sub.name,
        webp: `/defaults/events/${fileNameBase}.webp`,
        jpg: `/defaults/events/${fileNameBase}.jpg`,
        accent: sub.accent
      };

      totalCount++;
    }

    // Also generate Category Level Default Image
    const catDefaultName = `${cat.categoryKey}_default`;
    const catDefaultSub = {
      key: 'default',
      name: cat.categoryName,
      accent: cat.subcategories[0]?.accent || '#38BDF8',
      icon: 'discovery-prism'
    };
    const catSvg = generateSubcategorySvg(cat.categoryKey, cat.categoryName, catDefaultSub);
    const catImgBuf = Buffer.from(catSvg);
    const catWebp = await sharp(catImgBuf).resize(1280, 720).webp({ quality: 90 }).toBuffer();
    const catJpg = await sharp(catImgBuf).resize(1280, 720).jpeg({ quality: 90 }).toBuffer();

    fs.writeFileSync(path.join(studentDir, `${catDefaultName}.webp`), catWebp);
    fs.writeFileSync(path.join(studentDir, `${catDefaultName}.jpg`), catJpg);
    fs.writeFileSync(path.join(monorepoDir, `${catDefaultName}.webp`), catWebp);
    fs.writeFileSync(path.join(monorepoDir, `${catDefaultName}.jpg`), catJpg);
  }

  // Also create a global general default
  const generalSvg = generateSubcategorySvg('events', 'LPU Events Discovery', {
    key: 'general',
    name: 'Campus Event Discovery',
    accent: '#FF6B00',
    icon: 'discovery-prism'
  });
  const genBuf = Buffer.from(generalSvg);
  const genWebp = await sharp(genBuf).resize(1280, 720).webp({ quality: 90 }).toBuffer();
  const genJpg = await sharp(genBuf).resize(1280, 720).jpeg({ quality: 90 }).toBuffer();
  fs.writeFileSync(path.join(studentDir, `general_default.webp`), genWebp);
  fs.writeFileSync(path.join(studentDir, `general_default.jpg`), genJpg);
  fs.writeFileSync(path.join(monorepoDir, `general_default.webp`), genWebp);
  fs.writeFileSync(path.join(monorepoDir, `general_default.jpg`), genJpg);

  // Write manifest
  fs.writeFileSync(path.join(studentDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(monorepoDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`Successfully generated and exported ${totalCount} subcategory default images + 13 category defaults + 1 general default!`);
}

generateAll().catch(err => {
  console.error("Generation error:", err);
  process.exit(1);
});
