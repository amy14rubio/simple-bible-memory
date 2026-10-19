import { describe, expect, it, vi } from 'vitest';
import { handleBack } from './backButton';

describe('the Android back button', () => {
  it('goes back a screen when there is one to go back to', () => {
    const goBack = vi.fn();
    const exit = vi.fn();
    handleBack({ canGoBack: true }, goBack, exit);
    expect(goBack).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
  });

  it('leaves the app only from the first screen', () => {
    const goBack = vi.fn();
    const exit = vi.fn();
    handleBack({ canGoBack: false }, goBack, exit);
    expect(exit).toHaveBeenCalledOnce();
    expect(goBack).not.toHaveBeenCalled();
  });
});
