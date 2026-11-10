package app.simplebiblememory.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

import app.simplebiblememory.MainActivity;
import app.simplebiblememory.R;

/** A shortcut to "Add card": one tap opens the app on the Add card screen. */
public class AddCardWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, views(context));
    }

    static RemoteViews views(Context context) {
        WidgetData.Palette p = WidgetData.Palette.current(context);
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_add_card);
        v.setInt(R.id.widget_bg, "setColorFilter", p.surface);
        v.setInt(R.id.widget_ring, "setColorFilter", p.border);
        v.setInt(R.id.widget_badge, "setColorFilter", p.accent);
        v.setInt(R.id.widget_plus, "setColorFilter", WidgetData.readableOn(p.accent, p.background, p.foreground)); // the plus must show on whatever accent the theme has
        v.setTextViewText(R.id.widget_label, WidgetData.label(context, "addCard", context.getString(R.string.widget_add_card)));
        v.setTextColor(R.id.widget_label, p.foreground);
        v.setOnClickPendingIntent(R.id.widget_root, open(context, "simplebiblememory://add", 1));
        return v;
    }

    /** Opens the app on the screen a link names (the app's link handler does the rest). */
    static PendingIntent open(Context context, String link, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(link), context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
