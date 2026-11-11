import { Capacitor, registerPlugin } from '@capacitor/core';

/** The home-screen widgets get their data through this plugin (android/.../widgets/WidgetBridgePlugin.java, ios/App/App/WidgetBridgePlugin.swift). */
interface WidgetBridgePlugin {
  update(options: { snapshot: string }): Promise<void>;
}
const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge');

/** Widgets exist in the Android and the iPhone / iPad apps. */
export const widgetsAvailable = () => ['android', 'ios'].includes(Capacitor.getPlatform());

/** Hands the widgets a fresh snapshot (see src/features/widgets/snapshot.ts). Never throws: widgets are a bonus. */
export async function pushWidgetSnapshot(snapshot: unknown): Promise<void> {
  if (!widgetsAvailable()) return;
  try { await WidgetBridge.update({ snapshot: JSON.stringify(snapshot) }); } catch { /* the widgets keep what they had */ }
}
