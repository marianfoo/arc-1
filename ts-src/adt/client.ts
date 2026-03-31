/**
 * ADT Client — main facade for all SAP ADT operations.
 *
 * This is the entry point for all SAP interactions. It wires together:
 * - AdtHttpClient (HTTP transport, CSRF, cookies)
 * - SafetyConfig (operation/package/transport gating)
 * - FeatureConfig (optional feature detection)
 *
 * Every public method checks safety before making any HTTP call.
 * The client is stateless between calls (no cached object state),
 * except for CSRF token and session cookies managed by AdtHttpClient.
 *
 * Architecture: The client exposes high-level operations grouped by domain.
 * Read operations are directly on the client, while CRUD, DevTools, etc.
 * are imported from their respective modules when needed by handlers.
 * This keeps the client class manageable (not a 2,400-line God class).
 */

import type { AdtClientConfig } from './config.js';
import { defaultAdtClientConfig } from './config.js';
import { isNotFoundError } from './errors.js';
import { AdtHttpClient, type AdtHttpConfig } from './http.js';
import { checkOperation, OperationType, type SafetyConfig } from './safety.js';
import type { AdtSearchResult, SourceSearchResult } from './types.js';
import {
  parseClassStructure,
  parseFunctionGroup,
  parseInstalledComponents,
  parsePackageContents,
  parseSearchResults,
  parseSourceSearchResults,
  parseSystemInfo,
  parseTableContents,
} from './xml-parser.js';

/** Map simple object type names to ADT compound format for quickSearch filtering */
const ADT_OBJECT_TYPE_MAP: Record<string, string> = {
  CLAS: 'CLAS/OC',
  INTF: 'INTF/OI',
  PROG: 'PROG/P',
  FUGR: 'FUGR/F',
  FUNC: 'FUGR/FF',
  TABL: 'TABL/DT',
  VIEW: 'VIEW/DV',
  DDLS: 'DDLS/DF',
  BDEF: 'BDEF/BDO',
  SRVD: 'SRVD/SRV',
  INCL: 'PROG/I',
  DTEL: 'DTEL/DE',
  DOMA: 'DOMA/DD',
  TTYP: 'TTYP/DA',
  MSAG: 'MSAG/N',
  DEVC: 'DEVC/K',
};

export class AdtClient {
  readonly http: AdtHttpClient;
  readonly safety: SafetyConfig;
  /** The configured SAP username (from --user / SAP_USER) */
  readonly username: string;

  constructor(options: Partial<AdtClientConfig> = {}) {
    const config = { ...defaultAdtClientConfig(), ...options };
    this.safety = config.safety;
    this.username = config.username;

    const httpConfig: AdtHttpConfig = {
      baseUrl: config.baseUrl,
      username: config.username,
      password: config.password,
      client: config.client,
      language: config.language,
      insecure: config.insecure,
      cookies: config.cookies,
      btpProxy: config.btpProxy,
      sapConnectivityAuth: config.sapConnectivityAuth,
    };

    this.http = new AdtHttpClient(httpConfig);
  }

  // ─── Source Code Read Operations ──────────────────────────────────

  /** Get program source code */
  async getProgram(name: string): Promise<string> {
    checkOperation(this.safety, OperationType.Read, 'GetProgram');
    const resp = await this.http.get(`/sap/bc/adt/programs/programs/${encodeURIComponent(name)}/source/main`);
    return resp.body;
  }

  /** Get class source code (main include by default) */
  async getClass(name: string, include?: string): Promise<string> {
    checkOperation(this.safety, OperationType.Read, 'GetClass');
    const encodedName = encodeURIComponent(name);

    if (!include) {
      // Default: return full combined class source
      const resp = await this.http.get(`/sap/bc/adt/oo/classes/${encodedName}/source/main`);
      return resp.body;
    }

    const validIncludes = new Set(['main', 'definitions', 'implementations', 'macros', 'testclasses']);
    const includes = include
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const parts: string[] = [];
    for (const inc of includes) {
      if (!validIncludes.has(inc)) {
        parts.push(
          `=== ${inc} ===\n[Unknown include "${inc}". Valid: main, definitions, implementations, macros, testclasses]`,
        );
        continue;
      }

      // "main" uses /source/main; others use /includes/{type}
      const path =
        inc === 'main'
          ? `/sap/bc/adt/oo/classes/${encodedName}/source/main`
          : `/sap/bc/adt/oo/classes/${encodedName}/includes/${inc}`;

      try {
        const resp = await this.http.get(path);
        parts.push(`=== ${inc} ===\n${resp.body}`);
      } catch (err) {
        if (isNotFoundError(err)) {
          parts.push(
            `=== ${inc} ===\n[Include "${inc}" is not available for this class. Try reading without the include parameter to get the full source.]`,
          );
        } else {
          throw err; // Re-throw non-404 errors
        }
      }
    }
    return parts.join('\n\n');
  }

