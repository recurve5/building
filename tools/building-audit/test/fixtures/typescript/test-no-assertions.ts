import { describe, it } from 'vitest';
import { renderWidget } from '../src/widget';

describe('Widget', () => {
  it('should render without crashing', () => {
    const widget = renderWidget({ type: 'counter' });
    console.log('Widget rendered:', widget);
  });

  it('should handle click events', () => {
    const widget = renderWidget({ type: 'button' });
    widget.click();
    // no assertion here
  });
});
