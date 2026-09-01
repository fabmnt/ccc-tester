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
    forms: string;
    clinic: Array<{
      _id: string;
      clinicName: string;
      drive: {
        spreadsheet: string;
        driveFolder: string;
        urlRowNumber: number;
        formId: string;
        shortFormId: string;
      };
    }>;
  };
  executionRowsBySheet: Record<string, string[][]>;
  tabs: Array<{
    _id: string;
    index: number;
    sheetId: number;
    title: string;
  }>;
  form: {
    config: {
      "1": FormlessSection[];
      "2": FormlessSection[];
    };
    bookmarks: MockFormBookmark[];
    filename: string;
  };
}

export interface MockFormBookmark {
  id: string;
  name: string;
  type: "Text" | "Box" | "Toggle";
  value: string;
}

interface FormlessSection {
  bookmarks: Array<{
    _id: string;
    label: string;
    bookmark: string;
    type: "Text" | "Box" | "Toggle";
    isCode: boolean;
    isMissingTemplateBookmark?: boolean;
  }>;
  position: number;
  groupName: string;
  customFormName?: string;
  columns?: number;
}

const MOCK_FORM_ID = "ccc-tester-form";
const MOCK_FORM_FILENAME =
  "Insurance_verification_form_Aetna_Ada_20260831.docx";
const MOCK_SECONDARY_SHEET = "Mock secondary sheet";

const EXECUTION_HEADERS = [
  "Practice",
  "Carrier Name",
  "Member ID",
  "Subscriber ZIP",
  "Subscriber Name",
  "Subscriber Last Name",
  "Subscriber DOB",
  "Patient First Name",
  "Patient Last Name",
  "Patient DOB",
  "Relationship to Subscriber",
  "Insurance Verification Process Results",
  "Insurance Verification Status",
  "Type Of Verification",
  "Final Audit",
  "URL Drive",
  "Patient Notes",
  "Patient Address",
  "Policy Notes",
  "Files(s) Name",
];

const FORM_BOOKMARKS: MockFormBookmark[] = [
  {
    id: "mock-bookmark-text",
    name: "PatientName",
    type: "Text",
    value: "Ada Lovelace",
  },
  { id: "mock-bookmark-box", name: "CoverageBox", type: "Box", value: "o" },
  {
    id: "mock-bookmark-toggle",
    name: "VerifiedToggle",
    type: "Toggle",
    value: "n",
  },
];

const FORM_SECTIONS: FormlessSection[] = [
  {
    bookmarks: [
      {
        _id: "mock-bookmark-text",
        label: "Patient name",
        bookmark: "PatientName",
        type: "Text",
        isCode: false,
      },
      {
        _id: "mock-bookmark-box",
        label: "Coverage",
        bookmark: "CoverageBox",
        type: "Box",
        isCode: false,
      },
      {
        _id: "mock-bookmark-toggle",
        label: "Verified",
        bookmark: "VerifiedToggle",
        type: "Toggle",
        isCode: false,
      },
      {
        _id: "mock-bookmark-missing",
        label: "Missing template field",
        bookmark: "MissingTemplateField",
        type: "Text",
        isCode: false,
        isMissingTemplateBookmark: true,
      },
    ],
    position: 0,
    groupName: "CCC Tester form",
    customFormName: MOCK_FORM_FILENAME,
    columns: 1,
  },
];

function createExecutionRows(
  sheetName: string,
  includeExistingForms: boolean,
): string[][] {
  const formLink = (fileId: string) =>
    `https://drive.google.com/document/d/${fileId}/edit, https://drive.google.com/file/${fileId}-pdf/view`;

  return [
    EXECUTION_HEADERS,
    [
      "Main Office",
      "Aetna",
      "MEM-001",
      "12345",
      "Ada Lovelace",
      "Lovelace",
      "01/01/1980",
      "Ada",
      "Lovelace",
      "01/01/1980",
      "Self",
      "Pending",
      "READY",
      "FBD",
      "EMPTY",
      includeExistingForms
        ? formLink("ccc-e2e-file-1")
        : "https://drive.google.com/file/ccc-e2e-pdf-1/view",
      "Initial patient note",
      "123 Main Street",
      "Policy one",
      includeExistingForms
        ? `Insurance_verification_form_Aetna_Ada_${sheetName.replaceAll("-", "")}.docx`
        : "",
    ],
    [
      "North Office",
      "Delta Dental",
      "MEM-002",
      "67890",
      "Grace Hopper",
      "Hopper",
      "12/09/1906",
      "Grace",
      "Hopper",
      "12/09/1906",
      "Spouse",
      "Pending",
      "READY",
      "ELG",
      "EMPTY",
      formLink("ccc-e2e-file-2"),
      "Second patient note",
      "456 Oak Avenue",
      "Policy two",
      `Insurance_verification_form_Delta_Grace_${sheetName.replaceAll("-", "")}.docx`,
    ],
    [
      "South Office",
      "MetLife",
      "MEM-003",
      "24680",
      "Katherine Johnson",
      "Johnson",
      "08/26/1918",
      "Katherine",
      "Johnson",
      "08/26/1918",
      "Child",
      "Pending",
      "READY",
      "FBD",
      "EMPTY",
      "https://drive.google.com/file/ccc-e2e-pdf-3/view",
      "Third patient note",
      "789 Pine Road",
      "Policy three",
      "",
    ],
  ];
}

export function createMockDashboardData(
  settings: E2eSettings,
): MockDashboardData {
  const secondarySheet =
    settings.sheetName === MOCK_SECONDARY_SHEET
      ? "Mock primary sheet"
      : MOCK_SECONDARY_SHEET;

  return {
    client: {
      _id: MOCK_CLIENT_ID,
      clientName: TEST_CLIENT_NAME,
      forms: MOCK_FORM_ID,
      clinic: [
        {
          _id: MOCK_CLINIC_ID,
          clinicName: TEST_CLINIC_NAME,
          drive: {
            spreadsheet: "ccc-tester-spreadsheet",
            driveFolder: "ccc-tester-folder",
            urlRowNumber: 15,
            formId: MOCK_FORM_ID,
            shortFormId: MOCK_FORM_ID,
          },
        },
      ],
    },
    executionRowsBySheet: {
      [settings.sheetName]: createExecutionRows(settings.sheetName, true),
      [secondarySheet]: createExecutionRows(secondarySheet, true),
    },
    tabs: [
      {
        _id: MOCK_EXECUTION_ID,
        index: 0,
        sheetId: 0,
        title: settings.sheetName,
      },
      {
        _id: "ccc-tester-secondary-execution",
        index: 1,
        sheetId: 1,
        title: secondarySheet,
      },
    ],
    form: {
      config: { "1": FORM_SECTIONS, "2": FORM_SECTIONS },
      bookmarks: FORM_BOOKMARKS.map((bookmark) => ({ ...bookmark })),
      filename: MOCK_FORM_FILENAME,
    },
  };
}
