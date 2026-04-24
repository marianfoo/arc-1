import { describe, expect, it } from 'vitest';
import {
  applyRapHandlerImplementationStubs,
  applyRapHandlerSignatures,
  extractRapHandlerRequirements,
  findMissingRapHandlerImplementationStubs,
  findMissingRapHandlerRequirements,
  parseClassDefinitionMethods,
} from '../../../src/adt/rap-handlers.js';
import { spliceMethod } from '../../../src/context/method-surgery.js';

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

  it('extracts factory, internal, and static action variants and omits RESULT when BDEF has none', () => {
    const source = `managed implementation in class zbp_i_travel unique;
define behavior for zi_travel alias travel
authorization master ( global )
{
  action  ( features: instance ) acceptTravel result [1] $self;
  internal action reCalcTotalPrice;
  factory action copyTravel [1];
  static action doStaticThing;
  static factory action staticCreate;
}`;
    const requirements = extractRapHandlerRequirements(source);
    const accept = requirements.find((req) => req.methodName === 'accepttravel');
    expect(accept?.signature).toContain('FOR ACTION travel~acceptTravel RESULT result');

    const recalc = requirements.find((req) => req.methodName === 'recalctotalprice');
    expect(recalc).toBeDefined();
    expect(recalc?.signature).toContain('FOR ACTION travel~reCalcTotalPrice.');
    expect(recalc?.signature).not.toContain('RESULT');

    const copy = requirements.find((req) => req.methodName === 'copytravel');
    expect(copy, 'factory action should be detected').toBeDefined();
    expect(copy?.signature).toContain('FOR ACTION travel~copyTravel.');
    expect(copy?.signature).not.toContain('RESULT');

    const staticThing = requirements.find((req) => req.methodName === 'dostaticthing');
    expect(staticThing, 'static action should be detected').toBeDefined();
    expect(staticThing?.signature).not.toContain('RESULT');

    const staticCreate = requirements.find((req) => req.methodName === 'staticcreate');
    expect(staticCreate, 'static factory action should be detected').toBeDefined();
  });

  it('detects RESULT clause even when action declaration spans multiple lines', () => {
    const source = `define behavior for zi_travel alias travel
authorization master ( global )
{
  action acceptTravel
    result [1] $self;
  action cancelTravel
    ;
}`;
    const requirements = extractRapHandlerRequirements(source);
    const accept = requirements.find((req) => req.methodName === 'accepttravel');
    expect(accept?.signature).toContain('RESULT result');

    const cancel = requirements.find((req) => req.methodName === 'canceltravel');
    expect(cancel?.signature).not.toContain('RESULT');
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

  it('indexes FOR ACTION binding keys so semantic method names satisfy BDEF actions', () => {
    // This is the shape used by SAP's shipped /DMO/BP_TRAVEL_M: the method
    // name (`set_status_accepted`) is semantic, bound to BDEF action
    // `acceptTravel` via `FOR ACTION travel~accepttravel`. The scaffolder
    // compares against BDEF identifiers, so the binding key MUST also be
    // indexed — otherwise we'd falsely report `accepttravel` as missing and
    // try to re-inject it as a duplicate METHOD declaration.
    const source = `CLASS lhc_travel DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS set_status_accepted FOR MODIFY
      IMPORTING keys FOR ACTION travel~accepttravel RESULT result.
    METHODS recalc_total FOR DETERMINE ON MODIFY
      IMPORTING keys FOR travel~recalctotalprice.
ENDCLASS.`;
    const methods = parseClassDefinitionMethods(source);
    const travel = methods.get('lhc_travel');
    expect(travel).toBeDefined();
    // Method names are present…
    expect(travel?.has('set_status_accepted')).toBe(true);
    expect(travel?.has('recalc_total')).toBe(true);
    // …AND their binding keys are also indexed so the BDEF identifier
    // matches.
    expect(travel?.has('accepttravel')).toBe(true);
    expect(travel?.has('recalctotalprice')).toBe(true);
  });
});

describe('findMissingRapHandlerRequirements with semantic method names', () => {
  it('treats a BDEF action as fulfilled when bound via FOR ACTION alias~name', () => {
    // Regression for the /DMO/BP_TRAVEL_M pattern — without binding-key
    // extraction the scaffolder would incorrectly consider `accepttravel`
    // missing even though the hand-crafted pool fully implements it.
    const bdef = `managed implementation in class zbp_i_travel unique;
define behavior for zi_travel alias travel
authorization master ( global )
{
  action acceptTravel result [1] $self;
}`;
    const classSource = `CLASS lhc_travel DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS set_status_accepted FOR MODIFY
      IMPORTING keys FOR ACTION travel~accepttravel RESULT result.
ENDCLASS.`;
    const requirements = extractRapHandlerRequirements(bdef);
    const missing = findMissingRapHandlerRequirements(requirements, classSource);
    expect(missing.some((req) => req.methodName === 'accepttravel')).toBe(false);
  });
});

