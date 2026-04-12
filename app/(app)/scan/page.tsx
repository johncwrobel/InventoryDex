import { ScanClient } from "./scan-client";

export default function ScanPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Scan</h1>
      <ScanClient />
    </div>
  );
}
