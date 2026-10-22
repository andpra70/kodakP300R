export type ModelName = "p300r" | "p210r";

export interface PrinterProfile {
  name: ModelName;
  label: string;
  width: number;
  height: number;
  nativeModelId: number;
}

export const profiles: Record<ModelName, PrinterProfile> = {
  p300r: { name: "p300r", label: "Kodak P300R · 3 × 3", width: 896, height: 896, nativeModelId: 9 },
  p210r: { name: "p210r", label: "Kodak P210R · 2,1 × 3,4", width: 640, height: 1024, nativeModelId: 10 },
};
