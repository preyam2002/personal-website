import { render, screen } from '@testing-library/react';
import LinksPage from './page';

// Mock next/link
jest.mock('next/link', () => {
  const MockedLink = ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  );
  MockedLink.displayName = 'MockedLink';
  return MockedLink;
});

// Mock framer-motion with proper handling of animation props
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLProps<HTMLDivElement> & { children: React.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
    section: ({ children, ...props }: React.HTMLProps<HTMLElement> & { children: React.ReactNode }) => (
      <section {...props}>{children}</section>
    ),
  },
}));

describe('LinksPage', () => {
  it('renders the page title', () => {
    render(<LinksPage />);
    expect(screen.getByText('Curated')).toBeInTheDocument();
    expect(screen.getByText('resources')).toBeInTheDocument();
  });

  it('renders the description', () => {
    render(<LinksPage />);
    expect(screen.getByText(/A collection of tools/)).toBeInTheDocument();
  });

  it('renders all link categories', () => {
    render(<LinksPage />);
    expect(screen.getByText('Development')).toBeInTheDocument();
    expect(screen.getByText('Design')).toBeInTheDocument();
    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(screen.getByText('Reading')).toBeInTheDocument();
  });

  it('renders specific links', () => {
    render(<LinksPage />);
    expect(screen.getByText('HackerNews')).toBeInTheDocument();
    expect(screen.getByText('GitHub Trending')).toBeInTheDocument();
    expect(screen.getByText('Awwwards')).toBeInTheDocument();
    expect(screen.getByText('Paul Graham')).toBeInTheDocument();
  });

  it('has working back link to home', () => {
    render(<LinksPage />);
    const backLink = screen.getByText('Back to Home');
    expect(backLink).toBeInTheDocument();
    expect(backLink.closest('a')).toHaveAttribute('href', '/');
  });

  it('renders external links with correct attributes', () => {
    render(<LinksPage />);
    const hackerNewsLink = screen.getByText('HackerNews').closest('a');
    expect(hackerNewsLink).toHaveAttribute('href', 'https://news.ycombinator.com');
    expect(hackerNewsLink).toHaveAttribute('target', '_blank');
    expect(hackerNewsLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders footer with copyright', () => {
    render(<LinksPage />);
    expect(screen.getByText(/2026 PREYAM RAO/)).toBeInTheDocument();
  });
});
