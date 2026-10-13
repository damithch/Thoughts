import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet } from "react-native";

import { offerUndoDelete, PRIORITY_OPTIONS } from "@/components/tasks";
import { Button, ChoiceRow, DateStepper, ErrorText, Field, LoadingState } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { colomboToday } from "@/lib/dates";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";
import { errorMessage } from "@/lib/use-api";

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "skipped", label: "Skipped" },
];

export default function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { request } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [date, setDate] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const result = await request<{ task: Task }>(`/v1/tasks/${id}`);
      setTask(result.task);
      setTitle(result.task.title);
      setPriority(result.task.priority);
      setStatus(result.task.status);
      setDate(result.task.scheduled_date);
      setNote(result.task.note);
      setLoadError(null);
    } catch (caught) {
      setLoadError(errorMessage(caught));
    }
  }

  useEffect(() => {
    load();
    // Load once per task id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save() {
    if (!title.trim()) {
      setError("A task needs a title.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await request(`/v1/tasks/${id}`, {
        method: "PATCH",
        body: { title: title.trim(), priority, status, date, note: note.trim() },
      });
      router.back();
    } catch (caught) {
      setError(errorMessage(caught));
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);

    try {
      const { deleted } = await request<{ deleted: Task }>(`/v1/tasks/${id}`, { method: "DELETE" });
      router.back();
      offerUndoDelete(request, deleted, () => {});
    } catch (caught) {
      setDeleting(false);
      Alert.alert("Couldn't delete the task", errorMessage(caught));
    }
  }

  if (!task) {
    return <LoadingState error={loadError} onRetry={load} />;
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Title" value={title} onChangeText={setTitle} />
        <ChoiceRow label="Status" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
        <ChoiceRow label="Priority" options={PRIORITY_OPTIONS} value={priority} onChange={setPriority} />
        <DateStepper
          label="Day"
          value={date}
          onChange={setDate}
          allowNone
          noneLabel="Inbox (no date)"
          fallback={task.scheduled_date ?? colomboToday()}
        />
        <Field label="Note" value={note} onChangeText={setNote} multiline />
        <ErrorText message={error} />
        <Button title="Save" onPress={save} busy={saving} />
        <Button
          title="Delete task"
          variant="danger"
          busy={deleting}
          onPress={() =>
            Alert.alert("Delete this task?", task.recurring_task_id ? "This routine won't come back on this day." : undefined, [
              { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: remove },
            ])
          }
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 18, paddingBottom: 48 },
});
