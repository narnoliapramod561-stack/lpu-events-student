import { CategoryFeedItem } from "@lpu-events/shared";

export const OFFICIAL_PLATFORM_CATEGORIES: CategoryFeedItem[] = [
  {
    id: "c4444444-4444-4444-4444-444444444444",
    key: "academics",
    name: "Academics",
    sort_order: 1,
    subcategories: [
      { id: "ba100001-0000-0000-0000-000000000001", key: "seminar", name: "Seminar", sort_order: 1 },
      { id: "ba100001-0000-0000-0000-000000000002", key: "guest-lecture", name: "Guest Lecture", sort_order: 2 },
      { id: "b5555555-5555-5555-5555-555555555555", key: "workshop", name: "Workshop", sort_order: 3 },
      { id: "ba100001-0000-0000-0000-000000000003", key: "internship", name: "Internship", sort_order: 4 },
      { id: "ba100001-0000-0000-0000-000000000004", key: "capstone", name: "Capstone", sort_order: 5 },
      { id: "ba100001-0000-0000-0000-000000000005", key: "others", name: "Others", sort_order: 6 }
    ]
  },
  {
    id: "c2222222-2222-2222-2222-222222222222",
    key: "cultural",
    name: "Cultural",
    sort_order: 2,
    subcategories: [
      { id: "b3333333-3333-3333-3333-333333333333", key: "music", name: "Music", sort_order: 1 },
      { id: "b2020002-0000-0000-0000-000000000001", key: "dance", name: "Dance", sort_order: 2 },
      { id: "b2020002-0000-0000-0000-000000000002", key: "theatre", name: "Theatre", sort_order: 3 },
      { id: "ba200002-0000-0000-0000-000000000001", key: "social-media", name: "Social Media", sort_order: 4 },
      { id: "ba200002-0000-0000-0000-000000000002", key: "others", name: "Others", sort_order: 5 }
    ]
  },
  {
    id: "c1111111-1111-1111-1111-111111111111",
    key: "innovation",
    name: "Innovation",
    sort_order: 3,
    subcategories: [
      { id: "b1111111-1111-1111-1111-111111111111", key: "hackathon", name: "Hackathon", sort_order: 1 },
      { id: "b2222222-2222-2222-2222-222222222222", key: "technical-events", name: "Technical Events", sort_order: 2 },
      { id: "ba300003-0000-0000-0000-000000000001", key: "project-expo", name: "Project Expo", sort_order: 3 },
      { id: "ba300003-0000-0000-0000-000000000002", key: "workshop", name: "Workshop", sort_order: 4 },
      { id: "ba300003-0000-0000-0000-000000000003", key: "seminar", name: "Seminar", sort_order: 5 },
      { id: "ba300003-0000-0000-0000-000000000004", key: "others", name: "Others", sort_order: 6 }
    ]
  },
  {
    id: "c4000000-0000-0000-0000-000000000001",
    key: "entrepreneurship",
    name: "Entrepreneurship",
    sort_order: 4,
    subcategories: [
      { id: "ba400004-0000-0000-0000-000000000001", key: "b-plan", name: "B-Plan Competition", sort_order: 1 },
      { id: "ba400004-0000-0000-0000-000000000002", key: "pitch-fest", name: "Pitch Fest", sort_order: 2 },
      { id: "ba400004-0000-0000-0000-000000000003", key: "conclave", name: "Conclave", sort_order: 3 },
      { id: "ba400004-0000-0000-0000-000000000004", key: "bootcamp", name: "Bootcamp", sort_order: 4 },
      { id: "ba400004-0000-0000-0000-000000000005", key: "panel-discussion", name: "Panel Discussion", sort_order: 5 },
      { id: "ba400004-0000-0000-0000-000000000006", key: "expo", name: "Expo", sort_order: 6 },
      { id: "ba400004-0000-0000-0000-000000000007", key: "seminar", name: "Seminar", sort_order: 7 },
      { id: "ba400004-0000-0000-0000-000000000008", key: "others", name: "Others", sort_order: 8 }
    ]
  },
  {
    id: "c5000000-0000-0000-0000-000000000001",
    key: "schools",
    name: "Schools",
    sort_order: 5,
    subcategories: [
      // Engineering & Technology
      { id: "ba500005-0000-0000-0000-000000000001", key: "school-ai-emerging", name: "School of AI and Emerging Technologies", sort_order: 1 },
      { id: "ba500005-0000-0000-0000-000000000002", key: "school-bio", name: "School of Bio Engineering and Biosciences", sort_order: 2 },
      { id: "ba500005-0000-0000-0000-000000000003", key: "school-chemical", name: "School of Chemical Engineering and Physical Sciences", sort_order: 3 },
      { id: "ba500005-0000-0000-0000-000000000004", key: "school-ca", name: "School of Computer Applications", sort_order: 4 },
      { id: "ba500005-0000-0000-0000-000000000005", key: "school-cse", name: "School of Computer Science and Engineering", sort_order: 5 },
      { id: "ba500005-0000-0000-0000-000000000006", key: "school-cai", name: "School of Computing and Artificial Intelligence", sort_order: 6 },
      { id: "ba500005-0000-0000-0000-000000000007", key: "school-eee", name: "School of Electronics and Electrical Engineering", sort_order: 7 },
      { id: "ba500005-0000-0000-0000-000000000008", key: "school-me", name: "School of Mechanical Engineering", sort_order: 8 },
      
      // Arts, Design & Architecture
      { id: "ba500005-0000-0000-0000-000000000009", key: "school-arch", name: "Lovely School of Architecture and Design", sort_order: 9 },
      { id: "ba500005-0000-0000-0000-000000000010", key: "school-design-fashion", name: "School of Design (Fashion Design & Technology)", sort_order: 10 },
      { id: "ba500005-0000-0000-0000-000000000011", key: "school-design-interior", name: "School of Design (Interior & Product Design)", sort_order: 11 },
      { id: "ba500005-0000-0000-0000-000000000012", key: "school-design-multimedia", name: "School of Design (Multimedia)", sort_order: 12 },
      { id: "ba500005-0000-0000-0000-000000000013", key: "school-arts-films", name: "School of Liberal and Creative Arts (Films, Theatre and Music)", sort_order: 13 },
      { id: "ba500005-0000-0000-0000-000000000014", key: "school-arts-fine", name: "School of Liberal and Creative Arts (Fine Arts)", sort_order: 14 },
      { id: "ba500005-0000-0000-0000-000000000015", key: "school-arts-journalism", name: "School of Liberal and Creative Arts (Journalism and Mass Communication)", sort_order: 15 },
      { id: "ba500005-0000-0000-0000-000000000016", key: "school-arts-social", name: "School of Liberal and Creative Arts (Social Sciences and Languages)", sort_order: 16 },

      // Business, Law & Management
      { id: "ba500005-0000-0000-0000-000000000017", key: "school-business", name: "Mittal School of Business", sort_order: 17 },
      { id: "ba500005-0000-0000-0000-000000000018", key: "school-agriculture", name: "School of Agriculture", sort_order: 18 },
      { id: "ba500005-0000-0000-0000-000000000019", key: "school-hotel-tourism", name: "School of Hotel Management and Tourism", sort_order: 19 },
      { id: "ba500005-0000-0000-0000-000000000020", key: "school-law", name: "School of Law", sort_order: 20 },

      // Health, Education & Professional
      { id: "ba500005-0000-0000-0000-000000000021", key: "school-medical", name: "School of Allied Medical Sciences", sort_order: 21 },
      { id: "ba500005-0000-0000-0000-000000000022", key: "school-education", name: "School of Education", sort_order: 22 },
      { id: "ba500005-0000-0000-0000-000000000023", key: "school-phys-ed", name: "School of Education (Physical Education)", sort_order: 23 },
      { id: "ba500005-0000-0000-0000-000000000024", key: "school-pharma", name: "School of Pharmaceutical Sciences", sort_order: 24 },
      { id: "ba500005-0000-0000-0000-000000000025", key: "school-polytechnic", name: "School of Polytechnic", sort_order: 25 }
    ]
  },
  {
    id: "c6000000-0000-0000-0000-000000000001",
    key: "community-services",
    name: "Community Services",
    sort_order: 6,
    subcategories: [
      { id: "ba600006-0000-0000-0000-000000000001", key: "donation-drives", name: "Donation Drives", sort_order: 1 },
      { id: "ba600006-0000-0000-0000-000000000002", key: "environment", name: "Environment", sort_order: 2 },
      { id: "ba600006-0000-0000-0000-000000000003", key: "healthcare", name: "Healthcare", sort_order: 3 },
      { id: "ba600006-0000-0000-0000-000000000004", key: "others", name: "Others", sort_order: 4 }
    ]
  },
  {
    id: "c7000000-0000-0000-0000-000000000001",
    key: "day-celebrations",
    name: "Day Celebrations",
    sort_order: 7,
    subcategories: [
      { id: "ba700007-0000-0000-0000-000000000001", key: "national-days", name: "National Days", sort_order: 1 },
      { id: "ba700007-0000-0000-0000-000000000002", key: "cultural-days", name: "Cultural Days", sort_order: 2 },
      { id: "ba700007-0000-0000-0000-000000000003", key: "fest-days", name: "Fest Days", sort_order: 3 },
      { id: "ba700007-0000-0000-0000-000000000004", key: "awareness-days", name: "Awareness Days", sort_order: 4 },
      { id: "ba700007-0000-0000-0000-000000000005", key: "others", name: "Others", sort_order: 5 }
    ]
  },
  {
    id: "c3333333-3333-3333-3333-333333333333",
    key: "co-curricular",
    name: "Co-Curricular",
    sort_order: 8,
    subcategories: [
      { id: "ba800008-0000-0000-0000-000000000001", key: "skill-dev", name: "Skill Development", sort_order: 1 },
      { id: "ba800008-0000-0000-0000-000000000002", key: "certifications", name: "Certifications", sort_order: 2 },
      { id: "ba800008-0000-0000-0000-000000000003", key: "training", name: "Training Programs", sort_order: 3 },
      { id: "b4444444-4444-4444-4444-444444444444", key: "competitions", name: "Competitions", sort_order: 4 },
      { id: "ba800008-0000-0000-0000-000000000004", key: "others", name: "Others", sort_order: 5 }
    ]
  },
  {
    id: "c9000000-0000-0000-0000-000000000001",
    key: "student-clubs",
    name: "Student Clubs & Org",
    sort_order: 9,
    subcategories: [
      { id: "ba900009-0000-0000-0000-000000000001", key: "tech-clubs", name: "Technical Clubs", sort_order: 1 },
      { id: "ba900009-0000-0000-0000-000000000002", key: "cultural-clubs", name: "Cultural Clubs", sort_order: 2 },
      { id: "ba900009-0000-0000-0000-000000000003", key: "startup-clubs", name: "Startup Clubs", sort_order: 3 },
      { id: "ba900009-0000-0000-0000-000000000004", key: "literary-clubs", name: "Literary Clubs", sort_order: 4 },
      { id: "ba900009-0000-0000-0000-000000000005", key: "others", name: "Others", sort_order: 5 }
    ]
  },
  {
    id: "ca000000-0000-0000-0000-000000000001",
    key: "ncc",
    name: "NCC",
    sort_order: 10,
    subcategories: [
      { id: "baa0000a-0000-0000-0000-000000000001", key: "camps", name: "Camps", sort_order: 1 },
      { id: "baa0000a-0000-0000-0000-000000000002", key: "training", name: "Training", sort_order: 2 },
      { id: "baa0000a-0000-0000-0000-000000000003", key: "parades", name: "Parades", sort_order: 3 },
      { id: "baa0000a-0000-0000-0000-000000000004", key: "others", name: "Others", sort_order: 4 }
    ]
  },
  {
    id: "cb000000-0000-0000-0000-000000000001",
    key: "nss",
    name: "NSS",
    sort_order: 11,
    subcategories: [
      { id: "bab0000b-0000-0000-0000-000000000001", key: "social-work", name: "Social Work", sort_order: 1 },
      { id: "bab0000b-0000-0000-0000-000000000002", key: "campaigns", name: "Campaigns", sort_order: 2 },
      { id: "bab0000b-0000-0000-0000-000000000003", key: "awareness-drives", name: "Awareness Drives", sort_order: 3 },
      { id: "bab0000b-0000-0000-0000-000000000004", key: "others", name: "Others", sort_order: 4 }
    ]
  },
  {
    id: "cc000000-0000-0000-0000-000000000001",
    key: "fashion",
    name: "Fashion",
    sort_order: 12,
    subcategories: [
      { id: "bac0000c-0000-0000-0000-000000000001", key: "shows", name: "Shows", sort_order: 1 },
      { id: "bac0000c-0000-0000-0000-000000000002", key: "exhibitions", name: "Exhibitions", sort_order: 2 },
      { id: "bac0000c-0000-0000-0000-000000000003", key: "others", name: "Others", sort_order: 3 }
    ]
  },
  {
    id: "cd000000-0000-0000-0000-000000000001",
    key: "others",
    name: "Others",
    sort_order: 13,
    subcategories: [
      { id: "bad0000d-0000-0000-0000-000000000001", key: "miscellaneous", name: "Miscellaneous Events", sort_order: 1 }
    ]
  }
];

