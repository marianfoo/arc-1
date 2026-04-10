import { describe, expect, it } from 'vitest';
import {
  classifySapError,
  expectSapErrorContains,
  expectSapFailureClass,
  isSapError,
} from '../../helpers/expected-error.js';

describe('expected-error helpers', () => {
  describe('expectSapFailureClass', () => {
    it('passes with matching status code in message', () => {
      const err = new Error('Request failed with status 404');
      expect(() => expectSapFailureClass(err, [404])).not.toThrow();
    });

    it('passes with matching pattern', () => {
      const err = new Error('Object does not exist in repository');
      expect(() => expectSapFailureClass(err, [], [/does not exist/i])).not.toThrow();
    });

    it('throws when status code does not match', () => {
      const err = new Error('Request failed with status 500');
      expect(() => expectSapFailureClass(err, [404])).toThrow(/Unexpected SAP error shape/);
    });

    it('throws when error is not an Error object', () => {
      expect(() => expectSapFailureClass('string error', [404])).toThrow();
    });

    it('throws when message matches no pattern', () => {
      const err = new Error('Something completely different');
      expect(() => expectSapFailureClass(err, [404], [/not found/i])).toThrow(/Unexpected SAP error shape/);
    });
  });

  describe('isSapError', () => {
    it('returns true for Error with message', () => {
      expect(isSapError(new Error('SAP error'))).toBe(true);
    });

    it('returns false for non-Error objects', () => {
      expect(isSapError('not an error')).toBe(false);
      expect(isSapError(null)).toBe(false);
      expect(isSapError(undefined)).toBe(false);
      expect(isSapError({ message: 'fake' })).toBe(false);
    });
  });

  describe('expectSapErrorContains', () => {
    it('passes when substring is found', () => {
      const err = new Error('Object CL_FOO not found in repository');
      expect(() => expectSapErrorContains(err, 'not found')).not.toThrow();
    });

    it('throws when substring is missing', () => {
      const err = new Error('Request failed with status 500');
      expect(() => expectSapErrorContains(err, 'not found')).toThrow(/Expected SAP error message to contain/);
    });
  });

  describe('classifySapError', () => {
    it('classifies 404 as not-found', () => {
      expect(classifySapError(new Error('Request failed with status 404'))).toBe('not-found');
    });

    it('classifies 403 as forbidden', () => {
      expect(classifySapError(new Error('Request failed with status 403'))).toBe('forbidden');
    });

    it('classifies unknown errors as unknown', () => {
      expect(classifySapError(new Error('Something weird happened'))).toBe('unknown');
      expect(classifySapError('not even an error')).toBe('unknown');
    });
  });
});
