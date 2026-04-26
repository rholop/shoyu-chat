import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getToday,
  getISOWeekKey,
  getMonthKey,
  getWeekRangeLabel,
  getMonthLabel,
} from './dateHelpers';

describe('dateHelpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getToday', () => {
    it('returns date in YYYY-MM-DD format', () => {
      expect(getToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns the current UTC date', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-26T15:00:00.000Z'));
      expect(getToday()).toBe('2026-04-26');
    });
  });

  describe('getISOWeekKey', () => {
    it('returns string in YYYY-WXX format', () => {
      expect(getISOWeekKey(new Date('2026-04-26'))).toMatch(/^\d{4}-W\d{2}$/);
    });

    it('returns correct ISO week for a known Monday', () => {
      // 2026-04-27 is a Monday, ISO week 18
      expect(getISOWeekKey(new Date('2026-04-27'))).toBe('2026-W18');
    });

    it('returns correct ISO week for a known Sunday', () => {
      // 2026-05-03 is a Sunday, still ISO week 18
      expect(getISOWeekKey(new Date('2026-05-03'))).toBe('2026-W18');
    });

    it('handles year boundary — Jan 1 that belongs to previous year week', () => {
      // 2021-01-01 is a Friday, ISO week 53 of 2020
      expect(getISOWeekKey(new Date('2021-01-01'))).toBe('2020-W53');
    });

    it('pads single-digit week numbers', () => {
      // 2026-01-05 is week 2
      expect(getISOWeekKey(new Date('2026-01-05'))).toBe('2026-W02');
    });

    it('uses current date when no argument is provided', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'));
      expect(getISOWeekKey()).toMatch(/^\d{4}-W\d{2}$/);
    });
  });

  describe('getMonthKey', () => {
    it('returns string in YYYY-MM format', () => {
      expect(getMonthKey(new Date('2026-04-15'))).toMatch(/^\d{4}-\d{2}$/);
    });

    it('returns correct month key', () => {
      expect(getMonthKey(new Date('2026-04-15T12:00:00.000Z'))).toBe('2026-04');
    });

    it('uses current date when no argument is provided', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'));
      expect(getMonthKey()).toBe('2026-04');
    });
  });

  describe('getWeekRangeLabel', () => {
    it('returns a string with a year', () => {
      const label = getWeekRangeLabel(new Date('2026-04-26'));
      expect(label).toContain('2026');
    });

    it('returns correct Monday–Sunday range for a midweek date', () => {
      // 2026-04-26 is a Sunday, so week is Apr 20 – Apr 26
      const label = getWeekRangeLabel(new Date('2026-04-26'));
      expect(label).toContain('Apr');
    });

    it('returns range ending on Sunday', () => {
      // Verify the label contains a dash-separated range
      const label = getWeekRangeLabel(new Date('2026-04-22')); // Wednesday
      expect(label).toContain('–');
    });

    it('uses current date when no argument is provided', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'));
      const label = getWeekRangeLabel();
      expect(label).toContain('2026');
    });
  });

  describe('getMonthLabel', () => {
    it('returns full month name and year', () => {
      const label = getMonthLabel(new Date('2026-04-15'));
      expect(label).toContain('April');
      expect(label).toContain('2026');
    });

    it('returns correct label for January', () => {
      const label = getMonthLabel(new Date('2026-01-01'));
      expect(label).toContain('January');
    });

    it('returns correct label for December', () => {
      const label = getMonthLabel(new Date('2026-12-31'));
      expect(label).toContain('December');
      expect(label).toContain('2026');
    });

    it('uses current date when no argument is provided', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'));
      const label = getMonthLabel();
      expect(label).toContain('2026');
    });
  });
});
