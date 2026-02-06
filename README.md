# Personal Portfolio

A minimalist personal portfolio website built with Next.js 16 and React 19.

## Tech Stack

- **Framework**: Next.js 16.1.4 with App Router
- **Language**: TypeScript 5
- **UI Library**: React 19.2.3
- **Styling**: Tailwind CSS v4 with @tailwindcss/postcss
- **Animations**: Framer Motion 12.29.0
- **Icons**: Lucide React 0.563.0
- **Utilities**: clsx 2.1.1, tailwind-merge 3.4.0
- **Linting**: ESLint 9 with eslint-config-next

## Features

- Clean, minimalist design with dark theme
- Smooth scroll animations and transitions using Framer Motion
- Page transition effects with AnimatePresence
- Cursor glow effect that follows mouse movement
- Scroll progress indicator at the top
- Back to top button
- Responsive layout for all devices
- SEO optimized with comprehensive metadata
- Google Fonts (Inter, JetBrains Mono)
- Open Graph and Twitter card support

## Project Structure

```
website/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main landing page with all sections
│   │   ├── layout.tsx            # Root layout with fonts and metadata
│   │   ├── globals.css           # Global styles and CSS variables
│   │   └── links/                # Links page component
│   ├── components/
│   │   ├── hero.tsx              # Hero section with intro
│   │   ├── about.tsx             # About section
│   │   ├── projects.tsx          # Projects showcase
│   │   ├── personal.tsx          # Personal section
│   │   ├── contact.tsx           # Contact section
│   │   ├── nav.tsx               # Navigation bar
│   │   ├── footer.tsx            # Footer
│   │   ├── scroll-reveal.tsx     # Scroll animation wrapper
│   │   ├── page-transition.tsx   # Page transition effects
│   │   ├── cursor-glow.tsx       # Mouse-following glow effect
│   │   ├── scroll-progress.tsx   # Progress bar at top
│   │   └── back-to-top.tsx       # Back to top button
│   └── components/ui/
│       └── tabs.tsx              # Tab component
├── public/                       # Static assets (favicon, images)
├── next.config.js
├── package.json
├── tsconfig.json
└── tailwind.config.ts
```

## NPM Scripts

```bash
npm run dev      # Start development server on default port
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint with Next.js config
```

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

## Deployment

This project is deployed on Vercel. Simply push to the main branch to trigger automatic deployment.

## Author

**Preyam Rao** - Software Engineer
- IIT Kharagpur '23
- Ex-Oracle
- Candidate Master @ Codeforces
- [GitHub](https://github.com/preyam2002)

## License

MIT
