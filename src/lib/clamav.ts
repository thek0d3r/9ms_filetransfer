export type ClamavVerdict = { clean: true; response: string } | { clean: false; response: string };

export function parseClamavResponse(rawResponse: string): ClamavVerdict {
  const response = rawResponse.replaceAll("\0", "").trim();
  if (response.includes("FOUND")) return { clean: false, response };
  if (response.endsWith("OK")) return { clean: true, response };
  throw new Error(`Unexpected ClamAV response: ${response || "empty response"}`);
}
