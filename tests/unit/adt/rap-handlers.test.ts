import { describe, expect, it } from 'vitest';
import {
  applyRapHandlerSignatures,
  extractRapHandlerRequirements,
  findMissingRapHandlerRequirements,
  parseClassDefinitionMethods,
} from '../../../src/adt/rap-handlers.js';

const BDEF_SOURCE = `managed implementation in class ZBP_I_TRAVELREQ unique;
define behavior for ZI_TRAVELREQ alias Travel
authorization master ( instance )
{
  create;
  action SubmitForApproval result [1] $self;
  action RecalculateTotalCost result [1] $self;
  determination SetDefaults on modify { create; }
  validation ValidateDates on save { create; }
}

define behavior for ZI_TRAVELSEG alias Segment
{
  action Reprice result [1] $self;
}`;

describe('extractRapHandlerRequirements', () => {
  it('extracts action, determination, validation, and authorization requirements from BDEF', () => {
    const requirements = extractRapHandlerRequirements(BDEF_SOURCE);
    const kinds = requirements.map((req) => req.kind);
    expect(kinds).toContain('action');
    expect(kinds).toContain('determination');
    expect(kinds).toContain('validation');
    expect(kinds).toContain('instance_authorization');

    const submit = requirements.find((req) => req.methodName === 'submitforapproval');
    expect(submit?.targetHandlerClass).toBe('lhc_travel');
    expect(submit?.signature).toContain('FOR ACTION Travel~SubmitForApproval');

    const auth = requirements.find((req) => req.kind === 'instance_authorization');
    expect(auth?.signature).toContain('FOR INSTANCE AUTHORIZATION');
    expect(auth?.signature).toContain('FOR Travel RESULT result');
  });

  it('derives handler class names from aliases across multiple entities', () => {
    const requirements = extractRapHandlerRequirements(BDEF_SOURCE);
    const segmentAction = requirements.find((req) => req.methodName === 'reprice');
    expect(segmentAction?.entityAlias).toBe('Segment');
    expect(segmentAction?.targetHandlerClass).toBe('lhc_segment');
  });
});

describe('findMissingRapHandlerRequirements', () => {
  it('returns only requirements not declared in class definitions', () => {
    const classSource = `CLASS zbp_i_travelreq DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF zi_travelreq.
ENDCLASS.

CLASS lhc_travel DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS submitforapproval FOR MODIFY
      IMPORTING keys FOR ACTION Travel~SubmitForApproval RESULT result.
ENDCLASS.

CLASS lhc_travel IMPLEMENTATION.
ENDCLASS.

CLASS lhc_segment DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
ENDCLASS.`;

    const requirements = extractRapHandlerRequirements(BDEF_SOURCE);
    const missing = findMissingRapHandlerRequirements(requirements, classSource);
    expect(missing.some((req) => req.methodName === 'submitforapproval')).toBe(false);
    expect(missing.some((req) => req.methodName === 'recalculatetotalcost')).toBe(true);
    expect(missing.some((req) => req.methodName === 'reprice')).toBe(true);
  });
});

describe('parseClassDefinitionMethods', () => {
  it('extracts METHODS declarations per class', () => {
    const source = `CLASS lhc_travel DEFINITION.
  PRIVATE SECTION.
    METHODS submitforapproval FOR MODIFY IMPORTING keys FOR ACTION Travel~SubmitForApproval RESULT result.
ENDCLASS.
CLASS lhc_travel IMPLEMENTATION.
ENDCLASS.`;

    const methods = parseClassDefinitionMethods(source);
    expect(methods.get('lhc_travel')?.has('submitforapproval')).toBe(true);
  });

  it('does not skip concrete class definitions after deferred declarations', () => {
    const source = `CLASS lthc_carrier DEFINITION DEFERRED FOR TESTING.

CLASS lhc_carrier DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS validatename FOR VALIDATE ON SAVE
      IMPORTING keys FOR carrier~validatename.
ENDCLASS.`;

    const methods = parseClassDefinitionMethods(source);
    expect(methods.get('lhc_carrier')?.has('validatename')).toBe(true);
  });
});

describe('applyRapHandlerSignatures', () => {
  it('injects missing signatures into existing handler class private sections', () => {
    const classSource = `CLASS lhc_travel DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
ENDCLASS.

CLASS lhc_travel IMPLEMENTATION.
ENDCLASS.`;
    const requirements = extractRapHandlerRequirements(BDEF_SOURCE).filter(
      (req) => req.targetHandlerClass === 'lhc_travel',
    );
    const result = applyRapHandlerSignatures(classSource, requirements);

    expect(result.changed).toBe(true);
    expect(result.inserted.length).toBeGreaterThan(0);
    expect(result.updatedSource).toContain('METHODS submitforapproval FOR MODIFY');
    expect(result.updatedSource).toContain('METHODS recalculatetotalcost FOR MODIFY');
    expect(result.updatedSource).toContain('METHODS get_instance_authorizations FOR INSTANCE AUTHORIZATION');
  });

  it('adds PRIVATE SECTION when missing in a handler class definition', () => {
    const classSource = `CLASS lhc_travel DEFINITION INHERITING FROM cl_abap_behavior_handler.
ENDCLASS.

CLASS lhc_travel IMPLEMENTATION.
ENDCLASS.`;
    const requirement = extractRapHandlerRequirements(BDEF_SOURCE).find(
      (req) => req.methodName === 'submitforapproval',
    );
    expect(requirement).toBeDefined();
    const result = applyRapHandlerSignatures(classSource, requirement ? [requirement] : []);

    expect(result.changed).toBe(true);
    expect(result.updatedSource).toContain('PRIVATE SECTION.');
    expect(result.updatedSource).toContain('METHODS submitforapproval FOR MODIFY');
  });

  it('reports skipped requirements when target handler class is not present', () => {
    const classSource = `CLASS zbp_i_travelreq DEFINITION PUBLIC.
ENDCLASS.`;
    const requirements = extractRapHandlerRequirements(BDEF_SOURCE).filter(
      (req) => req.targetHandlerClass === 'lhc_segment',
    );
    const result = applyRapHandlerSignatures(classSource, requirements);

    expect(result.changed).toBe(false);
    expect(result.inserted).toHaveLength(0);
    expect(result.skipped).toHaveLength(requirements.length);
    expect(result.skipped[0]?.reason).toContain('not found');
  });
});
