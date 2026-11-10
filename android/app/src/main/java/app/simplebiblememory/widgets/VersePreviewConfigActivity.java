package app.simplebiblememory.widgets;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import app.simplebiblememory.R;

/**
 * The little screen shown when a Verse preview widget is added: which deck should it show a verse from? Decks that only have licensed
 * text are listed too, greyed, with the reason, so nobody wonders where their deck went.
 */
public class VersePreviewConfigActivity extends Activity {
    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setResult(RESULT_CANCELED); // backing out removes the widget
        widgetId = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return; }

        WidgetData.Palette p = WidgetData.Palette.current(this);
        JSONObject snapshot = WidgetData.load(this);
        JSONArray verseDecks = snapshot.optJSONArray("verseDecks");
        JSONArray licensed = snapshot.optJSONArray("licensedDecks");

        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setPadding(dp(22), dp(56), dp(22), dp(32));
        column.setBackgroundColor(p.background);

        TextView title = text(WidgetData.label(this, "chooseDeck", getString(R.string.widget_choose_deck)), 26, p.foreground, true);
        column.addView(title);
        TextView hint = text(WidgetData.label(this, "chooseDeckHint", getString(R.string.widget_choose_deck_hint)), 15, p.muted, false);
        hint.setPadding(0, dp(6), 0, dp(18));
        column.addView(hint);

        int shown = 0;
        for (int i = 0; verseDecks != null && i < verseDecks.length(); i++) {
            JSONObject deck = verseDecks.optJSONObject(i);
            int n = deck.optJSONArray("verses") == null ? 0 : deck.optJSONArray("verses").length();
            String sub = n == 1 ? WidgetData.label(this, "verse", "1 verse") : WidgetData.fill(WidgetData.label(this, "verses", "{count} verses"), n);
            column.addView(row(deck.optString("title"), sub, p, true, deck.optString("id")));
            shown++;
        }
        for (int i = 0; licensed != null && i < licensed.length(); i++) {
            JSONObject deck = licensed.optJSONObject(i);
            column.addView(row(deck.optString("title"), WidgetData.label(this, "licensedDeck", getString(R.string.widget_licensed_deck)), p, false, null));
            shown++;
        }
        if (shown == 0) {
            TextView none = text(WidgetData.label(this, "noVerses", getString(R.string.widget_no_verses)), 16, p.muted, false);
            column.addView(none);
        }

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(p.background);
        scroll.setFillViewport(true);
        scroll.addView(column, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(scroll);
    }

    private View row(String name, String sub, WidgetData.Palette p, boolean enabled, String deckId) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(dp(18), dp(14), dp(18), dp(14));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(p.surface);
        bg.setCornerRadius(dp(18));
        bg.setStroke(dp(1), p.border);
        row.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(10);
        row.setLayoutParams(lp);
        row.addView(text(name, 18, enabled ? p.foreground : p.muted, true));
        TextView s = text(sub, 14, p.muted, false);
        s.setPadding(0, dp(2), 0, 0);
        row.addView(s);
        if (enabled) {
            row.setClickable(true);
            row.setOnClickListener((v) -> choose(deckId));
            row.setContentDescription(name + ", " + sub);
        } else {
            row.setAlpha(0.65f);
            row.setContentDescription(name + ", " + sub);
        }
        return row;
    }

    private void choose(String deckId) {
        VersePreviewWidget.chooseDeck(this, widgetId, deckId);
        VersePreviewWidget.update(this, AppWidgetManager.getInstance(this), widgetId);
        setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));
        finish();
    }

    private TextView text(String value, int sp, int color, boolean serifBold) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setGravity(Gravity.START);
        if (serifBold) { t.setTypeface(android.graphics.Typeface.create("serif", android.graphics.Typeface.BOLD)); }
        return t;
    }

    private int dp(int v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }
}
