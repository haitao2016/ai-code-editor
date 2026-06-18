// ============================================================
// DAP Protocol Types — Debug Adapter Protocol 1.59 subset
// ============================================================

export interface DAPSource {
  name?: string;
  path?: string;
  sourceReference?: number;
  presentationHint?: 'normal' | 'emphasize' | 'deemphasize';
}

export interface DAPStackFrame {
  id: number;
  name: string;
  source?: DAPSource;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  presentationHint?: 'normal' | 'label' | 'subtle';
}

export interface DAPThread {
  id: number;
  name: string;
}

export interface DAPScope {
  name: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  expensive: boolean;
  presentationHint?: 'arguments' | 'locals' | 'registers';
}

export interface DAPVariable {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
  evaluateName?: string;
  presentationHint?: { kind?: string; attributes?: string[] };
}

export interface DAPBreakpoint {
  id?: number;
  verified: boolean;
  message?: string;
  source?: DAPSource;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

export interface DAPSourceBreakpoint {
  line: number;
  column?: number;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
}

export interface DAPFunctionBreakpoint {
  name: string;
  condition?: string;
  hitCondition?: string;
}

export interface DAPExceptionBreakpointsFilter {
  filter: string;
  label: string;
  description?: string;
  default?: boolean;
}

export interface DAPStoppedEvent {
  reason: 'step' | 'breakpoint' | 'exception' | 'pause' | 'entry' | 'goto' | 'function breakpoint' | 'data breakpoint' | 'instruction breakpoint';
  description?: string;
  threadId?: number;
  text?: string;
  allThreadsStopped?: boolean;
  hitBreakpointIds?: number[];
}

export interface DAPOutputEvent {
  category: 'console' | 'important' | 'stdout' | 'stderr' | 'telemetry';
  output: string;
  group?: 'start' | 'startCollapsed' | 'end';
  variablesReference?: number;
  source?: DAPSource;
  line?: number;
  column?: number;
}

export interface DAPCapabilities {
  supportsConfigurationDoneRequest?: boolean;
  supportsFunctionBreakpoints?: boolean;
  supportsConditionalBreakpoints?: boolean;
  supportsHitConditionalBreakpoints?: boolean;
  supportsEvaluateForHovers?: boolean;
  supportsStepBack?: boolean;
  supportsSetVariable?: boolean;
  supportsRestartFrame?: boolean;
  supportsGotoTargetsRequest?: boolean;
  supportsStepInTargetsRequest?: boolean;
  supportsCompletionsRequest?: boolean;
  supportsModulesRequest?: boolean;
  supportsRestartRequest?: boolean;
  supportsExceptionOptions?: boolean;
  supportsValueFormattingOptions?: boolean;
  supportsExceptionInfoRequest?: boolean;
  supportTerminateDebuggee?: boolean;
  supportsDelayedStackTraceLoading?: boolean;
  supportsLoadedSourcesRequest?: boolean;
  supportsLogPoints?: boolean;
  supportsTerminateThreadsRequest?: boolean;
  supportsSetExpression?: boolean;
  supportsTerminateRequest?: boolean;
  supportsDataBreakpoints?: boolean;
  supportsReadMemoryRequest?: boolean;
  supportsWriteMemoryRequest?: boolean;
  supportsDisassembleRequest?: boolean;
  supportsCancelRequest?: boolean;
  supportsBreakpointLocationsRequest?: boolean;
  supportsClipboardContext?: boolean;
  supportsSteppingGranularity?: boolean;
  supportsInstructionBreakpoints?: boolean;
  supportsExceptionFilterOptions?: boolean;
  supportsSingleThreadExecutionRequests?: boolean;
}

export interface DAPLaunchRequest {
  noDebug?: boolean;
  __restart?: any;
  [key: string]: any;
}

export interface DAPAttachRequest {
  __restart?: any;
  [key: string]: any;
}

export interface DAPEvaluateArguments {
  expression: string;
  frameId?: number;
  context?: 'watch' | 'repl' | 'hover' | 'clipboard' | 'variables';
  format?: { hex?: boolean };
}

export interface DAPEvaluateResponse {
  result: string;
  type?: string;
  presentationHint?: { kind?: string; attributes?: string[] };
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
}

export interface DAPSetBreakpointsResponse {
  breakpoints: DAPBreakpoint[];
}

export type DebugSessionState = 'initial' | 'launching' | 'running' | 'stopped' | 'terminated';

export interface DebugConfig {
  type: string;
  name: string;
  request: 'launch' | 'attach';
  program?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  console?: 'internalConsole' | 'integratedTerminal' | 'externalTerminal';
  runtimeExecutable?: string;
  runtimeArgs?: string[];
  port?: number;
  host?: string;
  sourceMaps?: boolean;
  outFiles?: string[];
  [key: string]: any;
}
