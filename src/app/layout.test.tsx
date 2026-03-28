import { renderToStaticMarkup } from "react-dom/server.node";
import RootLayout from './layout';

describe('RootLayout', () => {
  it('renders html wrapper and children content', () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <div>Test Content</div>
      </RootLayout>
    );

    expect(markup).toContain('lang="en"');
    expect(markup).toContain("Test Content");
  });
});
