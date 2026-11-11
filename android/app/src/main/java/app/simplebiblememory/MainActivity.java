package app.simplebiblememory;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import app.simplebiblememory.widgets.WidgetBridgePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridgePlugin.class); // the home-screen widgets' data (src/platform/widgets.ts)
        super.onCreate(savedInstanceState);
    }
}
