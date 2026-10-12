package app.tend;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONObject;

/** A full application snapshot commits atomically before the JS caller receives success. */
final class StateStore extends SQLiteOpenHelper {
    static final int MAX_BYTES = 25 * 1024 * 1024;
    StateStore(Context context) { super(context, "tend.db", null, 1); setWriteAheadLoggingEnabled(true); }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE snapshots (id INTEGER PRIMARY KEY CHECK(id IN (1,2)), body TEXT NOT NULL, updated_at INTEGER NOT NULL)");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        throw new IllegalStateException("No database migration defined");
    }
    synchronized String load() {
        try (Cursor cursor = getReadableDatabase().rawQuery("SELECT body FROM snapshots WHERE id=1", null)) {
            return cursor.moveToFirst() ? cursor.getString(0) : null;
        }
    }
    synchronized boolean save(String json) {
        if (json == null || json.length() > MAX_BYTES) return false;
        try { new JSONObject(json); } catch (Exception error) { return false; }
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.execSQL("INSERT OR REPLACE INTO snapshots (id,body,updated_at) SELECT 2,body,updated_at FROM snapshots WHERE id=1");
            ContentValues values = new ContentValues();
            values.put("id", 1); values.put("body", json); values.put("updated_at", System.currentTimeMillis());
            if (db.insertWithOnConflict("snapshots", null, values, SQLiteDatabase.CONFLICT_REPLACE) == -1) return false;
            db.setTransactionSuccessful();
            return true;
        } finally { db.endTransaction(); }
    }
}
