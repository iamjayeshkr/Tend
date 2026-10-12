package app.tend;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public final class QuickTaskActivity extends Activity {
    private String selectedCategory = "work";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_quick_task);

        EditText input = findViewById(R.id.quick_task_input);
        View closeBtn = findViewById(R.id.quick_task_close);
        if (closeBtn != null) {
            closeBtn.setOnClickListener(v -> finish());
        }

        View scrim = findViewById(R.id.quick_task_scrim);
        if (scrim != null) {
            scrim.setOnClickListener(v -> {
                InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
                if (imm != null && input != null) {
                    imm.hideSoftInputFromWindow(input.getWindowToken(), 0);
                }
                finish();
            });
        }

        View card = findViewById(R.id.quick_task_card);
        if (card != null) {
            card.setOnClickListener(v -> {});
        }

        TextView catWork = findViewById(R.id.cat_work);
        TextView catStudy = findViewById(R.id.cat_study);
        TextView catProject = findViewById(R.id.cat_project);
        TextView catExercise = findViewById(R.id.cat_exercise);
        TextView catLife = findViewById(R.id.cat_life);

        TextView[] cats = {catWork, catStudy, catProject, catExercise, catLife};
        String[] catNames = {"work", "study", "project", "exercise", "life"};

        for (int i = 0; i < cats.length; i++) {
            final String name = catNames[i];
            final TextView tv = cats[i];
            if (tv == null) continue;
            tv.setOnClickListener(v -> {
                selectedCategory = name;
                for (TextView other : cats) {
                    if (other == null) continue;
                    if (other == tv) {
                        other.setBackgroundResource(R.drawable.chip_selected);
                        other.setTextColor(Color.parseColor("#FAF8EF"));
                    } else {
                        other.setBackgroundResource(R.drawable.chip_unselected);
                        other.setTextColor(Color.parseColor("#264B38"));
                    }
                }
            });
        }

        Button submit = findViewById(R.id.quick_task_submit);
        Runnable submitAction = () -> {
            String text = input.getText().toString().trim();
            if (text.isEmpty()) {
                Toast.makeText(this, "Please enter a task title", Toast.LENGTH_SHORT).show();
                return;
            }

            StateStore store = new StateStore(this);
            try {
                String raw = store.load();
                if (raw != null) {
                    JSONObject snapshot = new JSONObject(raw);
                    JSONArray tasks = snapshot.optJSONArray("tasks");
                    if (tasks == null) {
                        tasks = new JSONArray();
                        snapshot.put("tasks", tasks);
                    }

                    String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
                    JSONObject newTask = new JSONObject();
                    newTask.put("id", "task-" + System.currentTimeMillis());
                    newTask.put("title", text);
                    newTask.put("category", selectedCategory);
                    newTask.put("done", false);
                    newTask.put("date", today);

                    tasks.put(newTask);
                    store.save(snapshot.toString());
                    ProtectionStore.syncSnapshot(this, snapshot.toString());
                    TendTasksWidgetProvider.updateAll(this);

                    Toast.makeText(this, "Task added to Today ✨", Toast.LENGTH_SHORT).show();
                }
            } catch (Exception ignored) {
            } finally {
                store.close();
            }

            // Hide keyboard and finish
            InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) {
                imm.hideSoftInputFromWindow(input.getWindowToken(), 0);
            }
            finish();
        };

        submit.setOnClickListener(v -> submitAction.run());

        // Support Enter key / IME Action Done on keyboard
        input.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                submitAction.run();
                return true;
            }
            return false;
        });

        // Auto-focus and open soft keyboard
        input.requestFocus();
        input.postDelayed(() -> {
            InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) {
                imm.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT);
            }
        }, 150);
    }
}
