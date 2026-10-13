import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { Button, Card, CardTitle, ChoiceRow, DateStepper, ErrorText, Muted } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colomboToday } from "@/lib/dates";
import { errorMessage } from "@/lib/use-api";

type Format = "json" | "csv";

function shiftMonth(month: string, offset: number) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 1 + offset, 1));

  return date.toISOString().slice(0, 7);
}

function formatMonth(month: string) {
  const [year, value] = month.split("-").map(Number);

  return new Date(Date.UTC(year, value - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

// Downloads a report from the server into a file and opens Android's share sheet (save to Files,
// send to Drive, an AI chat, etc.) — the web's report downloads.
export default function ExportScreen() {
  const { serverUrl, request } = useAuth();
  const [date, setDate] = useState<string | null>(colomboToday());
  const [format, setFormat] = useState<Format>("json");
  const [month, setMonth] = useState(colomboToday().slice(0, 7));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function exportFile(kind: string, path: string, fileName: string, mimeType: string) {
    setBusy(kind);
    setError(null);

    try {
      // The report routes return JSON for format=json; CSV comes back as text. Both go through the
      // signed-in request so the token is attached.
      const result = await request<unknown>(path);
      const content = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      const file = new File(Paths.cache, fileName);

      file.create({ overwrite: true });
      file.write(content);

      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("Sharing isn't available on this phone.");
      }

      await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
    } catch (caught) {
      setError(errorMessage(caught, `Couldn't export from ${serverUrl}.`));
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <CardTitle eyebrow="Daily report" title="Review a specific day" />
        <Muted>Thoughts, tasks, check-ins, the day note and conversation logs for one day. JSON is best for AI analysis.</Muted>
        <DateStepper label="Day" value={date} onChange={(value) => setDate(value)} fallback={colomboToday()} />
        <ChoiceRow
          label="Format"
          options={[
            { value: "json", label: "JSON" },
            { value: "csv", label: "CSV" },
          ]}
          value={format}
          onChange={setFormat}
        />
        <Button
          title="Export day"
          busy={busy === "day"}
          disabled={!date || busy !== null}
          onPress={() =>
            date &&
            exportFile(
              "day",
              `/reports/daily?date=${date}&format=${format}`,
              `thoughts-${date}.${format}`,
              format === "json" ? "application/json" : "text/csv",
            )
          }
        />
      </Card>

      <Card>
        <CardTitle eyebrow="Monthly report" title="The full month" />
        <Muted>Every thought, task, check-in and day note for a month in one JSON file.</Muted>
        <ChoiceRow
          label="Month"
          options={[-2, -1, 0].map((offset) => {
            const value = shiftMonth(colomboToday().slice(0, 7), offset);
            return { value, label: formatMonth(value) };
          })}
          value={month}
          onChange={setMonth}
        />
        <Button
          title="Export month"
          busy={busy === "month"}
          disabled={busy !== null}
          onPress={() => exportFile("month", `/reports/monthly?month=${month}`, `thoughts-${month}.json`, "application/json")}
        />
      </Card>

      <Card>
        <CardTitle eyebrow="Backup" title="Everything" />
        <Muted>A full backup of your account as JSON. Restoring a backup is done on the web.</Muted>
        <Button
          title="Export backup"
          variant="secondary"
          busy={busy === "backup"}
          disabled={busy !== null}
          onPress={() => exportFile("backup", "/backup", `thoughts-backup-${colomboToday()}.json`, "application/json")}
        />
      </Card>

      <ErrorText message={error} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 48 },
});
