import { Capacitor, registerPlugin } from '@capacitor/core';

/** The Android app's home-screen widgets get their data through this plugin (android/.../widgets/WidgetBridgePlugin.java). */
interface WidgetBridgePlugin {
  update(options: { snapshot: string }): Promise<void>;
}
const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge');

/** Widgets exist in the Android app only (for now). */
export const widgetsAvailable = () => Capacitor.getPlatform() === 'android';

/** Hands the widgets a fresh snapshot (see src/features/widgets/snapshot.ts). Never throws: widgets are a bonus. */
export async function pushWidgetSnapshot(snapshot: unknown): Promise<void> {
  if (!widgetsAvailable()) return;
  try { await WidgetBridge.update({ snapshot: JSON.stringify(snapshot) }); } catch { /* the widgets keep what they had */ }
}
