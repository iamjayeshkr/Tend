package app.tend;
import android.app.job.JobParameters;
import android.app.job.JobService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
public final class UsageJobService extends JobService {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    @Override public boolean onStartJob(JobParameters params) {
        worker.execute(() -> { UsageMonitor.checkLimits(this); jobFinished(params,false); });
        return true;
    }
    @Override public boolean onStopJob(JobParameters params) { return true; }
    @Override public void onDestroy() { worker.shutdown(); super.onDestroy(); }
}
