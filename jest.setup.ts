import '@testing-library/jest-dom';

jest.mock('next/font/google', () => ({
  Fraunces: () => ({ variable: '--font-display', className: 'mock-display' }),
  Newsreader: () => ({ variable: '--font-body', className: 'mock-body' }),
  JetBrains_Mono: () => ({ variable: '--font-mono', className: 'mock-mono' }),
  Bricolage_Grotesque: () => ({ variable: '--font-observatory', className: 'mock-observatory' }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn(), forward: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
