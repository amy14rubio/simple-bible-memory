package app.simplebiblememory.widgets;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.TimeZone;

import app.simplebiblememory.R;

/** One verse of a deck chosen when the widget was added, a new one each day (like a verse of the day). Tapping opens the deck. */
public class VersePreviewWidget extends AppWidgetProvider {
    private static final String PREFS = "verse_widgets";

    static void chooseDeck(Context context, int widgetId, String deckId) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("deck_" + widgetId, deckId).apply();
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) update(context, manager, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, android.os.Bundle options) {
        update(context, manager, id);
    }

    @Override
    public void onDeleted(Context context, int[] ids) {
        SharedPreferences.Editor e = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        for (int id : ids) e.remove("deck_" + id);
        e.apply();
    }

    static void update(Context context, AppWidgetManager manager, int id) {
        int[] size = WidgetData.sizeDp(manager, id, 250, 110);
        manager.updateAppWidget(id, views(context, id, size[1]));
    }

    /** Whole days since 1 Jan 1970 where the person is, so the verse changes at their midnight. */
    static long dayNumber() {
        long now = System.currentTimeMillis();
        return (now + TimeZone.getDefault().getOffset(now)) / 86400000L;
    }

    static RemoteViews views(Context context, int widgetId, int heightDp) {
        WidgetData.Palette p = WidgetData.Palette.current(context);
        JSONObject snapshot = WidgetData.load(context);
        JSONArray decks = snapshot.optJSONArray("verseDecks");
        String chosen = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("deck_" + widgetId, "");
        JSONObject deck = null;
        if (decks != null) {
            for (int i = 0; i < decks.length() && deck == null; i++) if (decks.optJSONObject(i).optString("id").equals(chosen)) deck = decks.optJSONObject(i);
            if (deck == null && decks.length() > 0 && chosen.isEmpty()) deck = decks.optJSONObject(0);
        }

        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_verse);
        v.setInt(R.id.widget_bg, "setColorFilter", p.surface);
        v.setInt(R.id.widget_ring, "setColorFilter", p.border);
        v.setInt(R.id.verse_bar, "setColorFilter", p.accent);
        v.setTextColor(R.id.verse_text, p.foreground);
        v.setTextColor(R.id.verse_ref, p.muted);

        JSONArray verses = deck == null ? null : deck.optJSONArray("verses");
        if (verses == null || verses.length() == 0) {
            // The deck is gone, or has no verses that may be shown (licensed text): say so instead of showing nothing.
            boolean licensed = !chosen.isEmpty() && deck == null && inList(snapshot.optJSONArray("licensedDecks"), chosen);
            // (a short note in a fixed size, so it is not blown up like a verse)
            v.setViewVisibility(R.id.verse_text, View.GONE);
            v.setViewVisibility(R.id.verse_note, View.VISIBLE);
            v.setTextColor(R.id.verse_note, p.foreground);
            v.setTextViewText(R.id.verse_note, licensed
                ? WidgetData.label(context, "licensedDeck", context.getString(R.string.widget_licensed_deck))
                : WidgetData.label(context, "noVerses", context.getString(R.string.widget_no_verses)));
            v.setTextViewText(R.id.verse_ref, "");
            v.setOnClickPendingIntent(R.id.widget_root, AddCardWidget.open(context, "simplebiblememory://home", 50));
            return v;
        }

        JSONObject verse = verses.optJSONObject((int) (dayNumber() % verses.length()));
        // The verse is as big as fits the widget (the text view sizes itself, between 13sp and 30sp).
        v.setTextViewText(R.id.verse_text, verse.optString("text"));
        String translation = verse.optString("tr", "");
        v.setTextViewText(R.id.verse_ref, translation.isEmpty() ? verse.optString("ref") : verse.optString("ref") + " · " + translation);
        v.setOnClickPendingIntent(R.id.widget_root, AddCardWidget.open(context, "simplebiblememory://deck/" + deck.optString("id"), 60 + widgetId));
        return v;
    }

    private static boolean inList(JSONArray list, String id) {
        if (list == null) return false;
        for (int i = 0; i < list.length(); i++) if (list.optJSONObject(i).optString("id").equals(id)) return true;
        return false;
    }
}
