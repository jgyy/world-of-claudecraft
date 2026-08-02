import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  anchorChatInputToWrap,
  type ChatInputAnchorTarget,
  type ChatInputAnchorWrap,
  clearChatInputAnchor,
  computeChatInputAnchor,
} from '../src/ui/hud/chat/chat_input_anchor';

const GAP = 6;
// Mirrors CHAT_BOX_LIMITS.minWidth (src/ui/hud/chat/chat_window.ts): the floor a
// manually dragged/resized chat box already enforces, so the never-touched anchor
// path can never get narrower than that.
const MIN_WIDTH = 240;

describe('computeChatInputAnchor', () => {
  it('matches the wrap width and left edge at the 370px cap (viewport >= 1400px)', () => {
    // #chatlog-wrap: width: min(370px, calc(50vw - 330px)); at 1400px viewport
    // width 50vw - 330 = 370, so the cap wins and the wrap is the full 370px.
    expect(computeChatInputAnchor({ left: 12, top: 502, width: 370 }, 720, GAP, MIN_WIDTH)).toEqual(
      {
        left: 12,
        width: 370,
        bottom: 224,
      },
    );
  });

  it('narrows to the wrap width on a sub-1400px desktop viewport (issue #1365)', () => {
    // At a 1200px-wide laptop viewport #chatlog-wrap computes
    // min(370, 50vw - 330) = min(370, 270) = 270px. A never-touched chat input
    // (no manual drag/resize ever ran) must shrink to match, not keep the
    // stock 370px and overhang the narrower window.
    expect(computeChatInputAnchor({ left: 12, top: 502, width: 270 }, 720, GAP, MIN_WIDTH)).toEqual(
      {
        left: 12,
        width: 270,
        bottom: 224,
      },
    );
  });

  it('rounds fractional rect measurements', () => {
    expect(
      computeChatInputAnchor({ left: 12.4, top: 501.6, width: 269.5 }, 720.2, GAP, MIN_WIDTH),
    ).toEqual({
      left: 12,
      width: 270,
      bottom: 225,
    });
  });

  it('floors the width at minWidth on a narrow windowed desktop viewport', () => {
    // At an 800px-wide windowed/split-screen browser (still on the desktop path:
    // mobile-touch is a capability class, not a width breakpoint) the wrap alone
    // computes min(370, 50vw - 330) = min(370, 70) = 70px, which would leave an
    // unusably narrow composer. The floor keeps it at the same 240px a
    // dragged/resized box could never go under (CHAT_BOX_LIMITS.minWidth).
    expect(computeChatInputAnchor({ left: 12, top: 502, width: 70 }, 720, GAP, MIN_WIDTH)).toEqual({
      left: 12,
      width: 240,
      bottom: 224,
    });
  });
});

describe('#chatlog-wrap CSS width floor', () => {
  it('floors the wrap itself at CHAT_BOX_LIMITS.minWidth (240px), matching the anchor clamp', () => {
    // The anchor clamp (above) floors the COMPOSER at MIN_WIDTH, but on a very
    // narrow windowed/split-screen desktop viewport #chatlog-wrap's own CSS
    // width could still measure narrower than that floor (min(370px, calc(50vw
    // - 330px)) has no floor of its own below ~1000px), which would leave the
    // composer wider than the wrap it is meant to match and reintroduce the
    // overhang the anchor module exists to fix. #chatlog-wrap must carry the
    // same 240px floor so the two surfaces can never diverge.
    const css = readFileSync(path.join(__dirname, '../src/styles/hud.css'), 'utf8');
    const match = css.match(/#chatlog-wrap\s*\{[^}]*\bwidth:\s*([^;]+);/);
    expect(match).not.toBeNull();
    expect(match?.[1].trim()).toBe(`max(${MIN_WIDTH}px, min(370px, calc(50vw - 330px)))`);
  });
});

function fakeChatInput(): ChatInputAnchorTarget {
  const style = {
    left: '',
    width: '',
    bottom: '',
    removeProperty(property: string): void {
      if (property === 'left') style.left = '';
      else if (property === 'width') style.width = '';
      else if (property === 'bottom') style.bottom = '';
    },
  };
  return { style };
}

function fakeWrap(rect: { left: number; top: number; width: number; height: number }) {
  return { getBoundingClientRect: () => rect } satisfies ChatInputAnchorWrap;
}

describe('anchorChatInputToWrap', () => {
  it('shrinks a never-touched, hardcoded-width chat input to a narrow wrap (issue #1365)', () => {
    const input = fakeChatInput();
    // Simulates the stock #chat-input CSS (left: 12px; width: 370px) before any
    // anchor pass has ever run, alongside a sub-1400px-viewport #chatlog-wrap.
    input.style.left = '12px';
    input.style.width = '370px';
    const wrap = fakeWrap({ left: 12, top: 502, width: 270, height: 206 });

    const applied = anchorChatInputToWrap(input, wrap, 720, GAP, MIN_WIDTH);

    expect(applied).toBe(true);
    expect(input.style.width).toBe('270px');
    expect(input.style.left).toBe('12px');
    expect(input.style.bottom).toBe('224px');
  });

  it('does not overhang the wrap edge: applied width never exceeds the wrap width', () => {
    const input = fakeChatInput();
    input.style.width = '370px';
    const wrap = fakeWrap({ left: 12, top: 560, width: 300, height: 148 });

    anchorChatInputToWrap(input, wrap, 640, GAP, MIN_WIDTH);

    expect(Number.parseFloat(input.style.width)).toBeLessThanOrEqual(300);
  });

  it('does not write when the wrap has not laid out yet (height <= 0)', () => {
    const input = fakeChatInput();
    const wrap = fakeWrap({ left: 12, top: 0, width: 370, height: 0 });

    const applied = anchorChatInputToWrap(input, wrap, 720, GAP, MIN_WIDTH);

    expect(applied).toBe(false);
    expect(input.style.width).toBe('');
    expect(input.style.left).toBe('');
    expect(input.style.bottom).toBe('');
  });
});

describe('clearChatInputAnchor', () => {
  it('removes a prior desktop anchor pass so touch CSS placement can take over', () => {
    const input = fakeChatInput();
    const wrap = fakeWrap({ left: 12, top: 502, width: 270, height: 206 });
    anchorChatInputToWrap(input, wrap, 720, GAP, MIN_WIDTH);
    expect(input.style.left).toBe('12px');
    expect(input.style.width).toBe('270px');
    expect(input.style.bottom).toBe('224px');

    clearChatInputAnchor(input);

    expect(input.style.left).toBe('');
    expect(input.style.width).toBe('');
    expect(input.style.bottom).toBe('');
  });
});
