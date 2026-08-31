import { TEST_SCOPES, type TestScope } from "../convex/validators.js";

export const MODES = ["dev", "production", "frontend", "all"] as const;
export type Mode = (typeof MODES)[number];
export type ExecutableMode = Exclude<Mode, "all">;

export interface CliArguments {
  executionSheet: string | undefined;
  help: boolean;
  mode: Mode;
  playwrightArguments: string[];
  saveResults: boolean;
  scope: TestScope;
}

const BOOLEAN_OPTIONS = new Set(["save-results"]);

export function parseCliArguments(argumentsList: string[]): CliArguments {
  let mode: string = "dev";
  let executionSheet: string | undefined;
  let scope: string = TEST_SCOPES[0];
  let help = false;
  let saveResults = false;
  const playwrightArguments: string[] = [];

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];

    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }

    if (argument === "--") {
      continue;
    }

    const option = getOption(argument);
    if (option) {
      const isBooleanOption = BOOLEAN_OPTIONS.has(option);
      const inlineValue = getInlineValue(argument, option);
      const value = isBooleanOption
        ? undefined
        : (inlineValue ?? argumentsList[index + 1]);
      if (!isBooleanOption && inlineValue === undefined) {
        index += 1;
      }

      switch (option) {
        case "execution-sheet":
          executionSheet = value;
          break;
        case "mode":
          mode = value ?? "";
          break;
        case "save-results":
          saveResults = true;
          break;
        case "scope":
          scope = value ?? "";
          break;
      }
      continue;
    }

    playwrightArguments.push(argument);
  }

  if (!isMode(mode)) {
    throw new Error(
      `Unknown mode "${mode}". Choose one of: ${MODES.join(", ")}.`,
    );
  }

  if (!isScope(scope)) {
    throw new Error(
      `Unknown scope "${scope}". Choose one of: ${TEST_SCOPES.join(", ")}.`,
    );
  }

  return {
    executionSheet,
    help,
    mode,
    playwrightArguments,
    saveResults,
    scope,
  };
}

export function getForwardedArguments(
  argumentsValue: CliArguments,
  mode: ExecutableMode,
): string[] {
  const forwardedArguments = ["--mode", mode, "--scope", argumentsValue.scope];
  const options: Array<[string, string | undefined]> = [
    ["--execution-sheet", argumentsValue.executionSheet],
  ];

  for (const [name, value] of options) {
    if (value !== undefined) {
      forwardedArguments.push(name, value);
    }
  }

  return forwardedArguments;
}

/** True when the token is a ccc-tester option (e.g. "--mode=dev", "--save-results") rather than a Playwright argument. */
export function isKnownCliOption(argument: string): boolean {
  return getOption(argument) !== undefined;
}

function getOption(argument: string | undefined): string | undefined {
  if (!argument) {
    return undefined;
  }

  const optionNames = ["execution-sheet", "mode", "save-results", "scope"];

  return optionNames.find(
    (optionName) =>
      argument === `--${optionName}` || argument.startsWith(`--${optionName}=`),
  );
}

function getInlineValue(argument: string, option: string): string | undefined {
  const prefix = `--${option}=`;
  return argument.startsWith(prefix)
    ? argument.slice(prefix.length)
    : undefined;
}

function isMode(value: string): value is Mode {
  return (MODES as readonly string[]).includes(value);
}

function isScope(value: string): value is TestScope {
  return (TEST_SCOPES as readonly string[]).includes(value);
}
