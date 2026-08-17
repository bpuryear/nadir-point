import { describe, expect, it } from 'vitest';
import { boot } from './main.js';

describe('scaffold', () => {
  it('boots', () => {
    expect(boot()).toBe('salvager');
  });
});