export const SCHOOL_GROUPS = [
  {
    name: "Engineering & Technology",
    schools: [
      "School of AI and Emerging Technologies",
      "School of Bio Engineering and Biosciences",
      "School of Chemical Engineering and Physical Sciences",
      "School of Computer Applications",
      "School of Computer Science and Engineering",
      "School of Computing and Artificial Intelligence",
      "School of Electronics and Electrical Engineering",
      "School of Mechanical Engineering"
    ]
  },
  {
    name: "Arts, Design & Architecture",
    schools: [
      "Lovely School of Architecture and Design",
      "School of Design (Fashion Design & Technology)",
      "School of Design (Interior & Product Design)",
      "School of Design (Multimedia)",
      "School of Liberal and Creative Arts (Films, Theatre and Music)",
      "School of Liberal and Creative Arts (Fine Arts)",
      "School of Liberal and Creative Arts (Journalism and Mass Communication)",
      "School of Liberal and Creative Arts (Social Sciences and Languages)"
    ]
  },
  {
    name: "Business, Law & Management",
    schools: [
      "Mittal School of Business",
      "School of Agriculture",
      "School of Hotel Management and Tourism",
      "School of Law"
    ]
  },
  {
    name: "Health, Education & Professional",
    schools: [
      "School of Allied Medical Sciences",
      "School of Education",
      "School of Education (Physical Education)",
      "School of Pharmaceutical Sciences",
      "School of Polytechnic"
    ]
  }
];
