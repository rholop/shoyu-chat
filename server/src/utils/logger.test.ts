import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('logger.info calls console.log with INFO prefix', async () => {
    const { logger } = await import('./logger');
    logger.info('hello', 'world');
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/^\[.*\] INFO$/),
      'hello',
      'world',
    );
  });

  it('logger.warn calls console.warn with WARN prefix', async () => {
    const { logger } = await import('./logger');
    logger.warn('something wrong');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/^\[.*\] WARN$/),
      'something wrong',
    );
  });

  it('logger.error calls console.error with ERROR prefix', async () => {
    const { logger } = await import('./logger');
    logger.error('boom');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(/^\[.*\] ERROR$/),
      'boom',
    );
  });

  it('logger.debug calls console.debug in development', async () => {
    process.env.NODE_ENV = 'development';
    const { logger } = await import('./logger');
    logger.debug('dbg');
    expect(console.debug).toHaveBeenCalled();
    delete process.env.NODE_ENV;
  });

  it('logger.debug is suppressed in production', async () => {
    process.env.NODE_ENV = 'production';
    const { logger } = await import('./logger');
    logger.debug('hidden');
    expect(console.debug).not.toHaveBeenCalled();
    delete process.env.NODE_ENV;
  });
});