  /**
   * Get a single method's source from a class.
   *
   * Fetches the class objectstructure to find the method's line range,
   * then reads the full source and extracts just that method.
   */
  async getClassMethod(name: string, method: string): Promise<string | null> {
    checkOperation(this.safety, OperationType.Read, 'GetClassMethod');
    const encodedName = encodeURIComponent(name);

    // Get class structure to find method line ranges
    const structResp = await this.http.get(`/sap/bc/adt/oo/classes/${encodedName}/objectstructure`);
    const methods = parseClassStructure(structResp.body);

    // Find the requested method (case-insensitive, handle interface methods with ~)
    const methodUpper = method.toUpperCase();
    const found = methods.find((m) => {
      const mName = m.name.toUpperCase();
      return mName === methodUpper || mName.endsWith(`~${methodUpper}`);
    });

    if (!found) return null;

    // Fetch full source and extract the method lines
    const sourceResp = await this.http.get(`/sap/bc/adt/oo/classes/${encodedName}/source/main`);
    const lines = sourceResp.body.split('\n');
    // ADT line numbers are 1-based
    const extracted = lines.slice(found.startLine - 1, found.endLine);
    return extracted.join('\n');
  }

  /** Get the list of methods in a class with their line ranges */
  async getClassMethods(name: string): Promise<Array<{ name: string; startLine: number; endLine: number }>> {
    checkOperation(this.safety, OperationType.Read, 'GetClassMethods');
    const encodedName = encodeURIComponent(name);
    const resp = await this.http.get(`/sap/bc/adt/oo/classes/${encodedName}/objectstructure`);
    return parseClassStructure(resp.body);
  }

  /** Get interface source code */
  async getInterface(name: string): Promise<string> {
    checkOperation(this.safety, OperationType.Read, 'GetInterface');
    const resp = await this.http.get(`/sap/bc/adt/oo/interfaces/${encodeURIComponent(name)}/source/main`);
    return resp.body;
  }

  /** Get function module source code */
  async getFunction(group: string, name: string): Promise<string> {
    checkOperation(this.safety, OperationType.Read, 'GetFunction');
    const resp = await this.http.get(
      `/sap/bc/adt/functions/groups/${encodeURIComponent(group)}/fmodules/${encodeURIComponent(name)}/source/main`,
    );
    return resp.body;
  }