describe('findMissingRapHandlerImplementationStubs', () => {
  it('reports declarations that still lack implementation blocks', () => {
    const bdef = `define behavior for zi_travel alias travel
{
  action SubmitForApproval result [1] $self;
}`;
    const classSource = `CLASS lhc_travel DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS submitforapproval FOR MODIFY
      IMPORTING keys FOR ACTION travel~SubmitForApproval RESULT result.
ENDCLASS.

CLASS lhc_travel IMPLEMENTATION.
ENDCLASS.`;

    const requirements = extractRapHandlerRequirements(bdef);
    const missing = findMissingRapHandlerImplementationStubs(requirements, classSource);

    expect(missing.map((req) => req.methodName)).toEqual(['submitforapproval']);
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

  it('ignores deferred handler declarations when choosing insertion target', () => {
    const classSource = `CLASS lhc_travel DEFINITION DEFERRED.

CLASS lhc_travel DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
ENDCLASS.

CLASS lhc_travel IMPLEMENTATION.
ENDCLASS.`;
    const requirement = extractRapHandlerRequirements(BDEF_SOURCE).find(
      (req) => req.methodName === 'submitforapproval',
    );
    expect(requirement).toBeDefined();

    const result = applyRapHandlerSignatures(classSource, requirement ? [requirement] : []);

    expect(result.changed).toBe(true);
    expect(result.updatedSource).toMatch(/^CLASS lhc_travel DEFINITION DEFERRED\./);
    expect(result.updatedSource).toContain(`CLASS lhc_travel DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS submitforapproval FOR MODIFY`);
    expect(result.updatedSource).not.toMatch(/^ {2}PRIVATE SECTION\./);
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

describe('applyRapHandlerImplementationStubs', () => {
  it('inserts empty method stubs into matching implementation classes', () => {
    const classSource = `CLASS lhc_travel DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS submitforapproval FOR MODIFY
      IMPORTING keys FOR ACTION Travel~SubmitForApproval RESULT result.
ENDCLASS.

CLASS lhc_travel IMPLEMENTATION.
ENDCLASS.`;
    const requirement = extractRapHandlerRequirements(BDEF_SOURCE).find(
      (req) => req.methodName === 'submitforapproval',
    );
    expect(requirement).toBeDefined();

    const result = applyRapHandlerImplementationStubs(classSource, requirement ? [requirement] : []);

    expect(result.changed).toBe(true);
    expect(result.updatedSource).toContain('CLASS lhc_travel IMPLEMENTATION.');
    expect(result.updatedSource).toContain('  METHOD submitforapproval.');
    expect(result.updatedSource).toContain('  ENDMETHOD.');

    const spliced = spliceMethod(
      result.updatedSource,
      'zbp_i_travelreq',
      'submitforapproval',
      '    reported = reported.',
    );
    expect(spliced.success).toBe(true);
    expect(spliced.newSource).toContain('reported = reported.');
  });

  it('creates implementation blocks in implementation includes when requested', () => {
    const classSource = `*"* implementations placeholder
CLASS lhc_travel DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS submitforapproval FOR MODIFY
      IMPORTING keys FOR ACTION Travel~SubmitForApproval RESULT result.
ENDCLASS.`;
    const requirement = extractRapHandlerRequirements(BDEF_SOURCE).find(
      (req) => req.methodName === 'submitforapproval',
    );
    expect(requirement).toBeDefined();

    const result = applyRapHandlerImplementationStubs(classSource, requirement ? [requirement] : [], {
      createImplementationBlocks: true,
    });

    expect(result.changed).toBe(true);
    expect(result.updatedSource).toContain(`CLASS lhc_travel IMPLEMENTATION.
  METHOD submitforapproval.
  ENDMETHOD.
ENDCLASS.`);
  });

  it('does not duplicate existing implementation stubs', () => {
    const classSource = `CLASS lhc_travel IMPLEMENTATION.
  METHOD submitforapproval.
  ENDMETHOD.
ENDCLASS.`;
    const requirement = extractRapHandlerRequirements(BDEF_SOURCE).find(
      (req) => req.methodName === 'submitforapproval',
    );
    expect(requirement).toBeDefined();

    const result = applyRapHandlerImplementationStubs(classSource, requirement ? [requirement] : []);

    expect(result.changed).toBe(false);
    expect(result.updatedSource.match(/METHOD submitforapproval/g)).toHaveLength(1);
  });
});
