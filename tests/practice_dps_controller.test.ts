// The practice DPS strip's thin painter (src/ui/hud/practice/
// practice_dps_controller.ts): it paints from the model it is handed, throttles
// to its own cadence, elides an unchanged frame, and re-localizes by itself.
import { describe, expect, it } from 'vitest';
import { ensureLocaleLoaded, setLanguage } from '../src/ui/i18n';
import {
  PRACTICE_PAINT_INTERVAL_MS,
  PracticeDpsController,
} from '../src/ui/hud/practice/practice_dps_controller';
import type { PracticeDpsModel, PracticeRun } from '../src/ui/hud/practice/practice_dps_view';

function trackerElement() {
  let html = '';
  let writes = 0;
  const element = {
    style: { display: '' },
    get innerHTML() {
      return html;
    },
    set innerHTML(value: string) {
      html = value;
      writes++;
    },
  } as unknown as HTMLElement;
  return { element, writes: () => writes };
}

function run(total: number, duration: number): PracticeRun {
  return { dummyTemplateId: 'training_dummy', total, duration, dps: total / duration };
}

function make(model: () => PracticeDpsModel | null) {
  const el = trackerElement();
  const controller = new PracticeDpsController({
    element: el.element,
    model,
    dummyName: (id) => `name:${id}`,
  });
  return { ...el, controller };
}

describe('PracticeDpsController', () => {
  it('stays hidden and empty with no model', () => {
    const { controller, element, writes } = make(() => null);
    controller.update(0);
    expect(element.style.display).toBe('none');
    expect(element.innerHTML).toBe('');
    expect(writes()).toBe(0); // nothing to clear: no write at all
  });

  it('shows the prompt while a dummy is targeted with no run', () => {
    const { controller, element } = make(() => ({
      targetDummyId: 'training_dummy',
      live: null,
      previous: [],
      bestDps: 0,
    }));
    controller.update(0);
    expect(element.style.display).toBe('block');
    expect(element.innerHTML).toContain('name:training_dummy');
    expect(element.innerHTML).toContain('Attack the dummy to start a run');
    expect(element.innerHTML).not.toContain('Previous runs');
  });

  it('paints the live number, this run, and the previous runs with the best marked', () => {
    const { controller, element } = make(() => ({
      targetDummyId: null,
      live: run(12_345, 10),
      previous: [run(2000, 10), run(30_000, 10)],
      bestDps: 3000,
    }));
    controller.update(0);
    const html = element.innerHTML;
    // Below 10k the figure stays whole (the meters window's own threshold);
    // the total crosses it and compacts.
    expect(html).toContain('1235 DPS');
    expect(html).toContain('This run');
    expect(html).toContain('12.3k in 10s');
    expect(html).toContain('Previous runs');
    expect(html).toContain('Run 1');
    expect(html).toContain('Run 2');
    // Exactly one best mark, on the 3000/s run.
    expect(html.match(/pt-best/g)).toHaveLength(1);
    expect(html).toMatch(/pt-best[^]*3000\/s/);
  });

  it('elides an unchanged frame and throttles to its cadence', () => {
    let model: PracticeDpsModel = {
      targetDummyId: 'training_dummy',
      live: run(1000, 2),
      previous: [],
      bestDps: 500,
    };
    const { controller, writes } = make(() => model);
    controller.update(0);
    expect(writes()).toBe(1);
    controller.update(PRACTICE_PAINT_INTERVAL_MS);
    expect(writes()).toBe(1); // same markup: no write
    model = { ...model, live: run(2000, 2), bestDps: 1000 };
    controller.update(PRACTICE_PAINT_INTERVAL_MS + 1); // inside the throttle window
    expect(writes()).toBe(1);
    controller.update(PRACTICE_PAINT_INTERVAL_MS * 2);
    expect(writes()).toBe(2);
  });

  it('re-localizes on the next paint without a fan-out arm (resolved-string elision)', async () => {
    // A live run carries numbers, which is what a locale flip moves for
    // English-only chrome keys (the decimal separator here: 12.3k vs 12,3k).
    const { controller, element } = make(() => ({
      targetDummyId: 'training_dummy',
      live: run(12_345, 10),
      previous: [],
      bestDps: 1234.5,
    }));
    controller.update(0);
    expect(element.innerHTML).toContain('12.3k');
    await ensureLocaleLoaded('de');
    setLanguage('de');
    try {
      controller.update(PRACTICE_PAINT_INTERVAL_MS);
      expect(element.innerHTML).toContain('12,3k');
      expect(element.innerHTML).not.toContain('12.3k');
    } finally {
      setLanguage('en');
    }
  });

  it('escapes the dummy name it is handed', () => {
    const el = trackerElement();
    const controller = new PracticeDpsController({
      element: el.element,
      model: () => ({ targetDummyId: 'training_dummy', live: null, previous: [], bestDps: 0 }),
      dummyName: () => '<b>x</b>',
    });
    controller.update(0);
    expect(el.element.innerHTML).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
