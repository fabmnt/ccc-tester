import {
  TEST_CLIENT_NAME,
  TEST_CLINIC_NAME,
  type E2eSettings,
} from "./test-config";

export const MOCK_CLIENT_ID = "ccc-tester-client";
export const MOCK_CLINIC_ID = "ccc-tester-clinic";
export const MOCK_EXECUTION_ID = "ccc-tester-execution";

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
      _id: MOCK_CLIENT_ID,
      clientName: TEST_CLIENT_NAME,
      clinic: [
        {
          _id: MOCK_CLINIC_ID,
          clinicName: TEST_CLINIC_NAME,
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
        _id: MOCK_EXECUTION_ID,
        index: 0,
        sheetId: 0,
        title: settings.sheetName,
      },
    ],
  };
}
