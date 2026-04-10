import { describe, expect, it } from 'vitest';
import { expectSapFailureClass } from '../../helpers/expected-error.js';

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
});
