export const MODES = ["dev", "production", "frontend", "all"] as const;
export type Mode = (typeof MODES)[number];
export type ExecutableMode = Exclude<Mode, "all">;

export interface CliArguments {
  apiBaseUrl: string | undefined;
  baseUrl: string | undefined;
  clientId: string | undefined;
  clinicId: string | undefined;
  devApiBaseUrl: string | undefined;
  executionId: string | undefined;
  executionSheet: string | undefined;
  help: boolean;
  mode: Mode;
  playwrightArguments: string[];
  productionApiBaseUrl: string | undefined;
}

export function parseCliArguments(argumentsList: string[]): CliArguments {
  let mode: string = "dev";
  let apiBaseUrl: string | undefined;
  let baseUrl: string | undefined;
  let clientId: string | undefined;
  let clinicId: string | undefined;
  let devApiBaseUrl: string | undefined;
  let executionId: string | undefined;
  let executionSheet: string | undefined;
  let productionApiBaseUrl: string | undefined;
  let help = false;
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
      const inlineValue = getInlineValue(argument, option);
      const value = inlineValue ?? argumentsList[index + 1];
      if (inlineValue === undefined) {
        index += 1;
      }

      switch (option) {
        case "api-base-url":
          apiBaseUrl = value;
          break;
        case "base-url":
          baseUrl = value;
          break;
        case "client-id":
          clientId = value;
          break;
        case "clinic-id":
          clinicId = value;
          break;
        case "dev-api-base-url":
          devApiBaseUrl = value;
          break;
        case "execution-id":
          executionId = value;
          break;
        case "execution-sheet":
          executionSheet = value;
          break;
        case "mode":
          mode = value ?? "";
          break;
        case "production-api-base-url":
          productionApiBaseUrl = value;
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

  return {
    apiBaseUrl,
    baseUrl,
    clientId,
    clinicId,
    devApiBaseUrl,
    executionId,
    executionSheet,
    help,
    mode,
    playwrightArguments,
    productionApiBaseUrl,
  };
}

export function getForwardedArguments(
  argumentsValue: CliArguments,
  mode: ExecutableMode,
): string[] {
  const forwardedArguments = ["--mode", mode];
  const options: Array<[string, string | undefined]> = [
    ["--api-base-url", argumentsValue.apiBaseUrl],
    ["--base-url", argumentsValue.baseUrl],
    ["--client-id", argumentsValue.clientId],
    ["--clinic-id", argumentsValue.clinicId],
    ["--dev-api-base-url", argumentsValue.devApiBaseUrl],
    ["--execution-id", argumentsValue.executionId],
    ["--execution-sheet", argumentsValue.executionSheet],
    ["--production-api-base-url", argumentsValue.productionApiBaseUrl],
  ];

  for (const [name, value] of options) {
    if (value !== undefined) {
      forwardedArguments.push(name, value);
    }
  }

  return forwardedArguments;
}

function getOption(argument: string | undefined): string | undefined {
  if (!argument) {
    return undefined;
  }

  const optionNames = [
    "api-base-url",
    "base-url",
    "client-id",
    "clinic-id",
    "dev-api-base-url",
    "execution-id",
    "execution-sheet",
    "mode",
    "production-api-base-url",
  ];

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
