package app.simplebiblememory.widgets;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** How the web app hands the home-screen widgets their snapshot (see src/platform/widgets.ts). */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        String snapshot = call.getString("snapshot");
        if (snapshot == null) { call.reject("no snapshot"); return; }
        WidgetData.save(getContext(), snapshot);
        WidgetData.refreshAll(getContext());
        call.resolve();
    }
}
