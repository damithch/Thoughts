import { revalidatePath } from "next/cache";

// Pages that show attention sessions or the tasks a session can tick off.
export function revalidateAttention(tasksChanged = false) {
  revalidatePath("/dashboard/attention");
  if (tasksChanged) {
    revalidatePath("/dashboard/tasks", "layout");
    revalidatePath("/dashboard/completion");
  }
}
