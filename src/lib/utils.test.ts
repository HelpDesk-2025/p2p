import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('joins plain class name strings', () => {
    expect(cn('flex', 'items-center')).toBe('flex items-center');
  });

  it('drops falsy values (conditional classes)', () => {
    expect(cn('flex', false && 'hidden', undefined, null, 'gap-2')).toBe('flex gap-2');
  });

  it('resolves conflicting Tailwind utilities, keeping the last one', () => {
    // twMerge should collapse conflicting spacing/color utilities instead of
    // emitting both, which is what makes `cn` safe for conditional className overrides.
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
    expect(cn('text-slate-500', 'text-blue-900')).toBe('text-blue-900');
  });
});
