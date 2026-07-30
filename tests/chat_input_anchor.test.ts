import { describe, expect, it } from 'vitest';
import {
  anchorChatInputToWrap,
  type ChatInputAnchorTarget,
  type ChatInputAnchorWrap,
  clearChatInputAnchor,
  computeChatInputAnchor,
} from '../src/ui/hud/chat/chat_input_anchor';

const GAP = 6;

describe('computeChatInputAnchor', () => {
  it('matches the wrap width and left edge at the 370px cap (viewport >= 1400px)', () => {
    // #chatlog-wrap: width: min(370px, calc(50vw - 330px)); at 1400px viewport
    // width 50vw - 330 = 370, so the cap wins and the wrap is the full 370px.
    expect(computeChatInputAnchor({ left: 12, top: 502, width: 370 }, 720, GAP)).toEqual({
      left: 12,
      width: 370,
      bottom: 224,
    });
  });

  it('narrows to the wrap width on a sub-1400px desktop viewport (issue #1365)', () => {
    // At a 1200px-wide laptop viewport #chatlog-wrap computes
    // min(370, 50vw - 330) = min(370, 270) = 270px. A never-touched chat input
    // (no manual drag/resize ever ran) must shrink to match, not keep the
    // stock 370px and overhang the narrower window.
    expect(computeChatInputAnchor({ left: 12, top: 502, width: 270 }, 720, GAP)).toEqual({
      left: 12,
      width: 270,
      bottom: 224,
    });
  });

  it('rounds fractional rect measurements', () => {
    expect(computeChatInputAnchor({ left: 12.4, top: 501.6, width: 269.5 }, 720.2, GAP)).toEqual({
      left: 12,
      width: 270,
      bottom: 225,
    });
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

    const applied = anchorChatInputToWrap(input, wrap, 720, GAP);

    expect(applied).toBe(true);
    expect(input.style.width).toBe('270px');
    expect(input.style.left).toBe('12px');
    expect(input.style.bottom).toBe('224px');
  });

  it('does not overhang the wrap edge: applied width never exceeds the wrap width', () => {
    const input = fakeChatInput();
    input.style.width = '370px';
    const wrap = fakeWrap({ left: 12, top: 560, width: 300, height: 148 });

    anchorChatInputToWrap(input, wrap, 640, GAP);

    expect(Number.parseFloat(input.style.width)).toBeLessThanOrEqual(300);
  });

  it('does not write when the wrap has not laid out yet (height <= 0)', () => {
    const input = fakeChatInput();
    const wrap = fakeWrap({ left: 12, top: 0, width: 370, height: 0 });

    const applied = anchorChatInputToWrap(input, wrap, 720, GAP);

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
    anchorChatInputToWrap(input, wrap, 720, GAP);
    expect(input.style.left).toBe('12px');
    expect(input.style.width).toBe('270px');
    expect(input.style.bottom).toBe('224px');

    clearChatInputAnchor(input);

    expect(input.style.left).toBe('');
    expect(input.style.width).toBe('');
    expect(input.style.bottom).toBe('');
  });
});
