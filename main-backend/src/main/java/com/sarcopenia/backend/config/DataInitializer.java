package com.sarcopenia.backend.config;

import com.sarcopenia.backend.npy.NpyWriter;
import com.sarcopenia.backend.patient.Patient;
import com.sarcopenia.backend.patient.PatientRepository;
import com.sarcopenia.backend.patient.Sex;
import com.sarcopenia.backend.scan.ScanClassification;
import com.sarcopenia.backend.scan.ScanMeta;
import com.sarcopenia.backend.scan.ScanService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Seeds the demo patients (and synthetic scans) on an empty database so pointing
 * the Web UI at the real backend ({@code VITE_USE_MOCK=false}) behaves like the
 * in-memory mock. The synthetic slices/masks mirror {@code mockApi.ts} and are
 * pushed through the real {@link ScanService#persist} path, so startup also
 * exercises metric derivation + preview rendering end-to-end.
 *
 * <p>Disabled via {@code app.seed-demo-data=false}.
 */
@Component
public class DataInitializer implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);
    private static final int DIM = 256;

    private final AppProperties properties;
    private final PatientRepository patients;
    private final ScanService scans;

    public DataInitializer(AppProperties properties, PatientRepository patients, ScanService scans) {
        this.properties = properties;
        this.patients = patients;
        this.scans = scans;
    }

    private record SeedScan(String performedAt, ScanClassification classification, int sliceCount, String notes) {
    }

    private record SeedPatient(Patient patient, List<SeedScan> scans) {
    }

    @Override
    public void run(String... args) {
        if (!properties.seedDemoData() || patients.count() > 0) {
            return;
        }
        log.info("Seeding demo patients and synthetic scans (empty database).");

        List<SeedPatient> seed = List.of(
                new SeedPatient(
                        new Patient("p-001", "MRN-48201", "Elena", "Popescu", LocalDate.of(1948, 3, 12),
                                Sex.F, 1.62, 58.4,
                                "Post-operative follow-up. Monitoring muscle wasting after hip surgery."),
                        List.of(
                                new SeedScan("2026-01-14T08:30:00Z", ScanClassification.NORMAL, 5, "Baseline."),
                                new SeedScan("2026-03-22T09:00:00Z", ScanClassification.INDETERMINATE, 5, "Slight decline."),
                                new SeedScan("2026-05-28T09:15:00Z", ScanClassification.SARCOPENIC, 5,
                                        "Below threshold; flag for intervention."))),
                new SeedPatient(
                        new Patient("p-002", "MRN-48355", "Mihai", "Ionescu", LocalDate.of(1955, 11, 2),
                                Sex.M, 1.78, 81.0,
                                "Oncology patient, baseline body composition before chemotherapy."),
                        List.of(
                                new SeedScan("2026-02-10T13:20:00Z", ScanClassification.NORMAL, 7, "Pre-treatment baseline."),
                                new SeedScan("2026-06-01T14:40:00Z", ScanClassification.NORMAL, 7, ""))),
                new SeedPatient(
                        new Patient("p-003", "MRN-49011", "Ana", "Georgescu", LocalDate.of(1972, 7, 21),
                                Sex.F, 1.68, 64.2, ""),
                        List.of()),
                new SeedPatient(
                        new Patient("p-004", "MRN-49120", "Gheorghe", "Dumitru", LocalDate.of(1940, 1, 9),
                                Sex.M, 1.71, 67.8,
                                "Frailty assessment. Reduced grip strength reported by GP."),
                        List.of(
                                new SeedScan("2025-09-30T10:00:00Z", ScanClassification.INDETERMINATE, 5, ""),
                                new SeedScan("2025-12-15T10:30:00Z", ScanClassification.SARCOPENIC, 5, ""),
                                new SeedScan("2026-02-20T10:45:00Z", ScanClassification.SARCOPENIC, 5, "Continued decline."),
                                new SeedScan("2026-04-19T11:05:00Z", ScanClassification.SARCOPENIC, 5,
                                        "Started resistance-training programme."))));

        for (SeedPatient sp : seed) {
            patients.save(sp.patient());
            int i = 0;
            for (SeedScan ss : sp.scans()) {
                String scanId = sp.patient().getId() + "-scan-" + (++i);
                byte[] slices = NpyWriter.writeFloat32(new int[]{ss.sliceCount(), DIM, DIM},
                        generateSlices(scanId, ss.sliceCount()));
                byte[] masks = NpyWriter.writeUint8(new int[]{ss.sliceCount(), DIM, DIM},
                        generateMasks(ss.sliceCount()));
                ScanMeta meta = new ScanMeta(Instant.parse(ss.performedAt()), ss.classification(), ss.notes());
                scans.persist(sp.patient().getId(), scanId, meta, slices, masks);
            }
        }
        log.info("Seed complete: {} patients.", seed.size());
    }

    // Synthetic volumes, ported from mockApi.ts.

    private static float[] generateSlices(String scanId, int n) {
        java.util.function.DoubleSupplier rnd = seededRandom(hashId(scanId) + 7);
        float[] data = new float[n * DIM * DIM];
        for (int z = 0; z < n; z++) {
            int base = z * DIM * DIM;
            for (int y = 0; y < DIM; y++) {
                for (int x = 0; x < DIM; x++) {
                    double dx = (x - DIM / 2.0) / 120.0;
                    double dy = (y - DIM / 2.0) / 105.0;
                    double r = dx * dx + dy * dy;
                    double v = r < 1 ? 0.35 + 0.3 * Math.cos(r * 3.1) : 0.04;
                    v += (rnd.getAsDouble() - 0.5) * 0.05;
                    data[base + y * DIM + x] = (float) Math.min(1, Math.max(0, v));
                }
            }
        }
        return data;
    }

    private static byte[] generateMasks(int n) {
        byte[] data = new byte[n * DIM * DIM];
        for (int z = 0; z < n; z++) {
            int base = z * DIM * DIM;
            for (int y = 0; y < DIM; y++) {
                for (int x = 0; x < DIM; x++) {
                    boolean left = Math.pow((x - 96) / 34.0, 2) + Math.pow((y - 150) / 26.0, 2) < 1;
                    boolean right = Math.pow((x - 160) / 34.0, 2) + Math.pow((y - 150) / 26.0, 2) < 1;
                    if (left || right) {
                        data[base + y * DIM + x] = 1;
                    }
                }
            }
        }
        return data;
    }

    private static java.util.function.DoubleSupplier seededRandom(long seed) {
        long s = seed % 2147483647L;
        long state = s <= 0 ? s + 2147483646L : s;
        long[] holder = {state};
        return () -> {
            holder[0] = (holder[0] * 16807L) % 2147483647L;
            return (holder[0] - 1) / 2147483646.0;
        };
    }

    private static long hashId(String id) {
        long h = 0;
        for (int i = 0; i < id.length(); i++) {
            h = (h * 31 + id.charAt(i)) & 0xFFFFFFFFL;
        }
        return h == 0 ? 1 : h;
    }
}
