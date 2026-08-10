// The shared resolve-and-validate step every src/net/native_*.ts bridge calls
// instead of hand-rolling its own window.Capacitor.Plugins.<name> duck-type check.
import { describe, expect, it } from 'vitest';
import { type NativePluginScope, resolveNativePlugin } from '../src/net/native_plugin';

interface ExamplePlugin {
  foo(): Promise<string>;
  bar(x: number): Promise<number>;
}

function scopeWith(plugins: Record<string, unknown>): NativePluginScope {
  return { Capacitor: { Plugins: plugins } };
}

describe('resolveNativePlugin', () => {
  it('returns the candidate, callable, when every required method is present', async () => {
    const foo = async () => 'ok';
    const bar = async (x: number) => x + 1;
    const scope = scopeWith({ Example: { foo, bar } });

    const plugin = resolveNativePlugin<ExamplePlugin>(scope, 'Example', ['foo', 'bar']);

    expect(plugin).not.toBeNull();
    await expect(plugin?.foo()).resolves.toBe('ok');
    await expect(plugin?.bar(1)).resolves.toBe(2);
  });

  it('returns null when the named plugin is absent', () => {
    const scope = scopeWith({});
    expect(resolveNativePlugin<ExamplePlugin>(scope, 'Example', ['foo', 'bar'])).toBeNull();
  });

  it('returns null when Capacitor or Plugins itself is missing', () => {
    expect(resolveNativePlugin<ExamplePlugin>({}, 'Example', ['foo', 'bar'])).toBeNull();
    expect(
      resolveNativePlugin<ExamplePlugin>({ Capacitor: {} }, 'Example', ['foo', 'bar']),
    ).toBeNull();
  });

  it('returns null when the plugin is not an object', () => {
    const scope = scopeWith({ Example: 'not-a-plugin' });
    expect(resolveNativePlugin<ExamplePlugin>(scope, 'Example', ['foo', 'bar'])).toBeNull();
  });

  it('returns null when the plugin is missing a required method', () => {
    const scope = scopeWith({ Example: { foo: async () => 'ok' } });
    expect(resolveNativePlugin<ExamplePlugin>(scope, 'Example', ['foo', 'bar'])).toBeNull();
  });

  it('returns null when a required member is present but not a function', () => {
    const scope = scopeWith({ Example: { foo: async () => 'ok', bar: 'nope' } });
    expect(resolveNativePlugin<ExamplePlugin>(scope, 'Example', ['foo', 'bar'])).toBeNull();
  });

  it('does not require methods outside the requested list', async () => {
    const foo = async () => 'ok';
    const scope = scopeWith({ Example: { foo, unrelated: 42 } });
    const plugin = resolveNativePlugin<ExamplePlugin>(scope, 'Example', ['foo']);
    expect(plugin).not.toBeNull();
    await expect(plugin?.foo()).resolves.toBe('ok');
  });
});
