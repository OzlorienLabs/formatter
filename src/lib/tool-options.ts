/**
 * Tool-specific segmented options. Every value here is one `dispatch()`
 * already understands — the options bar never offers a control that does
 * nothing. The first value of a group is its default.
 */
export type OptionGroup = { label: string; values: { label: string; value: string }[] };

const indent: OptionGroup = {
  label: "Indent",
  values: [
    { label: "2", value: "2" },
    { label: "4", value: "4" },
  ],
};

export const TOOL_OPTIONS: Record<string, OptionGroup[]> = {
  "json-formatter": [indent],
  "json-viewer": [indent],
  "jsonld-inspector": [indent],
  "mcp-inspector-lite": [indent],
  "hash-generator": [
    {
      label: "Algorithm",
      values: [
        { label: "SHA-256", value: "sha256" },
        { label: "SHA-512", value: "sha512" },
      ],
    },
  ],
  "text-toolbox": [
    {
      label: "Operation",
      values: [
        { label: "Sort", value: "sort" },
        { label: "Dedupe", value: "dedupe" },
        { label: "Upper", value: "upper" },
        { label: "Lower", value: "lower" },
        { label: "Reverse", value: "reverse" },
        { label: "Trim", value: "trim" },
      ],
    },
  ],
};

export const defaultOption = (slug: string) => TOOL_OPTIONS[slug]?.[0]?.values[0]?.value ?? "default";

/** Tools that read a second input, and what that field is called. */
export const SECOND_INPUT: Record<string, string> = {
  "json-diff": "Compare against",
  "file-diff-viewer": "Compare against",
  "inline-sql-vars": "Values (JSON)",
  "template-string-merger": "Values (JSON)",
  "csv-query-sql": "Query",
  "regex-tester": "Test string",
  "regex-lab-py-go-java": "Test string",
  "jq-playground": "Filter",
  "jsonpath-playground": "Path",
  "hmac-tool": "Key",
  "xpath-tester": "XPath",
};
