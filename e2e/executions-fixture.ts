import type { E2eSettings } from "./test-config";

export interface MockDashboardData {
  client: {
    _id: string;
    clientName: string;
    clinic: Array<{
      _id: string;
      clinicName: string;
      drive: { spreadsheet: string };
    }>;
  };
  executionRows: string[][];
  tabs: Array<{
    _id: string;
    index: number;
    sheetId: number;
    title: string;
  }>;
}

export function createMockDashboardData(
  settings: E2eSettings,
): MockDashboardData {
  return {
    client: {
      _id: settings.clientId,
      clientName: "CCC Tester client",
      clinic: [
        {
          _id: settings.clinicId,
          clinicName: "CCC Tester clinic",
          drive: { spreadsheet: "ccc-tester-spreadsheet" },
        },
      ],
    },
    executionRows: [
      ["Patient", "Execution status"],
      ["CCC Tester patient", "Completed"],
    ],
    tabs: [
      {
        _id: settings.executionId,
        index: 0,
        sheetId: 0,
        title: settings.sheetName,
      },
    ],
  };
}