  /** Resolve function group for a function module via quickSearch */
  async resolveFunctionGroup(fmName: string): Promise<string | null> {
    const results = await this.searchObject(fmName, 10);
    for (const r of results) {
      if (r.objectName.toUpperCase() === fmName.toUpperCase() && r.uri.includes('/groups/')) {
        const match = r.uri.match(/\/groups\/([^/]+)\//);
        if (match) return match[1]!.toUpperCase();
      }
    }
    return null;
  }

  /** Get function group structure (list of function modules) */
  async getFunctionGroup(name: string): Promise<{ name: string; functions: string[] }> {
    checkOperation(this.safety, OperationType.Read, 'GetFunctionGroup');
    const resp = await this.http.get(`/sap/bc/adt/functions/groups/${encodeURIComponent(name)}`);
    return parseFunctionGroup(resp.body);
  }

  /** Get function group source code */
  async getFunctionGroupSource(name: string): Promise<string> {
    checkOperation(this.safety, OperationType.Read, 'GetFunctionGroupSource');
    const resp = await this.http.get(`/sap/bc/adt/functions/groups/${encodeURIComponent(name)}/source/main`);
    return resp.body;
  }

  /** Get include source code */
  async getInclude(name: string): Promise<string> {
    checkOperation(this.safety, OperationType.Read, 'GetInclude');
    const resp = await this.http.get(`/sap/bc/adt/programs/includes/${encodeURIComponent(name)}/source/main`);
    return resp.body;
  }

  /** Get CDS view source code (DDLS) */
  async getDdls(name: string): Promise<string> {
    checkOperation(this.safety, OperationType.Read, 'GetDDLS');
    const resp = await this.http.get(`/sap/bc/adt/ddic/ddl/sources/${encodeURIComponent(name)}/source/main`);
    return resp.body;
  }

  /** Get behavior definition source code (BDEF) */
  async getBdef(name: string): Promise<string> {
    checkOperation(this.safety, OperationType.Read, 'GetBDEF');
    const resp = await this.http.get(`/sap/bc/adt/bo/behaviordefinitions/${encodeURIComponent(name)}/source/main`);
    return resp.body;
  }

  /** Get service definition source code (SRVD) */
  async getSrvd(name: string): Promise<string> {
    checkOperation(this.safety, OperationType.Read, 'GetSRVD');
    const resp = await this.http.get(`/sap/bc/adt/ddic/srvd/sources/${encodeURIComponent(name)}/source/main`);
    return resp.body;
  }

  /** Get table definition source code */
  async getTable(name: string): Promise<string> {
    checkOperation(this.safety, OperationType.Read, 'GetTable');
    const resp = await this.http.get(`/sap/bc/adt/ddic/tables/${encodeURIComponent(name)}/source/main`);
    return resp.body;
  }

  /** Get view definition source code */
  async getView(name: string): Promise<string> {
    checkOperation(this.safety, OperationType.Read, 'GetView');
    const resp = await this.http.get(`/sap/bc/adt/ddic/views/${encodeURIComponent(name)}/source/main`);
    return resp.body;
  }

  // ─── Search Operations ─────────────────────────────────────────────

  /** Search for ABAP objects by name pattern, optionally filtered by type and package */
  async searchObject(
    query: string,
    maxResults = 100,
    objectType?: string,
    packageName?: string,
  ): Promise<AdtSearchResult[]> {
    checkOperation(this.safety, OperationType.Search, 'SearchObject');
    let url = `/sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=${encodeURIComponent(query)}&maxResults=${maxResults}`;
    if (objectType) {
      // Map simple type names to ADT compound format (CLAS → CLAS/OC, etc.)
      const adtType = ADT_OBJECT_TYPE_MAP[objectType.toUpperCase()] ?? objectType;
      url += `&objectType=${encodeURIComponent(adtType)}`;
    }
    if (packageName) url += `&packageName=${encodeURIComponent(packageName)}`;
    const resp = await this.http.get(url);
    return parseSearchResults(resp.body);
  }

  /** Search within ABAP source code (full-text search) */
  async searchSource(
    pattern: string,
    maxResults = 50,
    objectType?: string,
    packageName?: string,
  ): Promise<SourceSearchResult[]> {
    checkOperation(this.safety, OperationType.Search, 'SearchSource');
    let url = `/sap/bc/adt/repository/informationsystem/textSearch?searchString=${encodeURIComponent(pattern)}&maxResults=${maxResults}`;
    if (objectType) url += `&objectType=${encodeURIComponent(objectType)}`;
    if (packageName) url += `&packageName=${encodeURIComponent(packageName)}`;
    const resp = await this.http.get(url);
    return parseSourceSearchResults(resp.body);
  }

  // ─── Package Operations ────────────────────────────────────────────

  /** Get package contents (objects and subpackages) */
  async getPackageContents(
    packageName: string,
  ): Promise<Array<{ type: string; name: string; description: string; uri: string }>> {
    checkOperation(this.safety, OperationType.Read, 'GetPackage');
    const resp = await this.http.post(
      `/sap/bc/adt/repository/nodestructure?parent_type=DEVC/K&parent_name=${encodeURIComponent(packageName)}&withShortDescriptions=true`,
      undefined,
      'application/xml',
    );
    return parsePackageContents(resp.body);
  }

  // ─── Table Data Operations ─────────────────────────────────────────

  /** Get table contents via data preview */
  async getTableContents(
    tableName: string,
    maxRows = 100,
    sqlFilter?: string,
  ): Promise<{ columns: string[]; rows: Record<string, string>[] }> {
    checkOperation(this.safety, OperationType.Query, 'GetTableContents');
    const resp = await this.http.post(
      `/sap/bc/adt/datapreview/ddic?rowNumber=${maxRows}&ddicEntityName=${encodeURIComponent(tableName)}`,
      sqlFilter,
      'text/plain',
    );
    return parseTableContents(resp.body);
  }

  /** Execute freestyle SQL query */
  async runQuery(sql: string, maxRows = 100): Promise<{ columns: string[]; rows: Record<string, string>[] }> {
    checkOperation(this.safety, OperationType.FreeSQL, 'RunQuery');
    const resp = await this.http.post(`/sap/bc/adt/datapreview/freestyle?rowNumber=${maxRows}`, sql, 'text/plain');
    return parseTableContents(resp.body);
  }

  // ─── System Information ────────────────────────────────────────────

  /** Get system info as structured JSON (user, system details from discovery XML) */
  async getSystemInfo(): Promise<string> {
    checkOperation(this.safety, OperationType.Read, 'GetSystemInfo');
    const resp = await this.http.get('/sap/bc/adt/core/discovery');
    const info = parseSystemInfo(resp.body, this.username);
    return JSON.stringify(info, null, 2);
  }

  /** Get installed SAP components */
  async getInstalledComponents(): Promise<Array<{ name: string; release: string; description: string }>> {
    checkOperation(this.safety, OperationType.Read, 'GetInstalledComponents');
    const resp = await this.http.get('/sap/bc/adt/system/components');
    return parseInstalledComponents(resp.body);
  }

  /** Get message class messages */
  async getMessages(messageClass: string): Promise<string> {
    checkOperation(this.safety, OperationType.Read, 'GetMessages');
    const resp = await this.http.get(`/sap/bc/adt/msg/messages/${encodeURIComponent(messageClass)}`);
    return resp.body;
  }

  /** Get program text elements */
  async getTextElements(program: string): Promise<string> {
    checkOperation(this.safety, OperationType.Read, 'GetTextElements');
    const resp = await this.http.get(`/sap/bc/adt/programs/programs/${encodeURIComponent(program)}/textelements`);
    return resp.body;
  }

  /** Get program variants */
  async getVariants(program: string): Promise<string> {
    checkOperation(this.safety, OperationType.Read, 'GetVariants');
    const resp = await this.http.get(`/sap/bc/adt/programs/programs/${encodeURIComponent(program)}/variants`);
    return resp.body;
  }
}
