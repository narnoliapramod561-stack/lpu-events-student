# LPU Events — Student Discovery Portal

The official student web platform for **LPU Events** — discover campus events, workshops, hackathons, cultural fests, clubs, and real-time updates at Lovely Professional University.

## 🚀 Features

- **Live Event Discovery**: Real-time event feeds, search, and category filtering.
- **Happening Today Slider**: Dynamic marquee for today's active campus activities.
- **Featured Hero Carousel**: Promoted events, student announcements, and notices.
- **Dynamic Sponsor Banners**: Partner and sponsor showcases.
- **Fast & Responsive**: Built with Vite, React 18, Tailwind CSS, and Framer Motion.
- **Analytics & Error Tracking**: Integrated PostHog, Microsoft Clarity, and Sentry.

## 🛠️ Tech Stack

- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS (v4)
- **State & Data**: Supabase Client
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Telemetry**: PostHog, Sentry, Microsoft Clarity

## 📦 Getting Started

### 1. Prerequisites
- Node.js (v18+)
- npm or pnpm

### 2. Installation
```bash
git clone https://github.com/narnoliapramod561-stack/lpu-events-student.git
cd lpu-events-student
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Update `.env` with your Supabase credentials:
```env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 4. Development Server
```bash
npm run dev
```
The application will run at `http://localhost:3000`.

### 5. Production Build
```bash
npm run build
npm run preview
```

## 🗄️ Database & Schema
The `supabase/` directory contains all SQL migrations, seed data, and schema definitions for running the backend locally or deploying to Supabase.
