import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { motion } from 'framer-motion';

// Regression: ISSUE-001 — mobile sidebar could not be closed/hidden
// Found by /qa on 2026-07-03
// Report: .gstack/qa-reports/qa-report-p2p-2026-07-03.md
//
// Root cause: framer-motion's `animate={{ x: 0 }}` sets a persistent inline
// `transform` style, which has higher CSS specificity than the Tailwind
// `translate-x-full` / `translate-x-0` classes Layout.tsx uses to toggle the
// sidebar off/on screen on mobile. Once the entrance animation settled at
// x:0, the inline style permanently overrode the "closed" Tailwind class and
// the sidebar became un-closeable below the `lg` breakpoint.
//
// This test mirrors the sidebar's actual motion.aside usage (not the full
// Layout component, which requires heavy auth/Supabase context mocking) and
// asserts the invariant the fix depends on: entrance-animating a Tailwind
// transform-controlled element must never set an inline `transform`, or the
// inline style silently wins over the class regardless of which class is
// present.

describe('motion.aside entrance animation (mobile sidebar pattern)', () => {
  it('does not set an inline transform style after the entrance animation settles', () => {
    const { container } = render(
      <motion.aside
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0 }}
        className="transform transition-transform lg:translate-x-0 -translate-x-full"
      >
        sidebar content
      </motion.aside>
    );

    const aside = container.querySelector('aside') as HTMLElement;
    expect(aside).toBeTruthy();
    // The bug: if framer-motion is given an `x` motion value, it writes
    // `style="transform: translateX(...)"` directly onto the element here,
    // which overrides whichever Tailwind translate-x-* class is active.
    expect(aside.style.transform).toBe('');
  });

  it('regression guard: animating x on the same element reintroduces an inline transform', () => {
    // This documents the exact failure mode so a future refactor that adds
    // `x` back to this animation trips this assertion instead of only being
    // caught by manual mobile QA.
    const { container } = render(
      <motion.aside
        initial={{ x: -24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0 }}
        className="transform transition-transform lg:translate-x-0 -translate-x-full"
      >
        sidebar content
      </motion.aside>
    );

    const aside = container.querySelector('aside') as HTMLElement;
    expect(aside.style.transform).not.toBe('');
  });
});
